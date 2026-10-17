import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase, configured } from './supabase';
import { PEOPLE, APP_NAME } from './config';
import { buildRows, getLocation, store } from './utils';
import MapView from './components/MapView';
import ListView from './components/ListView';
import RestaurantDetail from './components/RestaurantDetail';
import VisitEditor from './components/VisitEditor';
import { MapIcon, ListIcon, PlusIcon } from './components/Icons';

export default function App() {
  const [user, setUser] = useState(() => {
    const u = store.get('rr_user');
    return PEOPLE.some((p) => p.key === u) ? u : null;
  });
  const [tab, setTab] = useState(() => store.get('rr_tab') || 'map');
  const [restaurants, setRestaurants] = useState([]);
  const [visits, setVisits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [loc, setLoc] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [editor, setEditor] = useState(null); // { restaurant?, visit? }
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  const showToast = useCallback((msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }, []);

  const load = useCallback(async () => {
    if (!configured) return;
    const [r, v] = await Promise.all([
      supabase.from('restaurants').select('*'),
      supabase.from('visits').select('*'),
    ]);
    const err = r.error || v.error;
    if (err) {
      setLoadError(err.message);
    } else {
      setRestaurants(r.data);
      setVisits(v.data);
      setLoadError(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const onVisible = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load]);

  const locate = useCallback(
    async (quiet = false) => {
      try {
        setLoc(await getLocation());
        return true;
      } catch (e) {
        if (!quiet) showToast(e.message);
        return false;
      }
    },
    [showToast]
  );

  useEffect(() => {
    locate(true);
  }, [locate]);

  useEffect(() => store.set('rr_tab', tab), [tab]);

  const rows = useMemo(() => buildRows(restaurants, visits, loc), [restaurants, visits, loc]);
  const selected = rows.find((r) => r.id === selectedId) || null;

  const pickUser = (key) => {
    store.set('rr_user', key);
    setUser(key);
  };

  if (!configured) {
    return (
      <div className="center-screen">
        <h1>{APP_NAME}</h1>
        <p>
          Missing database settings. In Vercel, add <code>VITE_SUPABASE_URL</code> and{' '}
          <code>VITE_SUPABASE_ANON_KEY</code> under Settings → Environment Variables, then redeploy.
        </p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="center-screen">
        <h1 className="wordmark">{APP_NAME}</h1>
        <p className="muted">Who's using this phone?</p>
        <div className="user-pick">
          {PEOPLE.map((p) => (
            <button key={p.key} className="btn primary big" onClick={() => pickUser(p.key)}>
              {p.label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  const userLabel = PEOPLE.find((p) => p.key === user)?.label;

  return (
    <div className="app">
      <header className="topbar">
        <h1 className="wordmark">{APP_NAME}</h1>
        <button
          className="who"
          onClick={() => {
            if (confirm('Switch user on this device?')) pickUser(null);
          }}
          title="Switch user"
        >
          Rating as<b>{userLabel}</b>
        </button>
      </header>

      <main className="main">
        {loadError && (
          <div className="banner error">
            Couldn't load data: {loadError}
            <button className="btn small" onClick={load}>
              Retry
            </button>
          </div>
        )}
        <div className={`pane ${tab === 'map' ? '' : 'hidden'}`}>
          <MapView
            rows={rows}
            loc={loc}
            active={tab === 'map'}
            loading={loading}
            onLocate={() => locate(false)}
            onSelect={setSelectedId}
          />
        </div>
        <div className={`pane scroll ${tab === 'list' ? '' : 'hidden'}`}>
          <ListView
            rows={rows}
            loc={loc}
            loading={loading}
            onLocate={() => locate(false)}
            onSelect={setSelectedId}
          />
        </div>
      </main>

      <nav className="tabbar">
        <button className={tab === 'map' ? 'active' : ''} onClick={() => setTab('map')}>
          <MapIcon />
          Map
        </button>
        <button className="add-btn" onClick={() => setEditor({})} aria-label="Add a visit">
          <PlusIcon />
        </button>
        <button className={tab === 'list' ? 'active' : ''} onClick={() => setTab('list')}>
          <ListIcon />
          List
        </button>
      </nav>

      {selected && (
        <RestaurantDetail
          row={selected}
          onClose={() => setSelectedId(null)}
          onAddVisit={(r) => setEditor({ restaurant: r })}
          onEditVisit={(r, v) => setEditor({ restaurant: r, visit: v })}
          onChanged={load}
          onDeleted={() => {
            setSelectedId(null);
            load();
            showToast('Restaurant deleted');
          }}
          showToast={showToast}
        />
      )}

      {editor && (
        <VisitEditor
          rows={rows}
          loc={loc}
          user={user}
          restaurant={editor.restaurant || null}
          visit={editor.visit || null}
          onClose={() => setEditor(null)}
          onSaved={async (restaurantId) => {
            await load();
            setEditor(null);
            setSelectedId(restaurantId);
            showToast('Saved');
          }}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
