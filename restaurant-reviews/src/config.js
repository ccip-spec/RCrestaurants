// Edit names here. `key` must match the database columns (c_score, r_score) — don't change keys.
export const PEOPLE = [
  { key: 'c', label: 'C' },
  { key: 'r', label: 'R' },
];

export const APP_NAME = 'Our Eats';

// Default map center / search bias when location is unavailable (Philadelphia City Hall).
export const HOME_CENTER = { lat: 39.9526, lng: -75.1652 };

// On first load the map zooms to restaurants within this many miles of you (or Philly).
// The "All" button shows everything.
export const LOCAL_RADIUS_MILES = 25;
