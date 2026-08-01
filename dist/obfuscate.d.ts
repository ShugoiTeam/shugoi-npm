declare function stripTrace(code: string): string;
declare function applyObfuscation(code: string, seed: string): string;

export { applyObfuscation, stripTrace };
