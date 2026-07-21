import Fastify from 'fastify';
import expressPlugin from '@fastify/express';
import { createShugoiMiddleware } from 'shugoi';

const PORT = process.env.PORT || 3002;
const SITE_KEY = process.env.SITE_KEY || 'sg_sk_live_ee28bfe80dcf71efaabf0734f45b73d7';

const app = Fastify({ logger: true });

async function start() {
  // Use @fastify/express to register Connect-compatible middleware
  await app.register(expressPlugin);
  app.use(createShugoiMiddleware({
    siteKey: SITE_KEY,
    allowlist: ['/legal'],
  }));

  app.get('/', async (req, reply) => {
    reply.type('text/html').send(`<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Shugoi Fastify Demo</title></head>
<body>
  <h1>Shugoi Fastify Demo</h1>
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
</body></html>`);
  });

  await app.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`Fastify demo running on http://localhost:${PORT}`);
}

start();
