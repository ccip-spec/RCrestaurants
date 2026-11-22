import { useEffect, useMemo, useState } from 'react';
import { usePeople, nameOf } from '../people';
import { store } from '../utils';
import { PrivateTag } from './Privacy';
import { RECIPE_TYPES, fmtMinutes, fmtShort, totalMin } from '../recipes';

const SORTS = [
  { key: 'name', label: 'Name' },
  { key: 'added', label: 'Recently added' },
  { key: 'time', label: 'Total time' },
  { key: 'ingredients', label: 'Fewest ingredients' },
];
const defaultDir = (key) => (key === 'added' ? 'desc' : 'asc');

function sortValue(r, key) {
  if (key === 'name') return r.name.toLowerCase();
  if (key === 'added') return r.created_at;
  if (key === 'time') return totalMin(r);
  if (key === 'ingredients') return r.ingredients?.length || null;
  return null;
}

const EMPTY = { q: '', type: '', cuisine: '', by: '', maxTime: '' };
const TIME_CAPS = [15, 30, 45, 60, 90];

export default function RecipesView({ recipes, scope, error, loading, onSelect, onAdd, onRetry }) {
  const { members, byId } = usePeople();
  const [sort, setSort] = useState(() => store.get('rr_recipe_sort', { key: 'name', dir: 'asc' }));
  const [filters, setFilters] = useState(() => ({ ...EMPTY, ...store.get('rr_recipe_filters', {}) }));
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => store.set('rr_recipe_sort', sort), [sort]);
  useEffect(() => store.set('rr_recipe_filters', filters), [filters]);

  const setF = (k, v) => setFilters((f) => ({ ...f, [k]: v }));
  const cuisines = useMemo(() => [...new Set(recipes.map((r) => r.cuisine).filter(Boolean))].sort(), [recipes]);
  const adders = useMemo(
    () => members.filter((m) => recipes.some((r) => r.created_by === m.id)),
    [members, recipes]
  );
  const typeCounts = useMemo(
    () => Object.fromEntries(RECIPE_TYPES.map((t) => [t, recipes.filter((r) => r.meal_type === t).length])),
    [recipes]
  );
  const activeCount = ['cuisine', 'by', 'maxTime'].filter((k) => filters[k] !== '').length;

  const list = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    const cap = filters.maxTime ? Number(filters.maxTime) : null;
    const out = recipes.filter((r) => {
      if (q) {
        // Search covers ingredients too, so "chicken" finds everything with chicken in it.
        const hay = `${r.name} ${r.cuisine || ''} ${r.meal_type || ''} ${(r.ingredients || []).join(' ')} ${r.notes || ''}`;
        if (!hay.toLowerCase().includes(q)) return false;
      }
      if (filters.type && r.meal_type !== filters.type) return false;
      if (filters.cuisine && r.cuisine !== filters.cuisine) return false;
      if (filters.by && r.created_by !== filters.by) return false;
      if (cap != null) {
        const t = totalMin(r);
        if (t == null || t > cap) return false;
      }
      return true;
    });
    const mult = sort.dir === 'asc' ? 1 : -1;
    return out.sort((a, b) => {
      const va = sortValue(a, sort.key);
      const vb = sortValue(b, sort.key);
      if (va == null && vb == null) return a.name.localeCompare(b.name);
      if (va == null) return 1;
      if (vb == null) return -1;
      if (va < vb) return -1 * mult;
      if (va > vb) return 1 * mult;
      return a.name.localeCompare(b.name);
    });
  }, [recipes, filters, sort]);

  if (error) {
    return (
      <div className="banner error" style={{ marginTop: 12 }}>
        Couldn't load recipes: {error}
        <button className="btn small" onClick={onRetry}>
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="recipes">
      <div className="list-controls">
        <input
          className="lined-input"
          type="search"
          placeholder="Search recipes or ingredients"
          value={filters.q}
          onChange={(e) => setF('q', e.target.value)}
        />
        <div className="control-row">
          <label className="sort">
            <span>Sort</span>
            <select value={sort.key} onChange={(e) => setSort({ key: e.target.value, dir: defaultDir(e.target.value) })}>
              {SORTS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <button
            className="text-btn"
            onClick={() => setSort((s) => ({ ...s, dir: s.dir === 'asc' ? 'desc' : 'asc' }))}
            aria-label="Reverse order"
          >
            {sort.key === 'name' ? (sort.dir === 'asc' ? 'A to Z' : 'Z to A') : sort.dir === 'asc' ? 'Low to high' : 'High to low'}
          </button>
          <button className={`text-btn ${activeCount ? 'on' : ''}`} onClick={() => setShowFilters((s) => !s)}>
            Filter{activeCount ? ` (${activeCount})` : ''}
          </button>
        </div>

        <div className="meal-filter" role="group" aria-label="Filter by type">
          <button className={!filters.type ? 'on' : ''} onClick={() => setF('type', '')}>
            All
          </button>
          {RECIPE_TYPES.map((t) => (
            <button key={t} className={filters.type === t ? 'on' : ''} onClick={() => setF('type', filters.type === t ? '' : t)}>
              {t}
              {typeCounts[t] ? <span className="n">{typeCounts[t]}</span> : null}
            </button>
          ))}
        </div>

        {showFilters && (
          <div className="filters">
            <label>
              Cuisine
              <select value={filters.cuisine} onChange={(e) => setF('cuisine', e.target.value)}>
                <option value="">Any</option>
                {cuisines.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label>
              Total time
              <select value={filters.maxTime} onChange={(e) => setF('maxTime', e.target.value)}>
                <option value="">Any</option>
                {TIME_CAPS.map((m) => (
                  <option key={m} value={String(m)}>
                    {fmtMinutes(m)} or less
                  </option>
                ))}
              </select>
            </label>
            <label>
              Added by
              <select value={filters.by} onChange={(e) => setF('by', e.target.value)}>
                <option value="">Anyone</option>
                {adders.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
            <button className="text-btn" onClick={() => setFilters({ ...EMPTY, q: filters.q, type: filters.type })}>
              Clear filters
            </button>
          </div>
        )}

        <button className="btn primary block recipe-add" onClick={onAdd}>
          Add a recipe
        </button>
      </div>

      <ol className="check-lines">
        {list.map((r, i) => {
          const t = totalMin(r);
          return (
            <li key={r.id}>
              <button className="line-row recipe-row" onClick={() => onSelect(r.id)}>
                <span className="line-no">{i + 1}</span>
                <span className="line-main">
                  <span className="line-name">{r.name}</span>
                  <span className="meta">
                    {r.meal_type && <span className="price">{r.meal_type}</span>}
                    {r.cuisine && <span>{r.cuisine}</span>}
                    {r.ingredients?.length > 0 && <span>{r.ingredients.length} ingredients</span>}
                  </span>
                  <span className="line-people">
                    {r.created_by && <span>From {nameOf(byId, r.created_by)}</span>}
                    {!r.is_public && <PrivateTag />}
                  </span>
                </span>
                <span className="line-amount">
                  <span className="recipe-time">{t ? fmtShort(t) : ''}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      {!loading && recipes.length === 0 && (
        <p className="empty">{scope === 'mine' ? "You haven't added a recipe yet." : 'No recipes yet. Add the first meal you make.'}</p>
      )}
      {!loading && recipes.length > 0 && list.length === 0 && <p className="empty">No recipes match.</p>}
    </div>
  );
}
