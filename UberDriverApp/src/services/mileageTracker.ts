import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { MileageTrip, RoutePoint } from '../models/types';
import { insertMileageTrip, updateMileageTrip, getActiveTrip } from './database';
import { generateId } from '../utils/helpers';

const LOCATION_TASK_NAME = 'background-mileage-tracking';
const METERS_PER_MILE = 1609.344;

// Store active trip data in memory for fast access during tracking
let activeTripId: string | null = null;
let routeBuffer: RoutePoint[] = [];
let accumulatedDistanceMeters = 0;
let lastPoint: { latitude: number; longitude: number } | null = null;

/**
 * Request location permissions (foreground + background).
 * Must be called before starting any trip.
 */
export async function requestLocationPermissions(): Promise<boolean> {
  const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
  if (foregroundStatus !== 'granted') return false;

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
    routeBuffer = existing.routePoints;
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
    createdAt: now,
  };

  await insertMileageTrip(trip);

  // Set up tracking state
  activeTripId = trip.id;
  routeBuffer = [];
  accumulatedDistanceMeters = 0;
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
    foregroundService: {
      notificationTitle: 'Mileage Tracking Active',
      notificationBody: 'Recording your trip distance...',
      notificationColor: '#4CAF50',
    },
  });

  return trip;
}

/**
 * Stop the current trip and finalize the recording.
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

  const distanceMiles = accumulatedDistanceMeters / METERS_PER_MILE;

  await updateMileageTrip(activeTripId, {
    endTime: new Date().toISOString(),
    endLatitude: finalLocation.coords.latitude,
    endLongitude: finalLocation.coords.longitude,
    distanceMiles,
    isActive: false,
    routePoints: routeBuffer,
  });

  const tripId = activeTripId;

  // Reset state
  activeTripId = null;
  routeBuffer = [];
  accumulatedDistanceMeters = 0;
  lastPoint = null;

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
    pointCount: routeBuffer.length,
  };
}

// ── Background task handler ──

TaskManager.defineTask(LOCATION_TASK_NAME, ({ data, error }) => {
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

  // Periodically save progress to DB (every ~20 points)
  if (routeBuffer.length % 20 === 0) {
    updateMileageTrip(activeTripId, {
      distanceMiles: accumulatedDistanceMeters / METERS_PER_MILE,
      routePoints: routeBuffer,
    }).catch((err) => console.error('Failed to save trip progress:', err));
  }
});

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
