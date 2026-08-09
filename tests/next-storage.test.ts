import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createDiskHtmlStore } from '../src/next/token-store';
import { loadLocalGuards } from '../src/next/guard-cache';

const directories: string[] = [];

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'shugoi-next-test-'));
  directories.push(directory);
  return directory;
}

afterEach(() => {
  while (directories.length > 0) rmSync(directories.pop()!, { recursive: true, force: true });
});

describe('Next disk HTML store', () => {
  it('retrouve un token par un chemin déterministe sans parcourir les fichiers', () => {
    const directory = temporaryDirectory();
    const store = createDiskHtmlStore(directory);

    store.put('site:token', '<html>ok</html>');

    expect(store.get('site:token')).toBe('<html>ok</html>');
    expect(store.get('site:other')).toBeNull();
  });
});

describe('Next local guard cache', () => {
  it('charge et remplace les assets une seule fois en production', () => {
    const root = temporaryDirectory();
    mkdirSync(join(root, 'lib'));
    mkdirSync(join(root, 'scripts'));
    writeFileSync(join(root, 'lib', 'guard-assets.json'), JSON.stringify({ favicon: 'icon' }));
    writeFileSync(join(root, 'scripts', 'guard-detect.src.js'), 'detect:"__SG_FAVICON__"');
    writeFileSync(join(root, 'scripts', 'guard.src.js'), 'guard:"__SG_FAVICON__"');

    const first = loadLocalGuards(root, true);
    writeFileSync(join(root, 'scripts', 'guard.src.js'), 'changed');
    const second = loadLocalGuards(root, true);

    expect(first).toEqual({ detect: 'detect:"icon"', guard: 'guard:"icon"' });
    expect(second).toBe(first);
    expect(readFileSync(join(root, 'scripts', 'guard.src.js'), 'utf8')).toBe('changed');
  });
});
