import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase, configured } from './supabase';
import { APP_NAME } from './config';
import { buildRows, getLocation, store } from './utils';
import { PeopleContext, codeFromUrl, clearCodeFromUrl } from './people';
import MapView from './components/MapView';
import ListView from './components/ListView';
import RestaurantDetail from './components/RestaurantDetail';
import VisitEditor from './components/VisitEditor';
import TryEditor from './components/TryEditor';
import JoinScreen from './components/JoinScreen';
import PeopleSheet from './components/PeopleSheet';
import Sheet from './components/Sheet';
import { ensureRestaurant } from './restaurants';

// Every phone gets an anonymous sign-in (no email). Returns this phone's person, or null if not joined yet.
async function signInAndWho() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) {
    const { error } = await supabase.auth.signInAnonymously();
    if (error) throw error;
  }
  let res = await supabase.rpc('whoami');
  if (res.error) {
    // Stale sign-in on this phone: start a fresh one.
    await supabase.auth.signOut();
    const { error } = await supabase.auth.signInAnonymously();
    if (error) throw error;
    res = await supabase.rpc('whoami');
    if (res.error) throw res.error;
  }
  return res.data?.[0] || null;
}

export default function App() {
  const [status, setStatus] = useState('starting'); // starting | join | ready | error
  const [bootError, setBootError] = useState(null);
  const [meId, setMeId] = useState(null);
  const [members, setMembers] = useState([]);
  const [tab, setTab] = useState('list'); // always opens on the list
  const [section, setSection] = useState(() => store.get('rr_section', 'been'));
  const [restaurants, setRestaurants] = useState([]);
  const [visits, setVisits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [loc, setLoc] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [editor, setEditor] = useState(null); // { kind: 'visit'|'try'|'choose', restaurant?, visit? }
  const [showPeople, setShowPeople] = useState(false);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const [joinCode] = useState(codeFromUrl);

  const showToast = useCallback((msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }, []);

  const boot = useCallback(async () => {
    if (!configured) return;
    try {
      const who = await signInAndWho();
      if (!who) {
        setStatus('join');
        return;
      }
      setMeId(who.id);
      clearCodeFromUrl();
      setStatus('ready');
    } catch (e) {
      setBootError(e.message || String(e));
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    boot();
  }, [boot]);

  const load = useCallback(async () => {
    const [m, r, v] = await Promise.all([
      supabase.from('members').select('id, name, legacy_key, created_at').order('created_at').order('name'),
      supabase.from('restaurants').select('*'),
      supabase.from('visits').select('*'),
    ]);
    const err = m.error || r.error || v.error;
    if (err) {
      setLoadError(err.message);
    } else {
      setMembers(m.data);
      setRestaurants(r.data);
      setVisits(v.data);
      setLoadError(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (status !== 'ready') return;
    load();
    const onVisible = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [status, load]);

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
    if (status === 'ready') locate(true);
  }, [status, locate]);

  useEffect(() => store.set('rr_section', section), [section]);

  const rows = useMemo(() => buildRows(restaurants, visits, loc), [restaurants, visits, loc]);
  const selected = rows.find((r) => r.id === selectedId) || null;

  const people = useMemo(() => {
    const byId = Object.fromEntries(members.map((m) => [m.id, m]));
    return { members, byId, me: byId[meId] || (meId ? { id: meId, name: '' } : null) };
  }, [members, meId]);
  const user = meId;

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

  if (status === 'starting') {
    return (
      <div className="center-screen">
        <h1 className="wordmark">{APP_NAME}</h1>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="center-screen">
        <h1 className="wordmark">{APP_NAME}</h1>
        <p>Couldn't sign in: {bootError}</p>
        <button className="btn primary" onClick={() => window.location.reload()}>
          Try again
        </button>
      </div>
    );
  }

  if (status === 'join') {
    return <JoinScreen initialCode={joinCode} onJoined={boot} />;
  }

  const beenCount = rows.filter((r) => r.been).length;

  return (
    <PeopleContext.Provider value={people}>
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
            onSwitchUser={() => setShowPeople(true)}
            onQuickTry={async (place) => {
              try {
                await ensureRestaurant({ type: 'new', place }, { loc, user, fields: { want_to_try: true } });
                await load();
                showToast(`${place.name} added to try list`);
                return true;
              } catch (e) {
                showToast(e.message || String(e));
                return false;
              }
            }}
            onLogNew={(place) => setEditor({ kind: 'visit', choice: { type: 'new', place } })}
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
          initialChoice={editor.choice || null}
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

      {showPeople && (
        <PeopleSheet
          onClose={() => setShowPeople(false)}
          onChanged={load}
          onSwitched={(m) => {
            setMeId(m.id);
            setShowPeople(false);
            showToast(`Now rating as ${m.name}`);
          }}
          showToast={showToast}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
    </PeopleContext.Provider>
  );
}
