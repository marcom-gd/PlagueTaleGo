import http from 'node:http';
import { spawn } from 'node:child_process';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createWorkshopServer } from './server.mjs';
import { createSharing } from './tunnel.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const workspaceId = createHash('sha256').update(root).digest('hex').slice(0, 16);
const hash = value => createHash('sha256').update(value).digest();
const listen = (server, port) => new Promise((resolve, reject) => {
  const error = value => { server.off('listening', ready); reject(value); };
  const ready = () => { server.off('error', error); resolve(); };
  server.once('error', error); server.once('listening', ready); server.listen(port, '127.0.0.1');
});
const close = server => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });

async function findLauncher(port, userTest = false) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/launcher/identity`, { signal: AbortSignal.timeout(1000), redirect: 'error' });
    const identity = await response.json();
    if (identity.application === 'plague-tale-go-launcher' && identity.workspaceId === workspaceId && Boolean(identity.userTest) === userTest) {
      return { url: `http://127.0.0.1:${port}/welcome`, reused: true, stop: async () => {} };
    }
  } catch {}
}

export async function createLauncher({ userTest = false, port = Number(process.env.PORT) || (userTest ? 3100 : 3000), dataDir, connect } = {}) {
  // Probe the whole port range first: an earlier conflicting app may have closed
  // since this launcher chose its fallback port.
  if (port) for (let offset = 0; offset < 10 && port + offset <= 65535; offset++) {
    const existing = await findLauncher(port + offset, userTest);
    if (existing) return existing;
  }
  let base = '', sharing, gateway, shuttingDown = false;
  const publicMarker = randomBytes(24).toString('hex');
  const assets = new Map([['/welcome', ['welcome.html', 'text/html']], ['/welcome.js', ['welcome.js', 'text/javascript']], ['/welcome.css', ['welcome.css', 'text/css']]]);
  const json = (res, code, value) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(value)); };
  const host = {
    isLocal: req => !req.headers['x-workshop-public'] && [`127.0.0.1:${server.address()?.port}`, `localhost:${server.address()?.port}`].includes(req.headers.host),
    get publicUrl() { return sharing?.snapshot().publicUrl || ''; },
    async handle(req, res, isLocal) {
      try {
        const url = new URL(req.url, 'http://localhost');
        const isControl = url.pathname.startsWith('/api/launcher');
        const isAsset = assets.has(url.pathname) || url.pathname.startsWith('/welcome');
        if (!isControl && !isAsset) return false;
        if (!isLocal) { json(res, 403, { error: 'Session controls are available only on the host computer.' }); return true; }
        if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) { json(res, 403, { error: 'Open session controls from the welcome page.' }); return true; }
        if (assets.has(url.pathname) && ['GET', 'HEAD'].includes(req.method)) {
          const [file, type] = assets.get(url.pathname);
          const body = await readFile(path.join(root, 'launcher', file));
          res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'" });
          res.end(req.method === 'HEAD' ? undefined : body);
        } else if (url.pathname === '/api/launcher/identity' && req.method === 'GET') {
          json(res, 200, { application: 'plague-tale-go-launcher', workspaceId, userTest });
        } else if (url.pathname === '/api/launcher' && req.method === 'GET') {
          json(res, 200, { ...(sharing?.snapshot() || { state: 'local' }), ...(userTest ? { userTest: true } : {}) });
        } else if (['/api/launcher/online', '/api/launcher/stop'].includes(url.pathname) && req.method === 'POST') {
          // Require a browser same-origin request; a form on another website cannot start sharing.
          if (req.headers.origin !== `http://${req.headers.host}` || req.headers['content-type'] !== 'application/json') {
            json(res, 403, { error: 'Use the welcome page to change sharing.' }); return true;
          }
          if (!sharing || shuttingDown) { json(res, 503, { error: 'The launcher is starting or stopping. Please retry.' }); return true; }
          if (url.pathname.endsWith('/online')) sharing.start(randomBytes(12).toString('hex'));
          else await sharing.stop();
          json(res, 200, { ...sharing.snapshot(), ...(userTest ? { userTest: true } : {}) });
        } else json(res, 404, { error: 'Not found.' });
      } catch { if (!res.headersSent) json(res, 500, { error: 'Session controls could not complete the request. Please retry.' }); else res.end(); }
      return true;
    }
  };
  const server = await createWorkshopServer({ ...(dataDir ? { dataDir } : {}), host, userTest });
  for (let attempt = 0; ; attempt++) {
    const candidate = port === 0 ? 0 : port + attempt;
    try { await listen(server, candidate); break; }
    catch (error) {
      if (error.code !== 'EADDRINUSE') { await close(server); throw error; }
      const existing = await findLauncher(candidate, userTest);
      if (existing) { await close(server); return existing; }
      if (attempt >= 9) { await close(server); throw error; }
    }
  }
  base = `http://127.0.0.1:${server.address().port}`;
  // A separate gateway authenticates participants and marks every forwarded request.
  // The workshop has one in-memory room store; public requests never acquire host privileges.
  gateway = http.createServer((req, res) => {
    const password = sharing?.snapshot().password;
    const expected = `Basic ${Buffer.from(`workshop:${password}`).toString('base64')}`;
    if (!password || !timingSafeEqual(hash(req.headers.authorization || ''), hash(expected))) {
      res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="Workshop", charset="UTF-8"', 'Cache-Control': 'no-store' });
      return res.end('Enter the workshop username and session password supplied by your host.');
    }
    const headers = { ...req.headers, 'x-workshop-public': publicMarker };
    delete headers.authorization;
    // Preserve the original Host for the workshop's existing same-origin checks.
    const upstream = http.request(base + req.url, { method: req.method, headers }, response => {
      res.writeHead(response.statusCode, response.headers); response.pipe(res);
    });
    upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end('The workshop is unavailable. Ask your host to reopen the launcher.'); });
    res.on('close', () => upstream.destroy());
    req.pipe(upstream);
  });
  try { await listen(gateway, 0); }
  catch (error) { await close(server); throw error; }
  sharing = createSharing({ target: `http://127.0.0.1:${gateway.address().port}`, ...(connect ? { connect } : {}) });
  return {
    url: base + '/welcome', reused: false,
    async stop() {
      if (shuttingDown) return;
      shuttingDown = true;
      await sharing.stop();
      await close(gateway); await close(server);
    }
  };
}

function openBrowser(url) {
  const command = process.platform === 'win32' ? ['rundll32.exe', ['url.dll,FileProtocolHandler', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  const child = spawn(command[0], command[1], { windowsHide: true, detached: true, stdio: 'ignore' });
  child.on('error', () => console.error(`Open this address in your browser: ${url}`));
  child.unref();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const launcher = await createLauncher({ userTest: process.argv.includes('--user-test') });
    console.log(`Plague Tale GO: ${launcher.url}`);
    if (!process.argv.includes('--no-open')) openBrowser(launcher.url);
    if (!launcher.reused) {
      console.log('Keep this launcher running while you use the workshop. Press Ctrl+C to close it.');
      const stop = () => { launcher.stop().catch(error => { console.error(error.message); process.exitCode = 1; }); };
      process.on('SIGINT', stop); process.on('SIGTERM', stop);
      process.once('exit', () => { launcher.stop(); });
    }
  } catch (error) { console.error(`Could not start Plague Tale GO: ${error.message}`); process.exitCode = 1; }
}
