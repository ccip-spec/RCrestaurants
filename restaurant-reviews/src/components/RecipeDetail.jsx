import { useState } from 'react';
import { supabase } from '../supabase';
import { usePeople, nameOf } from '../people';
import { siteHost } from '../utils';
import { fmtMinutes, totalMin } from '../recipes';
import Sheet from './Sheet';
import { PrivateTag } from './Privacy';

export default function RecipeDetail({ recipe, onClose, onEdit, onDeleted, showToast }) {
  const { byId, me } = usePeople();
  const isMine = recipe.created_by === me?.id;
  // Tap an ingredient or step to cross it off while cooking (this phone only, resets on close).
  const [gotIt, setGotIt] = useState({});
  const [doneSteps, setDoneSteps] = useState({});
  const [busy, setBusy] = useState(false);
  const r = recipe;
  const total = totalMin(r);
  const host = siteHost(r.source_url);

  const remove = async () => {
    if (!window.confirm(`Delete "${r.name}"?`)) return;
    setBusy(true);
    const { error } = await supabase.from('recipes').delete().eq('id', r.id);
    setBusy(false);
    if (error) return showToast(error.message);
    onDeleted(`${r.name} deleted`);
  };

  return (
    <Sheet title={r.name} onClose={onClose}>
      <div className="recipe-facts">
        {r.meal_type && <span className="visit-meal">{r.meal_type}</span>}
        {r.cuisine && <span>{r.cuisine}</span>}
        {r.created_by && <span>From {nameOf(byId, r.created_by)}</span>}
        {!r.is_public && <PrivateTag />}
      </div>

      {Boolean(r.servings || r.prep_min || r.cook_min) && (
        <div className="tally">
          {r.servings && (
            <div className="tally-line">
              <span>Serves</span>
              <span className="dots" />
              <b>{r.servings}</b>
            </div>
          )}
          {r.prep_min != null && r.prep_min > 0 && (
            <div className="tally-line">
              <span>Prep</span>
              <span className="dots" />
              <b>{fmtMinutes(r.prep_min)}</b>
            </div>
          )}
          {r.cook_min != null && r.cook_min > 0 && (
            <div className="tally-line">
              <span>Cook</span>
              <span className="dots" />
              <b>{fmtMinutes(r.cook_min)}</b>
            </div>
          )}
          {total && r.prep_min > 0 && r.cook_min > 0 && (
            <div className="tally-line">
              <span>Total</span>
              <span className="dots" />
              <b>{fmtMinutes(total)}</b>
            </div>
          )}
        </div>
      )}

      <h3 className="section-title">Ingredients</h3>
      {r.ingredients?.length ? (
        <ul className="ingredients">
          {r.ingredients.map((ing, i) => (
            <li key={i}>
              <button className={gotIt[i] ? 'done' : ''} onClick={() => setGotIt((g) => ({ ...g, [i]: !g[i] }))}>
                <span className="tick" aria-hidden="true">{gotIt[i] ? '✓' : ''}</span>
                <span>{ing}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">No ingredients listed.</p>
      )}

      <h3 className="section-title">Instructions</h3>
      {r.steps?.length ? (
        <ol className="steps">
          {r.steps.map((s, i) => (
            <li key={i}>
              <button className={doneSteps[i] ? 'done' : ''} onClick={() => setDoneSteps((d) => ({ ...d, [i]: !d[i] }))}>
                <span className="step-no">{i + 1}</span>
                <span>{s}</span>
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="muted">No instructions yet.</p>
      )}

      {r.notes && (
        <>
          <h3 className="section-title">Notes</h3>
          <p className="visit-notes">{r.notes}</p>
        </>
      )}

      {host && (
        <p className="small" style={{ marginTop: 14 }}>
          Source:{' '}
          <a href={/^https?:/i.test(r.source_url) ? r.source_url : `https://${r.source_url}`} target="_blank" rel="noreferrer">
            {host}
          </a>
        </p>
      )}

      {isMine && (
        <div className="detail-admin">
          <div className="row gap wrap">
            <button className="text-btn" onClick={() => onEdit(r)}>
              Edit recipe
            </button>
            <button className="text-btn danger" onClick={remove} disabled={busy}>
              Delete recipe
            </button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
