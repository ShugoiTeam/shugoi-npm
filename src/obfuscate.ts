import crypto from 'crypto';

const RENAMES: Record<string, string> = {
  buildOverlay: '_wf',
  checkNotice: '_wg',
  hex: '_wh',
  stable: '_wi',
};

const KEYWORDS = new Set([
  "break","case","catch","class","const","continue","debugger","default","delete",
  "do","else","enum","export","extends","false","finally","for","function","if",
  "implements","import","in","instanceof","interface","let","new","null","package",
  "private","protected","public","return","static","super","switch","this","throw",
  "true","try","typeof","var","void","while","with","yield","await","async","of",
  "undefined",
]);

const GLOBALS = new Set([
  "window","document","navigator","screen","location","history","performance","console",
  "crypto","Date","Math","JSON","Array","Object","String","Number","Boolean","Symbol",
  "Uint8Array","Int8Array","Uint16Array","Int16Array","Uint32Array","Int32Array",
  "Float32Array","Float64Array","ArrayBuffer","Blob","Worker","URL","Image",
  "XMLHttpRequest","RTCPeerConnection","EventSource","MutationObserver","OffscreenCanvas",
  "AudioContext","webkitAudioContext","FontFace","TextEncoder","TextDecoder",
  "Screen","Navigator",
  "setTimeout","setInterval","clearTimeout","clearInterval","setImmediate",
  "requestAnimationFrame","cancelAnimationFrame","requestIdleCallback",
  "parseInt","parseFloat","isNaN","isFinite","encodeURIComponent","decodeURIComponent",
  "encodeURI","decodeURI","escape","unescape","btoa","atob","fetch","AbortSignal","Promise","Error",
  "RegExp","globalThis","self","top","parent","opener","frames","addEventListener",
  "removeEventListener","dispatchEvent","matchMedia","getComputedStyle","localStorage",
  "sessionStorage","Intl","DOMException","Event","CustomEvent","encodeURIComponent",
  "Function","Proxy","Reflect",
]);

const RESERVED_PREFIXES = ["__sg", "sg_", "SG_"];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0; }
  return Math.abs(h);
}

function hashStr(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
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

function isRegexStart(code: string, i: number): boolean {
  let j = i - 1;
  while (j >= 0 && /\s/.test(code[j] ?? '')) j--;
  if (j < 0) return true;
  const c = code[j] ?? '';
  if ('([{=,:;!&|?+-*%<>^~'.includes(c)) return true;
  if (/[a-zA-Z0-9_$)]/.test(c)) {
    let k = j;
    while (k >= 0 && /[a-zA-Z0-9_$]/.test(code[k] ?? '')) k--;
    const word = code.slice(k + 1, j + 1);
    return ['return', 'typeof', 'instanceof', 'in', 'of', 'case', 'delete', 'void', 'new', 'do', 'else', 'yield', 'await'].includes(word);
  }
  return false;
}

function templateValue(seg: string): string {
  return seg
    .replace(/\\(['"\\bfnrtv0`$])/g, (_: string, c: string) => ({ "'": "'", '"': '"', '\\': '\\', 'b': '\b', 'f': '\f', 'n': '\n', 'r': '\r', 't': '\t', 'v': '\v', '0': '\0', '`': '`', '$': '$' } as Record<string, string>)[c] ?? c)
    .replace(/\\(u\{([\da-fA-F]+)\}|u([\da-fA-F]{4})|x([\da-fA-F]{2}))/g, (_: string, __: string, ubrace: string, u4: string, x2: string) => {
      const code = ubrace ? parseInt(ubrace, 16) : (u4 ? parseInt(u4, 16) : parseInt(x2, 16));
      return String.fromCodePoint(code);
    });
}

// Chiffre un template literal : `a${x}b` → (_D("hex-a"))+x+(_D("hex-b"))
// pour ne pas laisser les textes (messages du guard, CSS…) en clair.
function encryptTemplate(code: string, start: number, key: string, dec: string): { text: string; next: number } {
  let i = start + 1;
  const parts: Array<{ t: 'str' | 'expr'; v: string }> = [];
  let seg = '';
  const n = code.length;
  while (i < n) {
    const ch = code[i]!;
    if (ch === '\\') { seg += ch + (code[i + 1] ?? ''); i += 2; continue; }
    if (ch === '`') { i++; break; }
    if (ch === '$' && code[i + 1] === '{') {
      if (seg) { parts.push({ t: 'str', v: seg }); seg = ''; }
      let depth = 1;
      let expr = '';
      i += 2;
      while (i < n && depth > 0) {
        const c = code[i]!;
        if (c === '\\') { expr += c + (code[i + 1] ?? ''); i += 2; continue; }
        if (c === "'" || c === '"' || c === '`') {
          const q = c;
          expr += c; i++;
          while (i < n && code[i] !== q) {
            if (code[i] === '\\') { expr += code[i] + (code[i + 1] ?? ''); i += 2; continue; }
            expr += code[i]!; i++;
          }
          if (i < n) { expr += q; i++; }
          continue;
        }
        if (c === '{') depth++;
        else if (c === '}') { depth--; if (depth === 0) { i++; break; } }
        expr += c; i++;
      }
      parts.push({ t: 'expr', v: expr });
      continue;
    }
    seg += ch;
    i++;
  }
  if (seg) parts.push({ t: 'str', v: seg });
  if (parts.length === 0) return { text: '(' + dec + '(""))', next: i };
  let text = '';
  for (let p = 0; p < parts.length; p++) {
    if (p > 0) text += '+';
    if (parts[p]!.t === 'str') {
      text += '(' + dec + '("' + xorEncrypt(templateValue(parts[p]!.v), key) + '"))';
    } else {
      text += '(' + parts[p]!.v + ')';
    }
  }
  return { text, next: i };
}

function encryptStrings(code: string, key: string, dec = '_D'): string {
  let r = '', i = 0;
  while (i < code.length) {
    if (code[i] === '`') {
      const out = encryptTemplate(code, i, key, dec);
      r += out.text;
      i = out.next;
    } else if (code[i] === '/' && isRegexStart(code, i)) {
      const start = i;
      i++;
      let inClass = false;
      while (i < code.length) {
        const ch = code[i];
        if (ch === '\\') { i += 2; continue; }
        if (ch === '[') inClass = true;
        else if (ch === ']') inClass = false;
        else if (ch === '/' && !inClass) { i++; break; }
        else if (ch === '\n') break;
        i++;
      }
      const slashEnd = i; // position après le '/' fermant
      let flagsEnd = slashEnd;
      while (flagsEnd < code.length && /[dgimsuvy]/.test(code[flagsEnd] ?? '')) flagsEnd++;
      const pattern = code.slice(start + 1, slashEnd - 1);
      const flags = code.slice(slashEnd, flagsEnd);
      // /pat/flags → (new RegExp((dec("hex")),(dec("hex")))) pour ne pas laisser
      // le pattern en clair (ex: /^Segoe UI...$/). Parenthèse externe pour
      // éviter la fusion `returnnew` → identifiant invalide.
      r += '(new RegExp((' + dec + '("' + xorEncrypt(pattern, key) + '"))' +
        (flags ? ',(' + dec + '("' + xorEncrypt(flags, key) + '"))' : '') + '))';
      i = flagsEnd;
    } else if (code[i] === "'" || code[i] === '"') {
      const q = code[i];
      let j = i + 1;
      while (j < code.length) { if (code[j] === '\\') { j += 2; continue; } if (code[j] === q) break; j++; }
      if (j < code.length) {
        const val = runtimeValue(code.slice(i, j + 1));
        // Parentheses prevent minifiers from merging `return` with `_D` into
        // the invalid identifier `return_D`.
        const enc = '(' + dec + '("' + xorEncrypt(val, key) + '"))';
        // Clé d'objet littéral : {"nom":v} → {[dec("...")]:v} (sinon
        // (_dec("...")): serait une clé invalide).
        let k = i - 1;
        while (k >= 0 && /\s/.test(code[k] ?? '')) k--;
        let f = j + 1;
        while (f < code.length && /\s/.test(code[f] ?? '')) f++;
        const keyPos = (code[k] === '{' || code[k] === ',') && code[f] === ':';
        if (keyPos) {
          r += '[' + enc + ']:';
          i = f + 1;
        } else {
          r += enc;
          i = j + 1;
        }
      } else { r += code[i]; i++; }
    } else { r += code[i]; i++; }
  }
  return r;
}

function stripComments(s: string): string {
  let r = '';
  let i = 0;
  const n = s.length;
  while (i < n) {
    const ch = s[i]!;
    if (ch === "'" || ch === '"' || ch === '`') {
      const q = ch;
      const start = i;
      i++;
      while (i < n) {
        if (s[i] === '\\') { i += 2; continue; }
        if (s[i] === q) { i++; break; }
        i++;
      }
      r += s.slice(start, i);
      continue;
    }
    if (ch === '/' && s[i + 1] === '/') {
      while (i < n && s[i] !== '\n') i++;
      continue;
    }
    if (ch === '/' && s[i + 1] === '*') {
      i += 2;
      while (i < n && !(s[i] === '*' && s[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    if (ch === '/' && isRegexStart(s, i)) {
      const start = i;
      i++;
      let inClass = false;
      while (i < n) {
        const c = s[i]!;
        if (c === '\\') { i += 2; continue; }
        if (c === '[') inClass = true;
        else if (c === ']') inClass = false;
        else if (c === '/' && !inClass) { i++; break; }
        else if (c === '\n') break;
        i++;
      }
      r += s.slice(start, i);
      continue;
    }
    r += ch;
    i++;
  }
  return r.replace(/\n{3,}/g, '\n\n');
}

function escapeClosingTags(code: string): string {
  return code.replace(/<\/(script|style)/gi, '<\\/$1');
}

function fixComputedProperties(code: string, dec = '_D'): string {
  const decEsc = dec.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return code.replace(new RegExp('([{,])(\\s*)\\(' + decEsc + '\\("([^"]*)"\\)\\)(\\s*):', 'g'), '$1$2[' + dec + '("$3")]$4:');
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

function injectDecoder(hexKey: string, dec = '_D', cacheName = '_Dx'): string {
  return buildDecoderStmt(hexKey, dec, cacheName);
}

function buildDecoderStmt(hexKey: string, dec: string, cacheName: string): string {
  const kb = hexToBytes(hexKey);
  const ks = kb.map((b) => '\\x' + b.toString(16).padStart(2, '0')).join('');
  return 'var ' + cacheName + '=Object.create(null),' + dec + '=function(h){var c=' + cacheName + '[h];if(c!==void 0)return c;var k="' + ks + '",r="";for(var i=0;i<h.length;i+=2){r+=String.fromCharCode(parseInt(h.substr(i,2),16)^k.charCodeAt((i/2)%' + kb.length + '))}return ' + cacheName + '[h]=r};';
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

function createRng(seed: number): () => number {
  let s = (seed >>> 0) || 1;
  return function next() {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NAME_ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_";

function shortName(rng: () => number, minLen: number): string {
  let n = "";
  const len = minLen + Math.floor(rng() * 4);
  for (let i = 0; i < len; i++) {
    n += NAME_ALPHABET[Math.floor(rng() * NAME_ALPHABET.length)];
  }
  return n;
}

function findIdentifiers(code: string): Array<{ start: number; end: number; value: string }> {
  const spans: Array<{ start: number; end: number; value: string }> = [];
  let i = 0;
  const n = code.length;
  let prevSig = "";
  while (i < n) {
    const ch = code[i]!;
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") { i++; continue; }
    if (ch === "/" && code[i + 1] === "/") {
      while (i < n && code[i] !== "\n") i++;
      continue;
    }
    if (ch === "/" && code[i + 1] === "*") {
      i += 2;
      while (i < n && !(code[i] === "*" && code[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    if (ch === "'" || ch === '"') {
      const q = ch;
      i++;
      while (i < n) {
        if (code[i] === "\\") { i += 2; continue; }
        if (code[i] === q) { i++; break; }
        i++;
      }
      prevSig = "str";
      continue;
    }
    if (ch === "`") {
      i++;
      while (i < n) {
        if (code[i] === "\\") { i += 2; continue; }
        if (code[i] === "`") { i++; break; }
        if (code[i] === "$" && code[i + 1] === "{") {
          prevSig = "$";
          i++;
          continue;
        }
        i++;
      }
      prevSig = "str";
      continue;
    }
    if (ch === "/") {
      const exprStart =
        prevSig === "" || "=([{,;:?!&|+-*%^~<>".indexOf(prevSig) >= 0 ||
        prevSig === "return" || prevSig === "typeof" || prevSig === "new" ||
        prevSig === "case" || prevSig === "delete" || prevSig === "void" ||
        prevSig === "in" || prevSig === "of" || prevSig === "instanceof" || prevSig === "throw";
      if (exprStart) {
        i++;
        let inClass = false;
        while (i < n) {
          if (code[i] === "\\") { i += 2; continue; }
          if (code[i] === "[") inClass = true;
          else if (code[i] === "]") inClass = false;
          if (code[i] === "/" && !inClass) { i++; break; }
          i++;
        }
        while (i < n && /[a-z]/i.test(code[i]!)) i++;
        prevSig = "str";
        continue;
      }
      prevSig = "/";
      i++;
      continue;
    }
    if (/[A-Za-z_$]/.test(ch)) {
      const start = i;
      while (i < n && /[A-Za-z0-9_$]/.test(code[i]!)) i++;
      const value = code.slice(start, i);
      // Identifiant avec escape Unicode (\uXXXX ou \u{...}) : on consomme les
      // escapes mais on NE RENOMME PAS (une clé d'objet `Bloqu\u00E9:` est
      // référencée via string — renommer casserait la correspondance).
      let hasUnicodeEscape = false;
      while (code[i] === '\\' && code[i + 1] === 'u') {
        hasUnicodeEscape = true;
        if (code[i + 2] === '{') {
          let k = i + 3;
          while (k < n && code[k] !== '}') k++;
          i = k + 1;
        } else {
          i += 6;
        }
      }
      const isProp = prevSig === ".";
      const isKey = code[i] === ":" && (prevSig === "{" || prevSig === ",");
      const isKeyword = KEYWORDS.has(value);
      const isGlobal = GLOBALS.has(value);
      const isReserved = RESERVED_PREFIXES.some((p) => value.startsWith(p));
      if (!isProp && !isKeyword && !isGlobal && !isReserved && !isKey && !hasUnicodeEscape) {
        spans.push({ start, end: i, value });
      }
      prevSig = KEYWORDS.has(value) ? value : "id";
      continue;
    }
    if (/[0-9]/.test(ch)) {
      while (i < n && /[0-9a-zA-Z.]/.test(code[i]!)) i++;
      prevSig = "num";
      continue;
    }
    if (ch === ".") { prevSig = "."; i++; continue; }
    prevSig = ch;
    i++;
  }
  return spans;
}

function rotateIdentifiers(code: string, seed: string): string {
  const spans = findIdentifiers(code);
  const rng = createRng(hashStr(seed));
  const map = new Map<string, string>();
  const used = new Set<string>();
  function nextName(orig: string): string {
    const minLen = 2 + (hashStr(orig) % 5);
    let name: string;
    let guard = 0;
    do {
      name = "_" + shortName(rng, minLen);
      guard++;
    } while (used.has(name) && guard < 500);
    used.add(name);
    return name;
  }
  let out = "";
  let last = 0;
  for (const s of spans) {
    out += code.slice(last, s.start);
    let name = map.get(s.value);
    if (!name) {
      name = nextName(s.value);
      map.set(s.value, name);
    }
    out += name;
    last = s.end;
  }
  out += code.slice(last);
  return out;
}

function isValidJavaScript(code: string): boolean {
  try {
    new Function(code);
    return true;
  } catch {
    return false;
  }
}

// Découpe le code en instructions de niveau supérieur (respecte strings/regex/braces).
function splitTopLevelStatements(code: string): string[] {
  const stmts: string[] = [];
  let depth = 0;
  let cur = "";
  let i = 0;
  const n = code.length;
  while (i < n) {
    const ch = code[i]!;
    if (ch === "/" && code[i + 1] === "/") {
      while (i < n && code[i] !== "\n") { cur += code[i]; i++; }
      continue;
    }
    if (ch === "/" && code[i + 1] === "*") {
      cur += "/*";
      i += 2;
      while (i < n && !(code[i] === "*" && code[i + 1] === "/")) { cur += code[i]; i++; }
      cur += "*/";
      i += 2;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") {
      const q = ch;
      cur += ch;
      i++;
      while (i < n) {
        cur += code[i];
        if (code[i] === "\\") { i++; cur += code[i] ?? ""; i++; continue; }
        if (code[i] === q) { i++; break; }
        i++;
      }
      continue;
    }
    if (ch === "{" || ch === "(" || ch === "[") { depth++; cur += ch; i++; continue; }
    if (ch === "}" || ch === ")" || ch === "]") {
      depth--; cur += ch; i++;
      // fin d'un bloc/IIFE au niveau 0 suivie d'une nouvelle instruction
      // sans ';' (ex: `function f(){}_gw(...)`, `}catch(e){...}x()`)
      if (ch === "}" && depth === 0) {
        let j = i;
        while (j < n && (code[j] === " " || code[j] === "\t" || code[j] === "\n" || code[j] === "\r")) j++;
        const nxt = code[j];
        // Ne pas couper entre un bloc et sa continuation try/catch/else/finally
        // (ex: `}catch(e){`, `}else{`, `}finally{`) — on coupe seulement si une
        // NOUVELLE instruction suit (ex: `function f(){}_gw(...)`, `}catch(){}x()`).
        const cont = /^(catch|else|finally|while)\b/.test(code.slice(j, j + 9));
        if (nxt !== undefined && nxt !== ";" && nxt !== "}" && !cont && /[A-Za-z_$(]/.test(nxt)) {
          const trimmed = cur.trim();
          if (trimmed) stmts.push(trimmed);
          cur = "";
        }
      }
      continue;
    }
    if (ch === ";" && depth === 0) {
      const trimmed = cur.trim();
      if (trimmed) stmts.push(trimmed);
      cur = "";
      i++;
      continue;
    }
    cur += ch;
    i++;
  }
  const trimmed = cur.trim();
  if (trimmed) stmts.push(trimmed);
  return stmts;
}

function isDeclarationStatement(stmt: string): boolean {
  return /^(var|let|const|function)\b/.test(stmt.trim());
}

// Shuffle les déclarations et diffère l'exécution : chaque instruction
// d'exécution est poussée dans _q[idx] (indice = ordre réel) puis jouée en
// boucle à la fin. L'ordre textuel ne reflète plus l'ordre d'exécution.
function deferExecution(code: string, seed: string, qName = '_q', iName = '_i'): string {
  const stmts = splitTopLevelStatements(code);
  if (stmts.length < 2) return code;
  const decls: string[] = [];
  const execs: string[] = [];
  for (const s of stmts) {
    if (isDeclarationStatement(s)) decls.push(s);
    else execs.push(s);
  }
  const rng = seededRng(seed);
  for (let i = decls.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = decls[i];
    decls[i] = decls[j] ?? '';
    decls[j] = t ?? '';
  }
  // push dans l'ordre réel (indice) mais désordre textuel
  const order = execs.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = order[i];
    order[i] = order[j] ?? 0;
    order[j] = t ?? 0;
  }
  const lines: string[] = ['var ' + qName + '=[];'];
  for (const d of decls) lines.push(d + ';');
  for (const o of order) {
    lines.push(qName + '[' + o + ']=function(){' + (execs[o] ?? '') + '};');
  }
  lines.push('for(var ' + iName + '=0;' + iName + '<' + qName + '.length;' + iName + '++){if(' + qName + '[' + iName + ']){try{' + qName + '[' + iName + ']()}catch(_sg_e){window.__sg_deferError=String(_sg_e&&_sg_e.message||_sg_e)}}}');
  return lines.join('');
}

// Hash toutes les propriétés `.prop` → `[dec("enc(prop)")]`, y compris sur les
// objets locaux (config, R, window.__sg_*). Saut : template literals (CSS du
// guard : sélecteurs `.classe`), strings, regex, décimales (0.5), namespaces.
function hashAllProperties(code: string, dec: string, key: string): string {
  let r = '';
  let i = 0;
  const n = code.length;
  while (i < n) {
    const ch = code[i]!;
    if (ch === '`') {
      const start = i;
      i++;
      while (i < n) {
        if (code[i] === '\\') { i += 2; continue; }
        if (code[i] === '`') { i++; break; }
        i++;
      }
      r += code.slice(start, i);
      continue;
    }
    if (ch === "'" || ch === '"') {
      const q = ch;
      const start = i;
      i++;
      while (i < n) {
        if (code[i] === '\\') { i += 2; continue; }
        if (code[i] === q) { i++; break; }
        i++;
      }
      r += code.slice(start, i);
      continue;
    }
    if (ch === '/' && isRegexStart(code, i)) {
      const start = i;
      i++;
      let inClass = false;
      while (i < n) {
        const c = code[i]!;
        if (c === '\\') { i += 2; continue; }
        if (c === '[') inClass = true;
        else if (c === ']') inClass = false;
        else if (c === '/' && !inClass) { i++; break; }
        else if (c === '\n') break;
        i++;
      }
      r += code.slice(start, i);
      continue;
    }
    if (ch === '.' && i + 1 < n && /[A-Za-z_$]/.test(code[i + 1]!)) {
      const prev = code[i - 1] ?? '';
      // 0.5, .5, 1.2e3 → nombre, pas un accès de propriété ; ...x → spread
      if (/[0-9]/.test(prev) || prev === '.') { r += ch; i++; continue; }
      let j = i + 1;
      while (j < n && /[A-Za-z0-9_$]/.test(code[j]!)) j++;
      const prop = code.slice(i + 1, j);
      if (prop) {
        r += '[' + dec + '("' + xorEncrypt(prop, key) + '")]';
        i = j;
        continue;
      }
      r += ch;
      i++;
      continue;
    }
    r += ch;
    i++;
  }
  return r;
}

// Snapshot des propriétés navigateur : toute lecture de global navigateur est
// routée via nav[_D("nom")] pour ne pas révéler en clair les propriétés
// utilisées. _D change à chaque refresh → le "hash" change.
function navify(code: string, seed: string, dec = '_D', cacheName = '_Dx', navName = 'nav'): string {
  const key = deriveKey(seed);
  const globalsToHide = [
    "fetch","document","setTimeout","clearTimeout","setInterval","clearInterval",
    "location","history","JSON","Object","String","Number","Math","Date",
    "encodeURIComponent","decodeURIComponent","TextEncoder","Uint8Array",
    "navigator","screen","crypto","performance","console","requestAnimationFrame",
    "cancelAnimationFrame","Image","FontFace","Blob","URL","Worker",
    "XMLHttpRequest","RTCPeerConnection","EventSource","MutationObserver",
    "OffscreenCanvas","AudioContext","webkitAudioContext","btoa","atob","escape","unescape",
    "parseInt","parseFloat","AbortSignal","Promise","Error","RegExp","window",
  ];
  let r = code;
  // globals appelables directement (natives) → (0, nav[dec("...")])(...)
  // pour forcer this=undefined (sinon "Illegal invocation")
  const nativeCalls = [
    "fetch","setTimeout","clearTimeout","setInterval","clearInterval",
    "requestAnimationFrame","cancelAnimationFrame","btoa","atob","escape","unescape",
    "encodeURIComponent","decodeURIComponent","parseInt","parseFloat",
  ];
  for (const g of nativeCalls) {
    const callRe = new RegExp('(?<![.$\\w])' + g + '(?=\\s*\\()', 'g');
    r = r.replace(callRe, '(0,' + navName + '[' + dec + '("' + xorEncrypt(g, key) + '")])');
  }
  // objets/globals référencés par propriété (document, location, JSON…)
  // et toutes autres références libres → nav[dec("...")]
  for (const g of globalsToHide) {
    const re = new RegExp('(?<![.$\\w])' + g + '(?![\\w$])', 'g');
    r = r.replace(re, navName + '[' + dec + '("' + xorEncrypt(g, key) + '")]');
  }
  // propriétés accédées sur TOUT objet : obj.prop → obj[dec("enc(prop)")]
  // pour ne révéler ni le nom des globals, ni les propriétés de nos objets
  // (config _bXJwJIg.enableTorCheck, R.platform, window.__sg_*…).
  // On saute les template literals (CSS du guard : sélecteurs .classe) et les
  // regex littéraux (contiennent des `.`) pour ne pas les corrompre.
  r = hashAllProperties(r, dec, key);
  // nav récupère window ET explicitement les globaux utilisés (fiabilité
  // même si for...in ne les énumère pas tous).
  const seeds = globalsToHide.map((g) => 'try{' + navName + '[' + dec + '("' + xorEncrypt(g, key) + '")]=' + g + '}catch(_nav_e){}').join('');
  // préambule : décodeur + nav, insérés ensemble à une position rotatée
  // parmi les instructions de niveau supérieur, TOUJOURS avant la boucle
  // d'exécution finale (_q). Les noms dérivent du seed → ni nom, ni place
  // ne sont statiques d'un refresh à l'autre.
  const preamble =
    buildDecoderStmt(key, dec, cacheName) +
    'var ' + navName + '={window:window};try{var _nav_i;for(_nav_i in window)' + navName + '[_nav_i]=window[_nav_i]}catch(_nav_e){};' + seeds + ';';
  // Le décodeur doit précéder toute utilisation de dec(...). Pour faire
  // varier SA position, on insère avant lui un nombre rotaté de déclarations
  // "leurre" (sans décodage) : il n'est donc jamais littéralement en tête,
  // et son décalage change à chaque refresh.
  const decoys = 1 + (hashStr(seed + 'decoy') % 3);
  const decoyLines: string[] = [];
  for (let d = 0; d < decoys; d++) {
    const v = '_' + shortName(createRng(hashStr(seed + 'dv' + d)), 2);
    const n = 1 + (hashStr(seed + 'dn' + d) % 3);
    decoyLines.push('var ' + v + '=' + n + ';');
  }
  const block = decoyLines.join('') + preamble;
  const stmts = splitTopLevelStatements(r);
  stmts.unshift(block);
  return stmts.join(';') + ';';
}

export function applyBootObfuscation(code: string, seed: string): string {
  let r = stripComments(code);
  r = stripTrace(r);
  r = rotateIdentifiers(r, seed);
  r = deferExecution(r, seed);
  const encKey = deriveKey(seed);
  const decName = '_' + shortName(createRng(hashStr(seed + 'dec')), 2);
  const cacheName = '_' + shortName(createRng(hashStr(seed + 'cache')), 2);
  const navName = '_' + shortName(createRng(hashStr(seed + 'nav')), 2);
  r = encryptStrings(r, encKey, decName);
  r = navify(r, seed, decName, cacheName, navName);
  r = escapeClosingTags(r);
  r = fixComputedProperties(r, decName);
  if (!isValidJavaScript(r)) return code;
  return r;
}

// Couche "invisible eval" : encode le code (déjà obfusqué) caractère par
// caractère en U+E0000+ (Supplementary Private Use Area-B, invisible à
// l'affichage) puis l'exécute via un wrapper eval([...].map(...).join('')).
// Le wrapper est seedé (noms, idiome du callback, représentation du décalage,
// découpe de la string encodée) → aucun décodage statique unique possible,
// chaque refresh produit un wrapper différent.
const INVISIBLE_EVAL_SHIFT = 0xe0000; // 917504

function encodeInvisible(code: string): string {
  let r = '';
  for (const ch of code) {
    const cp = ch.codePointAt(0)!;
    if (cp > 0x10ffff - INVISIBLE_EVAL_SHIFT) {
      throw new Error('applyInvisibleEval: cannot hide code point U+' + cp.toString(16).toUpperCase());
    }
    r += String.fromCodePoint(cp + INVISIBLE_EVAL_SHIFT);
  }
  return r;
}

export function applyInvisibleEval(code: string, seed: string): string {
  const enc = encodeInvisible(code);
  const rng = createRng(hashStr(seed));
  // Identifiants dynamiques : le paramètre du callback et le nom de la
  // fonction nommée dérivent du seed.
  const arg = '_' + shortName(rng, 2);
  const fn = '_' + shortName(rng, 2);
  // Représentation du décalage (917504) : décimale / hex / binaire.
  const shiftExpr = ['917504', '0xE0000', '0b11100000000000000000'][hashStr(seed + '::shift') % 3]!;
  // Idiome du callback : function anon / arrow / fonction nommée / arrow nue.
  const cbKind = hashStr(seed + '::cb') % 4;
  let cb: string;
  if (cbKind === 0) cb = 'function(' + arg + '){return String.fromCodePoint(' + arg + '.codePointAt(0)-' + shiftExpr + ')}';
  else if (cbKind === 1) cb = '(' + arg + ')=>String.fromCodePoint(' + arg + '.codePointAt(0)-' + shiftExpr + ')';
  else if (cbKind === 2) cb = 'function ' + fn + '(' + arg + '){return String.fromCodePoint(' + arg + '.codePointAt(0)-' + shiftExpr + ')}';
  else cb = arg + '=>String.fromCodePoint(' + arg + '.codePointAt(0)-' + shiftExpr + ')';
  // Découpe la string encodée en 1..3 morceaux à des bornes seedées : la
  // charge encodée n'est jamais littéralement d'un seul tenant.
  // IMPORTANT : les caractères encodés sont ≥ U+E0000 → des code points
  // ASTRALS (surrogate pairs en UTF-16). On découpe sur des bornes de CODE
  // POINTS (Array.from) et jamais sur des index UTF-16, sinon un surrogate
  // pair coupé en deux devient U+FFFD à l'exécution → code corrompu.
  const encPoints = Array.from(enc);
  const nParts = Math.min(1 + (hashStr(seed + '::parts') % 3), Math.max(1, encPoints.length));
  const parts: string[] = [];
  let idx = 0;
  for (let p = 0; p < nParts; p++) {
    const isLast = p === nParts - 1;
    let len: number;
    if (isLast) len = encPoints.length - idx;
    else {
      const max = encPoints.length - idx - (nParts - p - 1);
      len = 1 + (hashStr(seed + '::part' + p) % Math.max(1, max));
    }
    parts.push(encPoints.slice(idx, idx + len).join(''));
    idx += len;
  }
  // Les chars encodés sont tous ≥ U+E0000 : aucun `'`, `"`, `\`, backtick ni
  // `</script>` possible → les literals sont sûrs entre guillemets simples.
  const literal = parts.map((p) => "'" + p + "'").join('+');
  // eval direct (pas (0,eval)…) pour que le code reste dans la portée courante
  // (window fourni par le host reste visible dans le code décodé).
  const wrapper = 'eval([...(' + literal + ')].map(' + cb + ').join(""))';
  if (!isValidJavaScript(wrapper)) return code;
  return wrapper;
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

export function isValidJs(code: string): boolean {
  return isValidJavaScript(code);
}

export { stripComments, rotateIdentifiers, deferExecution, encryptStrings, navify, buildDecoderStmt, splitTopLevelStatements, fixComputedProperties, deriveKey, hashStr, createRng, shortName };
