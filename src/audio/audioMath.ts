/**
 * Audio math utilities for level calculations
 */

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/**
 * Convert RMS (0..1) to dBFS (negative, 0 is full scale)
 * @param rms Root mean square value (0..1)
 * @param floor Minimum dB level (default -100)
 * @returns dB value
 */
export function rmsToDb(rms: number, floor = -100): number {
  if (rms <= 1e-8) return floor;
  const db = 20 * Math.log10(rms);
  return db < floor ? floor : db > 0 ? 0 : db;
}

/**
 * Map dB to 0..1 where floor -> 0 and 0 dBFS -> 1
 * @param db Decibel value
 * @param floor Minimum dB level (default -100)
 * @returns Normalized value (0..1)
 */
export function dbToUnit(db: number, floor = -100): number {
  return clamp((db - floor) / (0 - floor), 0, 1);
}
