// Free place search via Photon (OpenStreetMap data) — no API key needed.
// https://github.com/komoot/photon — public server, fair-use limits.
// Extra details (website, cuisine) come from OpenStreetMap's Nominatim lookup.
import { HOME_CENTER } from './config';

const ENDPOINT = 'https://photon.komoot.io/api/';
const FOOD = new Set([
  'restaurant', 'cafe', 'fast_food', 'bar', 'pub', 'food_court', 'ice_cream', 'biergarten',
]);

export function titleCase(s) {
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
export async function searchPlaces(q, loc, signal, limit = 12) {
  const c = loc || HOME_CENTER;
  // Low bias scale = strongly prefer places near you (or Philly) over famous ones elsewhere.
  const params = new URLSearchParams({
    q, limit: String(limit), lat: c.lat, lon: c.lng, lang: 'en', zoom: '10', location_bias_scale: '0.1',
  });
  params.append('osm_tag', 'amenity');
  const places = await query(params, signal);
  return places.sort((a, b) => Number(b.isFood) - Number(a.isFood));
}

// Any place or street address, no category filter.
export async function searchAny(q, loc, limit = 6) {
  const c = loc || HOME_CENTER;
  const params = new URLSearchParams({
    q, limit: String(limit), lat: c.lat, lon: c.lng, lang: 'en', zoom: '10', location_bias_scale: '0.1',
  });
  return query(params);
}

// Address lookup for manually added restaurants.
export async function geocodeAddress(q, loc) {
  const c = loc || HOME_CENTER;
  const params = new URLSearchParams({ q, limit: '1', lat: c.lat, lon: c.lng, lang: 'en' });
  const places = await query(params);
  return places[0] || null;
}

// Website / cuisine / image for OpenStreetMap places, up to 50 per request.
export async function lookupDetails(osmRefs) {
  const ids = [...new Set(osmRefs.filter(Boolean))];
  const out = {};
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const res = await fetch(
      `https://nominatim.openstreetmap.org/lookup?osm_ids=${chunk.join(',')}&format=json&extratags=1`
    );
    if (res.ok) {
      const data = await res.json();
      for (const d of data) {
        const ref = `${d.osm_type[0].toUpperCase()}${d.osm_id}`;
        const x = d.extratags || {};
        out[ref] = {
          website: x.website || x['contact:website'] || x.url || null,
          cuisine: x.cuisine ? titleCase(x.cuisine) : null,
          image: /^https?:\/\//.test(x.image || '') ? x.image : null,
        };
      }
    }
    if (i + 50 < ids.length) await new Promise((r) => setTimeout(r, 1100));
  }
  return out;
}
