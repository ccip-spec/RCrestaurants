// ReCIPes: home recipes for C and R only.

export const RECIPES_NAME = 'ReCIPes';
export const RECIPE_TYPES = ['Breakfast', 'Lunch', 'Dinner', 'Side', 'Dessert', 'Snack', 'Drink'];

// Only the two original people (C and R) see recipes. The database enforces the same rule.
export const isAdmin = (member) => member?.legacy_key === 'c' || member?.legacy_key === 'r';

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
