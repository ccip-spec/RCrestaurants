import { priceLabel } from '../utils';

export default function Meta({ row }) {
  const area = row.neighborhood || row.city;
  if (!row.cuisine && !area && !row.price) return null;
  return (
    <div className="meta">
      {row.cuisine && <span>{row.cuisine}</span>}
      {area && <span>{area}</span>}
      {row.price ? <span className="price">{priceLabel(row.price)}</span> : null}
    </div>
  );
}
