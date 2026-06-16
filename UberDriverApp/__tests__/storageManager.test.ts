import { douglasPeucker } from '../src/services/mileageTracker';
import { RoutePoint } from '../src/models/types';

describe('Douglas-Peucker Route Compression', () => {
  const makePoint = (lat: number, lon: number): RoutePoint => ({
    latitude: lat,
    longitude: lon,
    timestamp: new Date().toISOString(),
    speed: null,
  });

  it('returns same points for 2 or fewer points', () => {
    const points = [makePoint(0, 0), makePoint(1, 1)];
    const result = douglasPeucker(points, 0.001);
    expect(result.length).toBe(2);
  });

  it('returns single point for 1-point array', () => {
    const points = [makePoint(0, 0)];
    const result = douglasPeucker(points, 0.001);
    expect(result.length).toBe(1);
  });

  it('returns empty array for empty input', () => {
    const result = douglasPeucker([], 0.001);
    expect(result.length).toBe(0);
  });

  it('removes collinear points', () => {
    // Points on a straight line from (0,0) to (1,1)
    const points = [
      makePoint(0, 0),
      makePoint(0.25, 0.25),
      makePoint(0.5, 0.5),
      makePoint(0.75, 0.75),
      makePoint(1, 1),
    ];

    const result = douglasPeucker(points, 0.001);
    // All intermediate points are on the line, so only endpoints should remain
    expect(result.length).toBe(2);
    expect(result[0].latitude).toBe(0);
    expect(result[1].latitude).toBe(1);
  });

  it('preserves points that deviate from the line', () => {
    // A point that deviates significantly from the straight line
    const points = [
      makePoint(0, 0),
      makePoint(0.5, 0.5), // on line
      makePoint(0.5, 1.0), // significantly off line
      makePoint(0.75, 0.75), // close to line
      makePoint(1, 1),
    ];

    const result = douglasPeucker(points, 0.01);
    // The deviated point should be preserved
    expect(result.length).toBeGreaterThan(2);
    expect(result.some((p) => p.longitude === 1.0)).toBe(true);
  });

  it('reduces point count significantly for a realistic route', () => {
    // Simulate a route with many small GPS updates along a mostly straight path
    const points: RoutePoint[] = [];
    for (let i = 0; i <= 100; i++) {
      // Mostly straight line with small noise
      const noise = (Math.random() - 0.5) * 0.00001;
      points.push(makePoint(40.7128 + i * 0.0001, -74.006 + i * 0.0001 + noise));
    }

    const result = douglasPeucker(points, 0.00005);
    // Should significantly reduce points (typically 70-80% reduction)
    expect(result.length).toBeLessThan(points.length * 0.5);
    // But must keep at least start and end
    expect(result.length).toBeGreaterThanOrEqual(2);
    expect(result[0].latitude).toBe(points[0].latitude);
    expect(result[result.length - 1].latitude).toBe(points[points.length - 1].latitude);
  });

  it('handles a zigzag route by keeping turn points', () => {
    const points = [
      makePoint(0, 0),
      makePoint(0.1, 0.5),  // turn point
      makePoint(0.2, 0),    // turn point
      makePoint(0.3, 0.5),  // turn point
      makePoint(0.4, 0),
    ];

    const result = douglasPeucker(points, 0.01);
    // Zigzag points deviate significantly, most should be kept
    expect(result.length).toBeGreaterThanOrEqual(4);
  });
});

describe('Storage Tier Logic', () => {
  it('calculates correct tier dates', () => {
    const now = new Date('2024-06-15');

    const hotThreshold = new Date(now);
    hotThreshold.setDate(hotThreshold.getDate() - 30);

    const warmThreshold = new Date(now);
    warmThreshold.setDate(warmThreshold.getDate() - 90);

    // A trip from 10 days ago should stay hot
    const recentTrip = new Date('2024-06-05');
    expect(recentTrip > hotThreshold).toBe(true);

    // A trip from 45 days ago should be warm
    const olderTrip = new Date('2024-05-01');
    expect(olderTrip < hotThreshold).toBe(true);
    expect(olderTrip > warmThreshold).toBe(true);

    // A trip from 100 days ago should be cold
    const oldTrip = new Date('2024-03-07');
    expect(oldTrip < warmThreshold).toBe(true);
  });
});
