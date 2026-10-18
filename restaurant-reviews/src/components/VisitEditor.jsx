import { useEffect, useMemo, useState } from 'react';
import { supabase, photoUrl, PHOTO_BUCKET } from '../supabase';
import { PEOPLE } from '../config';
import { ensureRestaurant } from '../restaurants';
import { compressImage, parseScore, priceLabel, todayISO, MEALS } from '../utils';
import PlacePicker, { ChosenPlace } from './PlacePicker';
import Sheet from './Sheet';


function newId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) =>
    (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16)
  );
}

const blankItem = () => ({ name: '', ...Object.fromEntries(PEOPLE.map((p) => [p.key, ''])) });

export default function VisitEditor({ rows, loc, user, restaurant, visit, onClose, onSaved }) {
  const editing = Boolean(visit);
  const locked = Boolean(restaurant);
  const [choice, setChoice] = useState(restaurant ? { type: 'existing', row: restaurant } : null);

  const [form, setForm] = useState(() => ({
    visit_date: visit ? visit.visit_date || '' : todayISO(),
    meal: visit?.meal || null,
    scores: Object.fromEntries(
      PEOPLE.map((p) => [p.key, visit?.[`${p.key}_score`] != null ? String(visit[`${p.key}_score`]) : ''])
    ),
    cost: visit?.cost != null ? String(visit.cost) : '',
    would_return: visit?.would_return ?? null,
    notes: visit?.notes || '',
    cuisine: '',
    price: '',
  }));
  const [items, setItems] = useState(() =>
    (visit?.items || []).map((it) => ({
      name: it.name || '',
      ...Object.fromEntries(PEOPLE.map((p) => [p.key, it[p.key] != null ? String(it[p.key]) : ''])),
    }))
  );
  const [keptPhotos, setKeptPhotos] = useState(visit?.photos || []);
  const [newFiles, setNewFiles] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setScore = (k, v) => setForm((f) => ({ ...f, scores: { ...f.scores, [k]: v } }));
  const setItem = (i, k, v) => setItems((list) => list.map((it, j) => (j === i ? { ...it, [k]: v } : it)));

  const previews = useMemo(() => newFiles.map((f) => URL.createObjectURL(f)), [newFiles]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

  const isNew = choice && choice.type !== 'existing';

  async function save() {
    setError(null);
    const scores = {};
    for (const p of PEOPLE) {
      const r = parseScore(form.scores[p.key], `${p.label}'s score`);
      if (r.error) return setError(r.error);
      scores[`${p.key}_score`] = r.value;
    }
    if (PEOPLE.every((p) => scores[`${p.key}_score`] == null)) return setError('Enter at least one score.');

    const cleanItems = [];
    for (const it of items) {
      if (!it.name.trim()) continue;
      const out = { name: it.name.trim() };
      for (const p of PEOPLE) {
        const r = parseScore(it[p.key], `${p.label}'s score for ${it.name.trim()}`);
        if (r.error) return setError(r.error);
        out[p.key] = r.value;
      }
      cleanItems.push(out);
    }

    let cost = null;
    if (form.cost.trim() !== '') {
      cost = Number(form.cost.replace(/[$,]/g, ''));
      if (!Number.isFinite(cost) || cost < 0) return setError('Total cost must be a number.');
    }

    setSaving(true);
    let createdId = null;
    const uploaded = [];
    try {
      const { id: restaurantId, created } = await ensureRestaurant(choice, {
        loc,
        user,
        fields: { cuisine: form.cuisine.trim(), price: form.price ? Number(form.price) : null },
      });
      if (created) createdId = restaurantId;

      const visitId = visit?.id || newId();
      for (const file of newFiles) {
        const blob = await compressImage(file);
        const path = `${visitId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
        const { error: upErr } = await supabase.storage.from(PHOTO_BUCKET).upload(path, blob, { contentType: 'image/jpeg' });
        if (upErr) throw upErr;
        uploaded.push(path);
      }

      const payload = {
        restaurant_id: restaurantId,
        visit_date: form.visit_date || null,
        meal: form.meal,
        ...scores,
        items: cleanItems,
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
      if (uploaded.length) await supabase.storage.from(PHOTO_BUCKET).remove(uploaded);
      if (createdId) await supabase.from('restaurants').delete().eq('id', createdId);
      setError(e.message || String(e));
      setSaving(false);
    }
  }

  return (
    <Sheet
      title={editing ? 'Edit visit' : 'Log a visit'}
      onClose={onClose}
      dismissOnBackdrop={false}
      footer={
        choice && (
          <>
            {error && <div className="error-text">{error}</div>}
            <button className="btn primary block" onClick={save} disabled={saving}>
              {saving ? 'Saving' : editing ? 'Save changes' : 'Save visit'}
            </button>
          </>
        )
      }
    >
      {!choice && <PlacePicker rows={rows} loc={loc} onChoose={setChoice} />}

      {choice && (
        <div className="form">
          <ChosenPlace choice={choice} onChange={locked ? null : () => setChoice(null)} />

          <div className="score-inputs">
            {PEOPLE.map((p) => (
              <label key={p.key} className={p.key === user ? 'mine' : ''}>
                {p.label}
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

          <div className="row gap wrap">
            <label className="grow">
              Date
              <input type="date" value={form.visit_date} onChange={(e) => set('visit_date', e.target.value)} />
            </label>
          </div>

          <div className="field">
            <span>Meal</span>
            <div className="seg">
              {MEALS.map((m) => (
                <button
                  key={m}
                  type="button"
                  className={form.meal === m ? 'on' : ''}
                  onClick={() => set('meal', form.meal === m ? null : m)}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {isNew && (
            <div className="row gap">
              <label className="grow">
                Cuisine
                <input value={form.cuisine} placeholder="Found automatically if blank" onChange={(e) => set('cuisine', e.target.value)} />
              </label>
              <label>
                Price
                <select value={form.price} onChange={(e) => set('price', e.target.value)}>
                  <option value="">–</option>
                  {[1, 2, 3, 4].map((p) => (
                    <option key={p} value={String(p)}>
                      {priceLabel(p)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          <div className="field">
            <span>What you ordered</span>
            {items.length > 0 && (
              <div className="items-edit">
                <div className="items-head">
                  <span>Dish</span>
                  {PEOPLE.map((p) => (
                    <span key={p.key}>{p.label}</span>
                  ))}
                  <span />
                </div>
                {items.map((it, i) => (
                  <div className="item-row" key={i}>
                    <input
                      value={it.name}
                      placeholder="Dish"
                      aria-label="Dish name"
                      onChange={(e) => setItem(i, 'name', e.target.value)}
                    />
                    {PEOPLE.map((p) => (
                      <input
                        key={p.key}
                        className="item-score"
                        inputMode="decimal"
                        placeholder="–"
                        aria-label={`${p.label}'s score`}
                        value={it[p.key]}
                        onChange={(e) => setItem(i, p.key, e.target.value)}
                      />
                    ))}
                    <button
                      className="icon-btn"
                      aria-label="Remove dish"
                      onClick={() => setItems((list) => list.filter((_, j) => j !== i))}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
            <button className="btn link" onClick={() => setItems((list) => [...list, blankItem()])}>
              Add a dish
            </button>
          </div>

          <details className="extras" open={editing && Boolean(visit?.notes || visit?.cost || visit?.photos?.length)}>
            <summary>Notes, cost and photos</summary>
            <label>
              Notes
              <textarea rows={3} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
            </label>
            <label>
              Total cost ($)
              <input type="text" inputMode="decimal" value={form.cost} onChange={(e) => set('cost', e.target.value)} />
            </label>
            <div className="field">
              <span>Would go back?</span>
              <div className="seg">
                {[
                  [true, 'Yes'],
                  [false, 'No'],
                  [null, 'Not sure'],
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
            <div className="field">
              <span>Photos</span>
              <div className="thumbs">
                {keptPhotos.map((p) => (
                  <div key={p} className="thumb-edit">
                    <img src={photoUrl(p)} alt="" />
                    <button onClick={() => setKeptPhotos((k) => k.filter((x) => x !== p))} aria-label="Remove photo">
                      ✕
                    </button>
                  </div>
                ))}
                {previews.map((u, i) => (
                  <div key={u} className="thumb-edit">
                    <img src={u} alt="" />
                    <button onClick={() => setNewFiles((f) => f.filter((_, j) => j !== i))} aria-label="Remove photo">
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
