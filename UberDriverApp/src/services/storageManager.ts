import { RoutePoint, StorageTier } from '../models/types';
import {
  getTripsByStorageTier, updateTripStorageTier,
  getRoutePointsForTrip, replaceRoutePointsForTrip, deleteRoutePointsForTrip,
  getDatabaseSize, getRoutePointsTotalCount,
} from './database';
import { douglasPeucker } from './mileageTracker';

// Storage tier thresholds (in days)
const HOT_THRESHOLD_DAYS = 30;
const WARM_THRESHOLD_DAYS = 90;
const ARCHIVAL_BATCH_SIZE = 20;

// Downsample epsilon for warm tier (more aggressive than initial compression)
const WARM_EPSILON = 0.0005; // ~55m tolerance — keeps ~1 point per 0.5mi

export interface StorageStats {
  dbSizeBytes: number;
  dbSizeMB: string;
  totalRoutePoints: number;
  isOverThreshold: boolean;
}

const STORAGE_WARNING_BYTES = 50 * 1024 * 1024; // 50MB

/**
 * Get current storage usage stats.
 */
export async function getStorageStats(): Promise<StorageStats> {
  const [dbSize, routePoints] = await Promise.all([
    getDatabaseSize(),
    getRoutePointsTotalCount(),
  ]);

  return {
    dbSizeBytes: dbSize,
    dbSizeMB: (dbSize / (1024 * 1024)).toFixed(1),
    totalRoutePoints: routePoints,
    isOverThreshold: dbSize > STORAGE_WARNING_BYTES,
  };
}

/**
 * Run tiered archival on old trip data.
 * Processes in batches to avoid blocking the UI thread.
 *
 * Tiers:
 * - Hot (< 30 days): full compressed route points
 * - Warm (30-90 days): further downsampled to ~1 point per 0.5mi
 * - Cold (> 90 days): route points deleted, only summary data kept
 */
export async function archiveOldTrips(): Promise<{
  hotToWarm: number;
  warmToCold: number;
}> {
  const now = new Date();
  let hotToWarm = 0;
  let warmToCold = 0;

  // Hot → Warm: trips older than 30 days
  const warmDate = new Date(now);
  warmDate.setDate(warmDate.getDate() - HOT_THRESHOLD_DAYS);
  const warmDateStr = warmDate.toISOString();

  const hotTrips = await getTripsByStorageTier('hot', warmDateStr, ARCHIVAL_BATCH_SIZE);
  for (const trip of hotTrips) {
    await archiveToWarm(trip.id);
    hotToWarm++;
  }

  // Warm → Cold: trips older than 90 days
  const coldDate = new Date(now);
  coldDate.setDate(coldDate.getDate() - WARM_THRESHOLD_DAYS);
  const coldDateStr = coldDate.toISOString();

  const warmTrips = await getTripsByStorageTier('warm', coldDateStr, ARCHIVAL_BATCH_SIZE);
  for (const trip of warmTrips) {
    await archiveToCold(trip.id);
    warmToCold++;
  }

  return { hotToWarm, warmToCold };
}

/**
 * Archive a trip from Hot → Warm tier.
 * Further downsample route points (keep ~1 point per 0.5mi).
 */
async function archiveToWarm(tripId: string): Promise<void> {
  const points = await getRoutePointsForTrip(tripId);

  if (points.length > 2) {
    const downsampled = douglasPeucker(points, WARM_EPSILON);
    await replaceRoutePointsForTrip(tripId, downsampled);
  }

  await updateTripStorageTier(tripId, 'warm');
}

/**
 * Archive a trip from Warm → Cold tier.
 * Delete all route points, keeping only start/end and distance summary.
 */
async function archiveToCold(tripId: string): Promise<void> {
  await deleteRoutePointsForTrip(tripId);
  await updateTripStorageTier(tripId, 'cold');
}

/**
 * Force cleanup: archive all eligible trips regardless of batch limits.
 * Use when user triggers manual cleanup from the Dashboard.
 */
export async function forceCleanup(): Promise<{
  hotToWarm: number;
  warmToCold: number;
  freedPoints: number;
}> {
  const beforeCount = await getRoutePointsTotalCount();

  let totalHotToWarm = 0;
  let totalWarmToCold = 0;
  let hasMore = true;

  while (hasMore) {
    const result = await archiveOldTrips();
    totalHotToWarm += result.hotToWarm;
    totalWarmToCold += result.warmToCold;
    hasMore = result.hotToWarm + result.warmToCold > 0;
  }

  const afterCount = await getRoutePointsTotalCount();

  return {
    hotToWarm: totalHotToWarm,
    warmToCold: totalWarmToCold,
    freedPoints: beforeCount - afterCount,
  };
}
