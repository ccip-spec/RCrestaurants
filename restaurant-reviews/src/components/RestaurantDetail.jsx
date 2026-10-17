import { useState } from 'react';
import { supabase, photoUrl, PHOTO_BUCKET } from '../supabase';
import { PEOPLE } from '../config';
import { fmtDate, fmtMiles, fmtMoney, fmtScore, mapsUrl, priceLabel, visitAvg } from '../utils';
import Sheet from './Sheet';

function Stat({ label, value, big }) {
  return (
    <div className={`stat ${big ? 'big' : ''}`}>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

function VisitCard({ visit, onEdit, onDelete }) {
  return (
    <div className="visit">
      <div className="visit-head">
        <strong>{fmtDate(visit.visit_date)}</strong>
        <div className="row gap">
          <button className="btn small" onClick={onEdit}>
            Edit
          </button>
          <button className="btn small danger" onClick={onDelete}>
            Delete
          </button>
        </div>
      </div>
      <div className="visit-scores">
        {PEOPLE.map((p) => (
          <span key={p.key}>
            {p.label} <b>{fmtScore(visit[`${p.key}_score`])}</b>
          </span>
        ))}
        <span>
          Avg <b>{fmtScore(visitAvg(visit))}</b>
        </span>
      </div>
      {(visit.would_return != null || visit.cost != null) && (
        <div className="muted small">
          {visit.would_return != null && (visit.would_return ? 'Would go back' : "Wouldn't go back")}
          {visit.would_return != null && visit.cost != null ? ' · ' : ''}
          {visit.cost != null && fmtMoney(visit.cost)}
        </div>
      )}
      {visit.dishes && (
        <p className="small">
          <b>Ordered:</b> {visit.dishes}
        </p>
      )}
      {visit.notes && <p className="small notes">{visit.notes}</p>}
      {visit.photos?.length > 0 && (
        <div className="thumbs">
          {visit.photos.map((p) => (
            <a key={p} href={photoUrl(p)} target="_blank" rel="noreferrer">
              <img src={photoUrl(p)} alt="" loading="lazy" />
            </a>
          ))}
        </div>
      )}
    </div>
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
      })
      .eq('id', row.id);
    setBusy(false);
    if (error) return showToast(error.message);
    setEditing(false);
    onChanged();
  };

  const deleteVisit = async (v) => {
    if (!confirm(`Delete the ${fmtDate(v.visit_date)} visit?`)) return;
    const { error } = await supabase.from('visits').delete().eq('id', v.id);
    if (error) return showToast(error.message);
    if (v.photos?.length) await supabase.storage.from(PHOTO_BUCKET).remove(v.photos);
    onChanged();
    showToast('Visit deleted');
  };

  const deleteRestaurant = async () => {
    if (!confirm(`Delete ${row.name} and all ${row.visits.length} visit(s)? This can't be undone.`)) return;
    setBusy(true);
    const photos = row.visits.flatMap((v) => v.photos || []);
    const { error } = await supabase.from('restaurants').delete().eq('id', row.id);
    setBusy(false);
    if (error) return showToast(error.message);
    if (photos.length) await supabase.storage.from(PHOTO_BUCKET).remove(photos);
    onDeleted();
  };

  const meta = [row.cuisine, row.neighborhood || row.city, priceLabel(row.price)].filter(Boolean).join(' · ');

  return (
    <Sheet title={row.name} onClose={onClose}>
      {meta && <div className="muted">{meta}</div>}
      {row.lat != null && (
        <a className="addr" href={mapsUrl(row)} target="_blank" rel="noreferrer">
          {row.address || 'Open in Maps'} ↗
        </a>
      )}
      {row.distance != null && <div className="muted small">{fmtMiles(row.distance)} away</div>}

      <div className="stats">
        <Stat label="Overall" value={fmtScore(row.overall)} big />
        {PEOPLE.map((p) => (
          <Stat key={p.key} label={p.label} value={fmtScore(row.avg[p.key])} />
        ))}
        <Stat label="Visits" value={row.visits.length} />
      </div>

      <button className="btn primary block" onClick={() => onAddVisit(row)}>
        + Add a visit
      </button>

      <h3>Visits</h3>
      {row.visits.length === 0 && <p className="muted">No visits logged yet.</p>}
      {row.visits.map((v) => (
        <VisitCard
          key={v.id}
          visit={v}
          onEdit={() => onEditVisit(row, v)}
          onDelete={() => deleteVisit(v)}
        />
      ))}

      <div className="detail-admin">
        {!editing ? (
          <button className="btn small" onClick={startEdit}>
            Edit restaurant info
          </button>
        ) : (
          <div className="form">
            <label>
              Name
              <input value={info.name} onChange={(e) => setInfo({ ...info, name: e.target.value })} />
            </label>
            <label>
              Cuisine
              <input
                value={info.cuisine}
                placeholder="e.g. Italian"
                onChange={(e) => setInfo({ ...info, cuisine: e.target.value })}
              />
            </label>
            <label>
              Neighborhood
              <input
                value={info.neighborhood}
                placeholder="e.g. Fishtown"
                onChange={(e) => setInfo({ ...info, neighborhood: e.target.value })}
              />
            </label>
            <label>
              Price
              <select value={info.price} onChange={(e) => setInfo({ ...info, price: e.target.value })}>
                <option value="">—</option>
                {[1, 2, 3, 4].map((p) => (
                  <option key={p} value={String(p)}>
                    {priceLabel(p)}
                  </option>
                ))}
              </select>
            </label>
            <div className="row gap">
              <button className="btn primary" onClick={saveInfo} disabled={busy}>
                Save
              </button>
              <button className="btn" onClick={() => setEditing(false)}>
                Cancel
              </button>
            </div>
            <button className="btn danger" onClick={deleteRestaurant} disabled={busy}>
              Delete restaurant
            </button>
          </div>
        )}
      </div>
    </Sheet>
  );
}
