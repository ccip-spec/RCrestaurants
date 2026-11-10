import { createContext, useContext } from 'react';

// { members: [{id, name, legacy_key}], me: {id, name}, byId: {id: member} }
export const PeopleContext = createContext({ members: [], me: null, byId: {} });
export const usePeople = () => useContext(PeopleContext);

export function nameOf(byId, id) {
  return byId[id]?.name || '?';
}

// Member ids in list order, limited to the ones present in `scores`.
export function ratersIn(members, scores) {
  if (!scores) return [];
  const ids = members.map((m) => m.id).filter((id) => scores[id] != null);
  // Scores from someone no longer on the list still count, shown last.
  for (const id of Object.keys(scores)) if (!ids.includes(id) && scores[id] != null) ids.push(id);
  return ids;
}

// On this person's try list: someone added it, and this person hasn't logged a score there yet.
// (A place with no visits and nobody recorded as adding it also counts — older entries.)
export function isTry(row, meId) {
  return (row.tryBy.length > 0 || !row.been) && row.avg[meId] == null;
}

export function avatarSrc(member, photoUrl) {
  if (!member?.avatar) return null;
  return /^https?:/.test(member.avatar) ? member.avatar : photoUrl(member.avatar);
}

const INVITE_KEY = 'rr_invite';
export function rememberCode(code) {
  try {
    if (code) localStorage.setItem(INVITE_KEY, code);
  } catch {
    /* ignore */
  }
}
export function rememberedCode() {
  try {
    return localStorage.getItem(INVITE_KEY) || '';
  } catch {
    return '';
  }
}

// Keep ?join=CODE in the address bar so "Add to Home Screen" carries the invite.
export function putCodeInUrl(code) {
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.get('join') === code) return;
    url.searchParams.set('join', code);
    window.history.replaceState(null, '', url.pathname + url.search + url.hash);
  } catch {
    /* ignore */
  }
}

// Pull the code out of a pasted invite link (or a bare code).
export function codeFromText(text) {
  const t = (text || '').trim();
  const m = t.match(/[?&]join=([A-Za-z0-9]+)/);
  return (m ? m[1] : /^[A-Za-z0-9]{4,12}$/.test(t) ? t : '').toUpperCase();
}

// Invite code from ?join=CODE in the address bar.
export function codeFromUrl() {
  try {
    const p = new URLSearchParams(window.location.search);
    return (p.get('join') || '').trim().toUpperCase();
  } catch {
    return '';
  }
}

export function clearCodeFromUrl() {
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete('join');
    window.history.replaceState(null, '', url.pathname + url.search + url.hash);
  } catch {
    /* ignore */
  }
}

export function inviteLink(code) {
  return `${window.location.origin}/?join=${encodeURIComponent(code)}`;
}
