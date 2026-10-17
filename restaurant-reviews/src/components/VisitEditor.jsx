import { useEffect, useMemo, useState } from 'react';
import { supabase, photoUrl, PHOTO_BUCKET } from '../supabase';
import { PEOPLE } from '../config';
import { searchPlaces, geocodeAddress } from '../photon';
import { compressImage, priceLabel, todayISO } from '../utils';
import Sheet from './Sheet';

function newId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  // Fallback for older browsers
  return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) =>
    (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16)
  );
}

export default function VisitEditor({ rows, loc, user, restaurant, visit, onClose, onSaved }) {
  const editing = Boolean(visit);
  const lockedRestaurant = Boolean(restaurant);

  // ----- restaurant choice -----
  const [choice, setChoice] = useState(restaurant ? { type: 'existing', row: restaurant } : null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [manual, setManual] = useState(false);
  const [manualName, setManualName] = useState('');
  const [manualAddress, setManualAddress] = useState('');
  const [useHere, setUseHere] = useState(false);

  // ----- visit form -----
  const [form, setForm] = useState(() => ({
    visit_date: visit?.visit_date || todayISO(),
    scores: Object.fromEntries(
      PEOPLE.map((p) => [p.key, visit?.[`${p.key}_score`] != null ? String(visit[`${p.key}_score`]) : ''])
    ),
    dishes: visit?.dishes || '',
    cost: visit?.cost != null ? String(visit.cost) : '',
    would_return: visit?.would_return ?? null,
    notes: visit?.notes || '',
    cuisine: '',
    price: '',
  }));
  const [keptPhotos, setKeptPhotos] = useState(visit?.photos || []);
  const [newFiles, setNewFiles] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setScore = (k, v) => setForm((f) => ({ ...f, scores: { ...f.scores, [k]: v } }));

  // Debounced place search
  useEffect(() => {
    if (choice || manual) return;
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
        if (e.name !== 'AbortError') setSearchError('Search is unavailable right now. Add it manually below.');
      } finally {
        if (!ctrl.signal.aborted) setSearching(false);
      }
    }, 350);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query, loc, choice, manual]);

  const localMatches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return rows.filter((r) => r.name.toLowerCase().includes(q)).slice(0, 5);
  }, [rows, query]);

  const previews = useMemo(() => newFiles.map((f) => URL.createObjectURL(f)), [newFiles]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

  const pickPlace = (place) => {
    const existing = place.osm_ref && rows.find((r) => r.osm_ref === place.osm_ref);
    if (existing) {
      setChoice({ type: 'existing', row: existing });
    } else {
      setChoice({ type: 'new', place });
      setForm((f) => ({ ...f, cuisine: place.cuisine || '' }));
    }
  };

  const resetChoice = () => {
    setChoice(null);
    setManual(false);
  };

  const isNewRestaurant = (choice && choice.type === 'new') || manual;

  async function resolveRestaurant() {
    if (choice?.type === 'existing') return { id: choice.row.id, created: false };

    let base;
    if (choice?.type === 'new') {
      base = choice.place;
    } else if (manual) {
      const name = manualName.trim();
      if (!name) throw new Error('Enter the restaurant name.');
      const address = manualAddress.trim();
      if (useHere) {
        if (!loc) throw new Error("Your location isn't available. Allow location or enter an address.");
        base = { name, address: address || null, city: '', neighborhood: '', lat: loc.lat, lng: loc.lng };
      } else {
        if (!address) throw new Error('Enter an address so it can go on the map.');
        const g = await geocodeAddress(address, loc);
        if (!g) throw new Error("Couldn't find that address. Check it, or tick “I'm here now”.");
        base = { name, address, city: g.city, neighborhood: g.neighborhood, lat: g.lat, lng: g.lng };
      }
      base.osm_ref = null;
    } else {
      throw new Error('Pick a restaurant first.');
    }

    const insert = {
      name: base.name,
      address: base.address || null,
      city: base.city || null,
      neighborhood: base.neighborhood || null,
      lat: base.lat,
      lng: base.lng,
      osm_ref: base.osm_ref || null,
      cuisine: form.cuisine.trim() || null,
      price: form.price ? Number(form.price) : null,
      created_by: user,
    };
    const { data, error } = await supabase.from('restaurants').insert(insert).select('id').single();
    if (error) {
      // Someone already added this exact place — reuse it.
      if (error.code === '23505' && insert.osm_ref) {
        const found = await supabase.from('restaurants').select('id').eq('osm_ref', insert.osm_ref).single();
        if (found.error) throw found.error;
        return { id: found.data.id, created: false };
      }
      throw error;
    }
    return { id: data.id, created: true };
  }

  async function save() {
    setError(null);

    const scores = {};
    for (const p of PEOPLE) {
      const raw = String(form.scores[p.key]).trim().replace(',', '.');
      if (raw === '') {
        scores[`${p.key}_score`] = null;
        continue;
      }
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0 || n > 10) return setError(`${p.label}'s score must be between 0 and 10.`);
      scores[`${p.key}_score`] = Math.round(n * 10) / 10;
    }
    if (PEOPLE.every((p) => scores[`${p.key}_score`] == null)) return setError('Enter at least one score.');
    if (!form.visit_date) return setError('Pick a date.');
    let cost = null;
    if (form.cost.trim() !== '') {
      cost = Number(form.cost.replace(/[$,]/g, ''));
      if (!Number.isFinite(cost) || cost < 0) return setError('Cost must be a number.');
    }

    setSaving(true);
    let createdRestaurantId = null;
    const uploaded = [];
    try {
      const { id: restaurantId, created } = await resolveRestaurant();
      if (created) createdRestaurantId = restaurantId;

      const visitId = visit?.id || newId();
      for (const file of newFiles) {
        const blob = await compressImage(file);
        const path = `${visitId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
        const { error } = await supabase.storage
          .from(PHOTO_BUCKET)
          .upload(path, blob, { contentType: 'image/jpeg' });
        if (error) throw error;
        uploaded.push(path);
      }

      const payload = {
        restaurant_id: restaurantId,
        visit_date: form.visit_date,
        ...scores,
        dishes: form.dishes.trim() || null,
        cost,
        would_return: form.would_return,
        notes: form.notes.trim() || null,
        photos: [...keptPhotos, ...uploaded],
      };
      const res = editing
        ? await supabase.from('visits').update(payload).eq('id', visit.id)
        : await supabase.from('visits').insert({ id: visitId, ...payload, created_by: user });
      if (res.error) throw res.error;

      const removed = (visit?.photos || []).filter((p) => !keptPhotos.includes(p));
      if (removed.length) await supabase.storage.from(PHOTO_BUCKET).remove(removed);

      onSaved(restaurantId);
    } catch (e) {
      // Roll back anything half-saved
      if (uploaded.length) await supabase.storage.from(PHOTO_BUCKET).remove(uploaded);
      if (createdRestaurantId) await supabase.from('restaurants').delete().eq('id', createdRestaurantId);
      setError(e.message || String(e));
      setSaving(false);
    }
  }

  // ---------- render ----------
  const restaurantPicker = (
    <div className="form">
      <label>
        Restaurant
        <input
          type="search"
          autoFocus
          placeholder="Start typing a name…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>

      {localMatches.length > 0 && (
        <div className="results">
          <div className="results-label">Already on your list</div>
          {localMatches.map((r) => (
            <button key={r.id} className="result" onClick={() => setChoice({ type: 'existing', row: r })}>
              <b>{r.name}</b>
              <span className="muted small">{r.address || r.city}</span>
            </button>
          ))}
        </div>
      )}

      {query.trim().length >= 2 && (
        <div className="results">
          <div className="results-label">{searching ? 'Searching…' : 'Search results'}</div>
          {searchError && <div className="muted small">{searchError}</div>}
          {!searching && !searchError && results.length === 0 && (
            <div className="muted small">No matches. Try another spelling or add it manually.</div>
          )}
          {results.map((p, i) => (
            <button key={`${p.osm_ref || i}`} className="result" onClick={() => pickPlace(p)}>
              <b>{p.name}</b>
              <span className="muted small">
                {[p.kind && p.kind.replace(/_/g, ' '), p.address].filter(Boolean).join(' · ')}
              </span>
            </button>
          ))}
        </div>
      )}

      <button
        className="btn small"
        onClick={() => {
          setManual(true);
          setManualName(query.trim());
        }}
      >
        Can't find it? Add manually
      </button>
    </div>
  );

  const chosenSummary = choice && (
    <div className="chosen">
      <div>
        <b>{choice.type === 'existing' ? choice.row.name : choice.place.name}</b>
        <div className="muted small">
          {choice.type === 'existing' ? choice.row.address || choice.row.city : choice.place.address}
        </div>
        {choice.type === 'new' && <div className="tag">New restaurant</div>}
      </div>
      {!lockedRestaurant && (
        <button className="btn small" onClick={resetChoice}>
          Change
        </button>
      )}
    </div>
  );

  const manualForm = manual && (
    <div className="form">
      <div className="chosen">
        <b>Add manually</b>
        <button className="btn small" onClick={resetChoice}>
          Back to search
        </button>
      </div>
      <label>
        Name
        <input value={manualName} onChange={(e) => setManualName(e.target.value)} />
      </label>
      <label>
        Address
        <input
          value={manualAddress}
          placeholder="Street, city"
          onChange={(e) => setManualAddress(e.target.value)}
        />
      </label>
      <label className="check">
        <input type="checkbox" checked={useHere} onChange={(e) => setUseHere(e.target.checked)} />
        I'm here now. Use my location for the map pin.
      </label>
    </div>
  );

  const showVisitForm = Boolean(choice) || manual;

  return (
    <Sheet
      title={editing ? 'Edit visit' : 'Add a visit'}
      onClose={onClose}
      dismissOnBackdrop={false}
      footer={
        showVisitForm && (
          <>
            {error && <div className="error-text">{error}</div>}
            <button className="btn primary block" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </>
        )
      }
    >
      {!choice && !manual && restaurantPicker}
      {chosenSummary}
      {manualForm}

      {showVisitForm && (
        <div className="form">
          <label>
            Date
            <input type="date" value={form.visit_date} onChange={(e) => set('visit_date', e.target.value)} />
          </label>

          <div className="score-inputs">
            {PEOPLE.map((p) => (
              <label key={p.key} className={p.key === user ? 'mine' : ''}>
                {p.label}'s score
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0–10"
                  value={form.scores[p.key]}
                  onChange={(e) => setScore(p.key, e.target.value)}
                />
              </label>
            ))}
          </div>
          <div className="muted small">Leave a score blank if that person wasn't there.</div>

          {isNewRestaurant && (
            <div className="row gap">
              <label className="grow">
                Cuisine
                <input value={form.cuisine} placeholder="e.g. Thai" onChange={(e) => set('cuisine', e.target.value)} />
              </label>
              <label>
                Price
                <select value={form.price} onChange={(e) => set('price', e.target.value)}>
                  <option value="">—</option>
                  {[1, 2, 3, 4].map((p) => (
                    <option key={p} value={String(p)}>
                      {priceLabel(p)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          <details className="extras" open={editing}>
            <summary>More details (optional)</summary>
            <label>
              What you ordered
              <input value={form.dishes} onChange={(e) => set('dishes', e.target.value)} />
            </label>
            <label>
              Total cost ($)
              <input
                type="text"
                inputMode="decimal"
                value={form.cost}
                onChange={(e) => set('cost', e.target.value)}
              />
            </label>
            <div className="field">
              <span>Would go back?</span>
              <div className="seg">
                {[
                  [true, 'Yes'],
                  [false, 'No'],
                  [null, '—'],
                ].map(([val, label]) => (
                  <button
                    key={label}
                    type="button"
                    className={form.would_return === val ? 'on' : ''}
                    onClick={() => set('would_return', val)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <label>
              Notes
              <textarea rows={3} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
            </label>
            <div className="field">
              <span>Photos</span>
              <div className="thumbs">
                {keptPhotos.map((p) => (
                  <div key={p} className="thumb-edit">
                    <img src={photoUrl(p)} alt="" />
                    <button onClick={() => setKeptPhotos((k) => k.filter((x) => x !== p))} aria-label="Remove">
                      ✕
                    </button>
                  </div>
                ))}
                {previews.map((u, i) => (
                  <div key={u} className="thumb-edit">
                    <img src={u} alt="" />
                    <button
                      onClick={() => setNewFiles((f) => f.filter((_, j) => j !== i))}
                      aria-label="Remove"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => {
                  const files = [...(e.target.files || [])];
                  setNewFiles((f) => [...f, ...files]);
                  e.target.value = '';
                }}
              />
            </div>
          </details>
        </div>
      )}
    </Sheet>
  );
}
