import { useEffect, useState } from 'react';
import { supabase, PHOTO_BUCKET } from '../supabase';
import { inviteLink, usePeople } from '../people';
import { compressImage } from '../utils';
import Avatar from './Avatar';
import Sheet from './Sheet';

const friendly = (e) => (e?.message || String(e)).replace(/^.*?:\s*(?=[A-Z])/, '');

export default function SettingsSheet({ onClose, onChanged, onLogout, showToast }) {
  const { members, me } = usePeople();
  const [code, setCode] = useState(null);
  const [name, setName] = useState(me?.name || '');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.rpc('get_invite_code').then(({ data }) => setCode(data || null));
  }, []);

  const link = code ? inviteLink(code) : '';
  const nameChanged = name.trim() && name.trim() !== me?.name;

  const share = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Our Eats', text: 'Join our restaurant list', url: link });
        return;
      }
    } catch (e) {
      if (e?.name === 'AbortError') return;
    }
    try {
      await navigator.clipboard.writeText(link);
      showToast('Invite link copied');
    } catch {
      showToast('Press and hold the link below to copy it');
    }
  };

  const saveName = async () => {
    setBusy(true);
    const { error } = await supabase.rpc('update_me', { new_name: name });
    setBusy(false);
    if (error) return showToast(friendly(error));
    onChanged();
    showToast('Name saved');
  };

  const setPhoto = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      const blob = await compressImage(file, 400, 0.85);
      const path = `avatars/${me.id}-${Date.now()}.jpg`;
      const up = await supabase.storage.from(PHOTO_BUCKET).upload(path, blob, { contentType: 'image/jpeg' });
      if (up.error) throw up.error;
      const { error } = await supabase.rpc('update_me', { new_avatar: path });
      if (error) throw error;
      if (me.avatar?.startsWith('avatars/')) await supabase.storage.from(PHOTO_BUCKET).remove([me.avatar]);
      onChanged();
      showToast('Photo saved');
    } catch (e) {
      showToast(friendly(e));
    }
    setBusy(false);
  };

  const removePhoto = async () => {
    setBusy(true);
    const { error } = await supabase.rpc('update_me', { clear_avatar: true });
    if (!error && me.avatar?.startsWith('avatars/')) await supabase.storage.from(PHOTO_BUCKET).remove([me.avatar]);
    setBusy(false);
    if (error) return showToast(friendly(error));
    onChanged();
  };

  const logout = async () => {
    if (!confirm('Log out on this phone? Open the invite link again to get back on.')) return;
    setBusy(true);
    await supabase.rpc('leave_device');
    await supabase.auth.signOut();
    onLogout();
  };

  return (
    <Sheet title="Settings" onClose={onClose}>
      <div className="profile">
        <label className="profile-photo">
          <Avatar member={me} size="lg" />
          <span className="text-btn">{me?.avatar ? 'Change photo' : 'Add a photo'}</span>
          <input type="file" accept="image/*" disabled={busy} onChange={(e) => setPhoto(e.target.files?.[0])} />
        </label>
        {me?.avatar && (
          <button className="text-btn" onClick={removePhoto} disabled={busy}>
            Remove photo
          </button>
        )}
        <label className="profile-name">
          Your name
          <input value={name} maxLength={30} onChange={(e) => setName(e.target.value)} />
        </label>
        {nameChanged && (
          <button className="btn primary" onClick={saveName} disabled={busy}>
            Save name
          </button>
        )}
      </div>

      <div className="invite-box">
        <div className="box-label">Invite someone</div>
        <p className="small">Anyone who opens this link can join the list with just their name.</p>
        <button className="btn primary block" onClick={share} disabled={!code}>
          Share invite link
        </button>
        {code && <div className="invite-link">{link}</div>}
      </div>

      <h3 className="section-title">On the list</h3>
      <ul className="people-list">
        {members.map((m) => (
          <li key={m.id}>
            <span className="person">
              <Avatar member={m} />
              <span className="person-name">{m.name}</span>
            </span>
            {m.id === me?.id && <span className="you">You</span>}
          </li>
        ))}
      </ul>

      <div className="detail-admin">
        <button className="text-btn danger" onClick={logout} disabled={busy}>
          Log out
        </button>
      </div>
    </Sheet>
  );
}
