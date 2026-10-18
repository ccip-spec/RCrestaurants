import { useEffect, useMemo, useState } from 'react';
import { searchPlaces, searchNominatim } from '../photon';
import { searchPhilly, samePlace } from '../phl';
import { HOME_CENTER } from '../config';
import { haversineMiles } from '../utils';

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9 ]/g, '');

// City license list + OpenStreetMap, duplicates removed, best name matches and nearest first.
export async function findRestaurants(q, loc, signal) {
  const [phl, osm] = await Promise.allSettled([searchPhilly(q, loc, signal, 10), searchPlaces(q, loc, signal, 10)]);
  if (phl.status === 'rejected' && osm.status === 'rejected') throw osm.reason;
  const osmList = osm.status === 'fulfilled' ? osm.value.filter((p) => p.isFood) : [];
  const phlList = phl.status === 'fulfilled' ? phl.value.filter((p) => !osmList.some((o) => samePlace(o, p))) : [];
  const c = loc || HOME_CENTER;
  const nq = norm(q);
  const score = (p) => {
    const n = norm(p.name);
    const rank = n === nq ? 0 : n.startsWith(nq) ? 1 : n.includes(nq) ? 2 : 3;
    return rank * 1000 + haversineMiles(c.lat, c.lng, p.lat, p.lng);
  };
  let all = [...osmList, ...phlList];
  // Hide far-away namesakes (London, Paraguay...) when there are matches nearby.
  const near = all.filter((p) => haversineMiles(c.lat, c.lng, p.lat, p.lng) <= 40);
  if (near.length) all = near;
  return all.sort((a, b) => score(a) - score(b)).slice(0, 12);
}

// Search for a restaurant (your list first, then OpenStreetMap), or enter one by hand.
export default function PlacePicker({ rows, loc, onChoose }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [manual, setManual] = useState(false);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [useHere, setUseHere] = useState(false);

  useEffect(() => {
    if (manual) return;
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearchError(null);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        setResults(await findRestaurants(q, loc, ctrl.signal));
        setSearchError(null);
      } catch (e) {
        if (e.name !== 'AbortError') setSearchError('unavailable');
      } finally {
        if (!ctrl.signal.aborted) setSearching(false);
      }
    }, 350);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query, loc, manual]);

  const localMatches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return rows.filter((r) => r.name.toLowerCase().includes(q)).slice(0, 5);
  }, [rows, query]);

  const pickPlace = (place) => {
    const existing = rows.find((r) => (place.osm_ref && r.osm_ref === place.osm_ref) || samePlace(r, place));
    onChoose(existing ? { type: 'existing', row: existing } : { type: 'new', place });
  };

  if (manual) {
    return (
      <div className="form">
        <label>
          Restaurant name
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          Address
          <input value={address} placeholder="Street and city" onChange={(e) => setAddress(e.target.value)} />
        </label>
        <label className="check-label">
          <input type="checkbox" checked={useHere} onChange={(e) => setUseHere(e.target.checked)} />
          I'm here now. Put the map pin at my location.
        </label>
        <div className="row gap">
          <button
            className="btn primary"
            disabled={!name.trim()}
            onClick={() => onChoose({ type: 'manual', name, address, useHere })}
          >
            Use this restaurant
          </button>
          <button className="btn" onClick={() => setManual(false)}>
            Back to search
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="form">
      <label>
        Restaurant
        <input
          type="search"
          autoFocus
          placeholder="Start typing a name"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>

      {localMatches.length > 0 && (
        <div className="results">
          <div className="results-label">On your list</div>
          {localMatches.map((r) => (
            <button key={r.id} className="result" onClick={() => onChoose({ type: 'existing', row: r })}>
              <b>{r.name}</b>
              <span className="muted small">{r.address || r.city}</span>
            </button>
          ))}
        </div>
      )}

      {query.trim().length >= 2 && (
        <div className="results">
          <div className="results-label">{searching ? 'Searching' : 'Places'}</div>
          {searchError && <span className="muted small">Quick search isn't responding.</span>}

          {!searching && !searchError && results.length === 0 && (
            <div className="muted small">No matches. Try another spelling or add it by hand.</div>
          )}
          {results.map((p, i) => (
            <button key={`${p.osm_ref || i}`} className="result" onClick={() => pickPlace(p)}>
              <b>{p.name}</b>
              <span className="muted small">{p.address || p.kind.replace(/_/g, ' ')}</span>
            </button>
          ))}
          {!searching && (
            <button
              className="text-btn"
              onClick={async () => {
                setSearching(true);
                try {
                  const more = await searchNominatim(`${query.trim()}, Philadelphia`, 8);
                  setResults((cur) => [...cur, ...more.filter((m) => !cur.some((c) => c.osm_ref === m.osm_ref))]);
                  setSearchError(null);
                } catch {
                  setSearchError('unavailable');
                }
                setSearching(false);
              }}
            >
              Not here? Search more places
            </button>
          )}
        </div>
      )}

      <button
        className="btn link"
        onClick={() => {
          setManual(true);
          setName(query.trim());
        }}
      >
        Can't find it? Add it by hand
      </button>
    </div>
  );
}

export function ChosenPlace({ choice, onChange }) {
  const title =
    choice.type === 'existing' ? choice.row.name : choice.type === 'new' ? choice.place.name : choice.name;
  const sub =
    choice.type === 'existing'
      ? choice.row.address || choice.row.city
      : choice.type === 'new'
        ? choice.place.address
        : choice.useHere
          ? 'Pinned at your location'
          : choice.address;
  return (
    <div className="chosen">
      <div>
        <div className="chosen-name">{title}</div>
        {sub && <div className="muted small">{sub}</div>}
        {choice.type !== 'existing' && <div className="tag-new">New to your list</div>}
      </div>
      {onChange && (
        <button className="btn small" onClick={onChange}>
          Change
        </button>
      )}
    </div>
  );
}
