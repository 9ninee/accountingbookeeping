import { haversineDistance, douglasPeucker } from '../src/services/mileageTracker';
import { RoutePoint } from '../src/models/types';

describe('haversineDistance', () => {
  it('returns 0 for identical coordinates', () => {
    const distance = haversineDistance(40.7128, -74.0060, 40.7128, -74.0060);
    expect(distance).toBe(0);
  });

  it('calculates roughly correct distance for known points', () => {
    // New York City to Los Angeles: ~3,944 km = ~3,944,000 meters
    const distance = haversineDistance(40.7128, -74.0060, 34.0522, -118.2437);
    const distanceKm = distance / 1000;
    expect(distanceKm).toBeGreaterThan(3900);
    expect(distanceKm).toBeLessThan(4000);
  });

  it('calculates short distances accurately', () => {
    // ~111 meters (roughly 0.001 degrees latitude)
    const distance = haversineDistance(40.7128, -74.0060, 40.7138, -74.0060);
    expect(distance).toBeGreaterThan(100);
    expect(distance).toBeLessThan(120);
  });
});

describe('douglasPeucker', () => {
  const makePoint = (lat: number, lon: number): RoutePoint => ({
    latitude: lat,
    longitude: lon,
    timestamp: new Date().toISOString(),
    speed: null,
  });

  it('handles empty array', () => {
    expect(douglasPeucker([], 0.001).length).toBe(0);
  });

  it('handles single point', () => {
    expect(douglasPeucker([makePoint(0, 0)], 0.001).length).toBe(1);
  });

  it('preserves two points', () => {
    const pts = [makePoint(0, 0), makePoint(1, 1)];
    expect(douglasPeucker(pts, 0.001).length).toBe(2);
  });

  it('reduces straight-line points to just endpoints', () => {
    const pts = Array.from({ length: 50 }, (_, i) =>
      makePoint(i * 0.001, i * 0.001)
    );
    const result = douglasPeucker(pts, 0.0001);
    expect(result.length).toBe(2);
  });
});
