import { PEOPLE } from './config';

// ---------- numbers & formatting ----------
export function mean(values) {
  const nums = values
    .filter((x) => x !== null && x !== undefined && x !== '')
    .map(Number)
    .filter((x) => Number.isFinite(x));
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export function fmtScore(n) {
  return n == null ? '–' : (Math.round(n * 10) / 10).toFixed(1);
}

// Your rating scale
export const TIERS = [
  { min: 8.6, label: 'Excellent', key: 'excellent' },
  { min: 7.3, label: 'Really good', key: 'really-good' },
  { min: 6.3, label: 'Good', key: 'good' },
  { min: 5.4, label: 'Okay', key: 'okay' },
  { min: -Infinity, label: 'Bad', key: 'bad' },
];

export function tierOf(score) {
  if (score == null) return null;
  const s = Math.round(score * 10) / 10;
  return TIERS.find((t) => s >= t.min);
}

export function fmtMiles(mi) {
  if (mi == null) return '';
  if (mi < 0.1) return '<0.1 mi';
  if (mi < 10) return `${mi.toFixed(1)} mi`;
  return `${Math.round(mi).toLocaleString()} mi`;
}

export function fmtDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function fmtMoney(n) {
  if (n == null) return '';
  return Number(n).toLocaleString(undefined, { style: 'currency', currency: 'USD' });
}

export const priceLabel = (p) => (p ? '$'.repeat(p) : '');

export function todayISO() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export function initials(name) {
  const words = name.replace(/^the\s+/i, '').split(/[\s&+-]+/).filter(Boolean);
  return (words[0]?.[0] || '?').toUpperCase() + (words[1]?.[0] || '').toUpperCase();
}

// Parses a 0–10 score typed by a person. Returns { value } or { error }.
export function parseScore(raw, who) {
  const s = String(raw ?? '').trim().replace(',', '.');
  if (s === '') return { value: null };
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0 || n > 10) return { error: `${who} must be between 0 and 10.` };
  return { value: Math.round(n * 10) / 10 };
}

// ---------- distance ----------
export function haversineMiles(lat1, lng1, lat2, lng2) {
  const R = 3958.8;
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function getLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Location is not supported on this device'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      (e) =>
        reject(
          new Error(
            e.code === 1
              ? 'Location is blocked. Allow it in Settings to sort by distance.'
              : "Couldn't get your location."
          )
        ),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 5 * 60 * 1000 }
    );
  });
}

// ---------- derived rows ----------
export function visitAvg(v) {
  return mean(PEOPLE.map((p) => v[`${p.key}_score`]));
}

function byVisitOrder(a, b) {
  // Newest dated visits first, undated visits last.
  if (a.visit_date && b.visit_date && a.visit_date !== b.visit_date) return b.visit_date.localeCompare(a.visit_date);
  if (a.visit_date && !b.visit_date) return -1;
  if (!a.visit_date && b.visit_date) return 1;
  return b.created_at.localeCompare(a.created_at);
}

export function buildRows(restaurants, visits, loc) {
  const byRestaurant = {};
  for (const v of visits) {
    (byRestaurant[v.restaurant_id] ||= []).push(v);
  }
  return restaurants.map((r) => {
    const vs = (byRestaurant[r.id] || []).slice().sort(byVisitOrder);
    const avg = {};
    for (const p of PEOPLE) avg[p.key] = mean(vs.map((v) => v[`${p.key}_score`]));
    // Overall = average of every individual score across all visits.
    const overall = mean(vs.flatMap((v) => PEOPLE.map((p) => v[`${p.key}_score`])));
    const distance =
      loc && r.lat != null && r.lng != null ? haversineMiles(loc.lat, loc.lng, r.lat, r.lng) : null;
    return {
      ...r,
      visits: vs,
      been: vs.length > 0,
      avg,
      overall,
      lastVisit: vs.find((v) => v.visit_date)?.visit_date || null,
      meals: [...new Set(vs.map((v) => v.meal).filter(Boolean))],
      distance,
    };
  });
}

export function mapsUrl(r) {
  const q = encodeURIComponent(r.name);
  return `https://maps.apple.com/?q=${q}&ll=${r.lat},${r.lng}`;
}

export function siteHost(website) {
  if (!website) return null;
  try {
    return new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

// ---------- images ----------
export async function compressImage(file, maxDim = 1600, quality = 0.8) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error(`Could not read ${file.name}`));
      i.src = url;
    });
    const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * scale);
    const h = Math.round(img.naturalHeight * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
    return await new Promise((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Could not compress image'))),
        'image/jpeg',
        quality
      )
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ---------- local storage (per device) ----------
export const store = {
  get(key, fallback = null) {
    try {
      const v = localStorage.getItem(key);
      return v == null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      if (value == null) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage unavailable — ignore */
    }
  },
};
