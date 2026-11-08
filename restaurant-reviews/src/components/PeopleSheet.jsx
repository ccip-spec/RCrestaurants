import { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { inviteLink, usePeople } from '../people';
import Sheet from './Sheet';

const friendly = (e) => (e?.message || String(e)).replace(/^.*?:\s*(?=[A-Z])/, '');

export default function PeopleSheet({ onClose, onChanged, onSwitched, showToast }) {
  const { members, me } = usePeople();
  const [code, setCode] = useState(null);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(me?.name || '');
  const [switching, setSwitching] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.rpc('get_invite_code').then(({ data }) => setCode(data || null));
  }, []);

  const link = code ? inviteLink(code) : '';

  const share = async () => {
    const text = `Join our restaurant list: ${link}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Our Eats', text: 'Join our restaurant list', url: link });
        return;
      }
    } catch (e) {
      if (e?.name === 'AbortError') return;
    }
    try {
      await navigator.clipboard.writeText(text);
      showToast('Invite link copied');
    } catch {
      showToast('Copy the link below');
    }
  };

  const saveName = async () => {
    setBusy(true);
    const { error } = await supabase.rpc('rename_me', { new_name: name });
    setBusy(false);
    if (error) return showToast(friendly(error));
    setRenaming(false);
    onChanged();
  };

  const switchTo = async (m) => {
    if (!code) return;
    setBusy(true);
    const { error } = await supabase.rpc('join_with_code', { code, existing_id: m.id });
    setBusy(false);
    if (error) return showToast(friendly(error));
    onSwitched(m);
  };

  return (
    <Sheet title="People" onClose={onClose}>
      <div className="invite-box">
        <div className="box-label">Invite someone</div>
        <p className="small">
          Send this link. They type their name and they're on the list, no email or password needed.
        </p>
        <button className="btn primary block" onClick={share} disabled={!code}>
          Share invite link
        </button>
        {code && (
          <>
            <div className="invite-link">{link}</div>
            <p className="muted small">
              On the home-screen app, they can type the code instead: <b className="invite-code">{code}</b>
            </p>
          </>
        )}
      </div>

      <h3 className="section-title">On the list</h3>
      <ul className="people-list">
        {members.map((m) => (
          <li key={m.id} className={m.id === me?.id ? 'me' : ''}>
            <span className="person-name">{m.name}</span>
            {m.id === me?.id ? (
              <span className="you">You</span>
            ) : switching ? (
              <button className="text-btn" disabled={busy} onClick={() => switchTo(m)}>
                This is me
              </button>
            ) : null}
          </li>
        ))}
      </ul>

      <div className="detail-admin">
        {renaming ? (
          <div className="form">
            <label>
              Your name
              <input value={name} maxLength={30} onChange={(e) => setName(e.target.value)} />
            </label>
            <div className="row gap">
              <button className="btn primary" onClick={saveName} disabled={busy || !name.trim()}>
                Save name
              </button>
              <button className="btn" onClick={() => setRenaming(false)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="row gap wrap">
            <button className="text-btn" onClick={() => setRenaming(true)}>
              Change my name
            </button>
            <button className="text-btn" onClick={() => setSwitching((s) => !s)}>
              {switching ? 'Cancel switching' : 'Switch person on this phone'}
            </button>
          </div>
        )}
      </div>
    </Sheet>
  );
}
