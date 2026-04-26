import { execFile } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const ROOT = process.env.SANDBOX_ROOT ?? '/tmp/claude-code-bridge';

export interface Sandbox {
  id: string;
  cwd: string;
  cleanup: () => Promise<void>;
}

// Per-session sandbox directory. Either fresh-empty (new project) or a
// shallow clone of a target repo. Always isolated under ROOT — the agent
// can write freely without touching anything canonical.
export async function createSandbox(sessionId: string, opts: {
  repoUrl?: string;
  branch?: string;
} = {}): Promise<Sandbox> {
  const cwd = join(ROOT, sessionId);
  await mkdir(cwd, { recursive: true });

  if (opts.repoUrl) {
    // Block file:// / ext:: / ssh:// / etc. CVE-2017-1000117-family —
    // even though the server already allowlists hosts, defense in depth.
    const args = [
      '-c', 'protocol.allow=user',
      '-c', 'protocol.file.allow=never',
      '-c', 'protocol.ext.allow=never',
      '-c', 'protocol.ssh.allow=never',
      'clone', '--depth', '1',
    ];
    if (opts.branch) args.push('--branch', opts.branch);
    args.push('--', opts.repoUrl, cwd);
    await execFileAsync('git', args, {
      timeout: 60_000,
      // Strip the env so a malicious post-clone hook can't read BRIDGE_SECRET
      // / ANTHROPIC_API_KEY through the standard git clone hook hooks.
      env: { PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: '/tmp' },
    });
  }

  return {
    id: sessionId,
    cwd,
    cleanup: async () => {
      if (existsSync(cwd)) {
        await rm(cwd, { recursive: true, force: true });
      }
    },
  };
}
