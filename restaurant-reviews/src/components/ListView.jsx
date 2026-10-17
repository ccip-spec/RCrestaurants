import { useEffect, useMemo, useState } from 'react';
import { PEOPLE } from '../config';
import { fmtDate, fmtMiles, fmtScore, priceLabel, store } from '../utils';
import Meta from './Meta';
import { SearchIcon } from './Icons';

const SORTS = [
  { key: 'overall', label: 'Overall rating' },
  ...PEOPLE.map((p) => ({ key: `p:${p.key}`, label: `${p.label}'s rating` })),
  { key: 'distance', label: 'Distance' },
  { key: 'recent', label: 'Most recent visit' },
  { key: 'visits', label: 'Most visits' },
  { key: 'name', label: 'Name' },
];

const defaultDir = (key) => (key === 'distance' || key === 'name' ? 'asc' : 'desc');

function sortValue(row, key) {
  if (key === 'overall') return row.overall;
  if (key.startsWith('p:')) return row.avg[key.slice(2)];
  if (key === 'distance') return row.distance;
  if (key === 'recent') return row.lastVisit;
  if (key === 'visits') return row.visits.length;
  if (key === 'name') return row.name.toLowerCase();
  return null;
}

const EMPTY_FILTERS = { q: '', cuisine: '', area: '', price: '', min: '' };

export default function ListView({ rows, loc, loading, onLocate, onSelect }) {
  const [sort, setSort] = useState(() => store.get('rr_sort', { key: 'overall', dir: 'desc' }));
  const [filters, setFilters] = useState(() => ({ ...EMPTY_FILTERS, ...store.get('rr_filters', {}) }));
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => store.set('rr_sort', sort), [sort]);
  useEffect(() => store.set('rr_filters', filters), [filters]);

  const cuisines = useMemo(
    () => [...new Set(rows.map((r) => r.cuisine).filter(Boolean))].sort(),
    [rows]
  );
  const areas = useMemo(
    () => [...new Set(rows.map((r) => r.neighborhood || r.city).filter(Boolean))].sort(),
    [rows]
  );

  const activeFilterCount = ['cuisine', 'area', 'price', 'min'].filter((k) => filters[k] !== '').length;

  const list = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    const filtered = rows.filter((r) => {
      if (q && !`${r.name} ${r.cuisine || ''} ${r.neighborhood || ''} ${r.city || ''}`.toLowerCase().includes(q))
        return false;
      if (filters.cuisine && r.cuisine !== filters.cuisine) return false;
      if (filters.area && (r.neighborhood || r.city) !== filters.area) return false;
      if (filters.price && String(r.price) !== filters.price) return false;
      if (filters.min && !(r.overall != null && r.overall >= Number(filters.min))) return false;
      return true;
    });
    const mult = sort.dir === 'asc' ? 1 : -1;
    return filtered.sort((a, b) => {
      const va = sortValue(a, sort.key);
      const vb = sortValue(b, sort.key);
      if (va == null && vb == null) return a.name.localeCompare(b.name);
      if (va == null) return 1; // blanks always last
      if (vb == null) return -1;
      if (va < vb) return -1 * mult;
      if (va > vb) return 1 * mult;
      return a.name.localeCompare(b.name);
    });
  }, [rows, filters, sort]);

  const changeSort = (key) => {
    setSort({ key, dir: defaultDir(key) });
    if (key === 'distance' && !loc) onLocate();
  };

  const setF = (k, v) => setFilters((f) => ({ ...f, [k]: v }));

  return (
    <div className="list-view">
      <div className="list-controls">
        <div className="search">
          <SearchIcon />
          <input
            type="search"
            placeholder="Search name, cuisine, area…"
            value={filters.q}
            onChange={(e) => setF('q', e.target.value)}
          />
        </div>
        <div className="row gap">
          <select value={sort.key} onChange={(e) => changeSort(e.target.value)} aria-label="Sort by">
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
          <button
            className="btn small"
            onClick={() => setSort((s) => ({ ...s, dir: s.dir === 'asc' ? 'desc' : 'asc' }))}
            aria-label="Reverse sort"
          >
            {sort.dir === 'asc' ? '↑' : '↓'}
          </button>
          <button
            className={`btn small ${activeFilterCount ? 'primary' : ''}`}
            onClick={() => setShowFilters((s) => !s)}
          >
            Filters{activeFilterCount ? ` (${activeFilterCount})` : ''}
          </button>
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
              Area
              <select value={filters.area} onChange={(e) => setF('area', e.target.value)}>
                <option value="">Any</option>
                {areas.map((a) => (
                  <option key={a}>{a}</option>
                ))}
              </select>
            </label>
            <label>
              Price
              <select value={filters.price} onChange={(e) => setF('price', e.target.value)}>
                <option value="">Any</option>
                {[1, 2, 3, 4].map((p) => (
                  <option key={p} value={String(p)}>
                    {priceLabel(p)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Min overall
              <select value={filters.min} onChange={(e) => setF('min', e.target.value)}>
                <option value="">Any</option>
                {[5, 6, 7, 8, 9].map((m) => (
                  <option key={m} value={String(m)}>
                    {m}+
                  </option>
                ))}
              </select>
            </label>
            <button className="btn small" onClick={() => setFilters({ ...EMPTY_FILTERS, q: filters.q })}>
              Clear filters
            </button>
          </div>
        )}

        {sort.key === 'distance' && !loc && (
          <div className="banner">
            Distance needs your location.{' '}
            <button className="btn small" onClick={onLocate}>
              Allow location
            </button>
          </div>
        )}
        <div className="count">
          {loading ? 'Loading…' : `${list.length} restaurant${list.length === 1 ? '' : 's'}`}
        </div>
      </div>

      <ul className="check">
        {list.map((r) => (
          <li key={r.id}>
            <button className="check-row" onClick={() => onSelect(r.id)}>
              <div className="check-main">
                <div className="check-name">{r.name}</div>
                <Meta row={r} />
                <div className="people">
                  {PEOPLE.map((p) => (
                    <span key={p.key}>
                      {p.label}
                      <b>{fmtScore(r.avg[p.key])}</b>
                    </span>
                  ))}
                  <span>
                    {r.visits.length} visit{r.visits.length === 1 ? '' : 's'}
                    {r.lastVisit ? `, last ${fmtDate(r.lastVisit)}` : ''}
                  </span>
                </div>
                {r.distance != null && <div className="meta">{fmtMiles(r.distance)} away</div>}
              </div>
              <div className={`check-total${r.overall == null ? ' none' : ''}`}>{fmtScore(r.overall)}</div>
            </button>
          </li>
        ))}
      </ul>
      {!loading && rows.length === 0 && (
        <p className="empty">No restaurants yet. Tap + to add your first.</p>
      )}
    </div>
  );
}
