import { useEffect, useMemo, useState } from 'react';
import { searchPlaces } from '../photon';

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
        setResults(await searchPlaces(q, loc, ctrl.signal));
        setSearchError(null);
      } catch (e) {
        if (e.name !== 'AbortError') setSearchError('Search is unavailable right now. Add it by hand instead.');
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
    const existing = place.osm_ref && rows.find((r) => r.osm_ref === place.osm_ref);
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
          {searchError && <div className="muted small">{searchError}</div>}
          {!searching && !searchError && results.length === 0 && (
            <div className="muted small">No matches. Try another spelling or add it by hand.</div>
          )}
          {results.map((p, i) => (
            <button key={`${p.osm_ref || i}`} className="result" onClick={() => pickPlace(p)}>
              <b>{p.name}</b>
              <span className="muted small">{p.address || p.kind.replace(/_/g, ' ')}</span>
            </button>
          ))}
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
