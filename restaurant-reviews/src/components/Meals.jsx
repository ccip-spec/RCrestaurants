import { MEALS } from '../utils';

export function MealTags({ meals }) {
  if (!meals?.length) return null;
  return (
    <span className="meal-tags">
      {meals.map((m) => (
        <span key={m} className="meal-tag">
          {m}
        </span>
      ))}
    </span>
  );
}

// Pick any number of meals (for tagging a restaurant).
export function MealPicker({ value, onChange }) {
  const toggle = (m) => onChange(value.includes(m) ? value.filter((x) => x !== m) : [...value, m]);
  return (
    <div className="seg multi">
      {MEALS.map((m) => (
        <button key={m} type="button" className={value.includes(m) ? 'on' : ''} onClick={() => toggle(m)}>
          {m}
        </button>
      ))}
    </div>
  );
}

// One-tap meal filter: All or a single meal.
export function MealFilter({ value, onChange, counts }) {
  return (
    <div className="meal-filter" role="group" aria-label="Filter by meal">
      <button className={!value ? 'on' : ''} onClick={() => onChange('')}>
        All
      </button>
      {MEALS.map((m) => (
        <button key={m} className={value === m ? 'on' : ''} onClick={() => onChange(value === m ? '' : m)}>
          {m}
          {counts && counts[m] ? <span className="n">{counts[m]}</span> : null}
        </button>
      ))}
    </div>
  );
}
