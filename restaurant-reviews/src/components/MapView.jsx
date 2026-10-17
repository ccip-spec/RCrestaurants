import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { PEOPLE, HOME_CENTER, LOCAL_RADIUS_MILES } from '../config';
import { fmtScore, haversineMiles, priceLabel } from '../utils';
import { LocateIcon, ExpandIcon } from './Icons';

// Below this zoom, pins show only the score so names don't pile up.
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
  box.append(el('strong', null, r.name));
  const meta = [r.cuisine, r.neighborhood || r.city, priceLabel(r.price)].filter(Boolean);
  if (meta.length) {
    const m = el('div', 'popup-scores');
    meta.forEach((t) => m.append(el('span', null, t)));
    box.append(m);
  }
  const scores = el('div', 'popup-scores');
  const overall = el('span', 'overall', 'Overall');
  overall.append(el('b', null, fmtScore(r.overall)));
  scores.append(overall);
  for (const p of PEOPLE) {
    const s = el('span', null, p.label);
    s.append(el('b', null, fmtScore(r.avg[p.key])));
    scores.append(s);
  }
  box.append(scores);
  const btn = el('button', 'btn small', `See ${r.visits.length} visit${r.visits.length === 1 ? '' : 's'}`);
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

  // Create the map once.
  useEffect(() => {
    const map = L.map(elRef.current, { zoomControl: false }).setView(
      [HOME_CENTER.lat, HOME_CENTER.lng],
      12
    );
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);
    L.control.zoom({ position: 'topright' }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    const syncZoomClass = () =>
      map.getContainer().classList.toggle('zoomed-out', map.getZoom() < NAME_ZOOM);
    map.on('zoomend', syncZoomClass);
    syncZoomClass();
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Draw restaurant name tags. Higher-rated places sit on top when tags overlap.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    layerRef.current.clearLayers();
    const all = [];
    for (const r of rows) {
      if (r.lat == null || r.lng == null) continue;
      const scored = r.overall != null;
      const icon = L.divIcon({
        className: 'tag-icon',
        html: `<div class="tag"><span class="tag-score${scored ? '' : ' none'}">${fmtScore(r.overall)}</span><span class="tag-name">${escapeHtml(r.name)}</span></div>`,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
        popupAnchor: [0, -40],
      });
      const marker = L.marker([r.lat, r.lng], {
        icon,
        title: r.name,
        zIndexOffset: scored ? Math.round(r.overall * 100) : 0,
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
    // First time data arrives: zoom to nearby restaurants (fall back to all).
    if (!fittedRef.current && all.length) {
      fittedRef.current = true;
      const c = loc || HOME_CENTER;
      const near = all.filter(([la, ln]) => haversineMiles(c.lat, c.lng, la, ln) <= LOCAL_RADIUS_MILES);
      fitTo(map, near.length ? near : all);
    }
  }, [rows, loc]);

  // Your location dot.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loc) return;
    if (!meRef.current) {
      meRef.current = L.circleMarker([loc.lat, loc.lng], {
        radius: 8,
        color: '#ffffff',
        weight: 3,
        fillColor: '#2a7de1',
        fillOpacity: 1,
      })
        .bindTooltip('You')
        .addTo(map);
    } else {
      meRef.current.setLatLng([loc.lat, loc.lng]);
    }
  }, [loc]);

  // Leaflet needs a resize nudge when its tab becomes visible.
  useEffect(() => {
    if (active && mapRef.current) setTimeout(() => mapRef.current?.invalidateSize(), 50);
  }, [active]);

  const centerOnMe = () => {
    if (loc) mapRef.current.setView([loc.lat, loc.lng], 14);
    else onLocate();
  };

  const showAll = () => {
    const pts = rows.filter((r) => r.lat != null).map((r) => [r.lat, r.lng]);
    fitTo(mapRef.current, pts);
  };

  const empty = !loading && rows.length === 0;

  return (
    <div className="map-wrap">
      <div ref={elRef} className="map" />
      <div className="map-buttons">
        <button className="btn small" onClick={centerOnMe}>
          <LocateIcon />
          Near me
        </button>
        <button className="btn small" onClick={showAll} disabled={!rows.length}>
          <ExpandIcon />
          Show all
        </button>
      </div>
      {empty && <div className="map-empty">No restaurants yet. Tap + to add your first.</div>}
    </div>
  );
}
