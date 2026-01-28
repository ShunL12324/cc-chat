/**
 * Auto Updater
 *
 * Handles automatic updates by checking GitHub releases and downloading
 * new versions. Updates are applied on next restart to avoid disrupting
 * running tasks.
 *
 * Update flow:
 * 1. Periodic checks fetch latest release from GitHub
 * 2. If new version found, download to {exe}.new
 * 3. On next startup, applyPendingUpdate() renames files
 * 4. Old version kept as {exe}.bak for rollback
 */

import { existsSync, readFileSync, writeFileSync, unlinkSync, renameSync, chmodSync } from 'fs';
import { dirname, join } from 'path';

/** GitHub repository owner */
const REPO_OWNER = 'ShunL12324';

/** GitHub repository name */
const REPO_NAME = 'cc-chat';

/** Platform-specific binary name */
const BINARY_NAME = process.platform === 'win32' ? 'cc-chat-win.exe' :
                    process.platform === 'darwin' ? 'cc-chat-mac-arm64' : 'cc-chat-linux';

/** Update check interval in milliseconds (1 hour) */
const CHECK_INTERVAL = 60 * 60 * 1000;

/** Callback for update notifications */
let onUpdateDownloaded: ((version: string) => void) | null = null;

/** Version of pending update, if any */
let pendingUpdateVersion: string | null = null;

/** Cached current version */
let currentVersion: string | null = null;

/**
 * Get the application directory (where executable is located).
 */
function getAppDir(): string {
  return dirname(process.execPath);
}

/**
 * Get the path to the version file.
 */
function getVersionFile(): string {
  return join(getAppDir(), '.version');
}

/**
 * Get the current executable path.
 */
function getExePath(): string {
  return process.execPath;
}

/**
 * Get the path for the downloaded new version.
 */
function getNewPath(): string {
  return `${getExePath()}.new`;
}

/**
 * Get the path for the backup of the previous version.
 */
function getBackupPath(): string {
  return `${getExePath()}.bak`;
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
 */
export function applyPendingUpdate(): void {
  const newPath = getNewPath();
  const exePath = getExePath();
  const backupPath = getBackupPath();
  const versionFile = getVersionFile();

  if (!existsSync(newPath)) {
    return;
  }

  console.log('[update] Applying pending update...');

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

    console.log('[update] Update applied successfully');
  } catch (error) {
    console.log(`[update] Failed to apply update: ${error}`);
    // Try to restore backup
    try {
      if (existsSync(backupPath) && !existsSync(exePath)) {
        renameSync(backupPath, exePath);
      }
      if (existsSync(newPath)) {
        unlinkSync(newPath);
      }
    } catch {
      // Ignore cleanup errors
    }
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
 * Check for updates from GitHub releases.
 * Downloads new version to .new file if available.
 *
 * @returns Object indicating if an update is available
 */
export async function checkForUpdates(): Promise<{ hasUpdate: boolean; version?: string }> {
  console.log('[update] Checking for updates...');

  try {
    const response = await fetch(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`,
      { headers: { 'User-Agent': 'cc-chat' } }
    );

    if (!response.ok) {
      console.log('[update] Failed to check for updates');
      return { hasUpdate: false };
    }

    const release = await response.json() as {
      tag_name: string;
      assets: Array<{ name: string; browser_download_url: string }>;
    };

    const latestTag = release.tag_name;
    const current = getCurrentVersion();

    // Already have pending update for this version
    if (existsSync(getNewPath()) && pendingUpdateVersion === latestTag) {
      console.log(`[update] Update ${latestTag} already downloaded, pending restart`);
      return { hasUpdate: true, version: latestTag };
    }

    if (current === latestTag) {
      console.log(`[update] Already on latest version: ${latestTag}`);
      return { hasUpdate: false };
    }

    console.log(`[update] New version available: ${latestTag} (current: ${current})`);

    // Find download URL
    const asset = release.assets.find(a => a.name === BINARY_NAME);
    if (!asset) {
      console.log('[update] No matching binary found');
      return { hasUpdate: false };
    }

    console.log('[update] Downloading...');

    const downloadResponse = await fetch(asset.browser_download_url);
    if (!downloadResponse.ok) {
      console.log('[update] Download failed');
      return { hasUpdate: false };
    }

    const buffer = await downloadResponse.arrayBuffer();
    const newPath = getNewPath();

    // Write new file
    writeFileSync(newPath, Buffer.from(buffer));

    // Update version file to new version
    writeFileSync(getVersionFile(), latestTag, 'utf-8');
    currentVersion = latestTag;
    pendingUpdateVersion = latestTag;

    console.log(`[update] Downloaded ${latestTag}, will apply on next restart`);

    // Notify callback
    if (onUpdateDownloaded) {
      onUpdateDownloaded(latestTag);
    }

    return { hasUpdate: true, version: latestTag };
  } catch (error) {
    console.log(`[update] Update check failed: ${error}`);
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
 * Start periodic update checks (runs every CHECK_INTERVAL).
 */
export function startPeriodicUpdateCheck(): void {
  setInterval(() => {
    checkForUpdates().catch(() => {});
  }, CHECK_INTERVAL);
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
