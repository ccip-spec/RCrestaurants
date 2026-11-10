// Home-screen install helpers.

// Android Chrome fires this once; keep it so the guide can show a real "Install" button.
let deferredPrompt = null;
const listeners = new Set();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    listeners.forEach((fn) => fn(true));
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    listeners.forEach((fn) => fn(false));
  });
}

export const canPromptInstall = () => Boolean(deferredPrompt);
export function onInstallAvailable(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export async function promptInstall() {
  if (!deferredPrompt) return false;
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  deferredPrompt = null;
  return outcome === 'accepted';
}

export function isStandalone() {
  try {
    return window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
  } catch {
    return false;
  }
}

// 'ios-safari' | 'ios-chrome' | 'ios-inapp' | 'android' | 'desktop'
export function platform() {
  const ua = navigator.userAgent || '';
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (ios) {
    if (/FBAN|FBAV|Instagram|Snapchat|LinkedInApp|Twitter|Line\/|GSA\//.test(ua)) return 'ios-inapp';
    if (/CriOS/.test(ua)) return 'ios-chrome';
    if (/FxiOS|EdgiOS/.test(ua)) return 'ios-chrome';
    return 'ios-safari';
  }
  if (/Android/.test(ua)) return 'android';
  return 'desktop';
}

// Safari 26+ moved Share into the ••• menu next to the address bar.
export function safariMajor() {
  const m = (navigator.userAgent || '').match(/Version\/(\d+)/);
  return m ? Number(m[1]) : 0;
}
