import { supabase } from './supabase';
import { geocodeAddress, lookupDetails } from './photon';

// Turns a picker choice into a restaurant id, creating the restaurant if needed.
// choice: { type: 'existing', row } | { type: 'new', place } | { type: 'manual', name, address, useHere }
export async function ensureRestaurant(choice, { loc, user, fields = {} }) {
  if (!choice) throw new Error('Pick a restaurant first.');
  if (choice.type === 'existing') return { id: choice.row.id, created: false };

  let base;
  if (choice.type === 'new') {
    base = { ...choice.place };
  } else {
    const name = choice.name.trim();
    if (!name) throw new Error('Enter the restaurant name.');
    const address = choice.address.trim();
    if (choice.useHere) {
      if (!loc) throw new Error("Your location isn't available. Allow location or enter an address.");
      base = { name, address, lat: loc.lat, lng: loc.lng };
    } else {
      if (!address) throw new Error('Enter an address so it can go on the map.');
      const g = await geocodeAddress(address, loc);
      if (!g) throw new Error("Couldn't find that address. Check it, or tick “I'm here now”.");
      base = { name, address, city: g.city, neighborhood: g.neighborhood, lat: g.lat, lng: g.lng };
    }
  }

  let details = {};
  if (base.osm_ref) {
    try {
      details = (await lookupDetails([base.osm_ref]))[base.osm_ref] || {};
    } catch {
      /* details are optional */
    }
  }

  const insert = {
    name: base.name,
    address: base.address || null,
    city: base.city || null,
    neighborhood: base.neighborhood || null,
    lat: base.lat,
    lng: base.lng,
    osm_ref: base.osm_ref || null,
    cuisine: fields.cuisine || base.cuisine || details.cuisine || null,
    price: fields.price ?? null,
    website: details.website || null,
    photo: details.image || null,
    want_to_try: Boolean(fields.want_to_try),
    recommended_by: fields.recommended_by || null,
    try_notes: fields.try_notes || null,
    created_by: user,
  };

  const { data, error } = await supabase.from('restaurants').insert(insert).select('id').single();
  if (error) {
    // Already added by someone — reuse it.
    if (error.code === '23505' && insert.osm_ref) {
      const found = await supabase.from('restaurants').select('id').eq('osm_ref', insert.osm_ref).single();
      if (found.error) throw found.error;
      return { id: found.data.id, created: false };
    }
    throw error;
  }
  return { id: data.id, created: true };
}
