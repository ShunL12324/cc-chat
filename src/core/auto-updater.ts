/**
 * Auto Updater
 *
 * Handles automatic updates by checking GitHub releases and downloading
 * new versions. Updates are applied on next restart to avoid disrupting
 * running tasks.
 *
 * Update flow:
 * 1. Scheduled checks (via croner) fetch latest release from GitHub
 * 2. Version comparison via semver (handles v-prefix, pre-releases, etc.)
 * 3. If new version found, download to {exe}.new with integrity check
 * 4. On next startup, applyPendingUpdate() renames files
 * 5. Old version kept as {exe}.bak for rollback
 * 6. Version file only promoted after successful apply
 */

import { existsSync, readFileSync, writeFileSync, unlinkSync, renameSync, chmodSync, statSync } from 'fs';
import { dirname, join } from 'path';
import { createHash } from 'crypto';
import { Cron } from 'croner';
import { valid, gt, clean } from 'semver';
import { z } from 'zod/v4';
import { getLogger } from './logger.js';

/** GitHub repository owner */
const REPO_OWNER = 'ShunL12324';

/** GitHub repository name */
const REPO_NAME = 'cc-chat';

/** Platform-specific binary name */
const BINARY_NAME = process.platform === 'win32' ? 'cc-chat-win.exe' :
                    process.platform === 'darwin'
                      ? (process.arch === 'arm64' ? 'cc-chat-mac-arm64' : 'cc-chat-mac-x64')
                      : 'cc-chat-linux';

/** Fetch timeout in milliseconds */
const FETCH_TIMEOUT = 30_000;

/** Fetch with timeout via AbortController */
async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Zod schema for GitHub release API response */
const GitHubReleaseSchema = z.object({
  tag_name: z.string(),
  assets: z.array(z.object({
    name: z.string(),
    browser_download_url: z.string().url(),
    size: z.number(),
  })),
});

/** Callback for update notifications */
let onUpdateDownloaded: ((version: string) => void) | null = null;

/** Version of pending update, if any */
let pendingUpdateVersion: string | null = null;

/** Active restart polling interval */
let restartInterval: ReturnType<typeof setInterval> | null = null;

/** Whether a restart is currently scheduled */
let restartScheduled = false;

/** Cached current version */
let currentVersion: string | null = null;

/** Cron job for periodic update checks */
let updateCron: Cron | null = null;

// --- Path helpers ---

function getAppDir(): string {
  return dirname(process.execPath);
}

function getVersionFile(): string {
  return join(getAppDir(), '.version');
}

function getPendingVersionFile(): string {
  return `${getVersionFile()}.pending`;
}

function getExePath(): string {
  return process.execPath;
}

function getNewPath(): string {
  return `${getExePath()}.new`;
}

function getBackupPath(): string {
  return `${getExePath()}.bak`;
}

// --- Version helpers ---

/**
 * Normalize a version string (strip 'v' prefix, validate semver).
 * Returns null if not a valid semver.
 */
function normalizeVersion(version: string): string | null {
  return clean(version) ?? valid(version);
}

/**
 * Check if `latest` is newer than `current` using semver.
 * Falls back to string comparison if either is not valid semver.
 */
function isNewer(latest: string, current: string): boolean {
  const latestClean = normalizeVersion(latest);
  const currentClean = normalizeVersion(current);

  if (latestClean && currentClean) {
    return gt(latestClean, currentClean);
  }

  // Fallback: string comparison (handles 'unknown' case)
  return latest !== current;
}

function getStartingMarker(): string {
  return join(getAppDir(), '.starting');
}

// --- Core functions ---

/**
 * Check if the previous launch crashed after an update, and rollback if so.
 * Call this at the very start of the application, before applyPendingUpdate.
 *
 * Detection: if .starting marker exists AND .bak exists, the previous
 * version crashed before marking itself healthy. Rollback to .bak.
 */
export function rollbackIfCrashed(): void {
  const marker = getStartingMarker();
  const backupPath = getBackupPath();
  const exePath = getExePath();
  const versionFile = getVersionFile();

  if (!existsSync(marker) || !existsSync(backupPath)) {
    return;
  }

  getLogger().error('[update] Previous version crashed after update, rolling back...');

  try {
    // Replace current (broken) exe with backup
    unlinkSync(exePath);
    renameSync(backupPath, exePath);

    // Revert version file to 'rollback' so next update check will re-download
    writeFileSync(versionFile, 'rollback', 'utf-8');
    currentVersion = 'rollback';

    // Clean up
    unlinkSync(marker);

    // Remove any pending update files
    const newPath = getNewPath();
    if (existsSync(newPath)) unlinkSync(newPath);
    const pendingVersionFile = getPendingVersionFile();
    if (existsSync(pendingVersionFile)) unlinkSync(pendingVersionFile);

    getLogger().info('[update] Rolled back to previous version');
  } catch (error) {
    getLogger().error(`[update] Rollback failed: ${error}`);
  }
}

/**
 * Mark the application as starting. Call before main logic.
 * If the app crashes before markHealthy(), next launch will rollback.
 */
export function markStarting(): void {
  writeFileSync(getStartingMarker(), String(Date.now()), 'utf-8');
}

/**
 * Mark the application as healthy (started successfully).
 * Removes the .starting marker and the .bak file (no longer needed for rollback).
 */
export function markHealthy(): void {
  const marker = getStartingMarker();
  if (existsSync(marker)) {
    unlinkSync(marker);
  }
  // Safe to remove backup now
  const backupPath = getBackupPath();
  if (existsSync(backupPath)) {
    try { unlinkSync(backupPath); } catch { /* ignore */ }
  }
}

/**
 * Apply pending update if .new file exists.
 * Call this at startup before main app logic.
 *
 * Process:
 * 1. Check if .new file exists
 * 2. Backup current executable to .bak
 * 3. Rename .new to current executable
 * 4. Set executable permissions on Unix
 * 5. Promote pending version file to current
 * 6. Return true so caller can re-exec the new binary
 */
export function applyPendingUpdate(): boolean {
  const newPath = getNewPath();
  const exePath = getExePath();
  const backupPath = getBackupPath();
  const pendingVersionFile = getPendingVersionFile();
  const versionFile = getVersionFile();

  if (!existsSync(newPath)) {
    return false;
  }

  getLogger().info('[update] Applying pending update...');

  try {
    // Remove old backup
    if (existsSync(backupPath)) {
      unlinkSync(backupPath);
    }

    // Backup current exe
    renameSync(exePath, backupPath);

    // Replace with new
    renameSync(newPath, exePath);

    // Make executable on Unix
    if (process.platform !== 'win32') {
      chmodSync(exePath, 0o755);
    }

    // Promote pending version to current version
    if (existsSync(pendingVersionFile)) {
      const version = readFileSync(pendingVersionFile, 'utf-8').trim();
      writeFileSync(versionFile, version, 'utf-8');
      unlinkSync(pendingVersionFile);
      currentVersion = version;
    }

    getLogger().info('[update] Update applied successfully');
    return true;
  } catch (error) {
    getLogger().error(`[update] Failed to apply update: ${error}`);
    // Try to restore backup
    try {
      if (existsSync(backupPath) && !existsSync(exePath)) {
        renameSync(backupPath, exePath);
      }
      if (existsSync(newPath)) {
        unlinkSync(newPath);
      }
      if (existsSync(pendingVersionFile)) {
        unlinkSync(pendingVersionFile);
      }
    } catch {
      // Ignore cleanup errors
    }
    return false;
  }
}

/**
 * Get the current version from the .version file.
 * Returns 'unknown' if file doesn't exist.
 */
export function getCurrentVersion(): string {
  if (currentVersion) return currentVersion;

  const versionFile = getVersionFile();
  currentVersion = existsSync(versionFile)
    ? readFileSync(versionFile, 'utf-8').trim()
    : 'unknown';
  return currentVersion;
}

/**
 * Get the pending update version, if one has been downloaded.
 */
export function getPendingUpdateVersion(): string | null {
  return pendingUpdateVersion;
}

/**
 * Apply pending update and spawn a new process, then exit.
 * The new process runs detached so it survives the current process exiting.
 */
async function applyAndRestart(shutdownFn: () => Promise<void>): Promise<void> {
  const log = getLogger();

  const applied = applyPendingUpdate();
  if (!applied) {
    log.error('[update] Failed to apply update during auto-restart');
    return;
  }

  log.info('[update] Update applied, spawning new process...');

  try {
    const child = Bun.spawn([process.execPath], {
      stdio: ['ignore', 'ignore', 'ignore'],
    });
    child.unref();
  } catch (error) {
    log.error(`[update] Failed to spawn new process: ${error}`);
    log.error('[update] Falling back to manual restart');
    return;
  }

  log.info('[update] New process spawned, shutting down current process...');
  await shutdownFn();
  process.exit(0);
}

/**
 * Schedule an auto-restart after an update is downloaded.
 * If idle (no running Claude processes), restarts immediately.
 * Otherwise polls every 10 seconds until idle.
 */
export function scheduleRestart(opts: {
  isIdle: () => boolean;
  shutdown: () => Promise<void>;
  notify: (msg: string) => void;
}): void {
  if (restartScheduled) return;
  restartScheduled = true;

  const log = getLogger();
  const version = pendingUpdateVersion ?? 'unknown';

  const doRestart = async () => {
    if (restartInterval) {
      clearInterval(restartInterval);
      restartInterval = null;
    }
    opts.notify(`🔄 Auto-restarting to apply update \`${version}\`...`);
    log.info(`[update] Auto-restarting to apply ${version}`);
    await applyAndRestart(opts.shutdown);
  };

  if (opts.isIdle()) {
    doRestart();
    return;
  }

  opts.notify(`⏳ Update \`${version}\` downloaded. Will auto-restart when all tasks finish.`);
  log.info('[update] Waiting for running tasks to finish before restart...');

  restartInterval = setInterval(() => {
    if (opts.isIdle()) {
      doRestart();
    }
  }, 10_000);
}

/**
 * Cancel a scheduled restart (e.g. if update was rolled back).
 */
export function cancelScheduledRestart(): void {
  if (restartInterval) {
    clearInterval(restartInterval);
    restartInterval = null;
  }
  restartScheduled = false;
}

/**
 * Check for updates from GitHub releases.
 * Downloads new version to .new file if available.
 * Uses semver for proper version comparison.
 */
export async function checkForUpdates(): Promise<{ hasUpdate: boolean; version?: string }> {
  getLogger().info('[update] Checking for updates...');

  try {
    const response = await fetchWithTimeout(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`,
      { headers: { 'User-Agent': 'cc-chat' } }
    );

    if (!response.ok) {
      getLogger().error(`[update] GitHub API returned ${response.status}`);
      return { hasUpdate: false };
    }

    const json = await response.json();
    const parsed = GitHubReleaseSchema.safeParse(json);

    if (!parsed.success) {
      getLogger().error(`[update] Invalid GitHub release response: ${JSON.stringify(parsed.error.issues).slice(0, 200)}`);
      return { hasUpdate: false };
    }

    const release = parsed.data;
    const latestTag = release.tag_name;
    const current = getCurrentVersion();

    // Already have pending update for this version
    if (existsSync(getNewPath()) && pendingUpdateVersion === latestTag) {
      getLogger().info(`[update] Update ${latestTag} already downloaded, pending restart`);
      return { hasUpdate: true, version: latestTag };
    }

    // Semver comparison
    if (!isNewer(latestTag, current)) {
      getLogger().info(`[update] Already on latest version: ${current}`);
      return { hasUpdate: false };
    }

    getLogger().info(`[update] New version available: ${latestTag} (current: ${current})`);

    // Find download URL
    const asset = release.assets.find(a => a.name === BINARY_NAME);
    if (!asset) {
      getLogger().error(`[update] No matching binary found for ${BINARY_NAME}`);
      return { hasUpdate: false };
    }

    getLogger().info(`[update] Downloading ${BINARY_NAME} (${(asset.size / 1024 / 1024).toFixed(1)}MB)...`);

    // Download checksums file for integrity verification
    const checksumAsset = release.assets.find(a => a.name === 'checksums.txt');
    let expectedHash: string | null = null;

    if (checksumAsset) {
      try {
        const checksumResponse = await fetchWithTimeout(checksumAsset.browser_download_url);
        if (checksumResponse.ok) {
          const checksumText = await checksumResponse.text();
          // Format: "<hash>  <filename>" (sha256sum output)
          const line = checksumText.split('\n').find(l => l.includes(BINARY_NAME));
          if (line) {
            expectedHash = line.trim().split(/\s+/)[0];
          }
        }
      } catch {
        getLogger().error('[update] Failed to download checksums, skipping hash verification');
      }
    }

    const downloadResponse = await fetchWithTimeout(asset.browser_download_url);
    if (!downloadResponse.ok) {
      getLogger().error(`[update] Download failed: ${downloadResponse.status}`);
      return { hasUpdate: false };
    }

    const buffer = await downloadResponse.arrayBuffer();

    // Integrity check: verify downloaded size matches expected
    if (buffer.byteLength !== asset.size) {
      getLogger().error(`[update] Size mismatch: expected ${asset.size}, got ${buffer.byteLength}`);
      return { hasUpdate: false };
    }

    // SHA256 integrity check
    if (expectedHash) {
      const actualHash = createHash('sha256').update(Buffer.from(buffer)).digest('hex');
      if (actualHash !== expectedHash) {
        getLogger().error(`[update] SHA256 mismatch: expected ${expectedHash}, got ${actualHash}`);
        return { hasUpdate: false };
      }
      getLogger().info(`[update] SHA256 verified: ${actualHash.slice(0, 16)}...`);
    } else {
      getLogger().info('[update] No checksum available, skipping hash verification');
    }

    const newPath = getNewPath();

    // Write new file
    writeFileSync(newPath, Buffer.from(buffer));

    // Verify written file size
    const writtenSize = statSync(newPath).size;
    if (writtenSize !== asset.size) {
      getLogger().error(`[update] Written file size mismatch: expected ${asset.size}, got ${writtenSize}`);
      unlinkSync(newPath);
      return { hasUpdate: false };
    }

    // Write version to pending file; only promote after successful apply
    writeFileSync(getPendingVersionFile(), latestTag, 'utf-8');
    pendingUpdateVersion = latestTag;

    getLogger().info(`[update] Downloaded ${latestTag}, will auto-restart when idle`);

    // Notify callback
    if (onUpdateDownloaded) {
      onUpdateDownloaded(latestTag);
    }

    return { hasUpdate: true, version: latestTag };
  } catch (error) {
    getLogger().error(`[update] Update check failed: ${error}`);
    return { hasUpdate: false };
  }
}

/**
 * Set a callback to be notified when an update is downloaded.
 */
export function setUpdateCallback(callback: (version: string) => void): void {
  onUpdateDownloaded = callback;
}

/**
 * Start periodic update checks using croner.
 * Runs every hour at minute 0. Can be stopped with stopPeriodicUpdateCheck().
 */
export function startPeriodicUpdateCheck(): void {
  // Stop existing cron if any
  stopPeriodicUpdateCheck();

  // Run every hour at minute 0
  updateCron = new Cron('0 * * * *', () => {
    checkForUpdates().catch(() => {});
  });
}

/**
 * Stop periodic update checks and cancel any scheduled restart.
 */
export function stopPeriodicUpdateCheck(): void {
  if (updateCron) {
    updateCron.stop();
    updateCron = null;
  }
  cancelScheduledRestart();
}

/**
 * Get the current update status for display.
 */
export function getUpdateStatus(): {
  currentVersion: string;
  pendingVersion: string | null;
  hasPendingUpdate: boolean;
} {
  return {
    currentVersion: getCurrentVersion(),
    pendingVersion: pendingUpdateVersion,
    hasPendingUpdate: existsSync(getNewPath()),
  };
}
