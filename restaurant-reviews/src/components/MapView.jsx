import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { PEOPLE, HOME_CENTER, LOCAL_RADIUS_MILES } from '../config';
import { fmtScore, haversineMiles, priceLabel, store, tierOf } from '../utils';

// Below this zoom, tags show only the score so names don't pile up.
const NAME_ZOOM = 12;

function fitTo(map, points) {
  if (!points.length) return;
  if (points.length === 1) map.setView(points[0], 15);
  else map.fitBounds(L.latLngBounds(points), { padding: [60, 60], maxZoom: 15 });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text != null) e.textContent = text;
  return e;
}

function popupContent(r, onOpen) {
  const box = el('div', 'popup');
  box.append(el('div', 'popup-name', r.name));
  const meta = [r.cuisine, r.neighborhood || r.city, priceLabel(r.price)].filter(Boolean);
  if (meta.length) box.append(el('div', 'popup-meta', meta.join('  /  ')));
  if (r.been) {
    const scores = el('div', 'popup-scores');
    for (const p of PEOPLE) {
      const s = el('span', null, `${p.label} `);
      s.append(el('b', null, fmtScore(r.avg[p.key])));
      scores.append(s);
    }
    const tier = tierOf(r.overall);
    const total = el('span', 'popup-total', 'Total ');
    total.append(el('b', null, fmtScore(r.overall)));
    scores.append(total);
    box.append(scores);
    if (tier) box.append(el('div', 'popup-tier', tier.label));
  } else if (r.recommended_by) {
    box.append(el('div', 'popup-meta', `To try, from ${r.recommended_by}`));
  } else {
    box.append(el('div', 'popup-meta', 'On your try list'));
  }
  const btn = el('button', 'popup-btn', r.been ? 'Open check' : 'Open');
  btn.onclick = onOpen;
  box.append(btn);
  return box;
}

export default function MapView({ rows, loc, active, loading, onLocate, onSelect }) {
  const elRef = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);
  const meRef = useRef(null);
  const fittedRef = useRef(false);
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;
  const [show, setShow] = useState(() => store.get('rr_mapshow', { been: true, try: true }));
  useEffect(() => store.set('rr_mapshow', show), [show]);

  // Create the map once.
  useEffect(() => {
    const map = L.map(elRef.current, { zoomControl: false }).setView([HOME_CENTER.lat, HOME_CENTER.lng], 12);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    const syncZoomClass = () => map.getContainer().classList.toggle('zoomed-out', map.getZoom() < NAME_ZOOM);
    map.on('zoomend', syncZoomClass);
    syncZoomClass();
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Draw tags. Higher-rated places sit on top when tags overlap.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    layerRef.current.clearLayers();
    const all = [];
    for (const r of rows) {
      if (r.lat == null || r.lng == null) continue;
      if (r.been ? !show.been : !show.try) continue;
      const tier = tierOf(r.overall);
      const left = r.been
        ? `<span class="tag-score${tier ? ` t-${tier.key}` : ' none'}">${fmtScore(r.overall)}</span>`
        : `<span class="tag-score try">Try</span>`;
      const icon = L.divIcon({
        className: 'tag-icon',
        html: `<div class="tag${r.been ? '' : ' is-try'}">${left}<span class="tag-name">${escapeHtml(r.name)}</span></div>`,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
        popupAnchor: [0, -40],
      });
      const marker = L.marker([r.lat, r.lng], {
        icon,
        title: r.name,
        zIndexOffset: r.overall != null ? Math.round(r.overall * 100) : 0,
      });
      marker.bindPopup(() =>
        popupContent(r, () => {
          map.closePopup();
          selectRef.current(r.id);
        })
      );
      marker.addTo(layerRef.current);
      all.push([r.lat, r.lng]);
    }
    if (!fittedRef.current && all.length) {
      fittedRef.current = true;
      const c = loc || HOME_CENTER;
      const near = all.filter(([la, ln]) => haversineMiles(c.lat, c.lng, la, ln) <= LOCAL_RADIUS_MILES);
      fitTo(map, near.length ? near : all);
    }
  }, [rows, loc, show]);

  // Your location dot.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loc) return;
    if (!meRef.current) {
      meRef.current = L.circleMarker([loc.lat, loc.lng], {
        radius: 8,
        color: '#ffffff',
        weight: 3,
        fillColor: '#2a6fd6',
        fillOpacity: 1,
      })
        .bindTooltip('You')
        .addTo(map);
    } else {
      meRef.current.setLatLng([loc.lat, loc.lng]);
    }
  }, [loc]);

  useEffect(() => {
    if (active && mapRef.current) setTimeout(() => mapRef.current?.invalidateSize(), 50);
  }, [active]);

  const centerOnMe = () => {
    if (loc) mapRef.current.setView([loc.lat, loc.lng], 14);
    else onLocate();
  };

  const showAll = () => {
    const pts = rows
      .filter((r) => r.lat != null && (r.been ? show.been : show.try))
      .map((r) => [r.lat, r.lng]);
    fitTo(mapRef.current, pts);
  };

  const empty = !loading && rows.length === 0;

  return (
    <div className="map-wrap">
      <div ref={elRef} className="map" />
      <div className="map-bar">
        <button className={`chip ${show.been ? 'on' : ''}`} onClick={() => setShow((s) => ({ ...s, been: !s.been }))}>
          Been
        </button>
        <button className={`chip try ${show.try ? 'on' : ''}`} onClick={() => setShow((s) => ({ ...s, try: !s.try }))}>
          To try
        </button>
        <span className="map-bar-gap" />
        <button className="chip plain" onClick={centerOnMe}>
          Near me
        </button>
        <button className="chip plain" onClick={showAll} disabled={!rows.length}>
          Show all
        </button>
      </div>
      {empty && <div className="map-empty">No restaurants yet. Tap + to log your first visit.</div>}
    </div>
  );
}
