import crypto from 'crypto';

const RENAMES: Record<string, string> = {
  buildOverlay: '_wf',
  checkNotice: '_wg',
  hex: '_wh',
  stable: '_wi',
};

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0; }
  return Math.abs(h);
}

function hexToBytes(hex: string): number[] {
  const b: number[] = [];
  for (let i = 0; i < hex.length; i += 2) b.push(parseInt(hex.substr(i, 2), 16));
  return b;
}

function xorEncrypt(str: string, hexKey: string): string {
  const kb = hexToBytes(hexKey);
  let enc = '';
  for (let i = 0; i < str.length; i++) {
    const cc = str.charCodeAt(i) ^ (kb[i % kb.length] ?? 0);
    enc += cc.toString(16).padStart(2, '0');
  }
  return enc;
}

function runtimeValue(str: string): string {
  let s = str.slice(1, -1);
  return s.replace(/\\(['"\\bfnrtv0])/g, (_: string, c: string) => ({ "'": "'", '"': '"', '\\': '\\', 'b': '\b', 'f': '\f', 'n': '\n', 'r': '\r', 't': '\t', 'v': '\v', '0': '\0' } as Record<string, string>)[c] ?? c)
    .replace(/\\(u\{([\da-fA-F]+)\}|u([\da-fA-F]{4})|x([\da-fA-F]{2}))/g, (_: string, __: string, ubrace: string, u4: string, x2: string) => {
      const code = ubrace ? parseInt(ubrace, 16) : (u4 ? parseInt(u4, 16) : parseInt(x2, 16));
      return String.fromCodePoint(code);
    });
}

function encryptStrings(code: string, key: string): string {
  let r = '', i = 0;
  while (i < code.length) {
    if (code[i] === '`') {
      const start = i;
      i++;
      while (i < code.length) {
        if (code[i] === '\\') { i += 2; continue; }
        if (code[i] === '`') { i++; break; }
        i++;
      }
      r += code.slice(start, i);
    } else if (code[i] === "'" || code[i] === '"') {
      const q = code[i];
      let j = i + 1;
      while (j < code.length) { if (code[j] === '\\') { j += 2; continue; } if (code[j] === q) break; j++; }
      if (j < code.length) {
        const val = runtimeValue(code.slice(i, j + 1));
        r += '_D("' + xorEncrypt(val, key) + '")';
        i = j + 1;
      } else { r += code[i]; i++; }
    } else { r += code[i]; i++; }
  }
  return r;
}

function stripComments(s: string): string {
  return s.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\n{3,}/g, '\n\n');
}

function escapeClosingTags(code: string): string {
  return code.replace(/<\/(script|style)/gi, '<\\/$1');
}

function fixComputedProperties(code: string): string {
  return code.replace(/([{,])(\s*)_D\("([^"]*)"\)(\s*:)/g, '$1$2[_D("$3")]$4');
}

function deriveKey(seed: string): string {
  return crypto.createHash('sha256').update(seed + 'sg_val_v1').digest('hex').slice(0, 32);
}

function seededRng(seed: string): () => number {
  let s = hash(seed + '_shuffle');
  return function () {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

function shuffleCode(code: string, seed: string): string {
  const lines = code.split('\n');
  const depth = new Array(lines.length).fill(0) as number[];
  let d = 0;
  for (let i = 0; i < lines.length; i++) {
    depth[i] = d;
    for (const ch of lines[i] ?? '') {
      if (ch === '{') d++;
      else if (ch === '}') d--;
    }
  }
  const blocks: Array<{ start: number; end: number }> = [];
  let start: number | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const isShuffleable = depth[i] === 1 && /^\s*R\.\w+\s*=/.test(line) && !/[{}]/.test(line) && line.trimEnd().endsWith(';');
    if (isShuffleable && start === null) start = i;
    if (!isShuffleable && start !== null) {
      blocks.push({ start, end: i - 1 });
      start = null;
    }
  }
  if (start !== null) blocks.push({ start, end: lines.length - 1 });
  const rng = seededRng(seed);
  for (const blk of blocks) {
    const slice = lines.slice(blk.start, blk.end + 1);
    for (let i = slice.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const current = slice[i];
      const replacement = slice[j];
      if (current !== undefined && replacement !== undefined) {
        slice[i] = replacement;
        slice[j] = current;
      }
    }
    lines.splice(blk.start, slice.length, ...slice);
  }
  return lines.join('\n');
}

function renameFunctions(code: string, seed: string): string {
  let r = code;
  const names = Object.entries(RENAMES).sort((a, b) => { const ha = hash(a[0] + seed), hb = hash(b[0] + seed); return ha < hb ? -1 : ha > hb ? 1 : 0; });
  for (const [from, to] of names) {
    const suffix = (hash(from + seed) % 9000 + 1000).toString(36);
    const newName = to + suffix;
    r = r.replace(new RegExp('\\b' + from + '\\(', 'g'), newName + '(');
  }
  return r;
}

function injectDecoder(hexKey: string): string {
  const kb = hexToBytes(hexKey);
  const ks = kb.map((b) => '\\x' + b.toString(16).padStart(2, '0')).join('');
  return 'var _D=function(h){var k="' + ks + '",r="";for(var i=0;i<h.length;i+=2){r+=String.fromCharCode(parseInt(h.substr(i,2),16)^k.charCodeAt((i/2)%' + kb.length + '))}return r};';
}

function removeFunction(code: string, name: string): string {
  const regex = new RegExp('function\\s+' + name + '\\s*\\([^)]*\\)\\s*\\{[^{}]*\\}', 'g');
  let r = code.replace(regex, '');
  const multiRegex = new RegExp('function\\s+' + name + '\\s*\\([^)]*\\)\\s*\\{[^}]*\\{[^}]*\\}[^}]*\\}', 'g');
  r = r.replace(multiRegex, '');
  return r;
}

export function stripTrace(code: string): string {
  let r = code;
  r = removeFunction(r, '_sgLogCP');
  r = removeFunction(r, '_sgErr');
  r = r.replace(/_sgLogCP\(\s*\d+\s*\)\s*[;,]?/g, '');
  r = r.replace(/_sgErr\(\s*(['"][^'"]*['"]|[A-Za-z_$][\w$]*)\s*,\s*(['"][^'"]*['"]|[A-Za-z_$][\w$]*)\s*\)\s*[;,]?/g, '');
  r = r.replace(/var\s+_SG_TRACE\s*=\s*(?:true|false)\s*;\s*/g, '');
  r = r.replace(/var\s+_sgCP\s*=\s*[^;]*;\s*/g, '');
  r = r.replace(/;\s*;/g, ';');
  return r;
}

export function applyObfuscation(code: string, seed: string): string {
  let r = stripComments(code);
  r = stripTrace(r);
  r = renameFunctions(r, seed);
  r = shuffleCode(r, seed);
  const encKey = deriveKey(seed);
  r = encryptStrings(r, encKey);
  // The injected boot code is a sequence of statements, not necessarily an
  // IIFE.  Always define the decoder before the first encoded string use.
  r = injectDecoder(encKey) + r;
  r = escapeClosingTags(r);
  r = fixComputedProperties(r);
  return r;
}
