var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/locales.ts
function resolveLocale(explicit, acceptLanguage) {
  if (explicit) return explicit;
  if (acceptLanguage && /^fr\b|,\s*fr\b/i.test(acceptLanguage)) return "fr";
  return "en";
}
var MESSAGES;
var init_locales = __esm({
  "src/locales.ts"() {
    "use strict";
    MESSAGES = {
      fr: {
        rateLimitTitle: "Trop de requ\xEAtes",
        rateLimitBody: (t) => `Vous avez effectu\xE9 trop de requ\xEAtes en peu de temps. Il reste ${t} avant de pouvoir r\xE9essayer.`,
        rateLimitBadge: "Rate Limit",
        blockedTitle: "Acc\xE8s bloqu\xE9",
        blockedBadge: "Blocage",
        tamperTitle: "Remplacement de contenu client d\xE9tect\xE9",
        tamperBody: "Nous avons remarqu\xE9 que vous avez tent\xE9 de modifier manuellement le rendu client c\xF4t\xE9 navigateur via les DevTools. Cette pratique est \xE9videmment bloqu\xE9e par nos services.",
        devtoolsBody: "L'utilisation des DevTools pour remplacer le contenu ou modifier les requ\xEAtes r\xE9seau a \xE9t\xE9 d\xE9tect\xE9e. L'int\xE9grit\xE9 de la page est prot\xE9g\xE9e et toute alt\xE9ration est imm\xE9diatement bloqu\xE9e.",
        fakeBrowserTitle: "Requ\xEAte non navigateur",
        fakeBrowserBody: "Votre requ\xEAte ne provient pas d'un navigateur standard. Utilisez un navigateur (Chrome, Firefox, Safari, Edge) pour acc\xE9der \xE0 ce site.",
        fakeBrowserBadge: "Acc\xE8s restreint",
        retryInSeconds: (s) => `Il reste ${s}s avant de pouvoir r\xE9essayer.`
      },
      en: {
        rateLimitTitle: "Too Many Requests",
        rateLimitBody: (t) => `You have made too many requests in a short time. ${t} remaining before you can try again.`,
        rateLimitBadge: "Rate Limit",
        blockedTitle: "Access Blocked",
        blockedBadge: "Blocked",
        tamperTitle: "Client Content Replacement Detected",
        tamperBody: "We noticed you attempted to manually modify the client-side rendering via DevTools. This practice is obviously blocked by our services.",
        devtoolsBody: "Using DevTools to replace content or modify network requests has been detected. Page integrity is protected and any alteration is immediately blocked.",
        fakeBrowserTitle: "Non-browser request",
        fakeBrowserBody: "Your request did not come from a standard browser. Please use a browser (Chrome, Firefox, Safari, Edge) to access this site.",
        fakeBrowserBadge: "Restricted access",
        retryInSeconds: (s) => `Retry in ${s}s.`
      }
    };
  }
});

// src/obfuscate.ts
import crypto from "crypto";
function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}
function hashStr(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}
function hexToBytes(hex) {
  const b = [];
  for (let i = 0; i < hex.length; i += 2) b.push(parseInt(hex.substr(i, 2), 16));
  return b;
}
function xorEncrypt(str, hexKey) {
  const kb = hexToBytes(hexKey);
  let enc = "";
  for (let i = 0; i < str.length; i++) {
    const cc = str.charCodeAt(i) ^ (kb[i % kb.length] ?? 0);
    enc += cc.toString(16).padStart(2, "0");
  }
  return enc;
}
function runtimeValue(str) {
  let s = str.slice(1, -1);
  return s.replace(/\\(['"\\bfnrtv0])/g, (_, c) => ({ "'": "'", '"': '"', "\\": "\\", "b": "\b", "f": "\f", "n": "\n", "r": "\r", "t": "	", "v": "\v", "0": "\0" })[c] ?? c).replace(/\\(u\{([\da-fA-F]+)\}|u([\da-fA-F]{4})|x([\da-fA-F]{2}))/g, (_, __, ubrace, u4, x2) => {
    const code = ubrace ? parseInt(ubrace, 16) : u4 ? parseInt(u4, 16) : parseInt(x2, 16);
    return String.fromCodePoint(code);
  });
}
function isRegexStart(code, i) {
  let j = i - 1;
  while (j >= 0 && /\s/.test(code[j] ?? "")) j--;
  if (j < 0) return true;
  const c = code[j] ?? "";
  if ("([{=,:;!&|?+-*%<>^~".includes(c)) return true;
  if (/[a-zA-Z0-9_$)]/.test(c)) {
    let k = j;
    while (k >= 0 && /[a-zA-Z0-9_$]/.test(code[k] ?? "")) k--;
    const word = code.slice(k + 1, j + 1);
    return ["return", "typeof", "instanceof", "in", "of", "case", "delete", "void", "new", "do", "else", "yield", "await"].includes(word);
  }
  return false;
}
function templateValue(seg) {
  return seg.replace(/\\(['"\\bfnrtv0`$])/g, (_, c) => ({ "'": "'", '"': '"', "\\": "\\", "b": "\b", "f": "\f", "n": "\n", "r": "\r", "t": "	", "v": "\v", "0": "\0", "`": "`", "$": "$" })[c] ?? c).replace(/\\(u\{([\da-fA-F]+)\}|u([\da-fA-F]{4})|x([\da-fA-F]{2}))/g, (_, __, ubrace, u4, x2) => {
    const code = ubrace ? parseInt(ubrace, 16) : u4 ? parseInt(u4, 16) : parseInt(x2, 16);
    return String.fromCodePoint(code);
  });
}
function encryptTemplate(code, start, key, dec) {
  let i = start + 1;
  const parts = [];
  let seg = "";
  const n = code.length;
  while (i < n) {
    const ch = code[i];
    if (ch === "\\") {
      seg += ch + (code[i + 1] ?? "");
      i += 2;
      continue;
    }
    if (ch === "`") {
      i++;
      break;
    }
    if (ch === "$" && code[i + 1] === "{") {
      if (seg) {
        parts.push({ t: "str", v: seg });
        seg = "";
      }
      let depth = 1;
      let expr = "";
      i += 2;
      while (i < n && depth > 0) {
        const c = code[i];
        if (c === "\\") {
          expr += c + (code[i + 1] ?? "");
          i += 2;
          continue;
        }
        if (c === "'" || c === '"' || c === "`") {
          const q = c;
          expr += c;
          i++;
          while (i < n && code[i] !== q) {
            if (code[i] === "\\") {
              expr += code[i] + (code[i + 1] ?? "");
              i += 2;
              continue;
            }
            expr += code[i];
            i++;
          }
          if (i < n) {
            expr += q;
            i++;
          }
          continue;
        }
        if (c === "{") depth++;
        else if (c === "}") {
          depth--;
          if (depth === 0) {
            i++;
            break;
          }
        }
        expr += c;
        i++;
      }
      parts.push({ t: "expr", v: expr });
      continue;
    }
    seg += ch;
    i++;
  }
  if (seg) parts.push({ t: "str", v: seg });
  if (parts.length === 0) return { text: "(" + dec + '(""))', next: i };
  let text = "";
  for (let p = 0; p < parts.length; p++) {
    if (p > 0) text += "+";
    if (parts[p].t === "str") {
      text += "(" + dec + '("' + xorEncrypt(templateValue(parts[p].v), key) + '"))';
    } else {
      text += "(" + parts[p].v + ")";
    }
  }
  return { text, next: i };
}
function encryptStrings(code, key, dec = "_D") {
  let r = "", i = 0;
  while (i < code.length) {
    if (code[i] === "`") {
      const out = encryptTemplate(code, i, key, dec);
      r += out.text;
      i = out.next;
    } else if (code[i] === "/" && isRegexStart(code, i)) {
      const start = i;
      i++;
      let inClass = false;
      while (i < code.length) {
        const ch = code[i];
        if (ch === "\\") {
          i += 2;
          continue;
        }
        if (ch === "[") inClass = true;
        else if (ch === "]") inClass = false;
        else if (ch === "/" && !inClass) {
          i++;
          break;
        } else if (ch === "\n") break;
        i++;
      }
      const slashEnd = i;
      let flagsEnd = slashEnd;
      while (flagsEnd < code.length && /[dgimsuvy]/.test(code[flagsEnd] ?? "")) flagsEnd++;
      const pattern = code.slice(start + 1, slashEnd - 1);
      const flags = code.slice(slashEnd, flagsEnd);
      r += "(new RegExp((" + dec + '("' + xorEncrypt(pattern, key) + '"))' + (flags ? ",(" + dec + '("' + xorEncrypt(flags, key) + '"))' : "") + "))";
      i = flagsEnd;
    } else if (code[i] === "'" || code[i] === '"') {
      const q = code[i];
      let j = i + 1;
      while (j < code.length) {
        if (code[j] === "\\") {
          j += 2;
          continue;
        }
        if (code[j] === q) break;
        j++;
      }
      if (j < code.length) {
        const val = runtimeValue(code.slice(i, j + 1));
        const enc = "(" + dec + '("' + xorEncrypt(val, key) + '"))';
        let k = i - 1;
        while (k >= 0 && /\s/.test(code[k] ?? "")) k--;
        let f = j + 1;
        while (f < code.length && /\s/.test(code[f] ?? "")) f++;
        const keyPos = (code[k] === "{" || code[k] === ",") && code[f] === ":";
        if (keyPos) {
          r += "[" + enc + "]:";
          i = f + 1;
        } else {
          r += enc;
          i = j + 1;
        }
      } else {
        r += code[i];
        i++;
      }
    } else {
      r += code[i];
      i++;
    }
  }
  return r;
}
function stripComments(s) {
  let r = "";
  let i = 0;
  const n = s.length;
  while (i < n) {
    const ch = s[i];
    if (ch === "'" || ch === '"' || ch === "`") {
      const q = ch;
      const start = i;
      i++;
      while (i < n) {
        if (s[i] === "\\") {
          i += 2;
          continue;
        }
        if (s[i] === q) {
          i++;
          break;
        }
        i++;
      }
      r += s.slice(start, i);
      continue;
    }
    if (ch === "/" && s[i + 1] === "/") {
      while (i < n && s[i] !== "\n") i++;
      continue;
    }
    if (ch === "/" && s[i + 1] === "*") {
      i += 2;
      while (i < n && !(s[i] === "*" && s[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    if (ch === "/" && isRegexStart(s, i)) {
      const start = i;
      i++;
      let inClass = false;
      while (i < n) {
        const c = s[i];
        if (c === "\\") {
          i += 2;
          continue;
        }
        if (c === "[") inClass = true;
        else if (c === "]") inClass = false;
        else if (c === "/" && !inClass) {
          i++;
          break;
        } else if (c === "\n") break;
        i++;
      }
      r += s.slice(start, i);
      continue;
    }
    r += ch;
    i++;
  }
  return r.replace(/\n{3,}/g, "\n\n");
}
function escapeClosingTags(code) {
  return code.replace(/<\/(script|style)/gi, "<\\/$1");
}
function fixComputedProperties(code, dec = "_D") {
  const decEsc = dec.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return code.replace(new RegExp("([{,])(\\s*)\\(" + decEsc + '\\("([^"]*)"\\)\\)(\\s*):', "g"), "$1$2[" + dec + '("$3")]$4:');
}
function deriveKey(seed) {
  return crypto.createHash("sha256").update(seed + "sg_val_v1").digest("hex").slice(0, 32);
}
function seededRng(seed) {
  let s = hash(seed + "_shuffle");
  return function() {
    s = s * 1103515245 + 12345 & 2147483647;
    return s / 2147483647;
  };
}
function shuffleCode(code, seed) {
  const lines = code.split("\n");
  const depth = new Array(lines.length).fill(0);
  let d = 0;
  for (let i = 0; i < lines.length; i++) {
    depth[i] = d;
    for (const ch of lines[i] ?? "") {
      if (ch === "{") d++;
      else if (ch === "}") d--;
    }
  }
  const blocks = [];
  let start = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const isShuffleable = depth[i] === 1 && /^\s*R\.\w+\s*=/.test(line) && !/[{}]/.test(line) && line.trimEnd().endsWith(";");
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
      if (current !== void 0 && replacement !== void 0) {
        slice[i] = replacement;
        slice[j] = current;
      }
    }
    lines.splice(blk.start, slice.length, ...slice);
  }
  return lines.join("\n");
}
function renameFunctions(code, seed) {
  let r = code;
  const names = Object.entries(RENAMES).sort((a, b) => {
    const ha = hash(a[0] + seed), hb = hash(b[0] + seed);
    return ha < hb ? -1 : ha > hb ? 1 : 0;
  });
  for (const [from, to] of names) {
    const suffix = (hash(from + seed) % 9e3 + 1e3).toString(36);
    const newName = to + suffix;
    r = r.replace(new RegExp("\\b" + from + "\\(", "g"), newName + "(");
  }
  return r;
}
function injectDecoder(hexKey, dec = "_D", cacheName = "_Dx") {
  return buildDecoderStmt(hexKey, dec, cacheName);
}
function buildDecoderStmt(hexKey, dec, cacheName) {
  const kb = hexToBytes(hexKey);
  const ks = kb.map((b) => "\\x" + b.toString(16).padStart(2, "0")).join("");
  return "var " + cacheName + "=Object.create(null)," + dec + "=function(h){var c=" + cacheName + '[h];if(c!==void 0)return c;var k="' + ks + '",r="";for(var i=0;i<h.length;i+=2){r+=String.fromCharCode(parseInt(h.substr(i,2),16)^k.charCodeAt((i/2)%' + kb.length + "))}return " + cacheName + "[h]=r};";
}
function removeFunction(code, name) {
  const regex = new RegExp("function\\s+" + name + "\\s*\\([^)]*\\)\\s*\\{[^{}]*\\}", "g");
  let r = code.replace(regex, "");
  const multiRegex = new RegExp("function\\s+" + name + "\\s*\\([^)]*\\)\\s*\\{[^}]*\\{[^}]*\\}[^}]*\\}", "g");
  r = r.replace(multiRegex, "");
  return r;
}
function stripTrace(code) {
  let r = code;
  r = removeFunction(r, "_sgLogCP");
  r = removeFunction(r, "_sgErr");
  r = r.replace(/_sgLogCP\(\s*\d+\s*\)\s*[;,]?/g, "");
  r = r.replace(/_sgErr\(\s*(['"][^'"]*['"]|[A-Za-z_$][\w$]*)\s*,\s*(['"][^'"]*['"]|[A-Za-z_$][\w$]*)\s*\)\s*[;,]?/g, "");
  r = r.replace(/var\s+_SG_TRACE\s*=\s*(?:true|false)\s*;\s*/g, "");
  r = r.replace(/var\s+_sgCP\s*=\s*[^;]*;\s*/g, "");
  r = r.replace(/;\s*;/g, ";");
  return r;
}
function createRng(seed) {
  let s = seed >>> 0 || 1;
  return function next() {
    s = s + 1831565813 >>> 0;
    let t = s;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function shortName(rng, minLen) {
  let n = "";
  const len = minLen + Math.floor(rng() * 4);
  for (let i = 0; i < len; i++) {
    n += NAME_ALPHABET[Math.floor(rng() * NAME_ALPHABET.length)];
  }
  return n;
}
function findIdentifiers(code) {
  const spans = [];
  let i = 0;
  const n = code.length;
  let prevSig = "";
  while (i < n) {
    const ch = code[i];
    if (ch === " " || ch === "	" || ch === "\n" || ch === "\r") {
      i++;
      continue;
    }
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
        if (code[i] === "\\") {
          i += 2;
          continue;
        }
        if (code[i] === q) {
          i++;
          break;
        }
        i++;
      }
      prevSig = "str";
      continue;
    }
    if (ch === "`") {
      i++;
      while (i < n) {
        if (code[i] === "\\") {
          i += 2;
          continue;
        }
        if (code[i] === "`") {
          i++;
          break;
        }
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
      const exprStart = prevSig === "" || "=([{,;:?!&|+-*%^~<>".indexOf(prevSig) >= 0 || prevSig === "return" || prevSig === "typeof" || prevSig === "new" || prevSig === "case" || prevSig === "delete" || prevSig === "void" || prevSig === "in" || prevSig === "of" || prevSig === "instanceof" || prevSig === "throw";
      if (exprStart) {
        i++;
        let inClass = false;
        while (i < n) {
          if (code[i] === "\\") {
            i += 2;
            continue;
          }
          if (code[i] === "[") inClass = true;
          else if (code[i] === "]") inClass = false;
          if (code[i] === "/" && !inClass) {
            i++;
            break;
          }
          i++;
        }
        while (i < n && /[a-z]/i.test(code[i])) i++;
        prevSig = "str";
        continue;
      }
      prevSig = "/";
      i++;
      continue;
    }
    if (/[A-Za-z_$]/.test(ch)) {
      const start = i;
      while (i < n && /[A-Za-z0-9_$]/.test(code[i])) i++;
      const value = code.slice(start, i);
      const isProp = prevSig === ".";
      const isKey = code[i] === ":" && (prevSig === "{" || prevSig === ",");
      const isKeyword = KEYWORDS.has(value);
      const isGlobal = GLOBALS.has(value);
      const isReserved = RESERVED_PREFIXES.some((p) => value.startsWith(p));
      if (!isProp && !isKeyword && !isGlobal && !isReserved && !isKey) {
        spans.push({ start, end: i, value });
      }
      prevSig = KEYWORDS.has(value) ? value : "id";
      continue;
    }
    if (/[0-9]/.test(ch)) {
      while (i < n && /[0-9a-zA-Z.]/.test(code[i])) i++;
      prevSig = "num";
      continue;
    }
    if (ch === ".") {
      prevSig = ".";
      i++;
      continue;
    }
    prevSig = ch;
    i++;
  }
  return spans;
}
function rotateIdentifiers(code, seed) {
  const spans = findIdentifiers(code);
  const rng = createRng(hashStr(seed));
  const map = /* @__PURE__ */ new Map();
  const used = /* @__PURE__ */ new Set();
  function nextName(orig) {
    const minLen = 2 + hashStr(orig) % 5;
    let name;
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
function isValidJavaScript(code) {
  try {
    new Function(code);
    return true;
  } catch {
    return false;
  }
}
function splitTopLevelStatements(code) {
  const stmts = [];
  let depth = 0;
  let cur = "";
  let i = 0;
  const n = code.length;
  while (i < n) {
    const ch = code[i];
    if (ch === "/" && code[i + 1] === "/") {
      while (i < n && code[i] !== "\n") {
        cur += code[i];
        i++;
      }
      continue;
    }
    if (ch === "/" && code[i + 1] === "*") {
      cur += "/*";
      i += 2;
      while (i < n && !(code[i] === "*" && code[i + 1] === "/")) {
        cur += code[i];
        i++;
      }
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
        if (code[i] === "\\") {
          i++;
          cur += code[i] ?? "";
          i++;
          continue;
        }
        if (code[i] === q) {
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    if (ch === "{" || ch === "(" || ch === "[") {
      depth++;
      cur += ch;
      i++;
      continue;
    }
    if (ch === "}" || ch === ")" || ch === "]") {
      depth--;
      cur += ch;
      i++;
      if (ch === "}" && depth === 0) {
        let j = i;
        while (j < n && (code[j] === " " || code[j] === "	" || code[j] === "\n" || code[j] === "\r")) j++;
        const nxt = code[j];
        const cont = /^(catch|else|finally|while)\b/.test(code.slice(j, j + 9));
        if (nxt !== void 0 && nxt !== ";" && nxt !== "}" && !cont && /[A-Za-z_$(]/.test(nxt)) {
          const trimmed2 = cur.trim();
          if (trimmed2) stmts.push(trimmed2);
          cur = "";
        }
      }
      continue;
    }
    if (ch === ";" && depth === 0) {
      const trimmed2 = cur.trim();
      if (trimmed2) stmts.push(trimmed2);
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
function isDeclarationStatement(stmt) {
  return /^(var|let|const|function)\b/.test(stmt.trim());
}
function deferExecution(code, seed, qName = "_q", iName = "_i") {
  const stmts = splitTopLevelStatements(code);
  if (stmts.length < 2) return code;
  const decls = [];
  const execs = [];
  for (const s of stmts) {
    if (isDeclarationStatement(s)) decls.push(s);
    else execs.push(s);
  }
  const rng = seededRng(seed);
  for (let i = decls.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = decls[i];
    decls[i] = decls[j] ?? "";
    decls[j] = t ?? "";
  }
  const order = execs.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = order[i];
    order[i] = order[j] ?? 0;
    order[j] = t ?? 0;
  }
  const lines = ["var " + qName + "=[];"];
  for (const d of decls) lines.push(d + ";");
  for (const o of order) {
    lines.push(qName + "[" + o + "]=function(){" + (execs[o] ?? "") + "};");
  }
  lines.push("for(var " + iName + "=0;" + iName + "<" + qName + ".length;" + iName + "++){" + qName + "[" + iName + "]&&" + qName + "[" + iName + "]()}");
  return lines.join("");
}
function hashAllProperties(code, dec, key) {
  let r = "";
  let i = 0;
  const n = code.length;
  while (i < n) {
    const ch = code[i];
    if (ch === "`") {
      const start = i;
      i++;
      while (i < n) {
        if (code[i] === "\\") {
          i += 2;
          continue;
        }
        if (code[i] === "`") {
          i++;
          break;
        }
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
        if (code[i] === "\\") {
          i += 2;
          continue;
        }
        if (code[i] === q) {
          i++;
          break;
        }
        i++;
      }
      r += code.slice(start, i);
      continue;
    }
    if (ch === "/" && isRegexStart(code, i)) {
      const start = i;
      i++;
      let inClass = false;
      while (i < n) {
        const c = code[i];
        if (c === "\\") {
          i += 2;
          continue;
        }
        if (c === "[") inClass = true;
        else if (c === "]") inClass = false;
        else if (c === "/" && !inClass) {
          i++;
          break;
        } else if (c === "\n") break;
        i++;
      }
      r += code.slice(start, i);
      continue;
    }
    if (ch === "." && i + 1 < n && /[A-Za-z_$]/.test(code[i + 1])) {
      const prev = code[i - 1] ?? "";
      if (/[0-9]/.test(prev) || prev === ".") {
        r += ch;
        i++;
        continue;
      }
      let j = i + 1;
      while (j < n && /[A-Za-z0-9_$]/.test(code[j])) j++;
      const prop = code.slice(i + 1, j);
      if (prop) {
        r += "[" + dec + '("' + xorEncrypt(prop, key) + '")]';
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
function navify(code, seed, dec = "_D", cacheName = "_Dx", navName = "nav") {
  const key = deriveKey(seed);
  const globalsToHide = [
    "fetch",
    "document",
    "setTimeout",
    "clearTimeout",
    "setInterval",
    "clearInterval",
    "location",
    "history",
    "JSON",
    "Object",
    "String",
    "Number",
    "Math",
    "Date",
    "encodeURIComponent",
    "decodeURIComponent",
    "TextEncoder",
    "Uint8Array",
    "navigator",
    "screen",
    "crypto",
    "performance",
    "console",
    "requestAnimationFrame",
    "cancelAnimationFrame",
    "Image",
    "FontFace",
    "Blob",
    "URL",
    "Worker",
    "XMLHttpRequest",
    "RTCPeerConnection",
    "EventSource",
    "MutationObserver",
    "OffscreenCanvas",
    "AudioContext",
    "webkitAudioContext",
    "btoa",
    "atob",
    "escape",
    "unescape",
    "parseInt",
    "parseFloat",
    "AbortSignal",
    "Promise",
    "Error",
    "RegExp",
    "window"
  ];
  let r = code;
  const nativeCalls = [
    "fetch",
    "setTimeout",
    "clearTimeout",
    "setInterval",
    "clearInterval",
    "requestAnimationFrame",
    "cancelAnimationFrame",
    "btoa",
    "atob",
    "escape",
    "unescape",
    "encodeURIComponent",
    "decodeURIComponent",
    "parseInt",
    "parseFloat"
  ];
  for (const g of nativeCalls) {
    const callRe = new RegExp("(?<![.$\\w])" + g + "(?=\\s*\\()", "g");
    r = r.replace(callRe, "(0," + navName + "[" + dec + '("' + xorEncrypt(g, key) + '")])');
  }
  for (const g of globalsToHide) {
    const re = new RegExp("(?<![.$\\w])" + g + "(?![\\w$])", "g");
    r = r.replace(re, navName + "[" + dec + '("' + xorEncrypt(g, key) + '")]');
  }
  r = hashAllProperties(r, dec, key);
  const seeds = globalsToHide.map((g) => "try{" + navName + "[" + dec + '("' + xorEncrypt(g, key) + '")]=' + g + "}catch(_nav_e){}").join("");
  const preamble = buildDecoderStmt(key, dec, cacheName) + "var " + navName + "={window:window};try{var _nav_i;for(_nav_i in window)" + navName + "[_nav_i]=window[_nav_i]}catch(_nav_e){};" + seeds + ";";
  const decoys = 1 + hashStr(seed + "decoy") % 3;
  const decoyLines = [];
  for (let d = 0; d < decoys; d++) {
    const v = "_" + shortName(createRng(hashStr(seed + "dv" + d)), 2);
    const n = 1 + hashStr(seed + "dn" + d) % 3;
    decoyLines.push("var " + v + "=" + n + ";");
  }
  const block = decoyLines.join("") + preamble;
  const stmts = splitTopLevelStatements(r);
  stmts.unshift(block);
  return stmts.join(";") + ";";
}
function applyBootObfuscation(code, seed) {
  let r = stripComments(code);
  r = stripTrace(r);
  r = rotateIdentifiers(r, seed);
  r = deferExecution(r, seed);
  const encKey = deriveKey(seed);
  const decName = "_" + shortName(createRng(hashStr(seed + "dec")), 2);
  const cacheName = "_" + shortName(createRng(hashStr(seed + "cache")), 2);
  const navName = "_" + shortName(createRng(hashStr(seed + "nav")), 2);
  r = encryptStrings(r, encKey, decName);
  r = navify(r, seed, decName, cacheName, navName);
  r = escapeClosingTags(r);
  r = fixComputedProperties(r, decName);
  if (!isValidJavaScript(r)) return code;
  return r;
}
function encodeInvisible(code) {
  let r = "";
  for (const ch of code) {
    const cp = ch.codePointAt(0);
    if (cp > 1114111 - INVISIBLE_EVAL_SHIFT) {
      throw new Error("applyInvisibleEval: cannot hide code point U+" + cp.toString(16).toUpperCase());
    }
    r += String.fromCodePoint(cp + INVISIBLE_EVAL_SHIFT);
  }
  return r;
}
function applyInvisibleEval(code, seed) {
  const enc = encodeInvisible(code);
  const rng = createRng(hashStr(seed));
  const arg = "_" + shortName(rng, 2);
  const fn = "_" + shortName(rng, 2);
  const shiftExpr = ["917504", "0xE0000", "0b11100000000000000000"][hashStr(seed + "::shift") % 3];
  const cbKind = hashStr(seed + "::cb") % 4;
  let cb;
  if (cbKind === 0) cb = "function(" + arg + "){return String.fromCodePoint(" + arg + ".codePointAt(0)-" + shiftExpr + ")}";
  else if (cbKind === 1) cb = "(" + arg + ")=>String.fromCodePoint(" + arg + ".codePointAt(0)-" + shiftExpr + ")";
  else if (cbKind === 2) cb = "function " + fn + "(" + arg + "){return String.fromCodePoint(" + arg + ".codePointAt(0)-" + shiftExpr + ")}";
  else cb = arg + "=>String.fromCodePoint(" + arg + ".codePointAt(0)-" + shiftExpr + ")";
  const encPoints = Array.from(enc);
  const nParts = Math.min(1 + hashStr(seed + "::parts") % 3, Math.max(1, encPoints.length));
  const parts = [];
  let idx = 0;
  for (let p = 0; p < nParts; p++) {
    const isLast = p === nParts - 1;
    let len;
    if (isLast) len = encPoints.length - idx;
    else {
      const max = encPoints.length - idx - (nParts - p - 1);
      len = 1 + hashStr(seed + "::part" + p) % Math.max(1, max);
    }
    parts.push(encPoints.slice(idx, idx + len).join(""));
    idx += len;
  }
  const literal = parts.map((p) => "'" + p + "'").join("+");
  const wrapper = "eval([...(" + literal + ")].map(" + cb + ').join(""))';
  if (!isValidJavaScript(wrapper)) return code;
  return wrapper;
}
function applyObfuscation(code, seed) {
  let r = stripComments(code);
  r = stripTrace(r);
  r = renameFunctions(r, seed);
  r = shuffleCode(r, seed);
  const encKey = deriveKey(seed);
  r = encryptStrings(r, encKey);
  r = injectDecoder(encKey) + r;
  r = escapeClosingTags(r);
  r = fixComputedProperties(r);
  return r;
}
function isValidJs(code) {
  return isValidJavaScript(code);
}
var RENAMES, KEYWORDS, GLOBALS, RESERVED_PREFIXES, NAME_ALPHABET, INVISIBLE_EVAL_SHIFT;
var init_obfuscate = __esm({
  "src/obfuscate.ts"() {
    "use strict";
    RENAMES = {
      buildOverlay: "_wf",
      checkNotice: "_wg",
      hex: "_wh",
      stable: "_wi"
    };
    KEYWORDS = /* @__PURE__ */ new Set([
      "break",
      "case",
      "catch",
      "class",
      "const",
      "continue",
      "debugger",
      "default",
      "delete",
      "do",
      "else",
      "enum",
      "export",
      "extends",
      "false",
      "finally",
      "for",
      "function",
      "if",
      "implements",
      "import",
      "in",
      "instanceof",
      "interface",
      "let",
      "new",
      "null",
      "package",
      "private",
      "protected",
      "public",
      "return",
      "static",
      "super",
      "switch",
      "this",
      "throw",
      "true",
      "try",
      "typeof",
      "var",
      "void",
      "while",
      "with",
      "yield",
      "await",
      "async",
      "of",
      "undefined"
    ]);
    GLOBALS = /* @__PURE__ */ new Set([
      "window",
      "document",
      "navigator",
      "screen",
      "location",
      "history",
      "performance",
      "console",
      "crypto",
      "Date",
      "Math",
      "JSON",
      "Array",
      "Object",
      "String",
      "Number",
      "Boolean",
      "Symbol",
      "Uint8Array",
      "Int8Array",
      "Uint16Array",
      "Int16Array",
      "Uint32Array",
      "Int32Array",
      "Float32Array",
      "Float64Array",
      "ArrayBuffer",
      "Blob",
      "Worker",
      "URL",
      "Image",
      "XMLHttpRequest",
      "RTCPeerConnection",
      "EventSource",
      "MutationObserver",
      "OffscreenCanvas",
      "AudioContext",
      "webkitAudioContext",
      "FontFace",
      "TextEncoder",
      "TextDecoder",
      "Screen",
      "Navigator",
      "setTimeout",
      "setInterval",
      "clearTimeout",
      "clearInterval",
      "setImmediate",
      "requestAnimationFrame",
      "cancelAnimationFrame",
      "requestIdleCallback",
      "parseInt",
      "parseFloat",
      "isNaN",
      "isFinite",
      "encodeURIComponent",
      "decodeURIComponent",
      "encodeURI",
      "decodeURI",
      "escape",
      "unescape",
      "btoa",
      "atob",
      "fetch",
      "AbortSignal",
      "Promise",
      "Error",
      "RegExp",
      "globalThis",
      "self",
      "top",
      "parent",
      "opener",
      "frames",
      "addEventListener",
      "removeEventListener",
      "dispatchEvent",
      "matchMedia",
      "getComputedStyle",
      "localStorage",
      "sessionStorage",
      "Intl",
      "DOMException",
      "Event",
      "CustomEvent",
      "encodeURIComponent",
      "Function",
      "Proxy",
      "Reflect"
    ]);
    RESERVED_PREFIXES = ["__sg", "sg_", "SG_"];
    NAME_ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_";
    INVISIBLE_EVAL_SHIFT = 917504;
  }
});

// src/security-utils.ts
import crypto2 from "crypto";
function safeChallengePath(path) {
  if (!path) return "/";
  if (path.charAt(0) !== "/" || path.charAt(1) === "/" || path.includes("\\")) return "/";
  for (const character of path) {
    const code = character.charCodeAt(0);
    if (code < 32 || code === 127) return "/";
  }
  return path;
}
function safeEqual(left, right) {
  if (left.length !== right.length) return false;
  return crypto2.timingSafeEqual(Buffer.from(left), Buffer.from(right));
}
function ipBucket(ip) {
  if (!ip || ip === "unknown") return "0";
  if (ip.includes(".")) {
    const match = ip.match(/^(\d+\.\d+\.\d+)(?:\.\d+)?$/);
    return match?.[1] ?? "0";
  }
  if (ip.includes(":")) return ip.split(":").filter(Boolean).slice(0, 4).join(".") || "0";
  return "0";
}
function uaFingerprint(userAgent) {
  return crypto2.createHash("sha256").update(userAgent).digest("hex").slice(0, 16);
}
var init_security_utils = __esm({
  "src/security-utils.ts"() {
    "use strict";
  }
});

// src/cookie-security.ts
import crypto3 from "crypto";
function createOkCookieValue(ip, userAgent, options) {
  const timestamp = Math.floor(Date.now() / 1e3);
  const bucket = ipBucket(ip);
  const fingerprint = uaFingerprint(userAgent);
  const signature = crypto3.createHmac("sha256", options.secret).update(`sg_ok:${timestamp}:${bucket}:${fingerprint}`).digest("hex");
  return `${timestamp}:${bucket}:${fingerprint}:${signature}`;
}
function isOkCookieValid(value, ip, userAgent, options) {
  if (!options.secret) return false;
  const [timestamp, bucket, fingerprint, signature] = value.split(":");
  if (!timestamp || !bucket || !fingerprint || !signature) return false;
  const parsedTimestamp = Number.parseInt(timestamp, 10);
  if (!Number.isFinite(parsedTimestamp) || Date.now() - parsedTimestamp * 1e3 > options.okTtlMs || parsedTimestamp * 1e3 > Date.now() + 6e4) return false;
  if (bucket !== ipBucket(ip) || fingerprint !== uaFingerprint(userAgent)) return false;
  const expected = crypto3.createHmac("sha256", options.secret).update(`sg_ok:${timestamp}:${bucket}:${fingerprint}`).digest("hex");
  return safeEqual(signature, expected);
}
function isAuthorizedCookieValid(value, options) {
  if (!options.secret) return false;
  const separator = value.indexOf(":");
  if (separator <= 0) return false;
  const timestamp = value.slice(0, separator);
  const signature = value.slice(separator + 1);
  const parsedTimestamp = Number.parseInt(timestamp, 10);
  if (!Number.isFinite(parsedTimestamp) || Date.now() - parsedTimestamp * 1e3 > options.authorizedTtlMs || parsedTimestamp * 1e3 > Date.now() + 6e4) return false;
  const expected = crypto3.createHmac("sha256", options.secret).update(`sg_authorized:${timestamp}`).digest("hex");
  return safeEqual(signature, expected);
}
function createMidAnchorValue(ip, userAgent, mid, options) {
  const timestamp = Math.floor(Date.now() / 1e3);
  const bucket = ipBucket(ip);
  const fingerprint = uaFingerprint(userAgent);
  const signature = crypto3.createHmac("sha256", options.secret).update(`sg_mid_anchor:${timestamp}:${bucket}:${fingerprint}:${mid}`).digest("hex");
  return `${timestamp}:${bucket}:${fingerprint}:${mid}:${signature}`;
}
function isMidAnchorValid(value, ip, userAgent, mid, options) {
  if (!options.secret) return false;
  const [timestamp, bucket, fingerprint, valueMid, signature] = value.split(":");
  if (!timestamp || !bucket || !fingerprint || !valueMid || !signature) return false;
  const parsedTimestamp = Number.parseInt(timestamp, 10);
  const ttlMs = options.anchorTtlMs ?? ANCHOR_TTL_MS_DEFAULT;
  if (!Number.isFinite(parsedTimestamp) || Date.now() - parsedTimestamp * 1e3 > ttlMs || parsedTimestamp * 1e3 > Date.now() + 6e4) return false;
  if (bucket !== ipBucket(ip) || fingerprint !== uaFingerprint(userAgent)) return false;
  if (valueMid !== mid) return false;
  const expected = crypto3.createHmac("sha256", options.secret).update(`sg_mid_anchor:${timestamp}:${bucket}:${fingerprint}:${valueMid}`).digest("hex");
  return safeEqual(signature, expected);
}
var ANCHOR_TTL_MS_DEFAULT;
var init_cookie_security = __esm({
  "src/cookie-security.ts"() {
    "use strict";
    init_security_utils();
    ANCHOR_TTL_MS_DEFAULT = 30 * 24 * 3600 * 1e3;
  }
});

// src/render.ts
var render_exports = {};
__export(render_exports, {
  __clearConfigCache: () => __clearConfigCache,
  enableDiskStore: () => enableDiskStore,
  ensureGuardsReady: () => ensureGuardsReady,
  fetchConfigForSiteKey: () => fetchConfigForSiteKey,
  fetchWhitelistForSiteKey: () => fetchWhitelistForSiteKey,
  generateSkeleton: () => generateSkeleton,
  getConfig: () => getConfig,
  handleRender: () => handleRender,
  injectGuardScripts: () => injectGuardScripts,
  injectReferrerPolicy: () => injectReferrerPolicy,
  renderResponseData: () => renderResponseData,
  signToken: () => signToken,
  storeHtml: () => storeHtml,
  verifyRenderGrant: () => verifyRenderGrant
});
import crypto4, { createHash } from "crypto";
import { writeFileSync, readFileSync, existsSync, unlinkSync, mkdirSync, readdirSync, chmodSync, statSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
function tokenFileName(token) {
  return createHash("sha256").update(token).digest("hex");
}
function startDiskCleanup() {
  if (_diskCleanupStarted) return;
  _diskCleanupStarted = true;
  setInterval(() => {
    try {
      for (const f of readdirSync(TOKEN_DIR)) {
        const p = join(TOKEN_DIR, f);
        try {
          if (Date.now() - statSync(p).mtimeMs > TOKEN_TTL) unlinkSync(p);
        } catch {
        }
      }
    } catch {
    }
  }, 3e4).unref();
}
function storeToDisk(token, html) {
  try {
    writeFileSync(join(TOKEN_DIR, tokenFileName(token)), html, { encoding: "utf-8", mode: 384 });
  } catch {
  }
}
function readFromDisk(token) {
  try {
    const p = join(TOKEN_DIR, tokenFileName(token));
    if (!existsSync(p)) return null;
    return readFileSync(p, "utf-8");
  } catch {
    return null;
  }
}
function dropEntry(token) {
  const e = _memoryStore.get(token);
  if (e) _totalBytes -= Buffer.byteLength(e.html, "utf-8");
  _memoryStore.delete(token);
}
function evictOldest() {
  const first = _memoryStore.keys().next();
  if (first.done) return;
  dropEntry(first.value);
}
function storeHtml(token, html, contentReplaceOn) {
  if (_diskEnabled) {
    storeToDisk(token, html);
  }
  dropEntry(token);
  const size = Buffer.byteLength(html, "utf-8");
  while ((_memoryStore.size >= MAX_ENTRIES || _totalBytes + size > MAX_TOTAL_BYTES) && _memoryStore.size > 0) {
    evictOldest();
  }
  const entry = { html, expiresAt: Date.now() + TOKEN_TTL, reads: 0 };
  if (contentReplaceOn !== void 0) entry.contentReplaceOn = contentReplaceOn;
  _memoryStore.set(token, entry);
  _totalBytes += size;
  const separator = token.indexOf(":");
  if (separator > 0) {
    const siteKey = token.slice(0, separator);
    _siteCache.delete(siteKey);
    _siteCache.set(siteKey, html);
    while (_siteCache.size > MAX_TENANTS) {
      const oldest = _siteCache.keys().next();
      if (oldest.done) break;
      _siteCache.delete(oldest.value);
    }
  }
}
function readFromMemory(token) {
  const entry = _memoryStore.get(token);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    dropEntry(token);
    return null;
  }
  entry.reads++;
  if (entry.reads > MAX_TOKEN_READS) {
    return entry.html;
  }
  return entry.html;
}
function verifyRenderGrant(mid, grant, token, _ip, expectedSiteKey) {
  const gSecret = process.env.SHUGOKI_SIGNING_SECRET || process.env.SHUGOKI_SECRET;
  if (!gSecret) return false;
  if (!grant || !mid || !/^[a-f0-9]{64}$/.test(mid)) return false;
  const sep = grant.indexOf(":");
  if (sep < 0) return false;
  const ts = grant.slice(0, sep);
  const sig = grant.slice(sep + 1);
  const tsSec = parseInt(ts, 36);
  const age = Date.now() - tsSec * 1e3;
  if (isNaN(tsSec) || age > GRANT_TTL_MS || age < -5e3) return false;
  if (!expectedSiteKey) return false;
  const payload = "render-grant:" + [expectedSiteKey, mid, token || "", ts].join(":");
  const exp = crypto4.createHmac("sha256", gSecret).update(payload).digest("hex");
  try {
    return crypto4.timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(exp, "hex"));
  } catch {
    return false;
  }
}
async function renderResponseData(token, locale, configUrl, mid, grant, ip, expectedSiteKey, _secret) {
  if (!token || token.length < 16 || token.length > 300) return { error: "not_found" };
  if (expectedSiteKey) {
    const tokSiteKey = token.split(":")[0];
    if (tokSiteKey !== expectedSiteKey) return { error: "not_found" };
  }
  const tokTs = parseInt(token.split(":")[1] || "", 10);
  if (!isNaN(tokTs) && Date.now() - tokTs > TOKEN_TTL) return { error: "not_found" };
  if (!verifyRenderGrant(mid, grant, token, ip, expectedSiteKey)) return { error: "not_found" };
  const contentReplaceOn = await fetchContentReplaceFlag(token, configUrl || "http://127.0.0.1:3098", _secret);
  const memHtml = readFromMemory(token);
  if (memHtml) {
    if (contentReplaceOn) {
      const entry = _memoryStore.get(token);
      if (entry && entry.reads > MAX_TOKEN_READS) {
        dropEntry(token);
        return { error: "not_found" };
      }
    }
    return { html: memHtml };
  }
  if (!contentReplaceOn) {
    const siteKey = token.split(":")[0] ?? "";
    const siteHtml = _siteCache.get(siteKey);
    if (siteHtml) return { html: siteHtml };
  }
  if (_diskEnabled) {
    const diskHtml = readFromDisk(token);
    if (diskHtml) return { html: diskHtml };
  }
  return verifyTokenAndRead(token, locale);
}
async function fetchContentReplaceFlag(token, internalUrl, _secret, retries = 2) {
  try {
    const siteKey = token.split(":")[0];
    if (!siteKey) return false;
    const { flags } = await getConfig(siteKey, internalUrl, _secret);
    return flags?.enableContentReplacementCheck === true;
  } catch {
    if (retries > 0) return fetchContentReplaceFlag(token, internalUrl, _secret, retries - 1);
    return false;
  }
}
function verifyTokenAndRead(token, _locale) {
  const parts = token.split(":");
  if (parts.length !== 4 || parts[3] === void 0 || parts[3].length !== 64) {
    return { error: "not_found" };
  }
  const [siteKey = "", timestamp = "", nonce = "", sig = ""] = parts;
  const ts = parseInt(timestamp, 10);
  if (isNaN(ts)) {
    return { error: "not_found" };
  }
  if (Date.now() - ts > TOKEN_TTL) {
    return { error: "not_found" };
  }
  const secret = process.env.SHUGOKI_SIGNING_SECRET || process.env.SHUGOKI_SECRET;
  if (secret) {
    const payload = [siteKey, timestamp, nonce].join(":");
    const expectedSig = crypto4.createHmac("sha256", secret).update(payload).digest("hex");
    if (!crypto4.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) {
      return { error: "not_found" };
    }
  }
  const fullTokenLookup = token;
  const memHtml = readFromMemory(fullTokenLookup);
  if (memHtml) return { html: memHtml };
  if (_diskEnabled) {
    const diskHtml = readFromDisk(fullTokenLookup);
    if (diskHtml) return { html: diskHtml };
  }
  if (secret) {
    return { error: "not_found" };
  }
  return { error: "not_found" };
}
function injectReferrerPolicy(html) {
  const meta = '<meta name="referrer" content="strict-origin-when-cross-origin">';
  if (html.includes("<head>")) return html.replace("<head>", "<head>" + meta);
  if (html.includes("<html")) {
    const m = html.match(/<html[^>]*>/);
    if (m) return html.replace(m[0], m[0] + meta);
  }
  return meta + html;
}
async function handleRender(token, res, configUrl, mid, grant, ip, expectedSiteKey, baseUrl, _secret, ua, midAnchor) {
  const data = await renderResponseData(token, void 0, configUrl, mid, grant, ip, expectedSiteKey, _secret);
  if (data.html && mid) data.html = injectNoticeScript(data.html, mid, expectedSiteKey || token.split(":")[0] || "", baseUrl);
  if (data.html) data.html = injectReferrerPolicy(data.html);
  const json = JSON.stringify(data);
  if (res.setHeader) res.setHeader("Content-Type", "application/json");
  if (res.setHeader) res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  if (res.setHeader) res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, no-transform");
  if (res.setHeader) res.setHeader("Pragma", "no-cache");
  if (data.html && res.setHeader) {
    const authSecret = process.env.SHUGOKI_SIGNING_SECRET || process.env.SHUGOKI_SECRET;
    if (authSecret) {
      const cookies = [];
      const ts = Math.floor(Date.now() / 1e3);
      const val = ts + ":" + crypto4.createHmac("sha256", authSecret).update("sg_authorized:" + ts).digest("hex");
      const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
      cookies.push("__sg_authorized=" + val + "; Path=/; HttpOnly; SameSite=Strict; Max-Age=120" + secure);
      if (mid) {
        const anchorOptions = { secret: authSecret, okTtlMs: 0, authorizedTtlMs: 0, anchorTtlMs: 30 * 24 * 3600 * 1e3 };
        const anchorOk = !!midAnchor && isMidAnchorValid(midAnchor, ip || "", ua || "", mid, anchorOptions);
        if (!anchorOk) {
          cookies.push("__sg_mid_anchor=" + createMidAnchorValue(ip || "", ua || "", mid, anchorOptions) + "; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000" + secure);
        }
      }
      const existing = res.getHeader ? res.getHeader("Set-Cookie") : void 0;
      if (existing !== void 0) {
        const current = Array.isArray(existing) ? existing : [existing];
        res.setHeader("Set-Cookie", [...current, ...cookies]);
      } else {
        res.setHeader("Set-Cookie", cookies);
      }
    }
  }
  if (res.send) res.send(json);
  else if (res.end) res.end(json);
}
function injectNoticeScript(html, mid, siteKey, baseUrl) {
  const baseVal = baseUrl || "";
  const inject = NOTICE_SCRIPT.replace("var mid=window.__sg_mid||'';", "var mid=" + JSON.stringify(mid) + "||'';").replace("var sk=window.__sg_siteKey||'';", "var sk=" + JSON.stringify(siteKey) + "||'';").replace("var base=window.__sg_baseUrl||'';", "var base=" + JSON.stringify(baseVal) + "||window.__sg_baseUrl||'';").replace("window.__sg_noticeEnabled", "window.__sg_noticeEnabled");
  if (html.includes("</body>")) return html.replace("</body>", inject + "</body>");
  return html + inject;
}
function signToken(siteKey, timestamp, secretOverride) {
  const secret = secretOverride || process.env.SHUGOKI_SIGNING_SECRET || process.env.SHUGOKI_SECRET;
  if (!secret) return { token: "" };
  const nonce = crypto4.randomBytes(8).toString("hex");
  const payload = [siteKey, timestamp, nonce].join(":");
  const sig = crypto4.createHmac("sha256", secret).update(payload).digest("hex");
  return { token: payload + ":" + sig };
}
function configKey(baseUrl, siteKey) {
  return baseUrl + "@" + siteKey;
}
function pruneCache(m) {
  if (m.size <= MAX_TENANTS) return;
  const sorted = [...m.entries()].sort((a, b) => a[1].fetchedAt - b[1].fetchedAt);
  for (let i = 0; i < sorted.length - MAX_TENANTS; i++) {
    const entry = sorted[i];
    if (entry) m.delete(entry[0]);
  }
}
async function refreshConfig(siteKey, baseUrl, entry, secret) {
  try {
    const cb = Date.now();
    const sig = secret ? crypto4.createHmac("sha256", secret).update(cb.toString()).digest("hex") : "";
    const res = await fetch(baseUrl + "/whitelist?key=" + encodeURIComponent(siteKey) + "&cb=" + cb + (sig ? "&sig=" + sig : ""), {
      signal: AbortSignal.timeout(CONFIG_FETCH_TIMEOUT)
    });
    if (res.ok) {
      const data = await res.json();
      entry.whitelist = data.whitelistedMachines || [];
      entry.flags = data.detectionFlags || data.flags || {};
      entry.skipPaths = data.skipPaths || [];
      entry.supportEmail = typeof data.supportEmail === "string" ? data.supportEmail : "";
    }
  } catch {
  }
  entry.fetchedAt = Date.now();
}
async function getConfig(siteKey, baseUrl, secret) {
  const key = configKey(baseUrl, siteKey);
  let entry = _configCache.get(key);
  if (!entry) {
    entry = { whitelist: [], flags: {}, skipPaths: [], supportEmail: "", fetchedAt: 0, inflight: null };
    _configCache.set(key, entry);
    pruneCache(_configCache);
  }
  const age = Date.now() - entry.fetchedAt;
  if (entry.fetchedAt === 0 || age > CONFIG_STALE_MAX) {
    if (!entry.inflight) {
      entry.inflight = refreshConfig(siteKey, baseUrl, entry, secret).finally(() => {
        entry.inflight = null;
      });
    }
    await entry.inflight;
    return { whitelist: entry.whitelist, flags: entry.flags, skipPaths: entry.skipPaths, supportEmail: entry.supportEmail };
  }
  if (age > CONFIG_CACHE_TTL && !entry.inflight) {
    entry.inflight = refreshConfig(siteKey, baseUrl, entry, secret).finally(() => {
      entry.inflight = null;
    });
    entry.inflight.catch(() => {
    });
  }
  return { whitelist: entry.whitelist, flags: entry.flags, skipPaths: entry.skipPaths, supportEmail: entry.supportEmail };
}
async function fetchWhitelistForSiteKey(siteKey, baseUrl) {
  return (await getConfig(siteKey, baseUrl)).whitelist;
}
async function fetchConfigForSiteKey(siteKey, baseUrl, secret) {
  return (await getConfig(siteKey, baseUrl, secret)).flags;
}
function __clearConfigCache() {
  _configCache.clear();
}
function cacheKey(baseUrl, siteKey) {
  return `${baseUrl}::${siteKey}`;
}
function getCacheEntry(baseUrl, siteKey) {
  const key = cacheKey(baseUrl, siteKey);
  if (!_guardCaches.has(key)) {
    _guardCaches.set(key, { detect: null, guard: null, fetching: false, queue: [], fetchedAt: 0 });
    pruneCache(_guardCaches);
  }
  return _guardCaches.get(key);
}
async function fetchGuardScripts(baseUrl, secret, siteKey) {
  const sk = siteKey || "cache";
  const cache = getCacheEntry(baseUrl, sk);
  if (cache.fetching) return new Promise((resolve) => {
    cache.queue.push(resolve);
  });
  cache.fetching = true;
  try {
    const cb = Date.now();
    const sig = secret ? crypto4.createHmac("sha256", secret).update(cb.toString()).digest("hex") : "";
    const [dRes, gRes] = await Promise.all([
      fetch(baseUrl + "/guard-detect?key=" + sk + "&raw=1&cb=" + cb + (sig ? "&sig=" + sig : ""), { signal: AbortSignal.timeout(5e3) }),
      fetch(baseUrl + "/guard?key=" + sk + "&raw=1&cb=" + cb + (sig ? "&sig=" + sig : ""), { signal: AbortSignal.timeout(5e3) })
    ]);
    if (dRes.ok && gRes.ok) {
      const rawDetect = await dRes.text();
      const rawGuard = await gRes.text();
      cache.detect = rawDetect;
      cache.guard = rawGuard;
      cache.fetchedAt = Date.now();
    }
  } catch {
    cache.detect = cache.detect || 'console.error("Shugoi guard-detect unavailable")';
    cache.guard = cache.guard || 'console.error("Shugoi guard unavailable")';
  }
  cache.fetching = false;
  cache.queue.forEach((r) => r());
  cache.queue = [];
}
function startGuardPoller(baseUrl, secret, siteKey) {
  const key = cacheKey(baseUrl, siteKey || "cache");
  if (_guardPollers.has(key)) return;
  const timer = setInterval(() => {
    const cache = _guardCaches.get(key);
    if (!cache) {
      clearInterval(timer);
      _guardPollers.delete(key);
      return;
    }
    const prev = { detect: cache.detect, guard: cache.guard };
    fetchGuardScripts(baseUrl, secret, siteKey).then(() => {
      const next = _guardCaches.get(key);
      if (next && (next.detect !== prev.detect || next.guard !== prev.guard)) {
      }
    }).catch(() => {
    });
  }, GUARD_POLL_MS);
  if (typeof timer.unref === "function") timer.unref();
  _guardPollers.set(key, timer);
}
async function ensureGuardsReady(baseUrl, secret, siteKey) {
  const cache = getCacheEntry(baseUrl, siteKey || "cache");
  if (!cache.detect || !cache.guard) {
    await fetchGuardScripts(baseUrl, secret, siteKey);
  }
  startGuardPoller(baseUrl, secret, siteKey);
}
async function generateSkeleton(siteKey, token, baseUrl, restrictedAccess, _whitelist, renderUrl, locale, flags, clockts, signingSecret, supportEmail, midAnchorOk) {
  await ensureGuardsReady(baseUrl, void 0, siteKey);
  const rurl = renderUrl || "./__shugoi/render";
  const fetched = flags ? null : await getConfig(siteKey, baseUrl, signingSecret);
  const cfg = flags ?? fetched.flags;
  const mail = supportEmail ?? fetched?.supportEmail ?? "";
  const loc = locale || "en";
  const msgs = MESSAGES[loc];
  const cache = getCacheEntry(baseUrl, siteKey);
  const fragments = [];
  fragments.push("window.__sg_siteKey=" + JSON.stringify(siteKey));
  fragments.push("window.__sg_baseUrl=" + JSON.stringify(baseUrl));
  fragments.push("window.__sg_config=" + JSON.stringify(cfg));
  if (mail) fragments.push("window.__sg_supportEmail=" + JSON.stringify(mail));
  fragments.push("window.__sg_diagEnabled=" + (process.env.NODE_ENV === "production" ? "false" : "true"));
  fragments.push("try{if((location.search||'').indexOf('sg_proof=')>=0){var _qs=location.search.replace(/[?&]sg_proof=[^&]*/,'');var _cu=location.pathname+(_qs?_qs:'')+location.hash;history.replaceState(null,'',_cu)}}catch(e){}");
  const _powTs = Math.floor(Date.now() / 1e3);
  const _powSecret = process.env.SHUGOKI_SIGNING_SECRET || process.env.SHUGOKI_SECRET || "";
  const _powNonce = typeof crypto4.randomBytes === "function" ? crypto4.randomBytes(8).toString("hex") : String(Math.floor(Math.random() * 4294967295)).padStart(8, "0") + String(Math.floor(Math.random() * 4294967295)).padStart(8, "0");
  const _powSalt = _powSecret ? crypto4.createHmac("sha256", _powSecret).update(_powTs + ":" + _powNonce).digest("hex") : "";
  const _powDiff = (() => {
    const raw = Number(process.env.SHUGOKI_POW_DIFF || "14");
    const base = Number.isInteger(raw) && raw >= 8 && raw <= 24 ? raw : 12;
    return midAnchorOk === false ? Math.min(base + 2, 24) : base;
  })();
  fragments.push("window.__sg_pow=" + JSON.stringify({ ts: _powTs, nonce: _powNonce, salt: _powSalt, difficulty: _powDiff }));
  const _ntpDrift = runtimeGlobal.__sg_ntpDrift || 0;
  const _ntpTime = runtimeGlobal.__sg_ntpTime || Date.now() - _ntpDrift;
  const _clockts = clockts || _ntpTime;
  fragments.push("window.__sg_ntp=" + _ntpTime);
  fragments.push("window.__sg_serverTime=" + _clockts);
  fragments.push("window.__sg_clockts=" + _clockts);
  if (!restrictedAccess) fragments.push("window.__sg_disableRestrictedAccess=true");
  if (cache.detect) fragments.push("try{" + cache.detect + "}catch(e){window.__sg_blocked=true}");
  const jsStr = (s) => JSON.stringify(s).slice(1, -1).replace(/</g, "\\x3c");
  const devtoolsMsg = jsStr(msgs.devtoolsBody);
  const tamperTitle = jsStr(msgs.tamperTitle);
  const fbBadge = jsStr(msgs.blockedBadge);
  const fbTitle = jsStr(msgs.blockedTitle);
  fragments.push('window.__sg_showBlock=function(msg,title,badge){var h="<head><meta charset=UTF-8><meta name=viewport content=width=device-width,initial-scale=1><style>@font-face{font-family:\\x27Alex Brush\\x27;src:url(https://shugoi.com/alex-brush.woff2?v=2) format(\\x27woff2\\x27);font-display:swap}*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}html,body{height:100%;background:#fcf9f5}body{font-family:system-ui,-apple-system,\\\\x27Segoe UI\\\\x27,Roboto,sans-serif;display:flex;align-items:center;justify-content:center;padding:1.2rem}#c{max-width:460px;width:100%;background:#fff;border:4px solid #000;border-radius:28px 6px 32px 10px;box-shadow:12px 12px 0 #000;padding:3rem 2.4rem 2.8rem;text-align:center}#c .l{width:80px;height:80px;pointer-events:none;transform:rotate(-2.5deg);margin:0 auto .6rem;display:block}#c .b{display:block;margin:0 auto .2rem;pointer-events:none;max-width:100%;height:auto}#c .bdg{display:inline-block;border:2px solid #000;border-radius:10px 2px 14px 4px;padding:.3rem .9rem;font-size:.6rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#E87090;margin-bottom:1.4rem}#c h2{font-family:\\x27Alex Brush\\x27,Georgia,\\\\x27Times New Roman\\\\x27,serif;font-size:2.2rem;color:#E87090;font-weight:400;margin:0 auto .6rem}#c p.desc{font-size:.9rem;color:#555;line-height:1.8;max-width:380px;margin:0 auto}#c p.ft{font-size:.55rem;color:#E87090;margin-top:1.8rem}@media (prefers-color-scheme:dark){html,body{background:#16101c}#c{background:#241a30;border-color:rgba(241,232,245,.14);box-shadow:0 10px 30px rgba(0,0,0,.4)}#c .bdg{background:rgba(233,137,159,.16);border-color:rgba(233,137,159,.5);color:#e9899f}#c h2{color:#e9899f}#c p.desc{color:#a795b4}#c p.ft{color:#e9899f}}</style></head><body><div id=c><img src=https://shugoi.com/favicon-block.png class=l><img src=https://shugoi.com/brand-block.png class=b><div class=bdg>"+(badge||"' + fbBadge + '")+"</div><h2>"+(title||"' + fbTitle + '")+"</h2><p class=desc>"+(msg||"")+"</p><p class=ft>"+location.hostname+" \\u00b7 Shugoi</p></div></body>";document.documentElement.innerHTML=h}');
  fragments.push("var t=" + JSON.stringify(token));
  fragments.push("window.__sg_token=" + JSON.stringify(token));
  fragments.push("var k=" + JSON.stringify(siteKey));
  fragments.push("var b=" + JSON.stringify(baseUrl));
  fragments.push("var r=" + JSON.stringify(rurl));
  fragments.push('var _gw=function(cb){if(window.__sg_guardsReady||window.__sg_blocked)cb();else setTimeout(function(){_gw(cb)},100)};function rd(p,n){if(window.__sg_blocked)return;if(!document.body)return setTimeout(function(){rd(p,n)},50);if(n>6){if((window.__sg_config||{}).enableContentReplacementCheck===true)window.__sg_showBlock&&window.__sg_showBlock("' + devtoolsMsg + '","' + tamperTitle + '");return}var _g=(window.__sg_grant||"");if(_g){p=p+("&grant="+encodeURIComponent(_g))}var _m=(window.__sg_detectMid||window.__sg_mid||"");if(_m){p=p+("&mid="+encodeURIComponent(_m))}fetch(p).then(function(x){return x.json()}).then(function(d){if(window.__sg_blocked)return;if(!document.body)return setTimeout(function(){rd(p,n+1)},50);if(d.html){document.open("text/html");document.write(d.html);document.close();window.scrollTo(0,0)}if(d.blocked){window.__sg_showBlock&&window.__sg_showBlock(d.message,d.title)}if(d.error){if((window.__sg_config||{}).enableContentReplacementCheck===true)window.__sg_showBlock&&window.__sg_showBlock("' + devtoolsMsg + '","' + tamperTitle + '")}else if(!d.html&&!d.blocked){setTimeout(function(){rd(p,n+1)},300)}}).catch(function(){setTimeout(function(){rd(p,n+1)},300)})}');
  fragments.push('function _sgCl(){try{for(var _i in window){if(_i.indexOf("__sg")===0){window[_i]=null;delete window[_i]}}window._sgLogCP=function(){};window.midHex=function(){};window.rd=function(){};window._gw=function(){};window.applyDecision=function(){};window._D=function(){};window.z=function(f){return f()}}catch(_e){}}_gw(function(){rd(r+"?token="+t,0);setTimeout(_sgCl,1500)})');
  const rawBootCode = fragments.join(";");
  const variantSeed = createHash("sha256").update(`${siteKey}:${token}`).digest("hex");
  const bootCode = (process.env.NODE_ENV === "production" && cfg.enableDevtoolsCheck !== false ? applyInvisibleEval(applyBootObfuscation(rawBootCode, variantSeed), variantSeed + "::e0") : rawBootCode).replace(/<\/(script|style)/gi, "<\\/$1");
  return "<script>" + bootCode + "</script>";
}
async function injectGuardScripts(html, siteKey, baseUrl, whitelist, restrictedAccess, signingSecret, _req, _allowedOrigins, locale, clockts, midAnchorOk) {
  await ensureGuardsReady(baseUrl, signingSecret, siteKey);
  const cfgData = await getConfig(siteKey, baseUrl, signingSecret);
  const wl = whitelist ?? cfgData.whitelist;
  const ts = Date.now();
  const signed = signToken(siteKey, ts, signingSecret);
  const configVars = [];
  if (!restrictedAccess) configVars.push("window.__sg_disableRestrictedAccess=true");
  const configScript = configVars.length ? "<script>" + configVars.join(";") + "</script>" : "";
  let injectedHtml = html;
  const headClose = injectedHtml.indexOf("</head>");
  if (headClose >= 0) injectedHtml = injectedHtml.slice(0, headClose) + configScript + injectedHtml.slice(headClose);
  else if (injectedHtml.includes("<body")) {
    const bm = injectedHtml.match(/<body[^>]*>/);
    if (bm) {
      const at = injectedHtml.indexOf(bm[0]) + bm[0].length;
      injectedHtml = injectedHtml.slice(0, at) + configScript + injectedHtml.slice(at);
    }
  } else injectedHtml = configScript + injectedHtml;
  const renderUrl = "./__shugoi/render";
  storeHtml(signed.token, injectedHtml);
  return generateSkeleton(siteKey, signed.token, baseUrl, restrictedAccess, wl, renderUrl, locale, cfgData.flags, clockts, signingSecret, cfgData.supportEmail, midAnchorOk);
}
function enableDiskStore(multiProcess) {
  _diskEnabled = multiProcess;
  if (multiProcess) startDiskCleanup();
}
var runtimeGlobal, TOKEN_DIR, TOKEN_TTL, MAX_ENTRIES, MAX_TOTAL_BYTES, MAX_TOKEN_READS, _memoryStore, _siteCache, _diskEnabled, _totalBytes, _diskCleanupStarted, GRANT_TTL_MS, NOTICE_SCRIPT, CONFIG_CACHE_TTL, CONFIG_STALE_MAX, CONFIG_FETCH_TIMEOUT, MAX_TENANTS, _configCache, GUARD_POLL_MS, _guardCaches, _guardPollers;
var init_render = __esm({
  "src/render.ts"() {
    "use strict";
    init_locales();
    init_obfuscate();
    init_cookie_security();
    runtimeGlobal = globalThis;
    TOKEN_DIR = join(tmpdir(), "shugoi-render-" + (process.getuid?.() ?? "x"));
    TOKEN_TTL = 12e4;
    MAX_ENTRIES = 5e3;
    MAX_TOTAL_BYTES = 64 * 1024 * 1024;
    MAX_TOKEN_READS = 1;
    _memoryStore = /* @__PURE__ */ new Map();
    _siteCache = /* @__PURE__ */ new Map();
    _diskEnabled = false;
    _totalBytes = 0;
    _diskCleanupStarted = false;
    if (!existsSync(TOKEN_DIR)) {
      try {
        mkdirSync(TOKEN_DIR, { recursive: true, mode: 448 });
      } catch {
      }
    }
    try {
      chmodSync(TOKEN_DIR, 448);
    } catch {
    }
    GRANT_TTL_MS = 6e4;
    NOTICE_SCRIPT = `
<script>
(function(){
  var mid=window.__sg_mid||'';
  var sk=window.__sg_siteKey||'';
  if(!mid||!sk||window.__sg_noticeEnabled===false)return;
  var base=window.__sg_baseUrl||'';
  var origin=base.replace(/\\/api\\/v1\\/?$/,'');
  var _OVERLAY_DESK='position:fixed!important;inset:0!important;z-index:2147483647!important;background:rgba(0,0,0,.6)!important;display:flex!important;align-items:center!important;justify-content:center!important;padding:1.2rem!important;pointer-events:auto!important';
  var _OVERLAY_MOB='position:fixed!important;inset:0!important;z-index:2147483647!important;background:rgba(0,0,0,.6)!important;display:flex!important;align-items:center!important;justify-content:center!important;padding:.6rem!important;pointer-events:auto!important';
  var _CARD_DESK='background:#fffdfa!important;border:1px solid rgba(43,33,29,.16)!important;border-radius:16px 5px 16px 5px!important;box-shadow:0 10px 30px rgba(43,33,29,.08)!important;padding:2.8rem 2.4rem 2.6rem!important;max-width:460px!important;width:100%!important;text-align:center!important;font-family:system-ui,-apple-system,Arial,sans-serif!important';
  var _CARD_MOB='background:#fffdfa!important;border:1px solid rgba(43,33,29,.16)!important;border-radius:14px 4px 14px 4px!important;box-shadow:0 10px 30px rgba(43,33,29,.08)!important;padding:2rem 1.3rem 2.2rem!important;max-width:340px!important;width:100%!important;text-align:center!important;font-family:system-ui,-apple-system,Arial,sans-serif!important';
  var _CARD_DESK_DARK='background:#241a30!important;border:1px solid rgba(241,232,245,.14)!important;border-radius:16px 5px 16px 5px!important;box-shadow:0 10px 30px rgba(0,0,0,.4)!important;padding:2.8rem 2.4rem 2.6rem!important;max-width:460px!important;width:100%!important;text-align:center!important;font-family:system-ui,-apple-system,Arial,sans-serif!important';
  var _CARD_MOB_DARK='background:#241a30!important;border:1px solid rgba(241,232,245,.14)!important;border-radius:14px 4px 14px 4px!important;box-shadow:0 10px 30px rgba(0,0,0,.4)!important;padding:2rem 1.3rem 2.2rem!important;max-width:340px!important;width:100%!important;text-align:center!important;font-family:system-ui,-apple-system,Arial,sans-serif!important';
  var _MOBILE=false;
  function _isMobile(){try{return window.matchMedia&&window.matchMedia('(max-width:640px)').matches}catch(e){return false}}
  _MOBILE=_isMobile();
  var _DARK=false;
  function _isDark(){try{return window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches}catch(e){return false}}
  _DARK=_isDark();
  function _OV(){return _MOBILE?_OVERLAY_MOB:_OVERLAY_DESK}
  function _CC(){return _DARK?(_MOBILE?_CARD_MOB_DARK:_CARD_DESK_DARK):(_MOBILE?_CARD_MOB:_CARD_DESK)}
  function _CH(){return _DARK?(_MOBILE?_CARD_HTML_MOB_DARK:_CARD_HTML_DESK_DARK):(_MOBILE?_CARD_HTML_MOB:_CARD_HTML_DESK)}
  var _CARD_HTML_DESK='<img src="'+origin+'/favicon-block.png" alt="" style="width:80px;height:80px;pointer-events:none;transform:rotate(-2.5deg);filter:drop-shadow(2px 4px 8px rgba(231,112,144,.55));margin:0 auto .6rem;display:block"><img src="'+origin+'/brand-block.png" alt="Shugoi" style="display:block;margin:0 auto .4rem;pointer-events:none;max-width:100%;height:auto"><div style="display:inline-block;background:#fdf0f4;border:1px solid rgba(194,84,111,.35);border-radius:10px 4px 10px 4px;padding:.3rem .9rem;font-size:.6rem;font-weight:600;text-transform:uppercase;letter-spacing:.16em;color:#c2546f;margin-bottom:1.4rem">Protection anti-abus</div><p style="font-size:.9rem;color:#7a6a62;line-height:1.8;max-width:380px;margin:0 auto .9rem">Ce site utilise Shugoi pour se prot\\u00e9ger contre les abus et la fraude. Des caract\\u00e9ristiques techniques de votre navigateur sont analys\\u00e9es pour d\\u00e9tecter les scripts automatis\\u00e9s, Tor, les VPN et les environnements virtuels. Aucune donn\\u00e9e personnelle n\\'est collect\\u00e9e.</p><button id="__sg_ok" style="background:#E87090;color:#fff;border:1px solid #c2546f;border-radius:10px 4px 10px 4px;padding:.55rem 3rem;font-size:.8rem;font-weight:600;cursor:pointer;font-family:inherit">OK</button><p style="font-size:.55rem;color:#c2546f;margin-top:1.5rem"><a href="'+origin+'/legal/shugoi-notice" target="_blank" style="color:#c2546f;text-decoration:underline">En savoir plus \\u00b7 shugoi.com</a></p>';
  var _CARD_HTML_MOB='<img src="'+origin+'/favicon-block.png" alt="" style="width:62px;height:62px;pointer-events:none;transform:rotate(-2.5deg);filter:drop-shadow(2px 4px 8px rgba(231,112,144,.55));margin:0 auto .6rem;display:block"><img src="'+origin+'/brand-block.png" alt="Shugoi" style="display:block;margin:0 auto .4rem;pointer-events:none;max-width:100%;height:auto"><div style="display:inline-block;background:#fdf0f4;border:1px solid rgba(194,84,111,.35);border-radius:10px 4px 10px 4px;padding:.3rem .9rem;font-size:.55rem;font-weight:600;text-transform:uppercase;letter-spacing:.16em;color:#c2546f;margin-bottom:1.1rem">Protection anti-abus</div><p style="font-size:.85rem;color:#7a6a62;line-height:1.75;max-width:340px;margin:0 auto .8rem">Ce site utilise Shugoi pour se prot\\u00e9ger contre les abus et la fraude. Des caract\\u00e9ristiques techniques de votre navigateur sont analys\\u00e9es pour d\\u00e9tecter les scripts automatis\\u00e9s, Tor, les VPN et les environnements virtuels. Aucune donn\\u00e9e personnelle n\\'est collect\\u00e9e.</p><button id="__sg_ok" style="background:#E87090;color:#fff;border:1px solid #c2546f;border-radius:10px 4px 10px 4px;padding:.5rem 2.4rem;font-size:.8rem;font-weight:600;cursor:pointer;font-family:inherit">OK</button><p style="font-size:.55rem;color:#c2546f;margin-top:1.3rem"><a href="'+origin+'/legal/shugoi-notice" target="_blank" style="color:#c2546f;text-decoration:underline">En savoir plus \\u00b7 shugoi.com</a></p>';
  var _CARD_HTML_DESK_DARK='<img src="'+origin+'/favicon-block.png" alt="" style="width:80px;height:80px;pointer-events:none;transform:rotate(-2.5deg);filter:drop-shadow(2px 4px 8px rgba(231,112,144,.55));margin:0 auto .6rem;display:block"><img src="'+origin+'/brand-block.png" alt="Shugoi" style="display:block;margin:0 auto .4rem;pointer-events:none;max-width:100%;height:auto"><div style="display:inline-block;background:rgba(233,137,159,.16);border:1px solid rgba(233,137,159,.5);border-radius:10px 4px 10px 4px;padding:.3rem .9rem;font-size:.6rem;font-weight:600;text-transform:uppercase;letter-spacing:.16em;color:#e9899f;margin-bottom:1.4rem">Protection anti-abus</div><p style="font-size:.9rem;color:#a795b4;line-height:1.8;max-width:380px;margin:0 auto .9rem">Ce site utilise Shugoi pour se prot\\u00e9ger contre les abus et la fraude. Des caract\\u00e9ristiques techniques de votre navigateur sont analys\\u00e9es pour d\\u00e9tecter les scripts automatis\\u00e9s, Tor, les VPN et les environnements virtuels. Aucune donn\\u00e9e personnelle n\\'est collect\\u00e9e.</p><button id="__sg_ok" style="background:#E87090;color:#fff;border:1px solid #c2546f;border-radius:10px 4px 10px 4px;padding:.55rem 3rem;font-size:.8rem;font-weight:600;cursor:pointer;font-family:inherit">OK</button><p style="font-size:.55rem;color:#e9899f;margin-top:1.5rem"><a href="'+origin+'/legal/shugoi-notice" target="_blank" style="color:#e9899f;text-decoration:underline">En savoir plus \\u00b7 shugoi.com</a></p>';
  var _CARD_HTML_MOB_DARK='<img src="'+origin+'/favicon-block.png" alt="" style="width:62px;height:62px;pointer-events:none;transform:rotate(-2.5deg);filter:drop-shadow(2px 4px 8px rgba(231,112,144,.55));margin:0 auto .6rem;display:block"><img src="'+origin+'/brand-block.png" alt="Shugoi" style="display:block;margin:0 auto .4rem;pointer-events:none;max-width:100%;height:auto"><div style="display:inline-block;background:rgba(233,137,159,.16);border:1px solid rgba(233,137,159,.5);border-radius:10px 4px 10px 4px;padding:.3rem .9rem;font-size:.55rem;font-weight:600;text-transform:uppercase;letter-spacing:.16em;color:#e9899f;margin-bottom:1.1rem">Protection anti-abus</div><p style="font-size:.85rem;color:#a795b4;line-height:1.75;max-width:340px;margin:0 auto .8rem">Ce site utilise Shugoi pour se prot\\u00e9ger contre les abus et la fraude. Des caract\\u00e9ristiques techniques de votre navigateur sont analys\\u00e9es pour d\\u00e9tecter les scripts automatis\\u00e9s, Tor, les VPN et les environnements virtuels. Aucune donn\\u00e9e personnelle n\\'est collect\\u00e9e.</p><button id="__sg_ok" style="background:#E87090;color:#fff;border:1px solid #c2546f;border-radius:10px 4px 10px 4px;padding:.5rem 2.4rem;font-size:.8rem;font-weight:600;cursor:pointer;font-family:inherit">OK</button><p style="font-size:.55rem;color:#e9899f;margin-top:1.3rem"><a href="'+origin+'/legal/shugoi-notice" target="_blank" style="color:#e9899f;text-decoration:underline">En savoir plus \\u00b7 shugoi.com</a></p>';
  var _closed=false;
  var mo=null;
  var _applying=false;
  function ack(){try{fetch(base+'/notice',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({machineId:mid,siteKey:sk}),keepalive:true,signal:AbortSignal.timeout(4000)}).catch(function(){})}catch(e){}}
  function buildOverlay(){
    var o=document.createElement('div');o.id='__sg_o';o.style.cssText=_OV();
    var c=document.createElement('div');c.id='__sg_cd';c.style.cssText=_CC();
    c.innerHTML=_CH();
    o.appendChild(c);return o;
  }
  function close(){_closed=true;try{if(mo)mo.disconnect()}catch(e){}var el=document.getElementById('__sg_o');if(el&&el.parentNode)el.parentNode.removeChild(el);document.body.style.overflow='';document.documentElement.style.overflow='';}
  function okHandler(){ack();close();}
  function rebind(){var b=document.getElementById('__sg_ok');if(b)b.onclick=okHandler;}
  function enforce(){
    if(_closed||_applying)return;
    _applying=true;
    try{
      var o=document.getElementById('__sg_o');
      if(!o){o=buildOverlay();document.documentElement.appendChild(o);}
      if(o.style.cssText!==_OV())o.style.cssText=_OV();
      var c=document.getElementById('__sg_cd');
      if(!c){o.innerHTML='';o.appendChild(buildOverlay().firstChild);}
      else{
        if(c.style.cssText!==_CC())c.style.cssText=_CC();
        if(c.innerHTML!==_CH())c.innerHTML=_CH();
      }
      rebind();
      if(document.body.style.overflow!=='hidden')document.body.style.overflow='hidden';
      if(document.documentElement.style.overflow!=='hidden')document.documentElement.style.overflow='hidden';
      try{
        if(o&&!o.__sgObserved){o.__sgObserved=true;mo&&mo.observe(o,{childList:true,subtree:true,attributes:true,characterData:true,attributeFilter:['style','class','id']});}
      }catch(e){}
    }finally{
      _applying=false;
      try{if(mo)mo.takeRecords();}catch(e){}
    }
  }
  function show(){
    _closed=false;
    var o=buildOverlay();document.documentElement.appendChild(o);
    document.body.style.overflow='hidden';document.documentElement.style.overflow='hidden';
    rebind();
    try{
      mo=new MutationObserver(function(){enforce();});
      mo.observe(document.documentElement,{childList:true});
      try{o.__sgObserved=true;mo.observe(o,{childList:true,subtree:true,attributes:true,characterData:true,attributeFilter:['style','class','id']});}catch(e){}
    }catch(e){}
  }
  try{window.addEventListener('resize',function(){var _m=_isMobile();if(_m!==_MOBILE){_MOBILE=_m;enforce();}},{passive:true})}catch(e){}
  function init(){if(document.body)show();else if(document.addEventListener)document.addEventListener('DOMContentLoaded',show);else setTimeout(init,50)}
  fetch(base+'/notice?machineId='+encodeURIComponent(mid)+'&siteKey='+encodeURIComponent(sk),{signal:AbortSignal.timeout(4000)}).then(function(r){return r.json()}).then(function(d){if(!d.acknowledged)init()}).catch(function(){init()});
})();
</script>`;
    CONFIG_CACHE_TTL = 3e4;
    CONFIG_STALE_MAX = 6e5;
    CONFIG_FETCH_TIMEOUT = 2e3;
    MAX_TENANTS = 500;
    _configCache = /* @__PURE__ */ new Map();
    GUARD_POLL_MS = (() => {
      const raw = Number(process.env.SHUGOKI_GUARD_POLL_MS || "");
      return Number.isFinite(raw) && raw >= 1e3 ? raw : 3e4;
    })();
    _guardCaches = /* @__PURE__ */ new Map();
    _guardPollers = /* @__PURE__ */ new Map();
  }
});

// src/errors.ts
var ShugoiError = class extends Error {
  constructor(code, message, cause) {
    super(message);
    this.code = code;
    this.cause = cause;
    this.name = "ShugoiError";
  }
  code;
  cause;
};

// src/index.ts
init_render();

// src/middleware.ts
init_render();

// src/csp.ts
function originOf(baseUrl) {
  if (!baseUrl) return null;
  try {
    const u = new URL(baseUrl);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.protocol + "//" + u.host;
  } catch {
    return null;
  }
}
var SHUGOI_ORIGIN = "https://shugoi.com";
function baseDirectives(apiOrigin) {
  const api = [...new Set([SHUGOI_ORIGIN, apiOrigin].filter(Boolean))];
  return {
    "default-src": ["'self'"],
    "script-src": ["'self'", "'unsafe-inline'", ...api],
    "worker-src": ["'self'", "blob:", ...api],
    "connect-src": ["'self'", ...api],
    "style-src": ["'self'", "'unsafe-inline'", ...api],
    "font-src": ["'self'", ...api, "data:"],
    "img-src": ["'self'", ...api, "data:", "blob:"],
    "frame-src": ["'self'", "chrome-extension:", "moz-extension:", "safari-web-extension:"],
    "frame-ancestors": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"]
  };
}
function buildCsp(options) {
  const apiOrigin = options.apiOrigin ?? SHUGOI_ORIGIN;
  const merged = {};
  for (const [k, v] of Object.entries(baseDirectives(apiOrigin))) merged[k] = [...v];
  if (options.extraDirectives) {
    for (const [key, values] of Object.entries(options.extraDirectives)) {
      merged[key] = [.../* @__PURE__ */ new Set([...merged[key] ?? [], ...values])];
    }
  }
  const requireUnsafeEval = options.bootEval ?? (process.env.NODE_ENV === "production" && options.enableDevtoolsCheck !== false);
  const scriptSrc = merged["script-src"] ?? [];
  if (requireUnsafeEval && !scriptSrc.includes("'unsafe-eval'")) {
    scriptSrc.push("'unsafe-eval'");
  }
  return Object.entries(merged).map(([key, values]) => `${key} ${values.join(" ")}`).join("; ");
}
function mergeCsp(existing, added) {
  if (!existing) return added;
  const parse = (s) => {
    const m = /* @__PURE__ */ new Map();
    for (const part of s.split(";")) {
      const [name, ...vals] = part.trim().split(/\s+/);
      if (!name) continue;
      const set = m.get(name) ?? /* @__PURE__ */ new Set();
      vals.forEach((v) => set.add(v));
      m.set(name, set);
    }
    return m;
  };
  const base = parse(existing);
  for (const [k, v] of parse(added)) {
    const set = base.get(k) ?? /* @__PURE__ */ new Set();
    v.forEach((x) => set.add(x));
    base.set(k, set);
  }
  for (const [, set] of base) {
    if (set.has("'none'") && set.size > 1) {
      set.clear();
      set.add("'none'");
    }
  }
  return [...base.entries()].map(([k, v]) => `${k} ${[...v].join(" ")}`).join("; ");
}

// src/core.ts
init_render();
init_locales();

// src/verify-bot.ts
import { promises as dns } from "dns";
var BOT_DOMAINS = [
  { pattern: /Googlebot|Google-InspectionTool|Storebot-Google/i, suffixes: [".googlebot.com", ".google.com"] },
  { pattern: /Bingbot|adidxbot|BingPreview/i, suffixes: [".search.msn.com"] },
  { pattern: /Slurp/i, suffixes: [".crawl.yahoo.net"] },
  { pattern: /DuckDuckBot/i, suffixes: [".duckduckgo.com"] },
  { pattern: /YandexBot/i, suffixes: [".yandex.ru", ".yandex.net", ".yandex.com"] },
  { pattern: /Applebot/i, suffixes: [".applebot.apple.com"] },
  { pattern: /Discordbot/i, suffixes: [".discord.gg", ".discord.com", ".discordapp.com"] }
];
var VERIFIABLE_BOTS = BOT_DOMAINS.map((b) => b.pattern);
var VERIFY_TTL = 36e5;
var MAX_ENTRIES2 = 5e3;
var _cache = /* @__PURE__ */ new Map();
async function verifyBotIp(ua, ip) {
  const entry = BOT_DOMAINS.find((b) => b.pattern.test(ua));
  if (!entry) return null;
  if (!ip || ip === "unknown") return false;
  const key = ip + "|" + entry.suffixes[0];
  const hit = _cache.get(key);
  if (hit && Date.now() - hit.at < VERIFY_TTL) return hit.ok;
  let ok = false;
  try {
    const names = await dns.reverse(ip);
    const name = names.find((n) => entry.suffixes.some((s) => n.toLowerCase().endsWith(s)));
    if (name) {
      const forward = await dns.resolve(name).catch(() => []);
      const forward6 = await dns.resolve6(name).catch(() => []);
      ok = forward.includes(ip) || forward6.includes(ip);
    }
  } catch {
    ok = false;
  }
  if (_cache.size >= MAX_ENTRIES2) {
    const oldest = [..._cache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) _cache.delete(oldest[0]);
  }
  _cache.set(key, { ok, at: Date.now() });
  return ok;
}

// src/block-page.ts
var BLOCK_PAGE = [
  "+---------------------------------------------+",
  "|           BLOCKED BY SHUGOI                 |",
  "+---------------------------------------------+",
  "|  Bots, scrapers and headless clients        |",
  "|  are blocked by Shugoi protection.          |",
  "|                                             |",
  "|  Use a standard browser to access           |",
  "|  this site.                                 |",
  "|                                             |",
  "|  - web: https://shugoi.com -                |",
  "+---------------------------------------------+"
].join("\n") + "\n";

// src/core.ts
init_security_utils();

// src/pow-utils.ts
import crypto5 from "crypto";
function createPowNonce() {
  return crypto5.randomBytes(8).toString("hex");
}
function verifyPow(proof, options) {
  if (!proof || !options.secret) return false;
  const [timestamp, nonce, solution] = proof.split(":");
  if (!timestamp || !nonce || !solution || !/^[0-9a-f]{16}$/.test(nonce)) return false;
  const parsedTimestamp = Number.parseInt(timestamp, 10);
  if (!Number.isFinite(parsedTimestamp) || Math.abs(Date.now() - parsedTimestamp * 1e3) > options.ttlMs) return false;
  const salt = crypto5.createHmac("sha256", options.secret).update(`${timestamp}:${nonce}`).digest("hex");
  const digest = crypto5.createHash("sha256").update(`${salt}:${solution}`).digest("hex");
  let leadingBits = 0;
  for (const nibble of digest) {
    const value = Number.parseInt(nibble, 16);
    if (value === 0) {
      leadingBits += 4;
      continue;
    }
    leadingBits += value & 8 ? 0 : value & 4 ? 1 : value & 2 ? 2 : 3;
    break;
  }
  return leadingBits >= options.difficulty;
}

// src/challenge-limiter.ts
var ChallengeLimiter = class {
  constructor(options) {
    this.options = options;
    this.timer = setInterval(() => this.cleanup(), options.windowMs);
    this.timer.unref();
  }
  options;
  entries = /* @__PURE__ */ new Map();
  timer;
  allow(ip) {
    if (!ip || ip === "unknown") return true;
    const now = Date.now();
    let entry = this.entries.get(ip);
    if (!entry || now - entry.windowStart >= this.options.windowMs) {
      this.entries.set(ip, { count: 1, windowStart: now, blockedUntil: 0 });
      return true;
    }
    entry.count += 1;
    if (entry.blockedUntil > now) return false;
    if (entry.count > this.options.limit) {
      const backoff = Math.min(6e4 * 2 ** Math.min(entry.count - this.options.limit, 10), this.options.maxBlockMs);
      entry.blockedUntil = now + backoff;
      entry.count = 0;
      return false;
    }
    return true;
  }
  close() {
    clearInterval(this.timer);
    this.entries.clear();
  }
  cleanup() {
    const now = Date.now();
    for (const [ip, entry] of this.entries) {
      if (now > entry.blockedUntil && now - entry.windowStart > this.options.windowMs * 2) this.entries.delete(ip);
    }
  }
};

// src/core.ts
init_cookie_security();

// src/proof-replay-store.ts
var ProofReplayStore = class {
  constructor(options) {
    this.options = options;
    this.timer = setInterval(() => this.cleanup(), options.ttlMs);
    this.timer.unref();
  }
  options;
  entries = /* @__PURE__ */ new Map();
  timer;
  consume(proof) {
    this.cleanup();
    if (this.entries.has(proof)) return false;
    this.entries.set(proof, Date.now());
    return true;
  }
  close() {
    clearInterval(this.timer);
    this.entries.clear();
  }
  cleanup() {
    const now = Date.now();
    for (const [proof, timestamp] of this.entries) {
      if (now - timestamp > this.options.ttlMs) this.entries.delete(proof);
    }
  }
};

// src/core.ts
import crypto6 from "crypto";
var DEFAULT_HEADLESS_PATTERNS = [
  /^curl/i,
  /^wget/i,
  /^python/i,
  /^Go-http-client/i,
  /^Java\//,
  /HTTPie/i,
  /^node-fetch/i,
  /axios/i,
  /^okhttp/i,
  /^scrapy/i,
  /PowerShell/i,
  /WinHttp/i
];
var DEFAULT_BOT_WHITELIST = [
  /Googlebot/i,
  /Bingbot/i,
  /Slurp/i,
  /DuckDuckBot/i,
  /YandexBot/i,
  /Applebot/i,
  /facebookexternalhit/i,
  /Twitterbot/i,
  /LinkedInBot/i,
  /Discordbot/i,
  /Slackbot/i,
  /WhatsApp/i,
  /TelegramBot/i
];
function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function shieldPage(title, msg, badge, host, remainSecs, locale) {
  const msgs = MESSAGES[locale];
  const prefix = msg ? msg.replace(/Il reste \d+ seconde?s?.*$/, "").replace(/Retry in \d+s?.*$/, "").trim() : "";
  const countdownScript = remainSecs > 0 ? "<script>var s=" + remainSecs + ';var i=setInterval(function(){s--;var e=document.getElementById("cd");if(e){if(s<=0){e.innerHTML="0s";clearInterval(i);setTimeout(function(){location.reload()},500)}else{e.innerHTML=s+"s"}}},1000)</script>' : "";
  const desc = remainSecs > 0 ? prefix + " " + msgs.retryInSeconds(remainSecs) : msg || "";
  const htmlTitle = escapeHtml(title || msgs.blockedTitle);
  const htmlBadge = escapeHtml(badge || msgs.blockedBadge);
  const htmlHost = escapeHtml((host || "shugoi.com").slice(0, 120));
  const htmlDesc = escapeHtml(desc);
  const htmlLang = locale === "fr" ? "fr" : "en";
  return '<!DOCTYPE html><html lang="' + htmlLang + `"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>@font-face{font-family:'Alex Brush';src:url(https://shugoi.com/alex-brush.woff2?v=2) format('woff2');font-display:swap}*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}html,body{height:100%;background:#fcf9f5}body{font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;display:flex;align-items:center;justify-content:center;padding:1.2rem}#c{max-width:460px;width:100%;background:#fff;border:4px solid #000;border-radius:28px 6px 32px 10px;box-shadow:12px 12px 0 #000;padding:3rem 2.4rem 2.8rem;text-align:center}#c .l{width:80px;height:80px;pointer-events:none;transform:rotate(-2.5deg);margin:0 auto .6rem;display:block}#c .b{display:block;margin:0 auto .2rem;pointer-events:none;max-width:100%;height:auto}#c .bdg{display:inline-block;border:2px solid #000;border-radius:10px 2px 14px 4px;padding:.3rem .9rem;font-size:.6rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#E87090;margin-bottom:1.4rem}#c h2{font-family:'Alex Brush',Georgia,"Times New Roman",serif;font-size:2.2rem;color:#E87090;font-weight:400;margin:0 auto .6rem}#c p.desc{font-size:.9rem;color:#555;line-height:1.8;max-width:380px;margin:0 auto}#c p.ft{font-size:.55rem;color:#E87090;margin-top:1.8rem}</style></head><body><div id=c><img src=https://shugoi.com/favicon.png alt class=l><img src=https://shugoi.com/brand.png alt class=b><div class=bdg>` + htmlBadge + "</div><h2>" + htmlTitle + "</h2><p class=desc>" + htmlDesc + "</p><p class=ft>" + htmlHost + " \xB7 Shugoi</p></div>" + countdownScript + "</body></html>";
}
function createCore(options) {
  const allowlist = options.allowlist ?? ["/api", "/legal"];
  const headlessPatterns = options.headlessPatterns ?? DEFAULT_HEADLESS_PATTERNS;
  const botWhitelist = options.botWhitelist ?? DEFAULT_BOT_WHITELIST;
  const baseUrl = options.baseUrl ?? "https://shugoi.com/api/v1";
  const debug = options.debug ?? false;
  const siteSecret = options.signingSecret || options.secret;
  const blockStatus = options.blockStatus ?? 403;
  const blockPage = options.blockPage ?? null;
  const cspEnabled = options.csp ?? true;
  const verifyBots = options.verifyBots !== false;
  let _validationValid = false;
  let _validationFailed = false;
  let _validationFailedReason = "";
  let _validationWarnedAt = 0;
  const VALIDATION_WARN_INTERVAL = 36e5;
  const apiOrigin = originOf(baseUrl);
  const csp = buildCsp({
    siteKey: options.siteKey,
    extraDirectives: options.extraDirectives || {},
    splitRender: options.splitRender ?? true,
    ...apiOrigin === null ? {} : { apiOrigin }
  });
  function log(...args) {
    if (debug) console.log("[shugoi]", ...args);
  }
  const POW_DIFF = (() => {
    const raw = Number(process.env.SHUGOKI_POW_DIFF || "14");
    return Number.isInteger(raw) && raw >= 8 && raw <= 24 ? raw : 12;
  })();
  const POW_OK_TTL_MS = 30 * 24 * 3600 * 1e3;
  const powSecret = process.env.SHUGOKI_SIGNING_SECRET || process.env.SHUGOKI_SECRET || "";
  const POW_TTL_MS = 6e4;
  const CHALLENGE_LIMIT = (() => {
    const raw = Number(process.env.SHUGOKI_CHALLENGE_LIMIT || "60");
    return Number.isInteger(raw) && raw > 0 ? raw : 60;
  })();
  const CHALLENGE_WINDOW_MS = (() => {
    const raw = Number(process.env.SHUGOKI_CHALLENGE_WINDOW || "60");
    return Number.isInteger(raw) && raw > 0 ? raw * 1e3 : 6e4;
  })();
  const CHALLENGE_MAX_BLOCK_MS = 15 * 60 * 1e3;
  const challengeLimiter = new ChallengeLimiter({ limit: CHALLENGE_LIMIT, windowMs: CHALLENGE_WINDOW_MS, maxBlockMs: CHALLENGE_MAX_BLOCK_MS });
  const proofReplayStore = new ProofReplayStore({ ttlMs: POW_TTL_MS });
  const isPowValid = (proof) => verifyPow(proof, { secret: powSecret, difficulty: POW_DIFF, ttlMs: POW_TTL_MS });
  const cookieSecurity = { secret: powSecret, okTtlMs: POW_OK_TTL_MS, authorizedTtlMs: 12e4 };
  const sgOkCookieValue = (ip, ua) => createOkCookieValue(ip, ua, cookieSecurity);
  const isSgOkValid = (value, ip, ua) => isOkCookieValid(value, ip, ua, cookieSecurity);
  const isSgAuthorizedValid = (value) => isAuthorizedCookieValid(value, cookieSecurity);
  const isSgMidAnchorValid = (value, ip, ua, mid) => isMidAnchorValid(value, ip, ua, mid, cookieSecurity);
  const validationPromise = (async () => {
    if (siteSecret && baseUrl) {
      try {
        const res = await fetch(baseUrl + "/validate-key", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ siteKey: options.siteKey, secret: siteSecret }),
          signal: AbortSignal.timeout(5e3)
        });
        if (res.ok) {
          const data = await res.json();
          if (data.valid) {
            _validationValid = true;
            if (debug) console.log("[shugoi] key validation OK");
          } else {
            _validationFailed = true;
            _validationFailedReason = String(data.reason || "invalid");
          }
        } else {
          _validationFailed = true;
          _validationFailedReason = "HTTP " + res.status;
        }
      } catch (e) {
        _validationFailed = true;
        _validationFailedReason = "r\xE9seau: " + (e instanceof Error ? e.message : String(e));
      }
    } else if (debug) {
      console.log("[shugoi] no secret provided, skipping key validation");
    }
  })();
  ensureGuardsReady(baseUrl, siteSecret, options.siteKey).catch(() => {
  });
  async function ensureValidated() {
    if (!siteSecret) return;
    if (_validationValid || _validationFailed) return;
    await Promise.race([
      validationPromise,
      new Promise((r) => setTimeout(r, 500))
    ]);
  }
  function isAllowlisted(path) {
    return allowlist.some((p) => path === p || path.startsWith(p + "/"));
  }
  function isWhitelistedBot(ua) {
    return botWhitelist.some((p) => p.test(ua));
  }
  const botIpList = new Set((process.env.SHUGOKI_BOT_IPS || "").split(",").map((s) => s.trim()).filter(Boolean));
  const LENIENT_WINDOW_MS = 6e4;
  const LENIENT_MAX_PER_WINDOW = 20;
  const LENIENT_MAX_IPS = 5e3;
  const _lenientHits = /* @__PURE__ */ new Map();
  function lenientBotAllow(ip) {
    const now = Date.now();
    if (_lenientHits.size > LENIENT_MAX_IPS && !_lenientHits.has(ip)) {
      let oldestKey = null;
      let oldestAt = Infinity;
      for (const [k, v] of _lenientHits) {
        const at = v[0] ?? 0;
        if (at < oldestAt) {
          oldestAt = at;
          oldestKey = k;
        }
      }
      if (oldestKey) _lenientHits.delete(oldestKey);
    }
    let hits = _lenientHits.get(ip);
    if (!hits) {
      hits = [];
      _lenientHits.set(ip, hits);
    }
    while (hits.length) {
      const first = hits[0];
      if (first === void 0 || now - first > LENIENT_WINDOW_MS) hits.shift();
      else break;
    }
    if (hits.length >= LENIENT_MAX_PER_WINDOW) return false;
    hits.push(now);
    return true;
  }
  async function botBypass(ua, ip) {
    if (!isWhitelistedBot(ua)) return false;
    if (options.logBotIps !== false) {
      console.log("[shugoi] bot_ua ip=" + ip + " ua=" + String(ua).slice(0, 50));
    }
    if (VERIFIABLE_BOTS.some((p) => p.test(ua))) return await isTrustedBot(ua, ip);
    return lenientBotAllow(ip);
  }
  async function isTrustedBot(ua, ip) {
    if (!isWhitelistedBot(ua)) return false;
    if (!verifyBots) return true;
    if (botIpList.has(ip)) return true;
    const verified = await verifyBotIp(ua, ip);
    if (verified === null) return false;
    return verified;
  }
  async function evaluate(ctx) {
    await ensureValidated();
    if (siteSecret && _validationFailed && Date.now() - _validationWarnedAt > VALIDATION_WARN_INTERVAL) {
      _validationWarnedAt = Date.now();
      console.warn(
        "[shugoi] La validation de la cl\xE9 a \xE9chou\xE9 (" + (_validationFailedReason || "raison inconnue") + ").\n[shugoi] La protection reste active, mais cette installation n'est pas authentifi\xE9e.\n[shugoi] V\xE9rifiez `siteKey` et `secret` : https://shugoi.com/docs#validation"
      );
      fetch(baseUrl + "/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteKey: options.siteKey, reason: "validation_failed" }),
        signal: AbortSignal.timeout(2e3)
      }).catch(() => {
      });
    }
    if (/\/assets\/[^?#]+\.(js|css)(\?|$)/.test(ctx.path)) {
      const authOk = !!ctx.sgAuthorized && isSgAuthorizedValid(ctx.sgAuthorized);
      if (!authOk) {
        log("asset prot\xE9g\xE9 refus\xE9:", ctx.path.slice(0, 60));
        return { block: true, status: 403, contentType: "text/plain", body: BLOCK_PAGE, headers: {} };
      }
    }
    if (ctx.sgMidAnchor && ctx.mid && !isSgMidAnchorValid(ctx.sgMidAnchor, ctx.ip, ctx.ua, ctx.mid)) {
      log("anchor_mismatch:", ctx.ip.slice(0, 24), ctx.mid.slice(0, 8));
      return { block: true, status: 403, contentType: "text/plain", body: BLOCK_PAGE, headers: {} };
    }
    if (isAllowlisted(ctx.path)) return null;
    if (ctx.path === "/__sg_challenge") {
      if (!challengeLimiter.allow(ctx.ip)) {
        const loc = resolveLocale(void 0, ctx.acceptLanguage);
        const lmsgs = MESSAGES[loc];
        return { block: true, status: 429, contentType: "text/html", body: shieldPage(lmsgs.rateLimitTitle, lmsgs.rateLimitBody("1 min"), lmsgs.rateLimitBadge, ctx.host || "", 60, loc) };
      }
      const js = `(function(){
var P=new URLSearchParams(location.search);
var salt=P.get('salt')||'', ts=P.get('ts')||'', nonce=P.get('nonce')||'', diff=parseInt(P.get('diff')||'14',10), path=P.get('path')||'/';
if(path.charAt(0)!=='/'||path.charAt(1)==='/'||path.indexOf('\\\\')>=0)path='/';
var enc=new TextEncoder();
function bits(d){var l=0;for(var i=0;i<d.length;i++){var b=parseInt(d[i],16);if(b===0){l+=4;continue}l+=(b&8)?0:(b&4)?1:(b&2)?2:3;break}return l}
var n=0;
function step(){
  crypto.subtle.digest('SHA-256',enc.encode(salt+':'+n.toString(16))).then(function(buf){
    var h=Array.from(new Uint8Array(buf)).map(function(v){return v.toString(16).padStart(2,'0')}).join('');
    if(bits(h)>=diff){var base=path;var q=(base.indexOf('?')>=0?'&':'?')+'sg_proof='+ts+':'+nonce+':'+n.toString(16);location.replace(base+q)}
    else{n++;if(n<300000)step()}
  }).catch(function(){location.reload()});
}
step();
})();`;
      const html = "<!--\n" + BLOCK_PAGE + "-->\n<script>" + js + "</script>";
      return { block: true, status: 200, contentType: "text/html", body: html };
    }
    const isPage = !ctx.path.includes("/__shugoi/") && !ctx.path.startsWith("/api/");
    if (isPage && powSecret && ctx.ua) {
      if (/Mozilla/i.test(ctx.ua) && !await botBypass(ctx.ua, ctx.ip)) {
        const sfd = ctx.secFetchDest ?? "";
        const sfm = ctx.secFetchMode ?? "";
        const al = ctx.acceptLanguage ?? "";
        if (!al && !sfd && !sfm) {
          log("fake browser (Accept-Language + Sec-Fetch absents) \u2192 403 block page:", ctx.ua.slice(0, 40));
          const bloc = resolveLocale(void 0, ctx.acceptLanguage);
          const lmsgs = MESSAGES[bloc];
          return { block: true, status: 403, contentType: "text/html", body: shieldPage(lmsgs.fakeBrowserTitle, lmsgs.fakeBrowserBody, lmsgs.fakeBrowserBadge, ctx.host || "", 0, bloc) };
        }
      }
      const proof = ctx.sgProof || "";
      const validProof = !!proof && isPowValid(proof);
      const validCookie = !!ctx.sgOk && isSgOkValid(ctx.sgOk, ctx.ip, ctx.ua);
      const proofFresh = validProof ? proofReplayStore.consume(proof) : false;
      const canProceed = validCookie || proofFresh;
      if (!canProceed && !await botBypass(ctx.ua, ctx.ip)) {
        if (!challengeLimiter.allow(ctx.ip)) {
          const loc = resolveLocale(void 0, ctx.acceptLanguage);
          const lmsgs = MESSAGES[loc];
          log("challenge rate-limited:", ctx.ip.slice(0, 24), ctx.ua.slice(0, 40));
          return { block: true, status: 429, contentType: "text/html", body: shieldPage(lmsgs.rateLimitTitle, lmsgs.rateLimitBody("1 min"), lmsgs.rateLimitBadge, ctx.host || "", 60, loc) };
        }
        const tsNow = Math.floor(Date.now() / 1e3);
        const nonce = createPowNonce();
        const salt = crypto6.createHmac("sha256", powSecret).update(tsNow + ":" + nonce).digest("hex");
        const prefix = ctx.forwardedPrefix && ctx.forwardedPrefix !== "/" ? ctx.forwardedPrefix.replace(/\/$/, "") : "";
        const path = safeChallengePath(ctx.path.startsWith("/") ? ctx.path : "/" + ctx.path);
        const chalUrl = prefix + "/__sg_challenge?ts=" + tsNow + "&salt=" + salt + "&nonce=" + nonce + "&diff=" + POW_DIFF + "&path=" + encodeURIComponent(prefix + path);
        log("pow challenge (307):", ctx.ua.slice(0, 40));
        return { block: true, status: 307, contentType: "text/plain", body: BLOCK_PAGE, headers: { Location: chalUrl } };
      }
    }
    const flags = await fetchConfigForSiteKey(options.siteKey, baseUrl, options.signingSecret || options.secret);
    const headlessEnabled = flags.enableHeadlessCheck !== false;
    if (flags.enableRateLimit === true) {
      try {
        const rlRes = await fetch(baseUrl + "/rate-limit-check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            siteKey: options.siteKey,
            scope: "edge_ip",
            ip: ctx.ip,
            metadata: { ip: ctx.ip, userAgent: ctx.ua || "", middleware: true }
          }),
          signal: AbortSignal.timeout(2e3)
        });
        if (rlRes.ok) {
          const rlData = await rlRes.json();
          if (rlData.allowed === false) {
            const remain = Math.max(0, Math.ceil((rlData.resetAt - Date.now()) / 1e3));
            const mins = Math.floor(remain / 60);
            const secs = remain % 60;
            const timeStr = mins > 0 ? mins + " min" + (mins > 1 ? "s" : "") + (secs > 0 ? " " + secs + " s" : "") : secs + " seconde" + (secs > 1 ? "s" : "");
            const loc = options.locale ?? resolveLocale(void 0, ctx.acceptLanguage);
            const msgs = MESSAGES[loc];
            if (blockPage) {
              return { block: true, status: 429, contentType: "text/html", body: blockPage({ reason: "rate_limit", title: msgs.rateLimitTitle, message: msgs.rateLimitBody(timeStr), badge: msgs.rateLimitBadge, host: ctx.host || "", remainingSeconds: remain, locale: loc }) };
            }
            return { block: true, status: 429, contentType: "text/html", body: shieldPage(msgs.rateLimitTitle, msgs.rateLimitBody(timeStr), msgs.rateLimitBadge, ctx.host || "", remain, loc) };
          }
        }
      } catch {
      }
    }
    if (headlessEnabled && ctx.ua && !await botBypass(ctx.ua, ctx.ip) && headlessPatterns.some((p) => p.test(ctx.ua))) {
      log("headless block:", ctx.ua.slice(0, 40));
      fetch(baseUrl + "/event", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ siteKey: options.siteKey, reason: "headless" }), signal: AbortSignal.timeout(2e3) }).catch(() => {
      });
      return { block: true, status: blockStatus, contentType: "text/plain", body: BLOCK_PAGE };
    }
    return null;
  }
  return {
    csp,
    cspEnabled,
    ensureValidated,
    isAllowlisted,
    isWhitelistedBot,
    isTrustedBot,
    evaluate,
    log,
    close() {
      challengeLimiter.close();
      proofReplayStore.close();
    },
    isProofValid: isPowValid,
    sgOkCookie(proof, ip, ua) {
      if (!proof || !isPowValid(proof)) return null;
      return "__sg_ok=" + sgOkCookieValue(ip, ua) + "; Path=/; HttpOnly; SameSite=Lax; Max-Age=" + Math.floor(POW_OK_TTL_MS / 1e3) + (process.env.NODE_ENV === "production" ? "; Secure" : "");
    }
  };
}

// src/evaluate-context.ts
function createEvaluateContext(path, ua, ip, values) {
  const context = { path, ua, ip };
  if (values.mid !== null) context.mid = values.mid;
  if (values.host !== null) context.host = values.host;
  if (values.acceptLanguage !== null) context.acceptLanguage = values.acceptLanguage;
  if (values.secFetchDest !== null) context.secFetchDest = values.secFetchDest;
  if (values.secFetchMode !== null) context.secFetchMode = values.secFetchMode;
  if (values.sgProof !== null) context.sgProof = values.sgProof;
  if (values.sgOk !== null) context.sgOk = values.sgOk;
  if (values.sgAuthorized !== null) context.sgAuthorized = values.sgAuthorized;
  if (values.sgMidAnchor !== null) context.sgMidAnchor = values.sgMidAnchor;
  if (values.forwardedPrefix !== null) context.forwardedPrefix = values.forwardedPrefix;
  return context;
}

// src/middleware.ts
init_locales();
init_cookie_security();
function createShugoiMiddleware(options) {
  const core = createCore(options);
  const autoInject = options.autoInject ?? true;
  const splitRender = options.splitRender ?? true;
  const restrictedAccess = options.restrictedAccess ?? false;
  const signingSecret = options.signingSecret || options.secret;
  const baseUrl = options.baseUrl ?? "https://shugoi.com/api/v1";
  const internalUrl = options.internalUrl || baseUrl;
  if (options.multiProcess) enableDiskStore(true);
  const middleware = async function shugoiMiddleware(req, res, next) {
    try {
      const path = (req.path ?? req.url ?? "/").split("?")[0] ?? "/";
      if (path.endsWith("/__shugoi/render")) {
        const m = String(req.method || "GET").toUpperCase();
        if (m !== "GET" && m !== "HEAD") {
          if (res.status) res.status(405);
          if (res.type) res.type("application/json");
          const body = JSON.stringify({ error: "method_not_allowed" });
          if (res.send) res.send(body);
          else if (res.end) res.end(body);
          return;
        }
        const { handleRender: handleRender2 } = await Promise.resolve().then(() => (init_render(), render_exports));
        const q = req.query && req.query || {};
        const ip2 = (typeof req.headers?.["x-forwarded-for"] === "string" ? req.headers["x-forwarded-for"].split(",")[0]?.trim() : void 0) || (typeof req.ip === "string" ? req.ip : "unknown");
        const ua2 = (typeof req.headers?.["user-agent"] === "string" ? req.headers["user-agent"] : "") || "";
        const midAnchor2 = typeof req.headers?.cookie === "string" ? req.headers.cookie.match(/(?:^|;\s*)__sg_mid_anchor=([^;]+)/)?.[1] ?? null : null;
        return handleRender2(q.token || "", res, internalUrl, q.mid || "", q.grant || "", ip2, options.siteKey, baseUrl, signingSecret, ua2, midAnchor2 || void 0);
      }
      if (path === "/__sg_challenge") {
        const m = String(req.method || "GET").toUpperCase();
        if (m !== "GET" && m !== "HEAD") {
          if (res.status) res.status(405);
          if (res.type) res.type("application/json");
          const body = JSON.stringify({ error: "method_not_allowed" });
          if (res.send) res.send(body);
          else if (res.end) res.end(body);
          return;
        }
      }
      if (core.cspEnabled && res.setHeader) {
        if (res.getHeader) {
          const existing = res.getHeader("Content-Security-Policy");
          res.setHeader("Content-Security-Policy", mergeCsp(
            typeof existing === "string" ? existing : void 0,
            core.csp
          ));
        } else {
          res.setHeader("Content-Security-Policy", core.csp);
        }
      }
      const ua = (typeof req.headers?.["user-agent"] === "string" ? req.headers["user-agent"] : "") || "";
      const ip = (typeof req.headers?.["x-forwarded-for"] === "string" ? req.headers["x-forwarded-for"].split(",")[0]?.trim() : void 0) || (typeof req.ip === "string" ? req.ip : "unknown");
      const reqLocale = resolveLocale(options.locale, typeof req.headers?.["accept-language"] === "string" ? req.headers?.["accept-language"] : void 0);
      const midAnchor = typeof req.headers?.cookie === "string" ? req.headers.cookie.match(/(?:^|;\s*)__sg_mid_anchor=([^;]+)/)?.[1] ?? null : null;
      const anchorSecret = signingSecret || process.env.SHUGOKI_SIGNING_SECRET || process.env.SHUGOKI_SECRET;
      let midAnchorOk;
      if (anchorSecret) {
        const anchorMid = midAnchor?.split(":")[3] ?? "";
        midAnchorOk = midAnchor && /^[a-f0-9]{64}$/.test(anchorMid) ? isMidAnchorValid(midAnchor, ip, ua, anchorMid, { secret: anchorSecret, okTtlMs: 0, authorizedTtlMs: 0, anchorTtlMs: 30 * 24 * 3600 * 1e3 }) : false;
      }
      if (autoInject && options.siteKey) {
        try {
          const { skipPaths } = await getConfig(options.siteKey, internalUrl, signingSecret);
          if (skipPaths?.some((p) => path === p)) {
            try {
              if (!options.renderSkipPath) return next();
              const html = await options.renderSkipPath(path);
              if (res.setHeader) res.setHeader("Content-Type", "text/html; charset=utf-8");
              if (res.send) res.send(html);
              else if (res.end) res.end(html);
              return;
            } catch (ssrErr) {
              return next();
            }
          }
        } catch {
        }
      }
      const decision = await core.evaluate(createEvaluateContext(path, ua, ip, {
        mid: null,
        host: typeof req.headers?.["host"] === "string" ? req.headers.host : null,
        acceptLanguage: typeof req.headers?.["accept-language"] === "string" ? req.headers["accept-language"] : null,
        secFetchDest: typeof req.headers?.["sec-fetch-dest"] === "string" ? req.headers["sec-fetch-dest"] : null,
        secFetchMode: typeof req.headers?.["sec-fetch-mode"] === "string" ? req.headers["sec-fetch-mode"] : null,
        sgProof: typeof req.query?.sg_proof === "string" ? req.query.sg_proof : null,
        sgOk: typeof req.headers?.cookie === "string" ? req.headers.cookie.match(/(?:^|;\s*)__sg_ok=([^;]+)/)?.[1] ?? null : null,
        sgAuthorized: typeof req.headers?.cookie === "string" ? req.headers.cookie.match(/(?:^|;\s*)__sg_authorized=([^;]+)/)?.[1] ?? null : null,
        sgMidAnchor: midAnchor,
        forwardedPrefix: typeof req.headers?.["x-forwarded-prefix"] === "string" ? req.headers["x-forwarded-prefix"] : null
      }));
      if (decision) {
        if (decision.headers) {
          for (const [k, v] of Object.entries(decision.headers)) {
            if (res.setHeader) res.setHeader(k, v);
          }
        }
        if (res.status) res.status(decision.status);
        if (decision.headers && decision.headers["Content-Type"]) {
          if (res.setHeader) res.setHeader("Content-Type", decision.headers["Content-Type"]);
        } else if (res.type) {
          res.type(decision.contentType.split("/")[1] ?? "plain");
        }
        if (decision.body) {
          if (res.send) res.send(decision.body);
          else if (res.end) res.end(decision.body);
        } else if (res.end) {
          res.end();
        }
        return;
      }
      const sgProofQ = typeof req.query?.sg_proof === "string" ? req.query.sg_proof : void 0;
      if (sgProofQ && res.setHeader) {
        const okCookie = core.sgOkCookie(sgProofQ, ip, ua);
        if (okCookie) res.setHeader("Set-Cookie", okCookie);
      }
      const isBot = await core.isTrustedBot(ua, ip) || core.isWhitelistedBot(ua);
      if (autoInject && splitRender && !isBot && !core.isAllowlisted(path)) {
        let injected = false;
        const originalSend = res.send?.bind(res);
        const originalEnd = res.end?.bind(res);
        const doInject = async (body) => {
          if (injected) return body ?? "";
          if (typeof body === "string") {
            const ct = res.getHeader ? res.getHeader("content-type") : void 0;
            if (!ct || String(ct).includes("text/html")) {
              try {
                body = await injectGuardScripts(body, options.siteKey, baseUrl, void 0, restrictedAccess, signingSecret, req, void 0, reqLocale, void 0, midAnchorOk);
              } catch (e) {
                core.log("inject error:", String(e));
              }
              injected = true;
            }
          }
          return body ?? "";
        };
        if (originalSend) {
          res.send = function(body) {
            return doInject(body).then((b) => originalSend?.(b) ?? res);
          };
        }
        if (originalEnd) {
          res.end = function(chunk, encoding, cb) {
            doInject(chunk).then((b) => {
              if (cb) originalEnd?.(b, encoding, cb);
              else originalEnd?.(b, encoding);
            });
            return this;
          };
        }
      }
      next();
    } catch (err) {
      core.log("Unhandled error:", String(err));
      next();
    }
  };
  return async (req, res, next) => middleware(req, res, next);
}
function createShugoiPlugin(options) {
  const core = createCore(options);
  const restrictedAccess = options.restrictedAccess ?? false;
  const signingSecret = options.signingSecret || options.secret;
  const baseUrl = options.baseUrl ?? "https://shugoi.com/api/v1";
  if (options.multiProcess) enableDiskStore(true);
  return async function shugoiPlugin(fastify) {
    fastify.addHook("onRequest", async (...args) => {
      const reply = args[1];
      if (core.cspEnabled && reply.getHeader) {
        const existing = reply.getHeader("Content-Security-Policy");
        reply.header("Content-Security-Policy", mergeCsp(
          typeof existing === "string" ? existing : void 0,
          core.csp
        ));
      } else if (core.cspEnabled) {
        reply.header("Content-Security-Policy", core.csp);
      }
    });
    fastify.get("/__shugoi/render", async (request, reply) => {
      const { renderResponseData: renderResponseData2, injectReferrerPolicy: injectReferrerPolicy2 } = await Promise.resolve().then(() => (init_render(), render_exports));
      const ip = (typeof request.headers?.["x-forwarded-for"] === "string" ? request.headers["x-forwarded-for"].split(",")[0]?.trim() : void 0) || (typeof request.ip === "string" ? request.ip : "unknown");
      const data = await renderResponseData2(request.query.token || "", void 0, options.baseUrl, request.query.mid || "", request.query.grant || "", ip, options.siteKey);
      if (data.html) data.html = injectReferrerPolicy2(data.html);
      reply.header("Referrer-Policy", "strict-origin-when-cross-origin");
      reply.header("Cache-Control", "no-store, no-cache, must-revalidate, no-transform");
      reply.header("Pragma", "no-cache");
      reply.send(data);
    });
    fastify.head("/__shugoi/healthcheck", async (_request, reply) => reply.send(""));
    fastify.addHook("preHandler", async (...args) => {
      const request = args[0];
      const reply = args[1];
      try {
        const path = request.url.split("?")[0] ?? "/";
        if (path.endsWith("/__shugoi/render") || path.endsWith("/__shugoi/healthcheck")) return;
        if (core.isAllowlisted(path)) return;
        const ua = request.headers["user-agent"] ?? "";
        const ip = request.headers["x-forwarded-for"]?.split(",")[0]?.trim() || request.ip || "unknown";
        const decision = await core.evaluate(createEvaluateContext(path, ua, ip, {
          mid: null,
          host: request.headers?.host ?? null,
          acceptLanguage: request.headers["accept-language"] ?? null,
          secFetchDest: request.headers["sec-fetch-dest"] ?? null,
          secFetchMode: request.headers["sec-fetch-mode"] ?? null,
          sgProof: request.query && typeof request.query?.sg_proof === "string" ? request.query.sg_proof : null,
          sgOk: typeof request.headers.cookie === "string" ? request.headers.cookie.match(/(?:^|;\s*)__sg_ok=([^;]+)/)?.[1] ?? null : null,
          sgAuthorized: typeof request.headers.cookie === "string" ? request.headers.cookie.match(/(?:^|;\s*)__sg_authorized=([^;]+)/)?.[1] ?? null : null,
          sgMidAnchor: typeof request.headers.cookie === "string" ? request.headers.cookie.match(/(?:^|;\s*)__sg_mid_anchor=([^;]+)/)?.[1] ?? null : null,
          forwardedPrefix: typeof request.headers["x-forwarded-prefix"] === "string" ? request.headers["x-forwarded-prefix"] : null
        }));
        if (decision) {
          if (decision.headers) {
            for (const [k, v] of Object.entries(decision.headers)) reply.header(k, v);
          }
          reply.code(decision.status).type(decision.contentType === "text/html" ? "text/html" : "text/plain").send(decision.body);
          return;
        }
        if (typeof request.query?.sg_proof === "string") {
          const okCookie = core.sgOkCookie(request.query.sg_proof, ip, ua);
          if (okCookie) reply.header("Set-Cookie", okCookie);
        }
      } catch (err) {
        core.log("preHandler error:", String(err));
      }
    });
    fastify.addHook("onSend", async (...args) => {
      const request = args[0];
      const reply = args[1];
      const payload = args[2] ?? "";
      if (typeof payload !== "string") return payload;
      const path = request.url.split("?")[0] ?? "/";
      if (path.endsWith("/__shugoi/render") || path.endsWith("/__shugoi/healthcheck")) return payload;
      if (reply.statusCode !== 200) return payload;
      const ua = typeof request.headers?.["user-agent"] === "string" ? request.headers["user-agent"] : "";
      if (core.isWhitelistedBot(ua)) return payload;
      const ct = reply.getHeader?.("content-type");
      if (!ct || String(ct).includes("text/html")) {
        const pluginLocale = resolveLocale(options.locale, typeof request.headers?.["accept-language"] === "string" ? request.headers?.["accept-language"] : void 0);
        const pluginIp = request.headers["x-forwarded-for"]?.split(",")[0]?.trim() || request.ip || "unknown";
        const pluginAnchor = typeof request.headers?.cookie === "string" ? request.headers.cookie.match(/(?:^|;\s*)__sg_mid_anchor=([^;]+)/)?.[1] ?? null : null;
        const pluginAnchorSecret = signingSecret || process.env.SHUGOKI_SIGNING_SECRET || process.env.SHUGOKI_SECRET;
        let pluginMidAnchorOk;
        if (pluginAnchorSecret) {
          const pluginAnchorMid = pluginAnchor?.split(":")[3] ?? "";
          pluginMidAnchorOk = pluginAnchor && /^[a-f0-9]{64}$/.test(pluginAnchorMid) ? isMidAnchorValid(pluginAnchor, pluginIp, ua, pluginAnchorMid, { secret: pluginAnchorSecret, okTtlMs: 0, authorizedTtlMs: 0, anchorTtlMs: 30 * 24 * 3600 * 1e3 }) : false;
        }
        return await injectGuardScripts(payload, options.siteKey, baseUrl, void 0, restrictedAccess, signingSecret, { url: path }, void 0, pluginLocale, void 0, pluginMidAnchorOk);
      }
      return payload;
    });
  };
}

// src/check-license.ts
async function checkLicense(options) {
  const baseUrl = options.baseUrl ?? "https://shugoi.com/api/v1";
  const timeout = options.timeout ?? 5e3;
  const serverUa = options.serverUa ?? "ShugoiNode/0.1.0";
  const body = {
    siteKey: options.siteKey,
    action: options.action,
    fingerprint: {
      machineId: options.machineId
    },
    signals: options.signals ?? {},
    captchaToken: options.captchaToken,
    passToken: options.passToken,
    metadata: options.metadata
  };
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    const res = await fetch(`${baseUrl}/check`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": serverUa
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    clearTimeout(timer);
    const data = await res.json();
    if (data.error === "invalid_site_key") {
      throw new ShugoiError("invalid_site_key", `Invalid siteKey: ${options.siteKey}`);
    }
    if (!res.ok) {
      throw new ShugoiError(
        "unexpected_api_response",
        `API returned status ${res.status}: ${JSON.stringify(data)}`
      );
    }
    return data;
  } catch (err) {
    if (err instanceof ShugoiError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new ShugoiError("api_timeout", "Shugoi API request timed out", err);
    }
    throw new ShugoiError("api_unreachable", "Shugoi API unreachable", String(err));
  }
}

// src/scripts.ts
init_render();
async function scriptTags(options) {
  const base = options.baseUrl ?? "https://shugoi.com/api/v1";
  const key = options.siteKey;
  const ts = Date.now();
  const signed = signToken(key, ts, options.signingSecret);
  const skel = await generateSkeleton(key, signed.token, base, options.restrictedAccess ?? false, options.whitelist, void 0, void 0, void 0, void 0, options.signingSecret);
  return { guardDetect: skel, guard: "", whitelistConfig: "", token: signed.token };
}

// src/validate-site-key.ts
async function validateSiteKey(options) {
  const baseUrl = options.baseUrl ?? "https://shugoi.com/api/v1";
  const timeout = options.timeout ?? 5e3;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    const res = await fetch(`${baseUrl}/check`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "ShugoiNode/0.1.0"
      },
      body: JSON.stringify({
        siteKey: options.siteKey,
        action: "validate",
        fingerprint: {},
        signals: {}
      }),
      signal: controller.signal
    });
    clearTimeout(timer);
    const data = await res.json();
    if (data.error === "invalid_site_key") {
      return { valid: false, error: "invalid_site_key" };
    }
    const mode = options.siteKey.startsWith("sg_sk_test_") ? "test" : "live";
    return { valid: true, mode };
  } catch (err) {
    if (err instanceof ShugoiError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new ShugoiError("api_timeout", "API request timed out", err);
    }
    throw new ShugoiError("api_unreachable", "Shugoi API unreachable", String(err));
  }
}

// src/index.ts
init_obfuscate();
export {
  BLOCK_PAGE,
  DEFAULT_BOT_WHITELIST,
  DEFAULT_HEADLESS_PATTERNS,
  ShugoiError,
  __clearConfigCache,
  applyBootObfuscation,
  applyObfuscation,
  buildCsp,
  checkLicense,
  createShugoiMiddleware,
  createShugoiPlugin,
  fetchWhitelistForSiteKey,
  generateSkeleton,
  handleRender,
  injectGuardScripts,
  isValidJs,
  mergeCsp,
  renderResponseData,
  scriptTags,
  signToken,
  storeHtml,
  validateSiteKey,
  verifyRenderGrant
};
