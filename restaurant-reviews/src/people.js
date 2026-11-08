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
