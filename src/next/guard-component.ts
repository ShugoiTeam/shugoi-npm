import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export interface ShugoiGuardProps {
  siteKey: string;
  enableWhitelist?: boolean;
  enableVmCheck?: boolean;
}

/** Generate the Shugoi guard script tag HTML (eval bootcode) */
export async function generateGuardHtml({ siteKey, enableWhitelist = true, enableVmCheck = true }: ShugoiGuardProps): Promise<string> {
  try {
    const root = process.cwd();
    const assets: Record<string, string> = {};
    try {
      const a = JSON.parse(readFileSync(join(root, "lib", "guard-assets.json"), "utf-8"));
      if (a.favicon) assets.favicon = a.favicon;
      if (a.brand) assets.brand = a.brand;
      if (a.title_tor) assets.title_tor = a.title_tor;
    } catch {}

    const detectPath = join(root, "scripts", "guard-detect.src.js");
    const guardPath = join(root, "scripts", "guard.src.js");
    if (!existsSync(detectPath)) return '<script>console.warn("Shugoi guards not found")<\/script>';

    let detect = readFileSync(detectPath, "utf-8");
    let guard = readFileSync(guardPath, "utf-8");

    if (assets.favicon) { detect = detect.replaceAll("__SG_FAVICON__", assets.favicon); guard = guard.replaceAll("__SG_FAVICON__", assets.favicon); }
    if (assets.brand) { detect = detect.replaceAll("__SG_BRAND_IMG__", assets.brand); guard = guard.replaceAll("__SG_BRAND_IMG__", assets.brand); }
    if (assets.title_tor) detect = detect.replaceAll("__SG_TITLE_TOR__", assets.title_tor);

    const cfg = JSON.stringify({ enableWhitelist, enableVmCheck, enableTorCheck: true, enableHeadlessCheck: true, enableAntiDetectCheck: true, enableContentReplacementCheck: false });
    const combined = 'window.__sg_siteKey=' + JSON.stringify(siteKey) + ';window.__sg_config=' + cfg + ';try{' + detect + '}catch(e){window.__sg_blocked=true};try{' + guard + '}catch(e){window.__sg_blocked=true}';

    const encParts: string[] = new Array(combined.length);
    for (let i = 0; i < combined.length; i++) {
      encParts[i] = String.fromCodePoint(917504 + combined.charCodeAt(i));
    }
    const enc = encParts.join('');
    return '<script>eval([...\'' + enc + '\'].map(function(x){return String.fromCodePoint(x.codePointAt(0)-917504)}).join(\'\'))<\/script>';
  } catch {
    return '<script>console.warn("Shugoi guard generation failed")<\/script>';
  }
}
