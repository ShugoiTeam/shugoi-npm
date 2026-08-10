import { loadLocalGuards } from "./guard-cache";

export interface ShugoiGuardProps {
  siteKey: string;
  enableWhitelist?: boolean;
  enableVmCheck?: boolean;
}

export async function generateGuardHtml({ siteKey, enableWhitelist = true, enableVmCheck = true }: ShugoiGuardProps): Promise<string> {
  try {
    const root = process.cwd();
    const guards = loadLocalGuards(root);
    if (!guards) return '<script>console.warn("Shugoi guards not found")<\/script>';

    const cfg = JSON.stringify({ enableWhitelist, enableVmCheck, enableTorCheck: true, enableHeadlessCheck: true, enableAntiDetectCheck: true, enableContentReplacementCheck: false });
    const combined = 'window.__sg_siteKey=' + JSON.stringify(siteKey) + ';window.__sg_config=' + cfg + ';try{' + guards.detect + '}catch(e){window.__sg_blocked=true};try{' + guards.guard + '}catch(e){window.__sg_blocked=true}';

    return '<script>' + combined.replace(/<\/(script|style)/gi, '<\\/$1') + '<\/script>';
  } catch {
    return '<script>console.warn("Shugoi guard generation failed")<\/script>';
  }
}
