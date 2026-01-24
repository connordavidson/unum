import type { Coordinates } from '../types';

export function toLatLng(coords: Coordinates): { latitude: number; longitude: number } {
  const [latitude, longitude] = coords;
  return { latitude, longitude };
}

export function toCoordinates(lat: number, lng: number): Coordinates {
  return [lat, lng];
}
