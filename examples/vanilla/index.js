import http from 'http';
import { createShugoiMiddleware } from 'shugoi';

const PORT = process.env.PORT || 3001;
const SITE_KEY = process.env.SITE_KEY || 'sg_sk_live_ee28bfe80dcf71efaabf0734f45b73d7';

// Vanilla Node.js server with Shugoi middleware
const middleware = createShugoiMiddleware({
  siteKey: SITE_KEY,
  allowlist: ['/legal'],
});

const server = http.createServer(async (req, res) => {
  const enhancedRes = Object.assign(res, {
    setHeader: res.setHeader.bind(res),
    getHeader: (key) => res.getHeader(key),
    status: (code) => { res.statusCode = code; return enhancedRes; },
    type: (t) => { res.setHeader('Content-Type', t); return enhancedRes; },
    send: (body) => { res.end(body); },
  });

  let nextCalled = false;
  await middleware(req, enhancedRes, () => { nextCalled = true; });

  if (!nextCalled) return;

  // Route handler
  const path = req.url.split('?')[0];
  if (path === '/') {
    const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Shugoi Vanilla Demo</title></head>
<body>
  <h1>Shugoi Vanilla Node.js Demo</h1>
  <p id="status">Loading...</p>
  <script>
    setTimeout(() => {
      const el = document.getElementById('status');
      if (window.machineId) {
        el.textContent = 'Machine ID: ' + window.machineId;
        el.style.color = 'green';
      } else if (window.__sg_blocked) {
        el.textContent = 'Blocked by Shugoi';
        el.style.color = 'red';
      } else {
        el.textContent = 'Waiting for Shugoi...';
      }
    }, 2000);
  </script>
  <footer><a href="https://shugoi.com/legal/shugoi-notice" target="_blank">Shugoi Anti-Abuse Protection</a></footer>
</body></html>`;
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://shugoi.com; connect-src 'self' https://shugoi.com;");
    res.end(html);
  } else {
    res.statusCode = 404;
    res.end('Not found');
  }
});

server.listen(PORT, () => console.log(`Vanilla demo running on http://localhost:${PORT}`));
