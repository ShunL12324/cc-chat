import { existsSync, readFileSync, writeFileSync, unlinkSync, renameSync } from 'fs';
import { dirname, join } from 'path';
import { spawn } from 'bun';

const REPO_OWNER = 'ShunL12324';
const REPO_NAME = 'cc-chat';
const BINARY_NAME = process.platform === 'win32' ? 'cc-chat-win.exe' :
                    process.platform === 'darwin' ? 'cc-chat-mac-arm64' : 'cc-chat-linux';

export async function checkForUpdates(): Promise<void> {
  const appDir = dirname(process.execPath);
  const versionFile = join(appDir, '.version');
  const exePath = process.execPath;

  console.log('[update] Checking for updates...');

  try {
    // Get latest release info using GitHub API
    const response = await fetch(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`,
      { headers: { 'User-Agent': 'cc-chat' } }
    );

    if (!response.ok) {
      console.log('[update] Failed to check for updates');
      return;
    }

    const release = await response.json() as {
      tag_name: string;
      assets: Array<{ name: string; browser_download_url: string }>;
    };

    const latestTag = release.tag_name;
    const currentVersion = existsSync(versionFile)
      ? readFileSync(versionFile, 'utf-8').trim()
      : '';

    if (currentVersion === latestTag) {
      console.log(`[update] Already on latest version: ${latestTag}`);
      return;
    }

    console.log(`[update] New version available: ${latestTag} (current: ${currentVersion || 'unknown'})`);

    // Find download URL for our binary
    const asset = release.assets.find(a => a.name === BINARY_NAME);
    if (!asset) {
      console.log('[update] No matching binary found');
      return;
    }

    console.log('[update] Downloading...');

    // Download new version
    const downloadResponse = await fetch(asset.browser_download_url);
    if (!downloadResponse.ok) {
      console.log('[update] Download failed');
      return;
    }

    const buffer = await downloadResponse.arrayBuffer();
    const tempPath = `${exePath}.new`;
    const backupPath = `${exePath}.bak`;

    // Write new file
    writeFileSync(tempPath, Buffer.from(buffer));

    // Backup current and replace
    try {
      if (existsSync(backupPath)) unlinkSync(backupPath);
      renameSync(exePath, backupPath);
      renameSync(tempPath, exePath);
      writeFileSync(versionFile, latestTag, 'utf-8');
      console.log(`[update] Updated to ${latestTag}`);
      console.log('[update] Restarting...');

      // Spawn new process and exit current
      spawn({
        cmd: [exePath],
        cwd: appDir,
        stdio: ['ignore', 'ignore', 'ignore'],
      });

      // Give new process time to start, then exit
      setTimeout(() => process.exit(0), 1000);
    } catch (error) {
      // Restore backup if rename failed
      console.log(`[update] Failed to apply update: ${error}`);
      if (existsSync(tempPath)) unlinkSync(tempPath);
    }
  } catch (error) {
    console.log(`[update] Update check failed: ${error}`);
  }
}
