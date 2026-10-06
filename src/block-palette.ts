export interface NativeBlockPalette {
  light: string
  dark: string
}

export function nativeBlockPalette(userAgent: string): NativeBlockPalette {
  if (/Edg\//.test(userAgent)) return { light: '#f6f6f6', dark: '#2d2d2d' }
  if (/Firefox\//.test(userAgent)) return { light: '#f9f9fb', dark: '#2b2a33' }
  if (/AppleWebKit/.test(userAgent) && !/Chrome|Chromium|Edg\/|OPR\//.test(userAgent)) {
    return { light: '#f6f6f6', dark: 'rgb(30,30,30)' }
  }
  if (/OPR\//.test(userAgent)) return { light: '#eef3f7', dark: '#101214' }
  return { light: '#fff', dark: '#202124' }
}

// Keep browser-rendered cards on the same palette contract as server-rendered pages.
export const NATIVE_BLOCK_PALETTE_SCRIPT =
  'var _sgNativeBlockPalette=function(ua){ua=String(ua||"");if(/Edg\\//.test(ua))return{light:"#f6f6f6",dark:"#2d2d2d"};if(/Firefox\\//.test(ua))return{light:"#f9f9fb",dark:"#2b2a33"};if(/AppleWebKit/.test(ua)&&!/Chrome|Chromium|Edg\\/|OPR\\//.test(ua))return{light:"#f6f6f6",dark:"rgb(30,30,30)"};if(/OPR\\//.test(ua))return{light:"#eef3f7",dark:"#101214"};return{light:"#fff",dark:"#202124"}}';
