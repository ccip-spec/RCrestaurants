import { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { APP_NAME } from '../config';
import { store } from '../utils';
import { codeFromText, rememberCode } from '../people';
import Avatar from './Avatar';

const friendly = (e) => (e?.message || String(e)).replace(/^.*?:\s*(?=[A-Z])/, '');

// Shown when this phone isn't on the list yet. The invite link carries everything needed.
export default function JoinScreen({ code: linkCode, onJoined }) {
  const [code, setCode] = useState(linkCode || '');
  const [members, setMembers] = useState(null);
  const [busy, setBusy] = useState(Boolean(linkCode));
  const [error, setError] = useState(null);
  const [newName, setNewName] = useState('');
  const [pasted, setPasted] = useState('');
  const legacy = store.get('rr_user'); // 'c' / 'r' from before invite links

  const open = async (c) => {
    if (!c) return;
    setBusy(true);
    setError(null);
    const { data, error: e } = await supabase.rpc('invite_members', { code: c });
    setBusy(false);
    if (e) {
      setMembers(null);
      return setError("That invite link isn't working. Ask for a new one.");
    }
    setCode(c);
    setMembers(data || []);
  };

  useEffect(() => {
    if (linkCode) open(linkCode);
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
    rememberCode(code);
    onJoined();
  };

  // No invite link on this phone (e.g. an old home-screen icon).
  if (!members) {
    return (
      <div className="center-screen join">
        <h1 className="wordmark">{APP_NAME}</h1>
        {busy ? (
          <p className="muted">Opening your invite</p>
        ) : (
          <>
            <p>Open the invite link someone sent you to join.</p>
            <form
              className="join-form"
              onSubmit={(e) => {
                e.preventDefault();
                open(codeFromText(pasted));
              }}
            >
              <label className="join-label">
                Or paste the link here
                <input
                  value={pasted}
                  placeholder="https://rc-restaurants.vercel.app/?join=…"
                  autoComplete="off"
                  onChange={(e) => setPasted(e.target.value)}
                />
              </label>
              <button className="btn primary block" disabled={!codeFromText(pasted)}>
                Open invite
              </button>
            </form>
          </>
        )}
        {error && <p className="error-text">{error}</p>}
      </div>
    );
  }

  return (
    <div className="center-screen join">
      <h1 className="wordmark">{APP_NAME}</h1>
      {members.length > 0 && (
        <>
          <p className="muted">Already on the list? Tap your name.</p>
          <div className="name-pick">
            {members.map((m) => (
              <button
                key={m.id}
                className={`name-btn ${m.legacy_key && m.legacy_key === legacy ? 'suggested' : ''}`}
                disabled={busy}
                onClick={() => join({ existing_id: m.id })}
              >
                <Avatar member={m} size="md" />
                <span>{m.name}</span>
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
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}
