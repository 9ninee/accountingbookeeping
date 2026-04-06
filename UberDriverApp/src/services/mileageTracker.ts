import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';
import { MileageTrip, RoutePoint } from '../models/types';
import { insertMileageTrip, updateMileageTrip, getActiveTrip, insertRoutePointsBatch, getRoutePointsForTrip, replaceRoutePointsForTrip } from './database';
import { generateId } from '../utils/helpers';

const LOCATION_TASK_NAME = 'background-mileage-tracking';
const METERS_PER_MILE = 1609.344;
const ROUTE_FLUSH_THRESHOLD = 50; // flush buffer to DB every N points

// Store active trip data in memory for fast access during tracking
let activeTripId: string | null = null;
let routeBuffer: RoutePoint[] = [];
let accumulatedDistanceMeters = 0;
let lastPoint: { latitude: number; longitude: number } | null = null;
let flushedPointCount = 0; // track how many points already written to DB

/**
 * Request location permissions with platform-specific flows.
 * Android 11+ requires separate foreground → background permission requests.
 */
export async function requestLocationPermissions(): Promise<boolean> {
  const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
  if (foregroundStatus !== 'granted') return false;

  if (Platform.OS === 'android' && Platform.Version >= 30) {
    // Android 11+: must request background location separately after foreground is granted
    const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
    return backgroundStatus === 'granted';
  }

  const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
  return backgroundStatus === 'granted';
}

/**
 * Start tracking a new mileage trip.
 */
export async function startTrip(
  purpose: MileageTrip['purpose'] = 'uber_trip'
): Promise<MileageTrip | null> {
  const hasPermission = await requestLocationPermissions();
  if (!hasPermission) return null;

  // Check if there's already an active trip
  const existing = await getActiveTrip();
  if (existing) {
    activeTripId = existing.id;
    routeBuffer = []; // buffer is empty — points are in DB
    flushedPointCount = 0;
    return existing;
  }

  const currentLocation = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.High,
  });

  const now = new Date().toISOString();
  const trip: MileageTrip = {
    id: generateId(),
    startTime: now,
    endTime: null,
    startLatitude: currentLocation.coords.latitude,
    startLongitude: currentLocation.coords.longitude,
    endLatitude: null,
    endLongitude: null,
    distanceMiles: 0,
    isActive: true,
    purpose,
    notes: null,
    routePoints: [],
    storageTier: 'hot',
    createdAt: now,
  };

  await insertMileageTrip(trip);

  // Set up tracking state
  activeTripId = trip.id;
  routeBuffer = [];
  accumulatedDistanceMeters = 0;
  flushedPointCount = 0;
  lastPoint = {
    latitude: currentLocation.coords.latitude,
    longitude: currentLocation.coords.longitude,
  };

  // Start background location tracking
  await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
    accuracy: Location.Accuracy.High,
    distanceInterval: 10, // update every 10 meters
    timeInterval: 5000,   // or every 5 seconds
    showsBackgroundLocationIndicator: true,
    pausesUpdatesAutomatically: true, // iOS: save battery when stationary
    activityType: Location.ActivityType.AutomotiveNavigation, // iOS: hint for driving
    foregroundService: {
      notificationTitle: 'Mileage Tracking Active',
      notificationBody: 'Recording your trip distance...',
      notificationColor: '#4CAF50',
    },
  });

  return trip;
}

/**
 * Stop the current trip, compress route, and finalize the recording.
 */
export async function stopTrip(): Promise<MileageTrip | null> {
  if (!activeTripId) return null;

  // Stop background tracking
  const isTracking = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
  if (isTracking) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
  }

  // Get final position
  const finalLocation = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.High,
  });

  // Add final point
  if (lastPoint) {
    const dist = haversineDistance(
      lastPoint.latitude, lastPoint.longitude,
      finalLocation.coords.latitude, finalLocation.coords.longitude
    );
    accumulatedDistanceMeters += dist;
  }

  routeBuffer.push({
    latitude: finalLocation.coords.latitude,
    longitude: finalLocation.coords.longitude,
    timestamp: new Date().toISOString(),
    speed: finalLocation.coords.speed
      ? finalLocation.coords.speed * 2.23694 // m/s → mph
      : null,
  });

  // Flush any remaining buffer to DB
  if (routeBuffer.length > 0 && activeTripId) {
    await insertRoutePointsBatch(activeTripId, routeBuffer, flushedPointCount);
  }

  const distanceMiles = accumulatedDistanceMeters / METERS_PER_MILE;

  // Compress route points using Douglas-Peucker before final storage
  const allPoints = await getRoutePointsForTrip(activeTripId);
  const compressed = douglasPeucker(allPoints, 0.00005); // ~5.5m tolerance in degrees
  await replaceRoutePointsForTrip(activeTripId, compressed);

  await updateMileageTrip(activeTripId, {
    endTime: new Date().toISOString(),
    endLatitude: finalLocation.coords.latitude,
    endLongitude: finalLocation.coords.longitude,
    distanceMiles,
    isActive: false,
    routePoints: [], // stored in route_points table now
  });

  const tripId = activeTripId;

  // Reset state
  activeTripId = null;
  routeBuffer = [];
  accumulatedDistanceMeters = 0;
  lastPoint = null;
  flushedPointCount = 0;

  // Fetch and return the completed trip
  const { getMileageTrips } = await import('./database');
  const trips = await getMileageTrips();
  return trips.find((t) => t.id === tripId) || null;
}

/**
 * Get current tracking status and live distance.
 */
export function getTrackingStatus(): {
  isTracking: boolean;
  tripId: string | null;
  currentDistanceMiles: number;
  pointCount: number;
} {
  return {
    isTracking: activeTripId !== null,
    tripId: activeTripId,
    currentDistanceMiles: accumulatedDistanceMeters / METERS_PER_MILE,
    pointCount: flushedPointCount + routeBuffer.length,
  };
}

// ── Background task handler ──

TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.error('Background location error:', error);
    return;
  }

  if (!data || !activeTripId) return;

  const { locations } = data as { locations: Location.LocationObject[] };

  for (const loc of locations) {
    const point: RoutePoint = {
      latitude: loc.coords.latitude,
      longitude: loc.coords.longitude,
      timestamp: new Date(loc.timestamp).toISOString(),
      speed: loc.coords.speed ? loc.coords.speed * 2.23694 : null,
    };

    if (lastPoint) {
      const segmentDistance = haversineDistance(
        lastPoint.latitude, lastPoint.longitude,
        loc.coords.latitude, loc.coords.longitude
      );
      // Filter out GPS jitter: ignore segments < 2m or with unrealistic speed
      if (segmentDistance >= 2 && segmentDistance < 1000) {
        accumulatedDistanceMeters += segmentDistance;
      }
    }

    lastPoint = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
    routeBuffer.push(point);
  }

  // Flush buffer to DB when threshold reached (memory-bounded for long trips)
  if (routeBuffer.length >= ROUTE_FLUSH_THRESHOLD && activeTripId) {
    const pointsToFlush = routeBuffer.splice(0); // take all and clear
    const currentTripId = activeTripId;
    const startSeq = flushedPointCount;
    flushedPointCount += pointsToFlush.length;

    insertRoutePointsBatch(currentTripId, pointsToFlush, startSeq)
      .then(() => {
        // Also update distance in DB
        return updateMileageTrip(currentTripId, {
          distanceMiles: accumulatedDistanceMeters / METERS_PER_MILE,
        });
      })
      .catch((err) => console.error('Failed to flush route points:', err));
  }
});

// ── Douglas-Peucker route compression ──

/**
 * Douglas-Peucker algorithm to reduce route points while preserving shape.
 * Epsilon is in degrees (~0.00001 degree ≈ 1.1 meters at equator).
 */
export function douglasPeucker(points: RoutePoint[], epsilon: number): RoutePoint[] {
  if (points.length <= 2) return points;

  // Find the point with the maximum distance from the line between first and last
  let maxDist = 0;
  let maxIdx = 0;
  const first = points[0];
  const last = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const dist = perpendicularDistance(points[i], first, last);
    if (dist > maxDist) {
      maxDist = dist;
      maxIdx = i;
    }
  }

  if (maxDist > epsilon) {
    // Recursively simplify both halves
    const left = douglasPeucker(points.slice(0, maxIdx + 1), epsilon);
    const right = douglasPeucker(points.slice(maxIdx), epsilon);
    return [...left.slice(0, -1), ...right];
  }

  // All points within epsilon — keep only endpoints
  return [first, last];
}

function perpendicularDistance(point: RoutePoint, lineStart: RoutePoint, lineEnd: RoutePoint): number {
  const dx = lineEnd.latitude - lineStart.latitude;
  const dy = lineEnd.longitude - lineStart.longitude;

  if (dx === 0 && dy === 0) {
    // Line start and end are the same point
    return Math.sqrt(
      (point.latitude - lineStart.latitude) ** 2 +
      (point.longitude - lineStart.longitude) ** 2
    );
  }

  const t = Math.max(0, Math.min(1,
    ((point.latitude - lineStart.latitude) * dx + (point.longitude - lineStart.longitude) * dy) /
    (dx * dx + dy * dy)
  ));

  const closestLat = lineStart.latitude + t * dx;
  const closestLon = lineStart.longitude + t * dy;

  return Math.sqrt(
    (point.latitude - closestLat) ** 2 +
    (point.longitude - closestLon) ** 2
  );
}

// ── Haversine formula ──

export function haversineDistance(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R = 6371000; // Earth's radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;

  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
