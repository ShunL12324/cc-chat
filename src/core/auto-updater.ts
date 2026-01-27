import { spawn } from 'bun';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';

const REPO = 'ShunL12324/cc-chat';
const BINARY_NAME = process.platform === 'win32' ? 'cc-chat-win.exe' :
                    process.platform === 'darwin' ? 'cc-chat-mac-arm64' : 'cc-chat-linux';

export async function checkForUpdates(): Promise<void> {
  const appDir = dirname(process.execPath);
  const versionFile = join(appDir, '.version');

  console.log('[update] Checking for updates...');

  try {
    // Get latest release info using gh CLI
    const proc = spawn({
      cmd: ['gh', 'release', 'view', '--repo', REPO, '--json', 'tagName'],
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      console.log('[update] Failed to check for updates (gh CLI error)');
      return;
    }

    const { tagName: latestTag } = JSON.parse(output);
    const currentVersion = existsSync(versionFile)
      ? readFileSync(versionFile, 'utf-8').trim()
      : '';

    if (currentVersion === latestTag) {
      console.log(`[update] Already on latest version: ${latestTag}`);
      return;
    }

    console.log(`[update] New version available: ${latestTag} (current: ${currentVersion || 'unknown'})`);
    console.log('[update] Downloading...');

    // Download new version
    const downloadProc = spawn({
      cmd: ['gh', 'release', 'download', latestTag, '--repo', REPO, '--pattern', BINARY_NAME, '--clobber'],
      cwd: appDir,
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const downloadExitCode = await downloadProc.exited;

    if (downloadExitCode === 0) {
      writeFileSync(versionFile, latestTag, 'utf-8');
      console.log(`[update] Updated to ${latestTag}`);
      console.log('[update] Restart required to apply update');
    } else {
      console.log('[update] Download failed, continuing with current version');
    }
  } catch (error) {
    console.log(`[update] Update check failed: ${error}`);
  }
}
