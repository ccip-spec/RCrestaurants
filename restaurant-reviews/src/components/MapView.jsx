import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { PEOPLE, HOME_CENTER, LOCAL_RADIUS_MILES } from '../config';
import { fmtScore, haversineMiles, priceLabel } from '../utils';

function fitTo(map, points) {
  if (!points.length) return;
  if (points.length === 1) map.setView(points[0], 15);
  else map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 15 });
}

function popupContent(r, onOpen) {
  const el = document.createElement('div');
  el.className = 'popup';
  const name = document.createElement('strong');
  name.textContent = r.name;
  const meta = document.createElement('div');
  meta.className = 'muted';
  meta.textContent = [r.cuisine, r.neighborhood || r.city, priceLabel(r.price)]
    .filter(Boolean)
    .join(' · ');
  const scores = document.createElement('div');
  scores.textContent = [
    `Overall ${fmtScore(r.overall)}`,
    ...PEOPLE.map((p) => `${p.label} ${fmtScore(r.avg[p.key])}`),
  ].join(' · ');
  const btn = document.createElement('button');
  btn.className = 'btn small primary';
  btn.textContent = `View ${r.visits.length} visit${r.visits.length === 1 ? '' : 's'}`;
  btn.onclick = onOpen;
  el.append(name, meta, scores, btn);
  return el;
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
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Draw restaurant markers.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    layerRef.current.clearLayers();
    const all = [];
    for (const r of rows) {
      if (r.lat == null || r.lng == null) continue;
      const icon = L.divIcon({
        className: 'pin-wrap',
        html: `<div class="pin"><span>${fmtScore(r.overall)}</span></div>`,
        iconSize: [46, 34],
        iconAnchor: [23, 34],
        popupAnchor: [0, -30],
      });
      const marker = L.marker([r.lat, r.lng], { icon, title: r.name });
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

  const centerOnMe = async () => {
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
          ◎ Me
        </button>
        <button className="btn small" onClick={showAll} disabled={!rows.length}>
          ⤢ All
        </button>
      </div>
      {empty && <div className="map-empty">No restaurants yet. Tap + to add your first.</div>}
    </div>
  );
}
