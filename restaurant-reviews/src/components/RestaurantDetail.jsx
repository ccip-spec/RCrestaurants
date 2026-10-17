import { useState } from 'react';
import { supabase, photoUrl, PHOTO_BUCKET } from '../supabase';
import { PEOPLE } from '../config';
import { fmtDate, fmtMiles, fmtMoney, fmtScore, mapsUrl, priceLabel, visitAvg } from '../utils';
import Sheet from './Sheet';
import Meta from './Meta';
import { EditIcon, TrashIcon, PinIcon } from './Icons';

function VisitCard({ visit, onEdit, onDelete }) {
  return (
    <div className="visit">
      <div className="visit-head">
        <span className="visit-date">{fmtDate(visit.visit_date)}</span>
        <div className="visit-actions">
          <button className="icon-btn" onClick={onEdit} aria-label="Edit visit">
            <EditIcon />
          </button>
          <button className="icon-btn danger" onClick={onDelete} aria-label="Delete visit">
            <TrashIcon />
          </button>
        </div>
      </div>
      <div className="visit-scores">
        {PEOPLE.map((p) => (
          <span key={p.key}>
            {p.label}
            <b>{fmtScore(visit[`${p.key}_score`])}</b>
          </span>
        ))}
        <span className="avg">
          Avg
          <b>{fmtScore(visitAvg(visit))}</b>
        </span>
      </div>
      {(visit.would_return != null || visit.cost != null || visit.dishes) && (
        <div className="visit-facts">
          {visit.would_return != null && (
            <span className={visit.would_return ? 'yes' : ''}>
              {visit.would_return ? 'Would go back' : "Wouldn't go back"}
            </span>
          )}
          {visit.cost != null && <span>{fmtMoney(visit.cost)}</span>}
          {visit.dishes && <span>Ordered: {visit.dishes}</span>}
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

  return (
    <Sheet title={row.name} onClose={onClose}>
      <Meta row={row} />
      {row.lat != null && (
        <a className="addr" href={mapsUrl(row)} target="_blank" rel="noreferrer">
          <PinIcon />
          {row.address || 'Open in Maps'}
        </a>
      )}
      {row.distance != null && <div className="distance">{fmtMiles(row.distance)} away</div>}

      <div className="tally">
        <div className="tally-overall">
          <span className="num">{fmtScore(row.overall)}</span>
          <span className="lbl">Overall</span>
        </div>
        <div className="tally-lines">
          {PEOPLE.map((p) => (
            <div className="line" key={p.key}>
              <span>{p.label}'s average</span>
              <span className="dots" />
              <b>{fmtScore(row.avg[p.key])}</b>
            </div>
          ))}
          <div className="line">
            <span>Visits</span>
            <span className="dots" />
            <b>{row.visits.length}</b>
          </div>
        </div>
      </div>

      <button className="btn primary block" onClick={() => onAddVisit(row)}>
        Add a visit
      </button>

      <h3 className="section-title">Visits</h3>
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
