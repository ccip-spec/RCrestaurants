// Public = everyone in the group sees it. Private = only you.
export function PublicToggle({ value, onChange, what = 'this' }) {
  return (
    <div className="field">
      <span>Who sees {what}</span>
      <div className="seg">
        <button type="button" className={value ? 'on' : ''} onClick={() => onChange(true)}>
          Public
        </button>
        <button type="button" className={!value ? 'on' : ''} onClick={() => onChange(false)}>
          Private
        </button>
      </div>
      <small className="muted">{value ? 'Everyone in the group can see it.' : 'Only you can see it.'}</small>
    </div>
  );
}

// Show just your own entries or everyone's.
export function ScopeToggle({ value, onChange }) {
  return (
    <div className="scope seg" role="group" aria-label="Show">
      <button className={value === 'mine' ? 'on' : ''} onClick={() => onChange('mine')}>
        Just mine
      </button>
      <button className={value === 'all' ? 'on' : ''} onClick={() => onChange('all')}>
        Show all
      </button>
    </div>
  );
}

export const PrivateTag = () => <span className="private-tag">Private</span>;
