// GET /api/recipe?url=https://...  →  { name, ingredients, steps, servings, prep_min, cook_min, cuisine, meal_type, image, source_url }
// Reads the recipe data most recipe sites embed for Google (schema.org "Recipe" JSON-LD). Free, runs on Vercel.
import dns from 'node:dns/promises';
import net from 'node:net';

const MAX_BYTES = 4 * 1024 * 1024;
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// ---------- only fetch public web pages ----------
function privateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224
    );
  }
  const v = ip.toLowerCase();
  if (v.startsWith('::ffff:')) return privateIp(v.slice(7));
  return v === '::' || v === '::1' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80');
}

async function assertPublic(u) {
  if (!/^https?:$/.test(u.protocol)) throw new Error('Only http and https links work.');
  const addrs = await dns.lookup(u.hostname, { all: true }).catch(() => []);
  if (!addrs.length) throw new Error(`Couldn't find ${u.hostname}.`);
  if (addrs.some((a) => privateIp(a.address))) throw new Error('That address is not allowed.');
}

async function fetchPage(start) {
  let u = start;
  for (let hop = 0; hop < 5; hop++) {
    await assertPublic(u);
    const res = await fetch(u, {
      redirect: 'manual',
      signal: AbortSignal.timeout(10000),
      headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml', 'accept-language': 'en-US,en;q=0.9' },
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      u = new URL(res.headers.get('location'), u);
      continue;
    }
    if (!res.ok) throw new Error(`The site answered ${res.status}${res.status === 403 ? ' (it blocks automatic readers)' : ''}.`);
    const reader = res.body.getReader();
    const chunks = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_BYTES) break;
      chunks.push(value);
    }
    reader.cancel().catch(() => {});
    return { html: Buffer.concat(chunks).toString('utf8'), finalUrl: u.toString() };
  }
  throw new Error('Too many redirects.');
}

// ---------- text cleanup ----------
const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', deg: '°', frac12: '½', frac14: '¼', frac34: '¾', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', hellip: '…', eacute: 'é', egrave: 'è', ntilde: 'ñ', reg: '®', trade: '™', copy: '©' };
function decode(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+\d*);/gi, (m, n) => NAMED[n.toLowerCase()] ?? m);
}
const clean = (s) =>
  decode(decode(String(s ?? '')))
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/[ \t ]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
const oneLine = (s) => clean(s).replace(/\n+/g, ' ').trim();

// ---------- find the Recipe object ----------
const isRecipe = (n) => n && typeof n === 'object' && [].concat(n['@type'] || []).some((t) => /recipe$/i.test(String(t)));
function findRecipe(node, depth = 0) {
  if (!node || depth > 6) return null;
  if (Array.isArray(node)) {
    for (const x of node) {
      const r = findRecipe(x, depth + 1);
      if (r) return r;
    }
    return null;
  }
  if (typeof node !== 'object') return null;
  if (isRecipe(node)) return node;
  for (const k of ['@graph', 'mainEntity', 'mainEntityOfPage', 'itemListElement', 'item']) {
    const r = findRecipe(node[k], depth + 1);
    if (r) return r;
  }
  return null;
}

function recipeFromHtml(html) {
  const re = /<script[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    const text = m[1].trim().replace(/^<!--|-->$/g, '');
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      try {
        data = JSON.parse(text.replace(/[\u0000-\u001f]+/g, ' '));
      } catch {
        continue;
      }
    }
    const r = findRecipe(data);
    if (r) return r;
  }
  return null;
}

// ---------- field mapping ----------
function minutes(iso) {
  if (!iso || typeof iso !== 'string') return null;
  const m = iso.match(/^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i);
  if (!m) return null;
  const t = (Number(m[1]) || 0) * 1440 + (Number(m[2]) || 0) * 60 + (Number(m[3]) || 0) + (Number(m[4]) || 0) / 60;
  return t > 0 && t <= 1440 ? Math.round(t) : null;
}

function steps(ins) {
  const out = [];
  const walk = (x) => {
    if (!x) return;
    if (typeof x === 'string') {
      // Some sites put every step in one string.
      clean(x)
        .split(/\n+/)
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach((s) => out.push(s));
      return;
    }
    if (Array.isArray(x)) return x.forEach(walk);
    if (typeof x === 'object') {
      if (x.itemListElement) return walk(x.itemListElement); // HowToSection
      const t = oneLine(x.text || x.name || x.description || '');
      if (t) out.push(t);
    }
  };
  walk(ins);
  return out.map((s) => s.replace(/^(step\s*)?\d+[.):]\s+/i, '')).filter(Boolean).slice(0, 80);
}

function firstText(v) {
  const x = [].concat(v || []).find((s) => typeof s === 'string' && s.trim());
  return x ? oneLine(x) : null;
}

function servings(y) {
  for (const v of [].concat(y || [])) {
    const n = parseInt(String(v).match(/\d+/)?.[0], 10);
    if (n > 0 && n <= 100) return n;
  }
  return null;
}

const TYPES = [
  [/breakfast|brunch/i, 'Breakfast'],
  [/dessert|baking|cake|cookie|sweet/i, 'Dessert'],
  [/side/i, 'Side'],
  [/drink|beverage|cocktail|smoothie/i, 'Drink'],
  [/snack|appetizer|starter/i, 'Snack'],
  [/lunch|sandwich|salad/i, 'Lunch'],
  [/dinner|main|entr[eé]e|supper/i, 'Dinner'],
];
function mealType(cat) {
  const s = [].concat(cat || []).join(' ');
  return TYPES.find(([re]) => re.test(s))?.[1] || null;
}

function image(img, base) {
  for (const v of [].concat(img || [])) {
    const raw = typeof v === 'string' ? v : v?.url || v?.contentUrl;
    if (!raw) continue;
    try {
      const u = new URL(raw, base);
      if (/^https?:$/.test(u.protocol)) return u.toString();
    } catch {
      /* skip */
    }
  }
  return null;
}

export default async function handler(req, res) {
  res.setHeader('content-type', 'application/json; charset=utf-8');
  const raw = String(req.query?.url || '').trim();
  let u;
  try {
    u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return res.status(400).json({ error: "That doesn't look like a link." });
  }
  try {
    const { html, finalUrl } = await fetchPage(u);
    const r = recipeFromHtml(html);
    if (!r) return res.status(422).json({ error: "Couldn't find a recipe on that page." });
    let prep = minutes(r.prepTime);
    let cook = minutes(r.cookTime);
    const total = minutes(r.totalTime);
    if (total && prep == null && cook == null) cook = total;
    else if (total && cook == null && prep != null && total > prep) cook = total - prep;
    const ingredients = [].concat(r.recipeIngredient || r.ingredients || []).map(oneLine).filter(Boolean).slice(0, 80);
    res.setHeader('cache-control', 's-maxage=86400');
    return res.status(200).json({
      name: oneLine(r.name || r.headline || '').slice(0, 120) || null,
      ingredients,
      steps: steps(r.recipeInstructions),
      servings: servings(r.recipeYield),
      prep_min: prep,
      cook_min: cook,
      cuisine: firstText(r.recipeCuisine),
      meal_type: mealType(r.recipeCategory),
      image: image(r.image, finalUrl),
      source_url: finalUrl,
    });
  } catch (e) {
    const msg = e?.name === 'TimeoutError' ? 'The site took too long to answer.' : e?.message || 'Something went wrong.';
    return res.status(502).json({ error: msg });
  }
}
