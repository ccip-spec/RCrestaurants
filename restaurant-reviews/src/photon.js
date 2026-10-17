// Free place search via Photon (OpenStreetMap data) — no API key needed.
// https://github.com/komoot/photon — public server, fair-use limits.
import { HOME_CENTER } from './config';

const ENDPOINT = 'https://photon.komoot.io/api/';
const FOOD = new Set([
  'restaurant', 'cafe', 'fast_food', 'bar', 'pub', 'food_court', 'ice_cream', 'biergarten',
]);

function titleCase(s) {
  return s
    .split(/[;_]/)
    .map((w) => w.trim())
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(', ');
}

function toPlace(f) {
  const p = f.properties || {};
  const [lng, lat] = f.geometry.coordinates;
  const street = [p.housenumber, p.street].filter(Boolean).join(' ');
  const city = p.city || p.town || p.village || p.county || '';
  return {
    name: p.name || street || 'Unnamed place',
    address: [street, city, p.state].filter(Boolean).join(', '),
    city,
    neighborhood: p.district || p.locality || '',
    lat,
    lng,
    osm_ref: p.osm_type && p.osm_id ? `${p.osm_type}${p.osm_id}` : null,
    kind: p.osm_value || '',
    isFood: FOOD.has(p.osm_value),
    cuisine: p.extra?.cuisine ? titleCase(p.extra.cuisine) : '',
  };
}

async function query(params, signal) {
  const res = await fetch(`${ENDPOINT}?${params}`, { signal });
  if (!res.ok) throw new Error(`Search failed (${res.status})`);
  const data = await res.json();
  return (data.features || []).map(toPlace);
}

// Restaurant search: only places tagged amenity=*, food places first.
export async function searchPlaces(q, loc, signal) {
  const c = loc || HOME_CENTER;
  const params = new URLSearchParams({ q, limit: '12', lat: c.lat, lon: c.lng, lang: 'en' });
  params.append('osm_tag', 'amenity');
  const places = await query(params, signal);
  return places.sort((a, b) => Number(b.isFood) - Number(a.isFood));
}

// Address lookup for manually added restaurants.
export async function geocodeAddress(q, loc) {
  const c = loc || HOME_CENTER;
  const params = new URLSearchParams({ q, limit: '1', lat: c.lat, lon: c.lng, lang: 'en' });
  const places = await query(params);
  return places[0] || null;
}
