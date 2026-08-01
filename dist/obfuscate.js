// src/obfuscate.ts
import crypto from "crypto";
var RENAMES = {
  buildOverlay: "_wf",
  checkNotice: "_wg",
  hex: "_wh",
  stable: "_wi"
};
function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
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
    let cc = str.charCodeAt(i) ^ kb[i % kb.length];
    enc += cc.toString(16).padStart(2, "0");
  }
  return enc;
}
function runtimeValue(str) {
  let s = str.slice(1, -1);
  return s.replace(/\\(['"\\bfnrtv0])/g, (_, c) => ({ "'": "'", '"': '"', "\\": "\\", "b": "\b", "f": "\f", "n": "\n", "r": "\r", "t": "	", "v": "\v", "0": "\0" })[c]).replace(/\\(u\{([\da-fA-F]+)\}|u([\da-fA-F]{4})|x([\da-fA-F]{2}))/g, (_, __, ubrace, u4, x2) => {
    const code = ubrace ? parseInt(ubrace, 16) : u4 ? parseInt(u4, 16) : parseInt(x2, 16);
    return String.fromCodePoint(code);
  });
}
function encryptStrings(code, key) {
  let r = "", i = 0;
  while (i < code.length) {
    if (code[i] === "'" || code[i] === '"') {
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
        r += '_D("' + xorEncrypt(val, key) + '")';
        i = j + 1;
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
  return s.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\n{3,}/g, "\n\n");
}
function escapeClosingTags(code) {
  return code.replace(/<\/(script|style)/gi, "<\\/$1");
}
function fixComputedProperties(code) {
  return code.replace(/([{,])(\s*)_D\("([^"]*)"\)(\s*:)/g, '$1$2[_D("$3")]$4');
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
    for (const ch of lines[i]) {
      if (ch === "{") d++;
      else if (ch === "}") d--;
    }
  }
  const blocks = [];
  let start = null;
  for (let i = 0; i < lines.length; i++) {
    const isShuffleable = depth[i] === 1 && /^\s*R\.\w+\s*=/.test(lines[i]) && !/[{}]/.test(lines[i]) && lines[i].trimEnd().endsWith(";");
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
      [slice[i], slice[j]] = [slice[j], slice[i]];
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
function injectDecoder(hexKey) {
  const kb = hexToBytes(hexKey);
  const ks = kb.map((b) => "\\x" + b.toString(16).padStart(2, "0")).join("");
  return 'var _D=function(h){var k="' + ks + '",r="";for(var i=0;i<h.length;i+=2){r+=String.fromCharCode(parseInt(h.substr(i,2),16)^k.charCodeAt((i/2)%' + kb.length + "))}return r};";
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
function applyObfuscation(code, seed) {
  let r = stripComments(code);
  r = stripTrace(r);
  r = renameFunctions(r, seed);
  r = shuffleCode(r, seed);
  const encKey = deriveKey(seed);
  r = encryptStrings(r, encKey);
  r = r.replace(/^\s*\(function\(\)\{/, (m) => m + injectDecoder(encKey));
  r = escapeClosingTags(r);
  r = fixComputedProperties(r);
  return r;
}
export {
  applyObfuscation,
  stripTrace
};
//# sourceMappingURL=obfuscate.js.map