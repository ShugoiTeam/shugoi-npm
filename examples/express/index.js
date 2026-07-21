import express from 'express';
import { createShugoiMiddleware } from 'shugoi';

const PORT = process.env.PORT || 3000;
const SITE_KEY = process.env.SITE_KEY || 'sg_sk_live_ee28bfe80dcf71efaabf0734f45b73d7';

const app = express();

// One line: all CSP, anti-bot, guard injection handled
app.use(createShugoiMiddleware({
  siteKey: SITE_KEY,
  allowlist: ['/legal', '/docs'],
}));

app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Shugoi Express Demo</title>
</head>
<body>
  <h1>Shugoi Express Demo</h1>
  <p>Shugoi scripts are auto-injected by the middleware.</p>
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
  <footer>
    <a href="https://shugoi.com/legal/shugoi-notice" target="_blank">Shugoi Anti-Abuse Protection</a>
  </footer>
</body>
</html>`);
});

app.get('/legal/shugoi-notice', (req, res) => {
  res.send('<!DOCTYPE html><html><body><h1>Legal Notice</h1><p>Placeholder legal notice.</p></body></html>');
});

app.listen(PORT, () => console.log(`Express demo running on http://localhost:${PORT}`));
