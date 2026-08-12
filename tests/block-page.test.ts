import { describe, expect, it } from "vitest";
import { BLOCK_PAGE } from "../src/block-page";
import { BLOCK_PAGE as coreBlockPage } from "../src/core";
import { BLOCK_PAGE as middlewareBlockPage } from "../src/middleware";
import { createShugoiNextMiddleware } from "../src/next/middleware";
import { createShugoiProxy } from "../src/next/proxy";
import { NextRequest } from "next/server.js";

describe("BLOCK_PAGE", () => {
  it("uses one canonical value across adapters", () => {
    expect(coreBlockPage).toBe(BLOCK_PAGE);
    expect(middlewareBlockPage).toBe(BLOCK_PAGE);
  });

  it("returns the canonical page from the Next middleware", async () => {
    const middleware = createShugoiNextMiddleware({ siteKey: "test" });
    const request = new NextRequest("https://example.test/", {
      headers: { accept: "text/html", "user-agent": "curl/8.0" },
    });
    const response = await middleware(request);
    expect(await response.text()).toBe(BLOCK_PAGE);
    expect(response.status).toBe(403);
  });

  it("returns the canonical page from the Next proxy", async () => {
    const proxy = createShugoiProxy({ siteKey: "test" });
    const request = new NextRequest("https://example.test/", {
      headers: { accept: "text/html", "user-agent": "curl/8.0" },
    });
    const response = await proxy(request);
    expect(await response.text()).toBe(BLOCK_PAGE);
    expect(response.status).toBe(403);
  });
});
