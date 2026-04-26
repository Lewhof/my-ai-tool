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
    const args = ['clone', '--depth', '1'];
    if (opts.branch) args.push('--branch', opts.branch);
    args.push(opts.repoUrl, cwd);
    await execFileAsync('git', args, { timeout: 60_000 });
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
