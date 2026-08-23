declare function hashStr(s: string): number;
declare function encryptStrings(code: string, key: string, dec?: string): string;
declare function stripComments(s: string): string;
declare function fixComputedProperties(code: string, dec?: string): string;
declare function deriveKey(seed: string): string;
declare function buildDecoderStmt(hexKey: string, dec: string, cacheName: string): string;
declare function stripTrace(code: string): string;
declare function createRng(seed: number): () => number;
declare function shortName(rng: () => number, minLen: number): string;
declare function rotateIdentifiers(code: string, seed: string): string;
declare function splitTopLevelStatements(code: string): string[];
declare function deferExecution(code: string, seed: string, qName?: string, iName?: string): string;
declare function navify(code: string, seed: string, dec?: string, cacheName?: string, navName?: string): string;
declare function applyBootObfuscation(code: string, seed: string): string;
declare function applyInvisibleEval(code: string, seed: string): string;
declare function applyObfuscation(code: string, seed: string): string;
declare function isValidJs(code: string): boolean;

export { applyBootObfuscation, applyInvisibleEval, applyObfuscation, buildDecoderStmt, createRng, deferExecution, deriveKey, encryptStrings, fixComputedProperties, hashStr, isValidJs, navify, rotateIdentifiers, shortName, splitTopLevelStatements, stripComments, stripTrace };
