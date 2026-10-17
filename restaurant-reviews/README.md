# Our Eats — shared restaurant reviews

React + Vite site with a map and a sortable list, for two people rating restaurants 0–10.
Free stack: Supabase (database and photos), OpenStreetMap (map tiles), Photon (restaurant search), Vercel (hosting).

## Setup

### 1. Supabase (database)
1. Go to https://supabase.com, sign in, and create a **New project**. Pick region East US and set any database password.
2. Open **SQL Editor** → **New query**. Paste all of `supabase.sql` and click **Run**.
3. Open **Project Settings** → **API** (or **API Keys**). Copy the **Project URL** and the **anon** / **publishable** key.

### 2. GitHub
1. Create a new repo named `restaurant-reviews`.
2. Click **uploading an existing file**. Drag in everything *inside* this folder, not the folder itself, and commit.

### 3. Vercel
1. **Add New** → **Project** → import `restaurant-reviews`. The framework should auto-detect as Vite.
2. Under **Environment Variables**, add:
   - `VITE_SUPABASE_URL` = your Project URL
   - `VITE_SUPABASE_ANON_KEY` = your anon/publishable key
3. Click **Deploy**.

### 4. Phones
Open the site in Safari, tap **Share** → **Add to Home Screen**. Pick your name, then allow location.

## Customizing
- Names, app name, and default map center: `src/config.js`
- Colors: the top of `src/styles.css`

## Run locally (optional)
```
copy .env.example .env.local
npm install
npm run dev
```
Edit `.env.local` with your keys first.

## Notes
- There's no password. Anyone with the link can view and edit, so don't post the URL publicly.
- Supabase pauses free projects after about a week of no activity. If the site shows a load error, open the Supabase dashboard and restore the project.
- Overall score = the average of every individual score across all visits. Each visit also shows the average of the two scores.
