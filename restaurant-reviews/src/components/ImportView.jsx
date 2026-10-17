import { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { searchPlaces, searchNominatim, lookupDetails } from '../photon';
import { fmtScore } from '../utils';

// One-time import of restaurants from /import.json.
// Finds each place on OpenStreetMap, lets you check the match, then saves restaurants + visits.
const SKIP = '__skip__';
const NO_PIN = '__nopin__';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export default function ImportView({ rows, user, onDone }) {
  const [entries, setEntries] = useState(null);
  const [phase, setPhase] = useState('idle'); // idle | searching | ready | importing | done
  const [progress, setProgress] = useState('');
  const [log, setLog] = useState([]);

  useEffect(() => {
    fetch('/import.json')
      .then((r) => r.json())
      .then((list) => setEntries(list.map((e) => ({ ...e, results: [], pick: null, status: 'pending' }))))
      .catch(() => setEntries([]));
  }, []);

  const existingByRef = Object.fromEntries(rows.filter((r) => r.osm_ref).map((r) => [r.osm_ref, r]));
  const existingByName = Object.fromEntries(rows.map((r) => [r.name.toLowerCase(), r]));

  async function searchOne(entry) {
    const q = entry.query.trim();
    const withCity = /philadelphia/i.test(q) ? q : `${q}, Philadelphia`;
    let results = [];
    try {
      results = await searchNominatim(withCity, 5);
    } catch {
      /* fall through to Photon */
    }
    if (!results.length && !/^\d/.test(q)) {
      try {
        results = (await searchPlaces(q, null, undefined, 5)).slice(0, 5);
      } catch {
        /* no results */
      }
    }
    const best = /^\d/.test(q) ? results[0] : results.find((p) => p.isFood) || results[0];
    return { ...entry, results, pick: best ? best.osm_ref : NO_PIN, status: best ? 'found' : 'none' };
  }

  async function findAll() {
    setPhase('searching');
    const out = [];
    for (let i = 0; i < entries.length; i++) {
      setProgress(`Searching ${i + 1} of ${entries.length}: ${entries[i].name}`);
      out.push(await searchOne(entries[i]));
      await wait(1100); // Nominatim allows 1 request per second
    }
    setEntries(out);
    setProgress('');
    setPhase('ready');
  }

  async function research(i, q) {
    const e = await searchOne({ ...entries[i], query: q });
    setEntries((list) => list.map((x, j) => (j === i ? e : x)));
  }

  const setPick = (i, pick) => setEntries((list) => list.map((x, j) => (j === i ? { ...x, pick } : x)));

  async function runImport() {
    setPhase('importing');
    const todo = entries.filter((e) => e.pick !== SKIP && !alreadyImported(e));
    const refs = todo.map((e) => (e.pick !== NO_PIN ? e.pick : null)).filter(Boolean);
    setProgress('Looking up websites and cuisines');
    let details = {};
    try {
      details = await lookupDetails(refs);
    } catch {
      /* optional */
    }
    const results = [];
    for (let i = 0; i < todo.length; i++) {
      const e = todo[i];
      setProgress(`Saving ${i + 1} of ${todo.length}: ${e.name}`);
      try {
        const place = e.pick !== NO_PIN ? e.results.find((p) => p.osm_ref === e.pick) : null;
        let restaurantId = place && existingByRef[place.osm_ref]?.id;
        if (!restaurantId) {
          const d = (place && details[place.osm_ref]) || {};
          const ins = await supabase
            .from('restaurants')
            .insert({
              name: e.name,
              address: place?.address || null,
              city: place?.city || null,
              neighborhood: place?.neighborhood || null,
              lat: place?.lat ?? null,
              lng: place?.lng ?? null,
              osm_ref: place?.osm_ref || null,
              cuisine: d.cuisine || place?.cuisine || null,
              website: d.website || null,
              photo: d.image || null,
              created_by: user,
            })
            .select('id')
            .single();
          if (ins.error) throw ins.error;
          restaurantId = ins.data.id;
        }
        const v = await supabase.from('visits').insert({
          restaurant_id: restaurantId,
          visit_date: null,
          meal: e.meal || null,
          c_score: e.c ?? null,
          r_score: e.r ?? null,
          notes: e.notes || null,
          items: [],
          photos: [],
          created_by: user,
        });
        if (v.error) throw v.error;
        results.push({ name: e.name, ok: true });
      } catch (err) {
        results.push({ name: e.name, ok: false, msg: err.message || String(err) });
      }
    }
    setLog(results);
    setProgress('');
    setPhase('done');
    onDone();
  }

  function alreadyImported(e) {
    const byRef = e.pick && existingByRef[e.pick];
    const byName = existingByName[e.name.toLowerCase()];
    return Boolean((byRef && byRef.been) || (byName && byName.been));
  }

  if (!entries) return <div className="import"><p>Loading</p></div>;

  const toImport = entries.filter((e) => e.pick !== SKIP && !alreadyImported(e)).length;

  return (
    <div className="import">
      <h2 className="section-title">Import past restaurants</h2>
      <p className="muted small">
        {entries.length} restaurants from your notes. Find their locations, check each match, then import. Visits are
        saved without a date.
      </p>

      {phase === 'idle' && (
        <button className="btn primary block" onClick={findAll}>
          Find locations
        </button>
      )}
      {progress && <p className="progress">{progress}</p>}

      {phase === 'done' && (
        <div className="import-done">
          <p>
            Imported {log.filter((l) => l.ok).length} of {log.length}.
          </p>
          {log
            .filter((l) => !l.ok)
            .map((l) => (
              <p key={l.name} className="error-text">
                {l.name}: {l.msg}
              </p>
            ))}
          <a className="btn primary block" href="#">
            Back to the list
          </a>
        </div>
      )}

      {(phase === 'ready' || phase === 'searching' || phase === 'importing') && (
        <ol className="import-list">
          {entries.map((e, i) => {
            const done = alreadyImported(e);
            const picked = e.results.find((p) => p.osm_ref === e.pick);
            return (
              <li key={i} className={`import-row ${e.pick === SKIP ? 'skipped' : ''}`}>
                <div className="import-top">
                  <b>{e.name}</b>
                  <span className="muted small">
                    {e.meal} · C {fmtScore(e.c)} · R {fmtScore(e.r)}
                  </span>
                </div>
                {done ? (
                  <div className="muted small">Already on your list</div>
                ) : e.status === 'pending' ? (
                  <div className="muted small">Waiting</div>
                ) : (
                  <>
                    <select value={e.pick || NO_PIN} onChange={(ev) => setPick(i, ev.target.value)}>
                      {e.results.map((p) => (
                        <option key={p.osm_ref} value={p.osm_ref}>
                          {p.name} — {p.address || p.kind}
                        </option>
                      ))}
                      <option value={NO_PIN}>Import without a map pin</option>
                      <option value={SKIP}>Skip this one</option>
                    </select>
                    {picked && <div className="muted small">{picked.kind.replace(/_/g, ' ')}</div>}
                    <ResearchBox initial={e.query} onSearch={(q) => research(i, q)} />
                  </>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {phase === 'ready' && (
        <div className="import-foot">
          <button className="btn primary block" onClick={runImport} disabled={!toImport}>
            Import {toImport} restaurants
          </button>
        </div>
      )}
    </div>
  );
}

function ResearchBox({ initial, onSearch }) {
  const [q, setQ] = useState(initial);
  return (
    <div className="research">
      <input value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search again" />
      <button className="text-btn" onClick={() => onSearch(q)}>
        Search again
      </button>
    </div>
  );
}
