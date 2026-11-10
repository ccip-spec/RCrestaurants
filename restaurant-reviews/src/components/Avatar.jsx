import { photoUrl } from '../supabase';
import { avatarSrc } from '../people';
import { initials } from '../utils';

export default function Avatar({ member, size = 'sm' }) {
  const src = avatarSrc(member, photoUrl);
  return (
    <span className={`avatar ${size}`} aria-hidden="true">
      {src ? <img src={src} alt="" /> : initials(member?.name || '?')}
    </span>
  );
}
