import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const TOKEN_TTL_MS = 120_000;
const MAX_ENTRIES = 5_000;

export interface DiskHtmlStore {
  put(token: string, html: string): void;
  get(token: string): string | null;
  cleanup(now?: number): void;
}

function fileName(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function createDiskHtmlStore(
  directory = join(tmpdir(), `shugoi-next-render-${process.getuid?.() ?? 'x'}`),
): DiskHtmlStore {
  if (!existsSync(directory)) mkdirSync(directory, { recursive: true, mode: 0o700 });
  try { chmodSync(directory, 0o700); } catch {}

  return {
    put(token: string, html: string): void {
      try {
        writeFileSync(join(directory, fileName(token)), html, { encoding: 'utf8', mode: 0o600 });
      } catch {}
    },

    get(token: string): string | null {
      try {
        const path = join(directory, fileName(token));
        return existsSync(path) ? readFileSync(path, 'utf8') : null;
      } catch {
        return null;
      }
    },

    cleanup(now = Date.now()): void {
      try {
        const entries = readdirSync(directory).flatMap((name) => {
          const path = join(directory, name);
          try { return [{ path, mtime: statSync(path).mtimeMs }]; }
          catch { return []; }
        });
        const live = entries.filter(({ path, mtime }) => {
          if (now - mtime <= TOKEN_TTL_MS) return true;
          try { unlinkSync(path); } catch {}
          return false;
        });
        live.sort((left, right) => left.mtime - right.mtime);
        for (const { path } of live.slice(0, Math.max(0, live.length - MAX_ENTRIES))) {
          try { unlinkSync(path); } catch {}
        }
      } catch {}
    },
  };
}
