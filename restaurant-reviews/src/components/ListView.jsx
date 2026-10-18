import { useEffect, useMemo, useState } from 'react';
import { PEOPLE } from '../config';
import { fmtDate, fmtMiles, fmtScore, priceLabel, store, TIERS, MEALS } from '../utils';
import { MealTags, MealFilter } from './Meals';
import Meta from './Meta';
import Score from './Score';
import Thumb from './Thumb';
import NearbyView from './NearbyView';

const BEEN_SORTS = [
  { key: 'overall', label: 'Overall rating' },
  ...PEOPLE.map((p) => ({ key: `p:${p.key}`, label: `${p.label}'s rating` })),
  { key: 'distance', label: 'Distance' },
  { key: 'recent', label: 'Most recent visit' },
  { key: 'visits', label: 'Most visits' },
  { key: 'name', label: 'Name' },
];
const TRY_SORTS = [
  { key: 'added', label: 'Recently added' },
  { key: 'distance', label: 'Distance' },
  { key: 'name', label: 'Name' },
];

const defaultDir = (key) => (key === 'distance' || key === 'name' ? 'asc' : 'desc');

function sortValue(row, key) {
  if (key === 'overall') return row.overall;
  if (key.startsWith('p:')) return row.avg[key.slice(2)];
  if (key === 'distance') return row.distance;
  if (key === 'recent') return row.lastVisit;
  if (key === 'visits') return row.visits.length;
  if (key === 'added') return row.created_at;
  if (key === 'name') return row.name.toLowerCase();
  return null;
}

const EMPTY_FILTERS = { q: '', cuisine: '', area: '', price: '', tier: '', meal: '' };

export default function ListView({
  rows, loc, loading, user, section, onSection: setSection, onSwitchUser, onLocate, onSelect, onQuickTry, onLogNew,
}) {
  const [sorts, setSorts] = useState(() =>
    store.get('rr_sorts', { been: { key: 'overall', dir: 'desc' }, try: { key: 'added', dir: 'desc' } })
  );
  const [filters, setFilters] = useState(() => ({ ...EMPTY_FILTERS, ...store.get('rr_filters2', {}) }));
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => store.set('rr_sorts', sorts), [sorts]);
  useEffect(() => store.set('rr_filters2', filters), [filters]);

  const been = useMemo(() => rows.filter((r) => r.been), [rows]);
  const toTry = useMemo(() => rows.filter((r) => !r.been), [rows]);
  const base = section === 'been' ? been : toTry;
  const sort = sorts[section] || sorts.been;
  const sortOptions = section === 'been' ? BEEN_SORTS : TRY_SORTS;

  const cuisines = useMemo(() => [...new Set(base.map((r) => r.cuisine).filter(Boolean))].sort(), [base]);
  const areas = useMemo(() => [...new Set(base.map((r) => r.neighborhood || r.city).filter(Boolean))].sort(), [base]);

  const filterKeys = section === 'been' ? ['cuisine', 'area', 'price', 'tier'] : ['cuisine', 'area', 'price'];
  const mealCounts = useMemo(
    () => Object.fromEntries(MEALS.map((m) => [m, base.filter((r) => r.meals.includes(m)).length])),
    [base]
  );
  const activeFilterCount = filterKeys.filter((k) => filters[k] !== '').length;

  const list = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    const tierMin = filters.tier ? TIERS.find((t) => t.key === filters.tier)?.min : null;
    const filtered = base.filter((r) => {
      const hay = `${r.name} ${r.cuisine || ''} ${r.neighborhood || ''} ${r.city || ''} ${r.recommended_by || ''}`;
      if (q && !hay.toLowerCase().includes(q)) return false;
      if (filters.cuisine && r.cuisine !== filters.cuisine) return false;
      if (filters.area && (r.neighborhood || r.city) !== filters.area) return false;
      if (filters.price && String(r.price) !== filters.price) return false;
      if (section === 'been') {
        if (tierMin != null && !(r.overall != null && Math.round(r.overall * 10) / 10 >= tierMin)) return false;
      }
      if (filters.meal && !r.meals.includes(filters.meal)) return false;
      return true;
    });
    const mult = sort.dir === 'asc' ? 1 : -1;
    return filtered.sort((a, b) => {
      const va = sortValue(a, sort.key);
      const vb = sortValue(b, sort.key);
      if (va == null && vb == null) return a.name.localeCompare(b.name);
      if (va == null) return 1;
      if (vb == null) return -1;
      if (va < vb) return -1 * mult;
      if (va > vb) return 1 * mult;
      return a.name.localeCompare(b.name);
    });
  }, [base, filters, sort, section]);

  const changeSort = (key) => {
    setSorts((s) => ({ ...s, [section]: { key, dir: defaultDir(key) } }));
    if (key === 'distance' && !loc) onLocate();
  };
  const flipDir = () =>
    setSorts((s) => ({ ...s, [section]: { ...s[section], dir: s[section].dir === 'asc' ? 'desc' : 'asc' } }));
  const setF = (k, v) => setFilters((f) => ({ ...f, [k]: v }));
  const userLabel = PEOPLE.find((p) => p.key === user)?.label;

  return (
    <div className="list-view">
      {/* The boxes printed across the top of a guest check */}
      <div className="check-head" role="tablist">
        <button
          role="tab"
          aria-selected={section === 'been'}
          className={`box ${section === 'been' ? 'on' : ''}`}
          onClick={() => setSection('been')}
        >
          <span className="box-label">Been</span>
          <span className="box-value">{been.length}</span>
        </button>
        <button
          role="tab"
          aria-selected={section === 'try'}
          className={`box ${section === 'try' ? 'on' : ''}`}
          onClick={() => setSection('try')}
        >
          <span className="box-label">To try</span>
          <span className="box-value">{toTry.length}</span>
        </button>
        <button
          role="tab"
          aria-selected={section === 'near'}
          className={`box ${section === 'near' ? 'on' : ''}`}
          onClick={() => setSection('near')}
        >
          <span className="box-label">Nearby</span>
          <span className="box-value near-pin">⌖</span>
        </button>
        <button className="box server" onClick={onSwitchUser} title="Switch who's rating on this phone">
          <span className="box-label">Server</span>
          <span className="box-value">{userLabel}</span>
        </button>
      </div>

      {section === 'near' ? (
        <NearbyView rows={rows} loc={loc} onLocate={onLocate} onSelect={onSelect} onQuickTry={onQuickTry} onLogNew={onLogNew} />
      ) : (
      <>
      <div className="list-controls">
        <input
          className="lined-input"
          type="search"
          placeholder={section === 'been' ? 'Search restaurants' : 'Search your try list'}
          value={filters.q}
          onChange={(e) => setF('q', e.target.value)}
        />
        <div className="control-row">
          <label className="sort">
            <span>Sort</span>
            <select value={sort.key} onChange={(e) => changeSort(e.target.value)}>
              {sortOptions.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <button className="text-btn" onClick={flipDir} aria-label="Reverse order">
            {sort.dir === 'asc' ? 'Low to high' : 'High to low'}
          </button>
          <button className={`text-btn ${activeFilterCount ? 'on' : ''}`} onClick={() => setShowFilters((s) => !s)}>
            Filter{activeFilterCount ? ` (${activeFilterCount})` : ''}
          </button>
        </div>

        <MealFilter value={filters.meal} onChange={(v) => setF('meal', v)} counts={mealCounts} />

        {showFilters && (
          <div className="filters">
            {section === 'been' && (
              <label>
                Rating
                <select value={filters.tier} onChange={(e) => setF('tier', e.target.value)}>
                  <option value="">Any</option>
                  {TIERS.slice(0, 4).map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.label}
                      {t.key === 'excellent' ? '' : ' or better'}
                    </option>
                  ))}
                </select>
              </label>
            )}
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
            <button className="text-btn" onClick={() => setFilters({ ...EMPTY_FILTERS, q: filters.q })}>
              Clear filters
            </button>
          </div>
        )}

        {sort.key === 'distance' && !loc && (
          <div className="banner">
            Sorting by distance needs your location.
            <button className="btn small" onClick={onLocate}>
              Allow
            </button>
          </div>
        )}
      </div>

      <ol className="check-lines">
        {list.map((r, i) => (
          <li key={r.id}>
            <button className="line-row" onClick={() => onSelect(r.id)}>
              <span className="line-no">{i + 1}</span>
              <Thumb row={r} />
              <span className="line-main">
                <span className="line-name">{r.name}</span>
                <Meta row={r} />
                <MealTags meals={r.meals} />
                {section === 'been' ? (
                  <span className="line-people">
                    {PEOPLE.map((p) => (
                      <span key={p.key}>
                        {p.label} <b>{fmtScore(r.avg[p.key])}</b>
                      </span>
                    ))}
                    {r.visits.length > 1 && <span>{r.visits.length} visits</span>}
                    {r.lastVisit && <span>{fmtDate(r.lastVisit)}</span>}
                  </span>
                ) : (
                  <span className="line-people">
                    {r.recommended_by && <span>From {r.recommended_by}</span>}
                    {r.try_notes && <span className="clip">{r.try_notes}</span>}
                  </span>
                )}
              </span>
              <span className="line-amount">
                {section === 'been' ? (
                  <Score value={r.overall} />
                ) : (
                  <span className="dist">{r.distance != null ? fmtMiles(r.distance) : ''}</span>
                )}
                {section === 'been' && r.distance != null && <span className="dist">{fmtMiles(r.distance)}</span>}
              </span>
            </button>
          </li>
        ))}
      </ol>

      {!loading && base.length === 0 && (
        <p className="empty">
          {section === 'been'
            ? 'Nothing here yet. Tap + to log your first visit.'
            : 'No places saved yet. Tap + and choose "Add to try list".'}
        </p>
      )}
      {!loading && base.length > 0 && list.length === 0 && <p className="empty">No matches for those filters.</p>}
      </>
      )}
    </div>
  );
}
