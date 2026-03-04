import { haversineDistance } from '../src/services/mileageTracker';

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
