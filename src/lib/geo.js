export const CITIES = {
  Warszawa: { lat: 52.2297, lng: 21.0122 },
  Kraków: { lat: 50.0647, lng: 19.945 },
  Wrocław: { lat: 51.1079, lng: 17.0385 },
  Poznań: { lat: 52.4064, lng: 16.9252 },
  Gdańsk: { lat: 54.352, lng: 18.6466 },
  Łódź: { lat: 51.7592, lng: 19.456 },
  Katowice: { lat: 50.2649, lng: 19.0238 },
  Lublin: { lat: 51.2465, lng: 22.5684 },
  Szczecin: { lat: 53.4285, lng: 14.5528 },
  Bydgoszcz: { lat: 53.1235, lng: 18.0084 },
  Białystok: { lat: 53.1325, lng: 23.1688 },
  Rzeszów: { lat: 50.0412, lng: 21.9991 },
};

export const CITY_NAMES = Object.keys(CITIES);

export function coordsFor(city) {
  return CITIES[city] ?? null;
}

export function haversineKm(a, b) {
  if (!a || !b) return null;
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function distanceLabel(fromCity, to) {
  const from = coordsFor(fromCity);
  if (!from || !to?.lat || !to?.lng) return null;
  const km = haversineKm(from, { lat: to.lat, lng: to.lng });
  if (km === null) return null;
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
}
