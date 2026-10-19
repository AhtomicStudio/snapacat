#!/usr/bin/env node
/**
 * Serves the repo so preview.html can be opened in a real browser.
 *
 *   npm run sprites:preview   →  http://127.0.0.1:4178/scripts/sprites/preview.html
 *
 * WHY THIS EXISTS
 *
 * The harness was built to run from file:// specifically so it needed no
 * server, and for a browser you drive yourself that is the right call. It stops
 * being the right call the moment anything else has to open it: embedded
 * viewers and preview panes commonly load a local file as a snapshot with no
 * filesystem base, and every relative path in the page — the generated data
 * table, all forty sheets — resolves against nothing and silently yields a
 * blank sprite. That is the same trap the page's own header warns about for
 * data: URLs, met from a different direction.
 *
 * Thirty lines of http.createServer costs less than the next person losing an
 * afternoon to a blank grid. file:// still works; this is the fallback.
 *
 * Deliberately bound to loopback and read-only: it is a review tool, not
 * infrastructure.
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const PORT = Number(process.env.PORT) || 4178;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8',
  '.ttf': 'font/ttf',
};

const server = http.createServer((req, res) => {
  // Strip the query, decode, and normalise. Resolving against ROOT and then
  // checking the result is still inside it is what stops `../../..` escaping.
  const raw = decodeURIComponent((req.url || '/').split('?')[0]);
  const target = path.resolve(ROOT, '.' + path.posix.normalize(raw));

  if (!target.startsWith(ROOT)) {
    res.writeHead(403).end('outside the repo');
    return;
  }

  fs.stat(target, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(target).toLowerCase()] ?? 'application/octet-stream',
      // The whole point of this tool is seeing the sheet you just rebuilt.
      'Cache-Control': 'no-store',
    });
    fs.createReadStream(target).pipe(res);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`sprite preview → http://127.0.0.1:${PORT}/scripts/sprites/preview.html`);
  console.log('ctrl-c to stop');
});
