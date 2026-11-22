import { useState } from 'react';
import { supabase } from '../supabase';
import { ensureRestaurant, saveTry } from '../restaurants';
import { myTry } from '../people';
import { PublicToggle } from './Privacy';
import { fmtScore } from '../utils';
import PlacePicker, { ChosenPlace } from './PlacePicker';
import Sheet from './Sheet';
import { MealPicker } from './Meals';

export default function TryEditor({ rows, loc, user, onClose, onSaved }) {
  const [choice, setChoice] = useState(null);
  const [recommendedBy, setRecommendedBy] = useState('');
  const [notes, setNotes] = useState('');
  const [meals, setMeals] = useState([]);
  const [isPublic, setIsPublic] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Already been = this person has a score there. Others having been doesn't matter.
  const alreadyBeen = choice?.type === 'existing' && choice.row.avg[user] != null;

  async function save() {
    setError(null);
    setSaving(true);
    try {
      let id;
      const mine = choice.type === 'existing' ? myTry(choice.row, user) : null;
      if (choice.type === 'existing') {
        id = choice.row.id;
        if (meals.length) {
          const { error: e } = await supabase
            .from('restaurants')
            .update({ meal_tags: [...new Set([...(choice.row.meal_tags || []), ...meals])] })
            .eq('id', id);
          if (e) throw e;
        }
      } else {
        ({ id } = await ensureRestaurant(choice, { loc, user, fields: { meal_tags: meals } }));
      }
      await saveTry(id, user, {
        isPublic,
        recommendedBy: recommendedBy.trim() || mine?.recommended_by,
        notes: notes.trim() || mine?.notes,
      });
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
              You've already been here. You rated it {fmtScore(choice.row.avg[user])}.
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
              <div className="field">
                <span>Good for</span>
                <MealPicker value={meals} onChange={setMeals} />
              </div>
              <label>
                Notes
                <textarea
                  rows={3}
                  value={notes}
                  placeholder="What to order, when to go"
                  onChange={(e) => setNotes(e.target.value)}
                />
              </label>
              <PublicToggle value={isPublic} onChange={setIsPublic} what="this try" />
            </>
          )}
        </div>
      )}
    </Sheet>
  );
}
