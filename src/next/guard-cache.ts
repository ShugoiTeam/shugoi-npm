import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface LocalGuards {
  detect: string;
  guard: string;
}

const cache = new Map<string, LocalGuards>();

function replaceAssets(code: string, assets: Record<string, string>): string {
  return code
    .replaceAll('__SG_FAVICON__', assets.favicon ?? '__SG_FAVICON__')
    .replaceAll('__SG_BRAND_IMG__', assets.brand ?? '__SG_BRAND_IMG__')
    .replaceAll('__SG_TITLE_TOR__', assets.title_tor ?? '__SG_TITLE_TOR__')
    .replaceAll('__SG_FONT_FACE__', assets.fontFace ?? '__SG_FONT_FACE__');
}

export function loadLocalGuards(
  root: string,
  production = process.env.NODE_ENV === 'production',
): LocalGuards | null {
  const cached = cache.get(root);
  if (cached && production) return cached;

  try {
    const assets = JSON.parse(readFileSync(join(root, 'lib', 'guard-assets.json'), 'utf8')) as Record<string, string>;
    const guards = {
      detect: replaceAssets(readFileSync(join(root, 'scripts', 'guard-detect.src.js'), 'utf8'), assets),
      guard: replaceAssets(readFileSync(join(root, 'scripts', 'guard.src.js'), 'utf8'), assets),
    };
    cache.set(root, guards);
    return guards;
  } catch {
    return null;
  }
}
