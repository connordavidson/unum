/**
 * Coordinates Utility Tests
 */

import { toLatLng, toCoordinates } from '../coordinates';
import type { Coordinates } from '../../types';

describe('coordinates utilities', () => {
  describe('toLatLng', () => {
    it('should convert Coordinates to latitude/longitude object', () => {
      const coords: Coordinates = [37.7749, -122.4194];
      const result = toLatLng(coords);

      expect(result).toEqual({
        latitude: 37.7749,
        longitude: -122.4194,
      });
    });

    it('should handle zero values', () => {
      const coords: Coordinates = [0, 0];
      const result = toLatLng(coords);

      expect(result).toEqual({
        latitude: 0,
        longitude: 0,
      });
    });

    it('should handle negative values', () => {
      const coords: Coordinates = [-33.8688, 151.2093]; // Sydney
      const result = toLatLng(coords);

      expect(result).toEqual({
        latitude: -33.8688,
        longitude: 151.2093,
      });
    });

    it('should handle extreme latitude values', () => {
      const northPole: Coordinates = [90, 0];
      const southPole: Coordinates = [-90, 0];

      expect(toLatLng(northPole)).toEqual({ latitude: 90, longitude: 0 });
      expect(toLatLng(southPole)).toEqual({ latitude: -90, longitude: 0 });
    });

    it('should handle extreme longitude values', () => {
      const eastExtreme: Coordinates = [0, 180];
      const westExtreme: Coordinates = [0, -180];

      expect(toLatLng(eastExtreme)).toEqual({ latitude: 0, longitude: 180 });
      expect(toLatLng(westExtreme)).toEqual({ latitude: 0, longitude: -180 });
    });

    it('should preserve decimal precision', () => {
      const coords: Coordinates = [37.77492950, -122.41941550];
      const result = toLatLng(coords);

      expect(result.latitude).toBeCloseTo(37.77492950, 8);
      expect(result.longitude).toBeCloseTo(-122.41941550, 8);
    });
  });

  describe('toCoordinates', () => {
    it('should convert latitude/longitude to Coordinates tuple', () => {
      const result = toCoordinates(37.7749, -122.4194);

      expect(result).toEqual([37.7749, -122.4194]);
    });

    it('should handle zero values', () => {
      const result = toCoordinates(0, 0);

      expect(result).toEqual([0, 0]);
    });

    it('should handle negative values', () => {
      const result = toCoordinates(-33.8688, 151.2093);

      expect(result).toEqual([-33.8688, 151.2093]);
    });

    it('should preserve decimal precision', () => {
      const result = toCoordinates(37.77492950, -122.41941550);

      expect(result[0]).toBeCloseTo(37.77492950, 8);
      expect(result[1]).toBeCloseTo(-122.41941550, 8);
    });
  });

  describe('round-trip conversion', () => {
    it('should preserve values through round-trip conversion', () => {
      const original: Coordinates = [37.7749, -122.4194];
      const latLng = toLatLng(original);
      const backToCoords = toCoordinates(latLng.latitude, latLng.longitude);

      expect(backToCoords).toEqual(original);
    });

    it('should handle multiple round-trips', () => {
      let coords: Coordinates = [40.7128, -74.006];

      for (let i = 0; i < 10; i++) {
        const latLng = toLatLng(coords);
        coords = toCoordinates(latLng.latitude, latLng.longitude);
      }

      expect(coords).toEqual([40.7128, -74.006]);
    });
  });

  describe('known locations', () => {
    const knownLocations = [
      { name: 'San Francisco', coords: [37.7749, -122.4194] as Coordinates },
      { name: 'New York', coords: [40.7128, -74.006] as Coordinates },
      { name: 'London', coords: [51.5074, -0.1278] as Coordinates },
      { name: 'Tokyo', coords: [35.6762, 139.6503] as Coordinates },
      { name: 'Sydney', coords: [-33.8688, 151.2093] as Coordinates },
    ];

    knownLocations.forEach(({ name, coords }) => {
      it(`should correctly convert ${name} coordinates`, () => {
        const latLng = toLatLng(coords);
        expect(latLng.latitude).toBe(coords[0]);
        expect(latLng.longitude).toBe(coords[1]);
      });
    });
  });
});
