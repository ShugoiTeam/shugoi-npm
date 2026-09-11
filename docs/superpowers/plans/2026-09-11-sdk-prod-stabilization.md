# Shugoi SDK Production Stabilization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Stabilize the SDK render/WebSocket implementation so its production artifact matches `shugoi-platform`, passes an honest test suite, and can be safely published to npmjs.

**Architecture:** Treat the vendor implementation in `shugoi-platform/shugoi.com/vendor/shugoi` as the behavioral reference. Keep the SDK package API compatible, make WebSocket render and bootstrap explicit, and update tests to assert the current security contract rather than the retired HTTP/token-only contract.

**Tech Stack:** TypeScript, Node.js 20, tsup, Vitest, `ws`, npm.

## Global Constraints

- Render transport must use same-origin `/api/v1/ws-wlc` WebSocket messaging.
- Bootstrap must be delivered through the invisible WebSocket loader flow.
- Missing site secrets must fail closed in production.
- No forced light background style may be injected into normal renders.
- Publish only after typecheck, build, focused render tests, and full test suite pass.

### Task 1: Reproduce and classify failures

**Files:**
- Inspect: `src/render.ts`, `src/middleware.ts`, `src/websocket.ts`, `tests/**/*.test.ts`
- Test: existing Vitest suites

- [ ] Run `npm run typecheck` and `npm test`.
- [ ] Record failures by category: obsolete expectations, missing fixtures/secrets, actual runtime regressions.
- [ ] Compare each render behavior with the platform vendor source before editing.

### Task 2: Align render and transport behavior

**Files:**
- Modify: `src/render.ts`
- Modify: `src/middleware.ts`
- Modify: `src/websocket.ts`
- Modify: `src/types.ts`
- Test: `tests/render.test.ts`, `tests/render-grant.test.ts`, `tests/middleware.test.ts`

- [ ] Ensure WLC requests are single-flight and render retries stop after a terminal decision.
- [ ] Ensure restricted mode is controlled only by `restrictedAccess`, never by an empty whitelist alone.
- [ ] Ensure WebSocket render uses the same-origin endpoint and the server-side grant validation path.
- [ ] Remove the forced `#fbf7f1` style from normal `document.open()` render replacement.

### Task 3: Make tests match the production contract

**Files:**
- Modify: `tests/render.test.ts`
- Modify: `tests/render-grant.test.ts`
- Modify: `tests/middleware.test.ts`
- Modify: `tests/next.test.ts`
- Modify: `tests/scripts.test.ts`
- Modify: `tests/config-cache.test.ts`

- [ ] Provide explicit test site secrets wherever the production contract requires them.
- [ ] Add tests for one WLC request per in-flight operation, terminal denial, and successful WebSocket render.
- [ ] Add a regression assertion that generated normal render code does not contain `#fbf7f1` or the forced background style.
- [ ] Retain security assertions for missing secrets, invalid grants, replay, and cross-site grants.

### Task 4: Release verification and npm publication

**Files:**
- Modify: `package.json`, `package-lock.json`, `CHANGELOG.md`

- [ ] Run `npm run typecheck`.
- [ ] Run `npm run build`.
- [ ] Run `npm test` with zero failures.
- [ ] Run `npm pack --dry-run` and inspect package contents.
- [ ] Bump the patch version and publish to npmjs only after all checks pass.
- [ ] Verify the published tarball exports `attachShugoiWebSocket` and contains the WebSocket render marker.
