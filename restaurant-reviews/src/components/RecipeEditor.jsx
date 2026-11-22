import { useState } from 'react';
import { supabase } from '../supabase';
import { RECIPE_TYPES, splitLines } from '../recipes';
import Sheet from './Sheet';

const num = (v) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

export default function RecipeEditor({ recipe, user, cuisines = [], onClose, onSaved }) {
  const editing = Boolean(recipe);
  const [f, setF] = useState(() => ({
    name: recipe?.name || '',
    meal_type: recipe?.meal_type || '',
    cuisine: recipe?.cuisine || '',
    servings: recipe?.servings ?? '',
    prep_min: recipe?.prep_min ?? '',
    cook_min: recipe?.cook_min ?? '',
    ingredients: (recipe?.ingredients || []).join('\n'),
    steps: (recipe?.steps || []).join('\n'),
    notes: recipe?.notes || '',
    source_url: recipe?.source_url || '',
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  async function save() {
    setError(null);
    const name = f.name.trim();
    if (!name) return setError('Give the recipe a name.');
    const row = {
      name,
      meal_type: f.meal_type || null,
      cuisine: f.cuisine.trim() || null,
      servings: num(f.servings) || null,
      prep_min: num(f.prep_min),
      cook_min: num(f.cook_min),
      ingredients: splitLines(f.ingredients),
      steps: splitLines(f.steps, true),
      notes: f.notes.trim() || null,
      source_url: f.source_url.trim() || null,
      updated_at: new Date().toISOString(),
    };
    setSaving(true);
    const res = editing
      ? await supabase.from('recipes').update(row).eq('id', recipe.id).select('id').single()
      : await supabase.from('recipes').insert({ ...row, created_by: user }).select('id').single();
    if (res.error) {
      setError(res.error.message);
      setSaving(false);
      return;
    }
    onSaved(res.data.id);
  }

  return (
    <Sheet
      title={editing ? 'Edit recipe' : 'New recipe'}
      onClose={onClose}
      dismissOnBackdrop={false}
      footer={
        <>
          {error && <div className="error-text">{error}</div>}
          <button className="btn primary block" onClick={save} disabled={saving}>
            {saving ? 'Saving' : editing ? 'Save recipe' : 'Add recipe'}
          </button>
        </>
      }
    >
      <div className="form">
        <label>
          Meal name
          <input value={f.name} placeholder="Sunday sauce" onChange={set('name')} autoFocus={!editing} />
        </label>
        <div className="field">
          <span>Type</span>
          <div className="seg multi">
            {RECIPE_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                className={f.meal_type === t ? 'on' : ''}
                onClick={() => setF((s) => ({ ...s, meal_type: s.meal_type === t ? '' : t }))}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
        <label>
          Cuisine
          <input value={f.cuisine} placeholder="Italian" list="recipe-cuisines" onChange={set('cuisine')} />
          <datalist id="recipe-cuisines">
            {cuisines.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>
        <div className="recipe-nums">
          <label>
            Serves
            <input inputMode="numeric" value={f.servings} onChange={set('servings')} />
          </label>
          <label>
            Prep (min)
            <input inputMode="numeric" value={f.prep_min} onChange={set('prep_min')} />
          </label>
          <label>
            Cook (min)
            <input inputMode="numeric" value={f.cook_min} onChange={set('cook_min')} />
          </label>
        </div>
        <label>
          Ingredients, one per line
          <textarea
            rows={7}
            value={f.ingredients}
            placeholder={'1 lb ground beef\n2 cloves garlic, minced\n1 can crushed tomatoes'}
            onChange={set('ingredients')}
          />
        </label>
        <label>
          Instructions, one step per line
          <textarea
            rows={8}
            value={f.steps}
            placeholder={'Brown the beef over medium-high heat.\nAdd garlic and cook 1 minute.\nStir in tomatoes and simmer 20 minutes.'}
            onChange={set('steps')}
          />
        </label>
        <label>
          Notes
          <textarea rows={3} value={f.notes} placeholder="Swaps, tips, what goes with it" onChange={set('notes')} />
        </label>
        <label>
          Source link
          <input value={f.source_url} inputMode="url" placeholder="Optional" onChange={set('source_url')} />
        </label>
      </div>
    </Sheet>
  );
}
