import { useMemo, useState } from 'react';
import { usePeople, isTry } from '../people';
import { fmtDate, fmtScore, mean } from '../utils';
import { fmtShort, totalMin } from '../recipes';
import Avatar from './Avatar';
import Score from './Score';
import Sheet from './Sheet';
import Thumb from './Thumb';
import { PrivateTag } from './Privacy';

const SHOW = 5;

function joined(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

// A person's page: what they rated, what they want to try, their recipes.
// Only shows what this phone is allowed to see (their public tries and recipes, plus your own).
export default function ProfileSheet({ memberId, rows, recipes, onClose, onSelect, onSelectRecipe }) {
  const { byId, me } = usePeople();
  const person = byId[memberId];
  const isMe = memberId === me?.id;
  const [tab, setTab] = useState('rated');
  const [all, setAll] = useState(false);

  const data = useMemo(() => {
    const lastScored = (r) => r.visits.find((v) => v.scores?.[memberId] != null)?.visit_date || null;
    const rated = rows
      .filter((r) => r.avg[memberId] != null)
      .map((r) => ({ r, score: r.avg[memberId], last: lastScored(r) }));
    const top = rated.slice().sort((a, b) => b.score - a.score || a.r.name.localeCompare(b.r.name));
    const recent = rated.slice().sort((a, b) => (b.last || '').localeCompare(a.last || ''));
    const tries = rows.filter((r) => isTry(r, memberId));
    const theirRecipes = recipes.filter((x) => x.created_by === memberId).sort((a, b) => a.name.localeCompare(b.name));
    // Everyone's average on the places this person rated, to show if they score high or low.
    const theirAvg = mean(rated.map((x) => x.score));
    const groupAvg = mean(rated.map((x) => x.r.overall));
    // How close your scores are to theirs on places you both rated.
    let match = null;
    if (!isMe && me) {
      const shared = rows.filter((r) => r.avg[memberId] != null && r.avg[me.id] != null);
      if (shared.length) {
        match = {
          n: shared.length,
          diff: mean(shared.map((r) => Math.abs(r.avg[memberId] - r.avg[me.id]))),
          agree: shared
            .slice()
            .sort((a, b) => Math.min(b.avg[memberId], b.avg[me.id]) - Math.min(a.avg[memberId], a.avg[me.id]))
            .find((r) => r.avg[memberId] >= 7.3 && r.avg[me.id] >= 7.3),
          split: shared
            .slice()
            .sort((a, b) => Math.abs(b.avg[memberId] - b.avg[me.id]) - Math.abs(a.avg[memberId] - a.avg[me.id]))[0],
        };
      }
    }
    return { rated, top, recent, tries, theirRecipes, theirAvg, groupAvg, match };
  }, [rows, recipes, memberId, isMe, me]);

  if (!person) return null;
  const firstName = isMe ? 'You' : person.name;
  const lean =
    data.theirAvg != null && data.groupAvg != null && data.rated.length >= 3
      ? data.theirAvg - data.groupAvg >= 0.3
        ? 'Scores higher than the group'
        : data.groupAvg - data.theirAvg >= 0.3
          ? 'Tough grader'
          : 'Scores in line with the group'
      : null;

  const tabs = [
    { key: 'rated', label: 'Top rated', n: data.rated.length },
    { key: 'recent', label: 'Recent', n: data.rated.length },
    { key: 'try', label: 'To try', n: data.tries.length },
    { key: 'recipes', label: 'Recipes', n: data.theirRecipes.length },
  ];
  const pick = (k) => {
    setTab(k);
    setAll(false);
  };

  const ratedList = tab === 'recent' ? data.recent : data.top;
  const list =
    tab === 'try' ? data.tries : tab === 'recipes' ? data.theirRecipes : ratedList;
  const shown = all ? list : list.slice(0, SHOW);

  return (
    <Sheet title={isMe ? 'Your profile' : person.name} onClose={onClose}>
      <div className="profile">
        <Avatar member={person} size="lg" />
        {joined(person.created_at) && <p className="muted small">On the list since {joined(person.created_at)}</p>}
      </div>

      <div className="tally">
        <div className="tally-line">
          <span>Places rated</span>
          <span className="dots" />
          <b>{data.rated.length}</b>
        </div>
        {data.theirAvg != null && (
          <div className="tally-line">
            <span>Average score</span>
            <span className="dots" />
            <b>{fmtScore(data.theirAvg)}</b>
          </div>
        )}
        <div className="tally-line">
          <span>On try list</span>
          <span className="dots" />
          <b>{data.tries.length}</b>
        </div>
        <div className="tally-line">
          <span>Recipes</span>
          <span className="dots" />
          <b>{data.theirRecipes.length}</b>
        </div>
      </div>
      {lean && <p className="muted small">{lean} (group avg {fmtScore(data.groupAvg)} on the same places).</p>}

      {data.match && (
        <div className="try-box match-box">
          <div className="try-stamp">You two</div>
          <p>
            Both rated <b>{data.match.n}</b> {data.match.n === 1 ? 'place' : 'places'}. Your scores are{' '}
            <b>{fmtScore(data.match.diff)}</b> apart on average.
          </p>
          {data.match.agree && (
            <p>
              You both loved{' '}
              <button className="name-link" onClick={() => onSelect(data.match.agree.id)}>
                {data.match.agree.name}
              </button>
              .
            </p>
          )}
          {data.match.split && data.match.n > 1 && Math.abs(data.match.split.avg[memberId] - data.match.split.avg[me.id]) >= 1 && (
            <p>
              Biggest split:{' '}
              <button className="name-link" onClick={() => onSelect(data.match.split.id)}>
                {data.match.split.name}
              </button>{' '}
              ({firstName} {fmtScore(data.match.split.avg[memberId])}, you {fmtScore(data.match.split.avg[me.id])}).
            </p>
          )}
        </div>
      )}

      <div className="meal-filter profile-tabs" role="tablist">
        {tabs.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} className={tab === t.key ? 'on' : ''} onClick={() => pick(t.key)}>
            {t.label}
            {t.n ? <span className="n">{t.n}</span> : null}
          </button>
        ))}
      </div>

      <ol className="check-lines plain">
        {tab === 'recipes'
          ? shown.map((x) => (
              <li key={x.id}>
                <button className="line-row recipe-row" onClick={() => onSelectRecipe(x.id)}>
                  <span className="line-no">·</span>
                  <Thumb row={x} />
                  <span className="line-main">
                    <span className="line-name">{x.name}</span>
                    <span className="meta">
                      {x.meal_type && <span className="price">{x.meal_type}</span>}
                      {x.cuisine && <span>{x.cuisine}</span>}
                      {!x.is_public && <PrivateTag />}
                    </span>
                  </span>
                  <span className="line-amount">
                    <span className="recipe-time">{totalMin(x) ? fmtShort(totalMin(x)) : ''}</span>
                  </span>
                </button>
              </li>
            ))
          : tab === 'try'
            ? shown.map((r) => {
                const t = r.tries.find((x) => x.member_id === memberId);
                return (
                  <li key={r.id}>
                    <button className="line-row" onClick={() => onSelect(r.id)}>
                      <span className="line-no">·</span>
                      <Thumb row={r} />
                      <span className="line-main">
                        <span className="line-name">{r.name}</span>
                        <span className="meta">
                          {r.cuisine && <span>{r.cuisine}</span>}
                          {(r.neighborhood || r.city) && <span>{r.neighborhood || r.city}</span>}
                          {t && !t.is_public && <PrivateTag />}
                        </span>
                        {t?.recommended_by && <span className="line-people">From {t.recommended_by}</span>}
                      </span>
                    </button>
                  </li>
                );
              })
            : shown.map(({ r, score, last }) => (
                <li key={r.id}>
                  <button className="line-row" onClick={() => onSelect(r.id)}>
                    <span className="line-no">·</span>
                    <Thumb row={r} />
                    <span className="line-main">
                      <span className="line-name">{r.name}</span>
                      <span className="meta">
                        {r.cuisine && <span>{r.cuisine}</span>}
                        {last && <span>{fmtDate(last)}</span>}
                      </span>
                    </span>
                    <span className="line-amount">
                      <Score value={score} />
                    </span>
                  </button>
                </li>
              ))}
      </ol>
      {list.length === 0 && (
        <p className="empty">
          {tab === 'try'
            ? isMe ? 'Your try list is empty.' : `${person.name}'s public try list is empty.`
            : tab === 'recipes'
              ? 'No public recipes yet.'
              : 'Nothing rated yet.'}
        </p>
      )}
      {list.length > SHOW && (
        <button className="text-btn" onClick={() => setAll((v) => !v)}>
          {all ? 'Show fewer' : `Show all ${list.length}`}
        </button>
      )}
    </Sheet>
  );
}
