import { describe, expect, it } from "vitest";
import { BLOCK_PAGE } from "../src/block-page";
import { BLOCK_PAGE as coreBlockPage } from "../src/core";
import { BLOCK_PAGE as middlewareBlockPage } from "../src/middleware";

describe("BLOCK_PAGE", () => {
  it("uses one canonical value across adapters", () => {
    expect(coreBlockPage).toBe(BLOCK_PAGE);
    expect(middlewareBlockPage).toBe(BLOCK_PAGE);
  });
});
