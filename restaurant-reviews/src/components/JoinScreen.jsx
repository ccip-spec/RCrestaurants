import { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { APP_NAME } from '../config';
import { store } from '../utils';

const friendly = (e) => (e?.message || String(e)).replace(/^.*?:\s*(?=[A-Z])/, '');

// Shown when this phone isn't on the list yet. Needs the invite code (from the link, or typed in).
export default function JoinScreen({ initialCode, onJoined }) {
  const [code, setCode] = useState(initialCode || '');
  const [checked, setChecked] = useState(null); // members list once the code is accepted
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [newName, setNewName] = useState('');
  const legacy = store.get('rr_user'); // 'c' / 'r' from before invite links

  const check = async (c) => {
    const clean = c.trim().toUpperCase();
    if (!clean) return;
    setBusy(true);
    setError(null);
    const { data, error: e } = await supabase.rpc('invite_members', { code: clean });
    setBusy(false);
    if (e) return setError(friendly(e));
    setCode(clean);
    setChecked(data || []);
  };

  useEffect(() => {
    if (initialCode) check(initialCode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const join = async (args) => {
    setBusy(true);
    setError(null);
    const { error: e } = await supabase.rpc('join_with_code', { code, ...args });
    if (e) {
      setBusy(false);
      return setError(friendly(e));
    }
    onJoined();
  };

  return (
    <div className="center-screen join">
      <h1 className="wordmark">{APP_NAME}</h1>

      {!checked ? (
        <>
          <p className="muted">Enter the invite code from your link.</p>
          <form
            className="join-form"
            onSubmit={(e) => {
              e.preventDefault();
              check(code);
            }}
          >
            <input
              className="code-input"
              value={code}
              placeholder="ABC123"
              autoCapitalize="characters"
              autoComplete="off"
              aria-label="Invite code"
              onChange={(e) => setCode(e.target.value.toUpperCase())}
            />
            <button className="btn primary block" disabled={busy || !code.trim()}>
              {busy ? 'Checking' : 'Continue'}
            </button>
          </form>
          <p className="muted small">No code? Ask someone on the list to send you their invite link.</p>
        </>
      ) : (
        <>
          {checked.length > 0 && (
            <>
              <p className="muted">Already on the list? Tap your name.</p>
              <div className="name-pick">
                {checked.map((m) => (
                  <button
                    key={m.id}
                    className={`name-btn ${m.legacy_key && m.legacy_key === legacy ? 'suggested' : ''}`}
                    disabled={busy}
                    onClick={() => join({ existing_id: m.id })}
                  >
                    {m.name}
                  </button>
                ))}
              </div>
              <p className="muted or">or</p>
            </>
          )}
          <form
            className="join-form"
            onSubmit={(e) => {
              e.preventDefault();
              join({ new_name: newName });
            }}
          >
            <label className="join-label">
              New here? Your name
              <input
                value={newName}
                maxLength={30}
                placeholder="First name or nickname"
                autoComplete="given-name"
                onChange={(e) => setNewName(e.target.value)}
              />
            </label>
            <button className="btn primary block" disabled={busy || !newName.trim()}>
              {busy ? 'Joining' : 'Join the list'}
            </button>
          </form>
        </>
      )}

      {error && <p className="error-text">{error}</p>}
    </div>
  );
}
