import { useEffect, useMemo, useState } from 'react';
import { HOME_CENTER } from '../config';
import { nearbyPhilly, samePlace } from '../phl';
import { nearbyOsm } from '../photon';
import { fmtMiles, haversineMiles } from '../utils';
import Score from './Score';
import Thumb from './Thumb';

const RADII = [
  { m: 400, label: '¼ mi' },
  { m: 800, label: '½ mi' },
  { m: 1600, label: '1 mi' },
];

export default function NearbyView({ rows, loc, onLocate, onSelect, onQuickTry, onLogNew }) {
  const [radius, setRadius] = useState(800);
  const [places, setPlaces] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [added, setAdded] = useState({});
  const center = loc || HOME_CENTER;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      let list = [];
      try {
        list = await nearbyPhilly(center, radius, 60);
      } catch {
        /* outside the city or the city service is down — try OpenStreetMap */
      }
      if (list.length < 5) {
        try {
          const osm = await nearbyOsm(center, radius / 1000, 30);
          list = [...list, ...osm.filter((o) => !list.some((p) => samePlace(p, o)))];
        } catch {
          if (!list.length) setError("Couldn't load nearby places right now.");
        }
      }
      if (!cancelled) {
        setPlaces(list);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [center.lat, center.lng, radius]);

  const miles = (p) => haversineMiles(center.lat, center.lng, p.lat, p.lng);
  const radiusMi = radius / 1609.34;

  const known = (p) => rows.find((r) => (p.osm_ref && r.osm_ref === p.osm_ref) || samePlace(r, p));

  const { tryNear, favNear, fresh } = useMemo(() => {
    const withDist = rows.filter((r) => r.lat != null).map((r) => ({ r, d: miles(r) }));
    const tryNear = withDist.filter(({ r, d }) => !r.been && d <= Math.max(radiusMi * 2, 1)).sort((a, b) => a.d - b.d);
    const favNear = withDist
      .filter(({ r, d }) => r.been && r.overall != null && r.overall >= 7.3 && d <= Math.max(radiusMi * 2, 1))
      .sort((a, b) => b.r.overall - a.r.overall)
      .slice(0, 8);
    const fresh = places.filter((p) => !known(p)).map((p) => ({ p, d: miles(p) })).sort((a, b) => a.d - b.d);
    return { tryNear, favNear, fresh };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, places, center.lat, center.lng, radiusMi]);

  const quickTry = async (p) => {
    setAdded((a) => ({ ...a, [p.osm_ref]: 'saving' }));
    const ok = await onQuickTry(p);
    setAdded((a) => ({ ...a, [p.osm_ref]: ok ? 'done' : undefined }));
  };

  return (
    <div className="nearby">
      {!loc && (
        <div className="banner">
          Showing Center City. Allow location to see what's near you.
          <button className="btn small" onClick={onLocate}>
            Allow
          </button>
        </div>
      )}

      <div className="meal-filter" role="group" aria-label="Distance">
        {RADII.map((r) => (
          <button key={r.m} className={radius === r.m ? 'on' : ''} onClick={() => setRadius(r.m)}>
            Within {r.label}
          </button>
        ))}
      </div>

      {tryNear.length > 0 && (
        <>
          <h3 className="section-title">On your try list</h3>
          <ol className="check-lines plain">
            {tryNear.map(({ r, d }) => (
              <li key={r.id}>
                <button className="line-row" onClick={() => onSelect(r.id)}>
                  <span className="line-no">·</span>
                  <Thumb row={r} />
                  <span className="line-main">
                    <span className="line-name">{r.name}</span>
                    <span className="line-people">{r.recommended_by ? `From ${r.recommended_by}` : 'Saved to try'}</span>
                  </span>
                  <span className="line-amount">
                    <span className="dist big">{fmtMiles(d)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </>
      )}

      {favNear.length > 0 && (
        <>
          <h3 className="section-title">Your favorites nearby</h3>
          <ol className="check-lines plain">
            {favNear.map(({ r, d }) => (
              <li key={r.id}>
                <button className="line-row" onClick={() => onSelect(r.id)}>
                  <span className="line-no">·</span>
                  <Thumb row={r} />
                  <span className="line-main">
                    <span className="line-name">{r.name}</span>
                    <span className="line-people">{fmtMiles(d)} away</span>
                  </span>
                  <span className="line-amount">
                    <Score value={r.overall} />
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </>
      )}

      <h3 className="section-title">Haven't been yet</h3>
      {loading && <p className="progress">Looking around</p>}
      {error && <p className="error-text">{error}</p>}
      {!loading && !error && fresh.length === 0 && (
        <p className="empty">Nothing new within {RADII.find((r) => r.m === radius)?.label}. Try a wider distance.</p>
      )}
      <ol className="check-lines plain">
        {fresh.map(({ p, d }, i) => {
          const state = added[p.osm_ref];
          return (
            <li key={`${p.osm_ref}-${i}`} className="near-row">
              <div className="near-main">
                <span className="line-name">{p.name}</span>
                <span className="muted small">{p.address}</span>
                <div className="near-actions">
                  {state === 'done' ? (
                    <span className="added">On your try list</span>
                  ) : (
                    <button className="text-btn" disabled={state === 'saving'} onClick={() => quickTry(p)}>
                      {state === 'saving' ? 'Saving' : 'Want to try'}
                    </button>
                  )}
                  <button className="text-btn" onClick={() => onLogNew(p)}>
                    We've been
                  </button>
                </div>
              </div>
              <span className="dist big">{fmtMiles(d)}</span>
            </li>
          );
        })}
      </ol>
      {fresh.length > 0 && (
        <p className="muted small source-note">Nearby places come from the City of Philadelphia's food license list.</p>
      )}
    </div>
  );
}
