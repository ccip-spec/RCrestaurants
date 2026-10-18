import { useState } from 'react';
import { supabase, photoUrl, PHOTO_BUCKET } from '../supabase';
import { PEOPLE } from '../config';
import { compressImage, fmtDate, fmtMiles, fmtMoney, fmtScore, mapsUrl, priceLabel, siteHost, visitAvg } from '../utils';
import Sheet from './Sheet';
import Meta from './Meta';
import Score from './Score';
import Thumb, { picturePath } from './Thumb';
import { MealTags, MealPicker } from './Meals';

function VisitBlock({ visit, onEdit, onDelete }) {
  const items = visit.items || [];
  return (
    <section className="visit">
      <div className="visit-head">
        <span className="visit-date">
          {visit.visit_date ? fmtDate(visit.visit_date) : 'Date not logged'}
          {visit.meal && <span className="visit-meal">{visit.meal}</span>}
        </span>
        <span className="visit-actions">
          <button className="text-btn" onClick={onEdit}>
            Edit
          </button>
          <button className="text-btn danger" onClick={onDelete}>
            Delete
          </button>
        </span>
      </div>

      <div className="visit-scores">
        {PEOPLE.map((p) => (
          <span key={p.key}>
            {p.label} <b>{fmtScore(visit[`${p.key}_score`])}</b>
          </span>
        ))}
        <span className="avg">
          Avg <Score value={visitAvg(visit)} size="sm" />
        </span>
      </div>

      {items.length > 0 && (
        <div className="items">
          {items.map((it, i) => (
            <div className="item" key={i}>
              <span className="item-name">{it.name}</span>
              <span className="dots" />
              {PEOPLE.map((p) => (
                <span className="item-score" key={p.key}>
                  <small>{p.label}</small> {fmtScore(it[p.key])}
                </span>
              ))}
            </div>
          ))}
        </div>
      )}
      {visit.dishes && <p className="visit-notes">Ordered: {visit.dishes}</p>}

      {(visit.would_return != null || visit.cost != null) && (
        <div className="visit-facts">
          {visit.would_return != null && (
            <span className={visit.would_return ? 'yes' : ''}>
              {visit.would_return ? 'Would go back' : "Wouldn't go back"}
            </span>
          )}
          {visit.cost != null && <span>{fmtMoney(visit.cost)}</span>}
        </div>
      )}
      {visit.notes && <p className="visit-notes">{visit.notes}</p>}
      {visit.photos?.length > 0 && (
        <div className="thumbs">
          {visit.photos.map((p) => (
            <a key={p} href={photoUrl(p)} target="_blank" rel="noreferrer">
              <img src={photoUrl(p)} alt="" loading="lazy" />
            </a>
          ))}
        </div>
      )}
    </section>
  );
}

export default function RestaurantDetail({ row, onClose, onAddVisit, onEditVisit, onChanged, onDeleted, showToast }) {
  const [editing, setEditing] = useState(false);
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState(false);

  const startEdit = () => {
    setInfo({
      name: row.name,
      cuisine: row.cuisine || '',
      neighborhood: row.neighborhood || '',
      price: row.price ? String(row.price) : '',
      website: row.website || '',
      recommended_by: row.recommended_by || '',
      try_notes: row.try_notes || '',
      meal_tags: row.meal_tags || [],
    });
    setEditing(true);
  };

  const saveInfo = async () => {
    if (!info.name.trim()) return showToast('Name is required');
    setBusy(true);
    const { error } = await supabase
      .from('restaurants')
      .update({
        name: info.name.trim(),
        cuisine: info.cuisine.trim() || null,
        neighborhood: info.neighborhood.trim() || null,
        price: info.price ? Number(info.price) : null,
        website: info.website.trim() || null,
        recommended_by: info.recommended_by.trim() || null,
        try_notes: info.try_notes.trim() || null,
        meal_tags: info.meal_tags,
      })
      .eq('id', row.id);
    setBusy(false);
    if (error) return showToast(error.message);
    setEditing(false);
    onChanged();
  };

  const setCover = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      const blob = await compressImage(file);
      const path = `covers/${row.id}-${Date.now()}.jpg`;
      const up = await supabase.storage.from(PHOTO_BUCKET).upload(path, blob, { contentType: 'image/jpeg' });
      if (up.error) throw up.error;
      const { error } = await supabase.from('restaurants').update({ photo: path }).eq('id', row.id);
      if (error) throw error;
      if (row.photo?.startsWith('covers/')) await supabase.storage.from(PHOTO_BUCKET).remove([row.photo]);
      onChanged();
      showToast('Photo updated');
    } catch (e) {
      showToast(e.message || String(e));
    }
    setBusy(false);
  };

  const removeCover = async () => {
    setBusy(true);
    const { error } = await supabase.from('restaurants').update({ photo: null }).eq('id', row.id);
    if (!error && row.photo?.startsWith('covers/')) await supabase.storage.from(PHOTO_BUCKET).remove([row.photo]);
    setBusy(false);
    if (error) return showToast(error.message);
    onChanged();
  };

  const deleteVisit = async (v) => {
    if (!confirm(`Delete this visit${v.visit_date ? ` from ${fmtDate(v.visit_date)}` : ''}?`)) return;
    const { error } = await supabase.from('visits').delete().eq('id', v.id);
    if (error) return showToast(error.message);
    if (v.photos?.length) await supabase.storage.from(PHOTO_BUCKET).remove(v.photos);
    onChanged();
    showToast('Visit deleted');
  };

  const deleteRestaurant = async () => {
    const msg = row.been
      ? `Delete ${row.name} and its ${row.visits.length} visit(s)? This can't be undone.`
      : `Remove ${row.name} from your try list?`;
    if (!confirm(msg)) return;
    setBusy(true);
    const photos = row.visits.flatMap((v) => v.photos || []);
    if (row.photo?.startsWith('covers/')) photos.push(row.photo);
    const { error } = await supabase.from('restaurants').delete().eq('id', row.id);
    setBusy(false);
    if (error) return showToast(error.message);
    if (photos.length) await supabase.storage.from(PHOTO_BUCKET).remove(photos);
    onDeleted(row.been ? 'Restaurant deleted' : 'Removed from try list');
  };

  const host = siteHost(row.website);
  const hasCover = Boolean(row.photo);

  return (
    <Sheet title={row.name} onClose={onClose}>
      {hasCover && <img className="cover" src={picturePath(row.photo)} alt="" />}

      <div className="detail-top">
        {!hasCover && <Thumb row={row} size="lg" />}
        <div className="detail-facts">
          <Meta row={row} />
          <MealTags meals={row.meals} />
          {row.lat != null && (
            <a className="addr" href={mapsUrl(row)} target="_blank" rel="noreferrer">
              {row.address || 'Open in Maps'}
            </a>
          )}
          <div className="facts-line">
            {row.distance != null && <span>{fmtMiles(row.distance)} away</span>}
            {host && (
              <a href={/^https?:/i.test(row.website) ? row.website : `https://${row.website}`} target="_blank" rel="noreferrer">
                {host}
              </a>
            )}
          </div>
        </div>
      </div>

      {row.been ? (
        <div className="tally">
          {PEOPLE.map((p) => (
            <div className="tally-line" key={p.key}>
              <span>{p.label}</span>
              <span className="dots" />
              <b>{fmtScore(row.avg[p.key])}</b>
            </div>
          ))}
          <div className="tally-line">
            <span>Visits</span>
            <span className="dots" />
            <b>{row.visits.length}</b>
          </div>
          <div className="tally-total">
            <span>Total</span>
            <Score value={row.overall} size="lg" />
          </div>
        </div>
      ) : (
        <div className="try-box">
          <div className="try-stamp">To try</div>
          {row.recommended_by && (
            <p>
              Recommended by <b>{row.recommended_by}</b>
            </p>
          )}
          {row.try_notes && <p className="visit-notes">{row.try_notes}</p>}
        </div>
      )}

      <button className="btn primary block" onClick={() => onAddVisit(row)}>
        {row.been ? 'Log another visit' : 'We went. Log a visit'}
      </button>

      {row.been && (
        <>
          <h3 className="section-title">Visits</h3>
          {row.visits.map((v) => (
            <VisitBlock key={v.id} visit={v} onEdit={() => onEditVisit(row, v)} onDelete={() => deleteVisit(v)} />
          ))}
          {row.recommended_by && <p className="muted small">Recommended by {row.recommended_by}</p>}
        </>
      )}

      <div className="detail-admin">
        {!editing ? (
          <div className="row gap wrap">
            <button className="text-btn" onClick={startEdit}>
              Edit details
            </button>
            <label className="text-btn file-btn">
              {hasCover ? 'Change photo' : 'Add a photo'}
              <input type="file" accept="image/*" onChange={(e) => setCover(e.target.files?.[0])} disabled={busy} />
            </label>
            {hasCover && (
              <button className="text-btn" onClick={removeCover} disabled={busy}>
                Remove photo
              </button>
            )}
            {!row.been && (
              <button className="text-btn danger" onClick={deleteRestaurant} disabled={busy}>
                Remove from try list
              </button>
            )}
          </div>
        ) : (
          <div className="form">
            <label>
              Name
              <input value={info.name} onChange={(e) => setInfo({ ...info, name: e.target.value })} />
            </label>
            <div className="row gap">
              <label className="grow">
                Cuisine
                <input value={info.cuisine} onChange={(e) => setInfo({ ...info, cuisine: e.target.value })} />
              </label>
              <label>
                Price
                <select value={info.price} onChange={(e) => setInfo({ ...info, price: e.target.value })}>
                  <option value="">–</option>
                  {[1, 2, 3, 4].map((p) => (
                    <option key={p} value={String(p)}>
                      {priceLabel(p)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              Neighborhood
              <input value={info.neighborhood} onChange={(e) => setInfo({ ...info, neighborhood: e.target.value })} />
            </label>
            <label>
              Website (shows their logo)
              <input
                value={info.website}
                placeholder="example.com"
                inputMode="url"
                onChange={(e) => setInfo({ ...info, website: e.target.value })}
              />
            </label>
            <div className="field">
              <span>Good for</span>
              <MealPicker value={info.meal_tags} onChange={(v) => setInfo({ ...info, meal_tags: v })} />
            </div>
            <label>
              Recommended by
              <input value={info.recommended_by} onChange={(e) => setInfo({ ...info, recommended_by: e.target.value })} />
            </label>
            {!row.been && (
              <label>
                Notes
                <textarea rows={3} value={info.try_notes} onChange={(e) => setInfo({ ...info, try_notes: e.target.value })} />
              </label>
            )}
            <div className="row gap">
              <button className="btn primary" onClick={saveInfo} disabled={busy}>
                Save details
              </button>
              <button className="btn" onClick={() => setEditing(false)}>
                Cancel
              </button>
            </div>
            <button className="text-btn danger" onClick={deleteRestaurant} disabled={busy}>
              {row.been ? 'Delete restaurant' : 'Remove from try list'}
            </button>
          </div>
        )}
      </div>
    </Sheet>
  );
}
