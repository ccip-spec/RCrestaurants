// ReCIPes: home recipes. Public ones are shared with the group; private ones only their author sees.

export const RECIPES_NAME = 'ReCIPes';
export const RECIPE_TYPES = ['Breakfast', 'Lunch', 'Dinner', 'Side', 'Dessert', 'Snack', 'Drink'];

// One entry per line. Strips pasted bullets and numbering ("- ", "• ", "1. ", "2) ", "Step 3:").
export function splitLines(text, numbered = false) {
  return (text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .map((l) => l.replace(/^[-*•·▢□☐]\s*/, ''))
    .map((l) => (numbered ? l.replace(/^(step\s*)?\d+\s*[.):-]?\s+/i, '') : l))
    .filter(Boolean);
}

export const totalMin = (r) => {
  const t = (r.prep_min || 0) + (r.cook_min || 0);
  return t > 0 ? t : null;
};

// Compact form for the list column: "3h 20m".
export function fmtShort(m) {
  if (m == null) return '';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h}h ${m % 60}m` : `${h}h`;
}

export function fmtMinutes(m) {
  if (m == null) return '';
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h} hr ${rest} min` : `${h} hr`;
}

// ---------- servings scaler ----------
const UNI = { '½': 1 / 2, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 1 / 4, '¾': 3 / 4, '⅕': 1 / 5, '⅛': 1 / 8, '⅜': 3 / 8, '⅝': 5 / 8, '⅞': 7 / 8 };
const U = Object.keys(UNI).join('');
const NUM = `(?:\\d+\\s+\\d+\\/\\d+|\\d+\\s*[${U}]|\\d+\\/\\d+|\\d*\\.\\d+|\\d+|[${U}])`;
const LEAD = new RegExp(`^(${NUM})(\\s*(?:-|–|to)\\s*(${NUM}))?`);

function parseNum(s) {
  s = s.trim();
  let m;
  if ((m = s.match(/^(\d+)\s+(\d+)\/(\d+)$/))) return +m[1] + m[2] / m[3];
  if ((m = s.match(new RegExp(`^(\\d+)\\s*([${U}])$`)))) return +m[1] + UNI[m[2]];
  if ((m = s.match(/^(\d+)\/(\d+)$/))) return m[2] > 0 ? m[1] / m[2] : null;
  if (UNI[s] != null) return UNI[s];
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const FRACS = [[0, ''], [1 / 8, '⅛'], [1 / 4, '¼'], [1 / 3, '⅓'], [3 / 8, '⅜'], [1 / 2, '½'], [5 / 8, '⅝'], [2 / 3, '⅔'], [3 / 4, '¾'], [7 / 8, '⅞'], [1, '']];

function fmtNum(v, decimal) {
  if (decimal || v >= 20) return String(Math.round(v * 100) / 100);
  let whole = Math.floor(v);
  const rest = v - whole;
  const [f, sym] = FRACS.reduce((best, c) => (Math.abs(c[0] - rest) < Math.abs(best[0] - rest) ? c : best));
  if (Math.abs(f - rest) > 0.05) return String(Math.round(v * 100) / 100);
  if (f === 1) whole += 1;
  if (!whole && !sym) return String(Math.round(v * 100) / 100);
  return `${whole || ''}${sym}`;
}

// Scales the amount at the start of an ingredient line: "1 1/2 cups flour" × 2 → "3 cups flour".
export function scaleIngredient(line, factor) {
  if (!factor || factor === 1) return line;
  const m = line.match(LEAD);
  if (!m) return line;
  const a = parseNum(m[1]);
  if (a == null) return line;
  const decimal = m[0].includes('.');
  let out = fmtNum(a * factor, decimal);
  if (m[3]) {
    const b = parseNum(m[3]);
    if (b != null) out += `–${fmtNum(b * factor, decimal)}`;
  }
  return out + line.slice(m[0].length);
}
