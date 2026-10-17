import { fmtScore, tierOf } from '../utils';

// A score written in pen. Excellent scores get circled in red, like a server marking a check.
export default function Score({ value, size = 'md', showTier = true }) {
  const tier = tierOf(value);
  return (
    <span className={`score ${size} ${tier ? `t-${tier.key}` : 'empty'}`}>
      <span className="score-num">
        {fmtScore(value)}
        {tier?.key === 'excellent' && (
          <svg className="circled" viewBox="0 0 100 60" preserveAspectRatio="none" aria-hidden="true">
            <path d="M52 6C26 4 6 14 5 30c-1 17 22 26 47 25 26-1 44-11 43-27C94 13 74 4 47 7" />
          </svg>
        )}
      </span>
      {showTier && tier && <span className="tier">{tier.label}</span>}
    </span>
  );
}
