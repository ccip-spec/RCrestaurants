import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase, configured } from './supabase';
import { PEOPLE, APP_NAME } from './config';
import { buildRows, getLocation, store } from './utils';
import MapView from './components/MapView';
import ListView from './components/ListView';
import RestaurantDetail from './components/RestaurantDetail';
import VisitEditor from './components/VisitEditor';
import TryEditor from './components/TryEditor';
import ImportView from './components/ImportView';
import Sheet from './components/Sheet';

function useHash() {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const on = () => setHash(window.location.hash);
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return hash;
}

export default function App() {
  const [user, setUser] = useState(() => {
    const u = store.get('rr_user');
    return PEOPLE.some((p) => p.key === u) ? u : null;
  });
  const [tab, setTab] = useState('list'); // always opens on the list
  const [section, setSection] = useState(() => store.get('rr_section', 'been'));
  const [restaurants, setRestaurants] = useState([]);
  const [visits, setVisits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [loc, setLoc] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [editor, setEditor] = useState(null); // { kind: 'visit'|'try'|'choose', restaurant?, visit? }
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const hash = useHash();

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

  useEffect(() => store.set('rr_section', section), [section]);

  const rows = useMemo(() => buildRows(restaurants, visits, loc), [restaurants, visits, loc]);
  const selected = rows.find((r) => r.id === selectedId) || null;

  const pickUser = (key) => {
    store.set('rr_user', key);
    setUser(key);
  };
  const switchUser = () => {
    if (confirm('Switch who is rating on this phone?')) pickUser(null);
  };

  if (!configured) {
    return (
      <div className="center-screen">
        <h1 className="wordmark">{APP_NAME}</h1>
        <p>
          Missing database settings. In Vercel, add <code>VITE_SUPABASE_URL</code> and{' '}
          <code>VITE_SUPABASE_ANON_KEY</code> under Settings, Environment Variables, then redeploy.
        </p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="center-screen">
        <h1 className="wordmark">{APP_NAME}</h1>
        <p className="muted">Who's rating on this phone?</p>
        <div className="user-pick">
          {PEOPLE.map((p) => (
            <button key={p.key} className="pick-btn" onClick={() => pickUser(p.key)}>
              {p.label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (hash === '#import') {
    return (
      <div className="app">
        <header className="topbar">
          <a className="wordmark" href="#">
            {APP_NAME}
          </a>
        </header>
        <main className="main">
          <div className="pane scroll">
            <ImportView rows={rows} user={user} onDone={load} />
          </div>
        </main>
      </div>
    );
  }

  const beenCount = rows.filter((r) => r.been).length;

  return (
    <div className="app">
      <header className="topbar">
        <h1 className="wordmark">{APP_NAME}</h1>
        <span className="serial" aria-label={`${beenCount} restaurants rated`}>
          No. {String(beenCount).padStart(4, '0')}
        </span>
      </header>

      <main className="main">
        {loadError && (
          <div className="banner error">
            Couldn't load your list: {loadError}
            <button className="btn small" onClick={load}>
              Try again
            </button>
          </div>
        )}
        <div className={`pane scroll ${tab === 'list' ? '' : 'hidden'}`}>
          <ListView
            rows={rows}
            loc={loc}
            loading={loading}
            user={user}
            section={section}
            onSection={setSection}
            onSwitchUser={switchUser}
            onLocate={() => locate(false)}
            onSelect={setSelectedId}
          />
        </div>
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
      </main>

      <nav className="tabbar">
        <button className={tab === 'list' ? 'active' : ''} onClick={() => setTab('list')}>
          List
        </button>
        <button className="add-btn" onClick={() => setEditor({ kind: 'choose' })} aria-label="Add">
          +
        </button>
        <button className={tab === 'map' ? 'active' : ''} onClick={() => setTab('map')}>
          Map
        </button>
      </nav>

      {selected && (
        <RestaurantDetail
          row={selected}
          onClose={() => setSelectedId(null)}
          onAddVisit={(r) => setEditor({ kind: 'visit', restaurant: r })}
          onEditVisit={(r, v) => setEditor({ kind: 'visit', restaurant: r, visit: v })}
          onChanged={load}
          onDeleted={(msg) => {
            setSelectedId(null);
            load();
            showToast(msg);
          }}
          showToast={showToast}
        />
      )}

      {editor?.kind === 'choose' && (
        <Sheet title="Add" onClose={() => setEditor(null)}>
          <div className="choose">
            <button className="choose-btn" onClick={() => setEditor({ kind: 'visit' })}>
              <span className="choose-title">Log a visit</span>
              <span className="choose-sub">Rate somewhere you ate</span>
            </button>
            <button className="choose-btn" onClick={() => setEditor({ kind: 'try' })}>
              <span className="choose-title">Add to try list</span>
              <span className="choose-sub">Save a place someone recommended</span>
            </button>
          </div>
        </Sheet>
      )}

      {editor?.kind === 'visit' && (
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
            showToast('Visit saved');
          }}
        />
      )}

      {editor?.kind === 'try' && (
        <TryEditor
          rows={rows}
          loc={loc}
          user={user}
          onClose={() => setEditor(null)}
          onSaved={async () => {
            await load();
            setEditor(null);
            setSection('try');
            setTab('list');
            showToast('Added to try list');
          }}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
