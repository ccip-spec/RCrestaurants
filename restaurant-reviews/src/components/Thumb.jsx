import { useEffect, useMemo, useState } from 'react';
import { photoUrl } from '../supabase';
import { initials, siteHost } from '../utils';

export function picturePath(p) {
  return /^https?:\/\//.test(p) ? p : photoUrl(p);
}

// Picture priority: cover photo → latest visit photo → logo from the restaurant's website → initials.
function candidates(row) {
  const out = [];
  if (row.photo) out.push({ src: picturePath(row.photo), kind: 'photo' });
  const withPhoto = row.visits?.find((v) => v.photos?.length);
  if (withPhoto) out.push({ src: photoUrl(withPhoto.photos[0]), kind: 'photo' });
  const host = siteHost(row.website);
  if (host) out.push({ src: `https://www.google.com/s2/favicons?domain=${host}&sz=128`, kind: 'logo' });
  return out;
}

export default function Thumb({ row, size = 'md' }) {
  const list = useMemo(() => candidates(row), [row]);
  const key = list.map((c) => c.src).join('|');
  const [i, setI] = useState(0);
  useEffect(() => setI(0), [key]);

  const c = list[i];
  if (!c) {
    return (
      <div className={`thumb ${size} mono`} aria-hidden="true">
        {initials(row.name)}
      </div>
    );
  }
  return (
    <div className={`thumb ${size} ${c.kind}`} aria-hidden="true">
      <img
        src={c.src}
        alt=""
        loading="lazy"
        onError={() => setI((n) => n + 1)}
        onLoad={(e) => {
          // The logo service returns a tiny generic globe when a site has no icon — skip it.
          if (c.kind === 'logo' && e.currentTarget.naturalWidth <= 16) setI((n) => n + 1);
        }}
      />
    </div>
  );
}
