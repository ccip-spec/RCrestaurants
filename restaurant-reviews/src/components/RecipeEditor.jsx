import { useState } from 'react';
import { supabase, PHOTO_BUCKET } from '../supabase';
import { compressImage, siteHost } from '../utils';
import { picturePath } from './Thumb';
import { RECIPE_TYPES, splitLines } from '../recipes';
import Sheet from './Sheet';
import { PublicToggle } from './Privacy';

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
    is_public: recipe ? recipe.is_public !== false : true,
  }));
  // Photo: an uploaded file (blob), a picture link from a recipe site, or the saved one.
  const [photo, setPhoto] = useState(recipe?.photo || null);
  const [photoBlob, setPhotoBlob] = useState(null);
  const [preview, setPreview] = useState(null);
  const [link, setLink] = useState('');
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState(null);

  const pickPhoto = async (file) => {
    if (!file) return;
    try {
      const blob = await compressImage(file, 1400, 0.82);
      setPhotoBlob(blob);
      setPreview(URL.createObjectURL(blob));
    } catch (e) {
      setError(e.message);
    }
  };
  const clearPhoto = () => {
    setPhoto(null);
    setPhotoBlob(null);
    setPreview(null);
  };
  const shownPhoto = preview || (photo ? picturePath(photo) : null);

  // Fill the form from a recipe page (see api/recipe.js).
  async function importLink() {
    const url = link.trim();
    if (!url) return;
    setError(null);
    setImported(null);
    setImporting(true);
    try {
      const res = await fetch(`/api/recipe?url=${encodeURIComponent(url)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Couldn't read that page (${res.status}).`);
      setF((s) => ({
        ...s,
        name: data.name || s.name,
        meal_type: data.meal_type || s.meal_type,
        cuisine: data.cuisine || s.cuisine,
        servings: data.servings ?? s.servings,
        prep_min: data.prep_min ?? s.prep_min,
        cook_min: data.cook_min ?? s.cook_min,
        ingredients: data.ingredients?.length ? data.ingredients.join('\n') : s.ingredients,
        steps: data.steps?.length ? data.steps.join('\n') : s.steps,
        source_url: data.source_url || url,
      }));
      if (data.image && !photoBlob) {
        setPhoto(data.image);
        setPreview(null);
      }
      setImported(`Filled in from ${siteHost(data.source_url || url)}. Check it over, then save.`);
      setLink('');
    } catch (e) {
      setError(`${e.message} You can type it in, or send the link to Claude.`);
    }
    setImporting(false);
  }
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
      is_public: f.is_public,
      updated_at: new Date().toISOString(),
    };
    setSaving(true);
    let photoPath = photo;
    if (photoBlob) {
      const path = `recipes/${crypto.randomUUID()}.jpg`;
      const up = await supabase.storage.from(PHOTO_BUCKET).upload(path, photoBlob, { contentType: 'image/jpeg' });
      if (up.error) {
        setError(up.error.message);
        setSaving(false);
        return;
      }
      photoPath = path;
    }
    row.photo = photoPath || null;
    const res = editing
      ? await supabase.from('recipes').update(row).eq('id', recipe.id).select('id').single()
      : await supabase.from('recipes').insert({ ...row, created_by: user }).select('id').single();
    if (res.error) {
      setError(res.error.message);
      setSaving(false);
      return;
    }
    // Clean up an uploaded photo that was replaced or removed.
    const old = recipe?.photo;
    if (old && old !== row.photo && old.startsWith('recipes/')) await supabase.storage.from(PHOTO_BUCKET).remove([old]);
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
        {!editing && (
        <div className="import-box">
          <label>
            Paste a recipe link
            <div className="row gap">
              <input
                value={link}
                inputMode="url"
                placeholder="https://..."
                onChange={(e) => setLink(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && importLink()}
              />
              <button type="button" className="btn primary" onClick={importLink} disabled={importing || !link.trim()}>
                {importing ? 'Reading' : 'Fill in'}
              </button>
            </div>
          </label>
          {imported && <p className="small ok-text">{imported}</p>}
        </div>
        )}

        <div className="field">
          <span>Photo</span>
          {shownPhoto && <img className="cover" src={shownPhoto} alt="" />}
          <div className="row gap wrap">
            <label className="text-btn file-btn">
              {shownPhoto ? 'Change photo' : 'Add a photo'}
              <input type="file" accept="image/*" onChange={(e) => pickPhoto(e.target.files?.[0])} />
            </label>
            {shownPhoto && (
              <button type="button" className="text-btn danger" onClick={clearPhoto}>
                Remove photo
              </button>
            )}
          </div>
        </div>

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
        <PublicToggle value={f.is_public} onChange={(v) => setF((s) => ({ ...s, is_public: v }))} what="this recipe" />
      </div>
    </Sheet>
  );
}
