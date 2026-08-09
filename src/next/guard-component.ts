import { loadLocalGuards } from "./guard-cache";

export interface ShugoiGuardProps {
  siteKey: string;
  enableWhitelist?: boolean;
  enableVmCheck?: boolean;
}

/** Generate the Shugoi guard script tag HTML (eval bootcode) */
export async function generateGuardHtml({ siteKey, enableWhitelist = true, enableVmCheck = true }: ShugoiGuardProps): Promise<string> {
  try {
    const root = process.cwd();
    const guards = loadLocalGuards(root);
    if (!guards) return '<script>console.warn("Shugoi guards not found")<\/script>';

    const cfg = JSON.stringify({ enableWhitelist, enableVmCheck, enableTorCheck: true, enableHeadlessCheck: true, enableAntiDetectCheck: true, enableContentReplacementCheck: false });
    const combined = 'window.__sg_siteKey=' + JSON.stringify(siteKey) + ';window.__sg_config=' + cfg + ';try{' + guards.detect + '}catch(e){window.__sg_blocked=true};try{' + guards.guard + '}catch(e){window.__sg_blocked=true}';

    let enc = "";
    for (let i = 0; i < combined.length; i++) {
      enc += String.fromCodePoint(917504 + combined.charCodeAt(i));
    }
    return '<script>eval([...\'' + enc + '\'].map(function(x){return String.fromCodePoint(x.codePointAt(0)-917504)}).join(\'\'))<\/script>';
  } catch {
    return '<script>console.warn("Shugoi guard generation failed")<\/script>';
  }
}
