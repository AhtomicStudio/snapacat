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

/**
 * The only directories this tool will serve.
 *
 * It started out serving the whole repository, which is more than it needs and
 * more than is wise: `/.git/config`, `/google-services.json` and everything
 * under `node_modules` were all reachable. Binding to loopback is not the
 * protection it looks like — any page open in a browser on this machine can
 * make requests to 127.0.0.1, and DNS rebinding turns that into a read of
 * whatever the server will hand out. A review harness needs the harness and
 * the sheets, so that is all it gets.
 */
const SERVABLE = ['scripts/sprites', 'src/assets/sprites'].map((p) => path.resolve(ROOT, p));

/** True when `target` is inside `dir` — and not merely prefixed by its name. */
function isInside(target, dir) {
  // `startsWith(dir)` alone says yes to "<dir>Evil/x", which is the oldest
  // path-containment bug there is.
  return target === dir || target.startsWith(dir + path.sep);
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8',
  '.ttf': 'font/ttf',
};

const server = http.createServer((req, res) => {
  /**
   * Only answer to a loopback name.
   *
   * A browser will happily resolve an attacker-controlled hostname to
   * 127.0.0.1 and then treat this server as that origin, which is how a web
   * page reads from a local dev server it has no business touching. Checking
   * the Host header costs nothing and takes the easy version of that off the
   * table.
   */
  const host = (req.headers.host || '').replace(/:\d+$/, '');
  if (host !== '127.0.0.1' && host !== 'localhost' && host !== '[::1]') {
    res.writeHead(403).end('loopback only');
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405).end('read only');
    return;
  }

  // Strip the query, decode, and normalise. posix.normalize drops leading
  // `..` segments on an absolute path, so a traversal attempt lands inside
  // ROOT rather than above it — but the containment check below is what the
  // guarantee actually rests on, not that.
  let raw;
  try {
    raw = decodeURIComponent((req.url || '/').split('?')[0]);
  } catch {
    res.writeHead(400).end('bad path');
    return;
  }
  const target = path.resolve(ROOT, '.' + path.posix.normalize(raw));

  if (!SERVABLE.some((dir) => isInside(target, dir))) {
    res.writeHead(403).end('not a servable path');
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
  console.log(`serving only: ${SERVABLE.map((d) => path.relative(ROOT, d)).join(", ")}`);
  console.log('ctrl-c to stop');
});
