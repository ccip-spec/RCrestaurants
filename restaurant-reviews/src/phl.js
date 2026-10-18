// Philadelphia's open data: every active "Food Preparing and Serving" license in the city.
// Public SQL API from the City of Philadelphia (phl.carto.com) — no key needed.
import { HOME_CENTER } from './config';

const API = 'https://phl.carto.com/api/v2/sql';
const FOOD_LICENSES = "('Food Preparing and Serving','Food Preparing and Serving (30+ SEATS)')";

const SMALL = new Set(['and', 'of', 'the', 'a', 'at', 'on', 'in', 'de', 'la', 'di', 'del', 'by']);

function titleCase(s) {
  return s
    .toLowerCase()
    .split(/(\s+|-|\/)/)
    .map((w, i) => {
      if (!/[a-z]/.test(w)) return w;
      if (i > 0 && SMALL.has(w)) return w;
      // keep things like "bbq", "ii" readable
      if (/^(bbq|ii|iii|iv|nyc|usa|pa)$/.test(w)) return w.toUpperCase();
      return w.replace(/^([^a-z]*)([a-z])/, (_, pre, c) => pre + c.toUpperCase()).replace(/'S\b/g, "'s");
    })
    .join('');
}

const ENTITY = /[,.]?\s*\b(l\.?l\.?c\.?|inc\.?|incorporated|corp\.?|corporation|co\.?|company|l\.?p\.?|ltd\.?|pllc|llp)\s*$/i;

// "CURT FLOOD BOOKING INC (ROYAL TAVERN)" -> "Royal Tavern"; "Giuseppe & Sons Restaurant Group LLC" -> "Giuseppe & Sons"
export function cleanName(business, legal) {
  let s = (business || legal || '').trim();
  const paren = s.match(/\(([^)]+)\)/);
  if (paren && /[a-z]/i.test(paren[1])) s = paren[1];
  const ta = s.match(/\b(?:t\/a|d\/b\/a|dba)\s+(.+)$/i);
  if (ta) s = ta[1];
  for (let i = 0; i < 3; i++) s = s.replace(ENTITY, '').trim();
  s = s.replace(/\s+(restaurant|hospitality)\s+group$/i, '').replace(/\s+/g, ' ').trim();
  if (s === s.toUpperCase()) s = titleCase(s);
  return s || 'Unnamed';
}

function cleanAddress(a) {
  if (!a) return '';
  return titleCase(a).replace(/\b(St|Ave|Rd|Blvd|Pl|Ln|Dr|Ct|Pkwy|Sq)\b/g, (m) => m);
}

function toPlace(row) {
  const street = cleanAddress(row.address);
  return {
    name: cleanName(row.business_name, row.legalname),
    address: [street, 'Philadelphia, PA'].filter(Boolean).join(', '),
    city: 'Philadelphia',
    neighborhood: '',
    lat: row.lat,
    lng: row.lng,
    osm_ref: `L${row.licensenum}`, // stored in the same "source id" column
    kind: 'restaurant',
    isFood: true,
    cuisine: '',
    source: 'philly',
    meters: row.meters ?? null,
  };
}

async function sql(q, signal) {
  const res = await fetch(`${API}?q=${encodeURIComponent(q)}`, { signal });
  if (!res.ok) throw new Error(`Philly lookup failed (${res.status})`);
  const data = await res.json();
  if (data.error) throw new Error(String(data.error));
  return data.rows || [];
}

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();

function dedupe(places) {
  const seen = new Set();
  return places.filter((p) => {
    const k = `${norm(p.name)}|${norm(p.address)}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

const point = (c) => `ST_SetSRID(ST_MakePoint(${Number(c.lng)},${Number(c.lat)}),4326)`;
const COLS = 'business_name, legalname, address, licensenum, ST_Y(the_geom) lat, ST_X(the_geom) lng';

// Name search across city food licenses, nearest first.
export async function searchPhilly(q, loc, signal, limit = 10) {
  const n = norm(q).replace(/'/g, '');
  if (n.length < 2) return [];
  const c = loc || HOME_CENTER;
  const like = `'%${n.replace(/'/g, "''")}%'`;
  const rows = await sql(
    `SELECT ${COLS} FROM business_licenses
     WHERE licensestatus = 'Active' AND licensetype IN ${FOOD_LICENSES} AND the_geom IS NOT NULL
       AND (regexp_replace(lower(business_name), '[^a-z0-9 ]', '', 'g') LIKE ${like}
         OR regexp_replace(lower(legalname), '[^a-z0-9 ]', '', 'g') LIKE ${like})
     ORDER BY the_geom <-> ${point(c)}
     LIMIT ${limit * 2}`,
    signal
  );
  return dedupe(rows.map(toPlace)).slice(0, limit);
}

// Food places within `meters` of a point, nearest first.
export async function nearbyPhilly(loc, meters = 800, limit = 60) {
  const c = loc || HOME_CENTER;
  const rows = await sql(
    `SELECT ${COLS}, ST_Distance(the_geom::geography, ${point(c)}::geography) meters
     FROM business_licenses
     WHERE licensestatus = 'Active' AND licensetype IN ${FOOD_LICENSES} AND the_geom IS NOT NULL
       AND ST_DWithin(the_geom::geography, ${point(c)}::geography, ${Number(meters)})
     ORDER BY meters
     LIMIT ${limit * 2}`
  );
  return dedupe(rows.map(toPlace)).slice(0, limit);
}

// True when two places are probably the same restaurant (close together, similar name).
export function samePlace(a, b) {
  if (a.lat == null || b.lat == null) return false;
  const dLat = (a.lat - b.lat) * 111000;
  const dLng = (a.lng - b.lng) * 85000;
  if (Math.hypot(dLat, dLng) > 90) return false;
  const wa = new Set(norm(a.name).split(' ').filter((w) => w.length > 2 && !SMALL.has(w)));
  return norm(b.name)
    .split(' ')
    .some((w) => wa.has(w));
}
