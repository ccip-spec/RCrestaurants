import { useState } from 'react';
import { supabase } from '../supabase';
import { ensureRestaurant } from '../restaurants';
import { fmtScore } from '../utils';
import PlacePicker, { ChosenPlace } from './PlacePicker';
import Sheet from './Sheet';

export default function TryEditor({ rows, loc, user, onClose, onSaved }) {
  const [choice, setChoice] = useState(null);
  const [recommendedBy, setRecommendedBy] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const alreadyBeen = choice?.type === 'existing' && choice.row.been;

  async function save() {
    setError(null);
    setSaving(true);
    try {
      let id;
      if (choice.type === 'existing') {
        id = choice.row.id;
        const { error: e } = await supabase
          .from('restaurants')
          .update({
            want_to_try: true,
            recommended_by: recommendedBy.trim() || choice.row.recommended_by || null,
            try_notes: notes.trim() || choice.row.try_notes || null,
          })
          .eq('id', id);
        if (e) throw e;
      } else {
        ({ id } = await ensureRestaurant(choice, {
          loc,
          user,
          fields: { want_to_try: true, recommended_by: recommendedBy.trim(), try_notes: notes.trim() },
        }));
      }
      onSaved(id);
    } catch (e) {
      setError(e.message || String(e));
      setSaving(false);
    }
  }

  return (
    <Sheet
      title="Add to try list"
      onClose={onClose}
      dismissOnBackdrop={false}
      footer={
        choice &&
        !alreadyBeen && (
          <>
            {error && <div className="error-text">{error}</div>}
            <button className="btn primary block" onClick={save} disabled={saving}>
              {saving ? 'Saving' : 'Add to try list'}
            </button>
          </>
        )
      }
    >
      {!choice && <PlacePicker rows={rows} loc={loc} onChoose={setChoice} />}
      {choice && (
        <div className="form">
          <ChosenPlace choice={choice} onChange={() => setChoice(null)} />
          {alreadyBeen ? (
            <p className="muted">
              You've already been here. It's rated {fmtScore(choice.row.overall)} on your list.
            </p>
          ) : (
            <>
              <label>
                Recommended by
                <input
                  value={recommendedBy}
                  placeholder="Who told you about it"
                  onChange={(e) => setRecommendedBy(e.target.value)}
                />
              </label>
              <label>
                Notes
                <textarea
                  rows={3}
                  value={notes}
                  placeholder="What to order, when to go"
                  onChange={(e) => setNotes(e.target.value)}
                />
              </label>
            </>
          )}
        </div>
      )}
    </Sheet>
  );
}
