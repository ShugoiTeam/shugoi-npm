import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocket, WebSocketServer } from 'ws';
import { readLatestBootstrap, renderResponseData } from './render';

export interface ShugoiWebSocketOptions {
  siteKey: string;
  secret: string;
  /** Optional multi-tenant resolver used by the Shugoi platform itself. */
  resolveSecret?: (siteKey: string) => string | null | Promise<string | null>;
  sameOrigin?: (req: IncomingMessage) => boolean;
}
type RenderRequest = { token: string; mid: string; grant: string };
const MAX_QUERY_BYTES = 24 * 1024;
const nowSubMs = (): number => Date.now() + (typeof performance === 'undefined' ? 0 : performance.now() % 1);
const originOK = (req: IncomingMessage): boolean => { const origin = req.headers.origin, host = req.headers.host; if (!origin || !host) return false; try { return new URL(origin).host === host; } catch { return false; } };
function headers(req: IncomingMessage): Headers { const out = new Headers({ accept: 'application/json', 'x-shugoi-ws-relay': '1' }); for (const n of ['origin','user-agent','sec-ch-ua','sec-ch-ua-platform','sec-ch-ua-mobile','x-real-ip','x-forwarded-for','x-forwarded-proto','cookie']) { const v = req.headers[n]; if (typeof v === 'string' && v.length <= 4096) out.set(n, v); } return out; }
function renderRequest(value: string, multiplexed = false): RenderRequest | null { try { const x = JSON.parse(value) as Record<string, unknown>; const allowed = multiplexed ? ['cmd', 'token', 'mid', 'grant'] : ['token', 'mid', 'grant']; if (!x || typeof x !== 'object' || Array.isArray(x) || Object.keys(x).length !== allowed.length || Object.keys(x).some(k => !allowed.includes(k)) || (multiplexed && x.cmd !== 'render') || typeof x.token !== 'string' || x.token.length < 16 || x.token.length > 300 || typeof x.mid !== 'string' || !/^[a-f0-9]{64}$/.test(x.mid) || typeof x.grant !== 'string' || x.grant.length > 256) return null; return { token: x.token, mid: x.mid, grant: x.grant }; } catch { return null; } }
function queryRequest(value: string): { query: string; stream: boolean; streamQuery?: string } | null { try { const x = JSON.parse(value) as Record<string, unknown>; if (!x || typeof x !== 'object' || Array.isArray(x) || Object.keys(x).some(k => k !== 'q' && k !== 's')) return null; const stream = typeof x.s === 'string' && typeof x.q !== 'string'; const raw = x.q ?? x.s; if (typeof raw !== 'string' || raw.length < 2 || raw.length > MAX_QUERY_BYTES || !raw.startsWith('?')) return null; const q = new URLSearchParams(raw.slice(1)); if (!q.has('mid') || !q.has('raw') || !q.has('key')) return null; const streamQuery = typeof x.q === 'string' && typeof x.s === 'string' && x.s.startsWith('?') ? new URLSearchParams(x.s.slice(1)).toString() : undefined; return { query: q.toString(), stream, streamQuery }; } catch { return null; } }
async function stream(ws: WebSocket, req: IncomingMessage, base: string, query: string): Promise<void> { const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 65000); timer.unref(); ws.once('close', () => ctl.abort()); try { const r = await fetch(`${base}/api/v1/whitelist-stream?${query}`, { headers: headers(req), signal: ctl.signal }); if (!r.ok || !r.body) { if (ws.readyState === WebSocket.OPEN) ws.send((await r.text()).slice(0, 16384), () => ws.close()); return; } const reader = r.body.getReader(), decoder = new TextDecoder(); let pending = ''; while (ws.readyState === WebSocket.OPEN) { const part = await reader.read(); if (part.done) break; pending += decoder.decode(part.value, { stream: true }); const lines = pending.split(/\r?\n/); pending = lines.pop() || ''; for (const line of lines) if (line.startsWith('data: ') && line.length <= 16384 && ws.bufferedAmount < 65536) ws.send(line.slice(6), { binary: false, compress: false }); } } catch {} finally { clearTimeout(timer); } }
async function render(ws: WebSocket, msg: Record<string, unknown>, opts: ShugoiWebSocketOptions, multiplexed = false): Promise<void> {
  const r = renderRequest(JSON.stringify(msg), multiplexed);
  if (!r) {
    console.warn('[shugoi] ws_render_rejected', { reason: 'invalid_request', multiplexed });
    return ws.terminate();
  }
  try {
    const tokenSiteKey = r.token.split(':', 1)[0];
    const renderSiteKey = tokenSiteKey === opts.siteKey ? opts.siteKey : tokenSiteKey;
    const renderSecret = renderSiteKey === opts.siteKey
      ? opts.secret
      : (opts.resolveSecret ? await opts.resolveSecret(renderSiteKey) : null);
    if (!renderSecret) {
      console.warn('[shugoi] ws_render_rejected', { reason: 'unknown_site', siteKey: renderSiteKey, mid: r.mid.slice(0, 8) });
      return ws.terminate();
    }
    const out = await renderResponseData(r.token, undefined, undefined, r.mid, r.grant, undefined, renderSiteKey, renderSecret);
    if (!out.html) {
      console.warn('[shugoi] ws_render_rejected', { reason: out.error || 'empty_render', siteKey: opts.siteKey, mid: r.mid.slice(0, 8) });
      return ws.terminate();
    }
    if (out.html.length > 1024 * 1024 || ws.readyState !== WebSocket.OPEN) {
      console.warn('[shugoi] ws_render_rejected', { reason: ws.readyState !== WebSocket.OPEN ? 'socket_not_open' : 'render_too_large', siteKey: opts.siteKey, mid: r.mid.slice(0, 8) });
      return ws.terminate();
    }
    ws.send(out.html, { binary: false, compress: false }, err => {
      if (err) console.warn('[shugoi] ws_render_send_failed', { siteKey: opts.siteKey, mid: r.mid.slice(0, 8), error: String(err) });
      else ws.close(1000, 'render-delivered');
    });
  } catch (error) {
    console.warn('[shugoi] ws_render_error', { siteKey: opts.siteKey, mid: r.mid.slice(0, 8), error: String(error) });
    ws.terminate();
  }
}

/** SDK-owned bootstrap, SSR render, WLC, whitelist-stream and clock transports. */
export function attachShugoiWebSocket(server: Server, opts: ShugoiWebSocketOptions): () => void {
  const wss = new WebSocketServer({ noServer: true, perMessageDeflate: false, maxPayload: MAX_QUERY_BYTES + 256 });
  const upgrades = new Map<string, number[]>();
  const onUpgrade = (req: IncomingMessage, socket: Duplex, head: Buffer): void => { const path = new URL(req.url || '/', 'http://localhost').pathname; if (!['/__shugoi/bootstrap/ws','/__shugoi/render/ws','/api/v1/ws-wlc','/ws-clock'].includes(path)) return; const origin = req.headers.origin; const wlcOrigin = typeof origin === 'string' && /^https?:\/\//.test(origin); if (path === '/api/v1/ws-wlc' ? !wlcOrigin : !(opts.sameOrigin || originOK)(req)) { socket.destroy(); return; } const peer = req.socket.remoteAddress || 'unknown', now = Date.now(), recent = (upgrades.get(peer) || []).filter(t => now - t < 10000); if (path === '/api/v1/ws-wlc' && recent.length >= 24) { socket.destroy(); return; } recent.push(now); upgrades.set(peer, recent); wss.handleUpgrade(req, socket, head, ws => { const ttl = setTimeout(() => ws.terminate(), path === '/api/v1/ws-wlc' ? 70000 : 10000); ttl.unref(); let tick: ReturnType<typeof setInterval> | undefined; ws.on('close', () => { clearTimeout(ttl); clearInterval(tick); }); ws.on('error', () => ws.terminate()); if (path === '/__shugoi/bootstrap/ws') { const b = readLatestBootstrap(); if (!b) return ws.terminate(); return ws.send(b, { binary: false, compress: false }, () => ws.close(1000, 'bootstrap-delivered')); } let mode: 'clock'|'wlc'|null = null, pings = 0, drift: number | null = null;
    ws.on('message', async (raw, binary) => { if (binary) return ws.terminate(); let msg: unknown; try { msg = JSON.parse(raw.toString()); } catch { return ws.terminate(); } if (!msg || typeof msg !== 'object' || Array.isArray(msg)) return ws.terminate(); const x = msg as Record<string, unknown>;
      if (path === '/__shugoi/render/ws') return void render(ws, x, opts);
      if (path === '/ws-clock') { if (x.cmd === 'stop') { clearInterval(tick); return; } if (x.cmd === 'stream') { const ms = Math.max(50, Math.min(1000, Math.round(Number(x.ms ?? 250)))); clearInterval(tick); tick = setInterval(() => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify({ t: nowSubMs(), ms })), ms); return; } if (Object.keys(x).length !== 1 || typeof x.tSend !== 'number') return ws.terminate(); return void ws.send(JSON.stringify({ tSend: x.tSend, tRecv: nowSubMs(), tOut: nowSubMs() })); }
      if (x.cmd === 'clock-ping' && mode !== 'wlc' && typeof x.tSend === 'number') { if (++pings > 8) return ws.terminate(); mode = 'clock'; const tRecv = nowSubMs(), tOut = nowSubMs(); drift = (tRecv + tOut) / 2 - x.tSend; return void ws.send(JSON.stringify({ cmd: 'clock-pong', tSend: x.tSend, tRecv, tOut })); }
      if (mode === 'clock' && x.cmd === 'clock-stream') { const ms = Math.max(50, Math.min(1000, Math.round(Number(x.ms ?? 250)))); clearInterval(tick); tick = setInterval(() => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify({ cmd: 'clock-tick', t: nowSubMs(), ms })), ms); return; } if (mode === 'clock' && x.cmd === 'clock-stop') { clearInterval(tick); return; }
      if (x.cmd === 'event' && typeof x.reason === 'string' && typeof x.siteKey === 'string' && Object.keys(x).every(k => ['cmd', 'reason', 'machineId', 'siteKey'].includes(k))) { const address = server.address(); if (!address || typeof address === 'string') return ws.terminate(); try { await fetch(`http://127.0.0.1:${address.port}/api/v1/event`, { method: 'POST', headers: { ...Object.fromEntries(headers(req)), 'content-type': 'application/json' }, body: JSON.stringify({ siteKey: x.siteKey, reason: x.reason, machineId: typeof x.machineId === 'string' ? x.machineId : '' }), signal: AbortSignal.timeout(4000) }); } catch {} return void ws.close(1000, 'event-delivered'); }
      if (x.cmd === 'render') return void render(ws, x, opts, true); const q = queryRequest(JSON.stringify(x)), address = server.address(); if (!q || !address || typeof address === 'string') return ws.terminate(); if (drift !== null && Math.abs(Number(new URLSearchParams(q.query).get('drift')) - drift) > 1500) return ws.terminate(); mode = 'wlc'; const base = `http://127.0.0.1:${address.port}`; if (q.stream) return void stream(ws, req, base, q.query); try { const r = await fetch(`${base}/api/v1/wlc?${q.query}`, { headers: headers(req), signal: AbortSignal.timeout(8000) }); const body = await r.text(); if (body.length > 16384 || ws.readyState !== WebSocket.OPEN) return ws.terminate(); ws.send(body, { binary: false, compress: false }, () => { if (q.streamQuery) void stream(ws, req, base, q.streamQuery); }); } catch { ws.terminate(); }
    }); }); };
  server.on('upgrade', onUpgrade); return () => { server.off('upgrade', onUpgrade); for (const ws of wss.clients) ws.terminate(); wss.close(); };
}
