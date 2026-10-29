import http from 'node:http';
import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import { newProject, applyAction, validateProject } from './public/model.js';

const root = path.dirname(fileURLToPath(import.meta.url));
export async function createWorkshopServer({ dataDir = path.join(root, 'data') } = {}) {
  await mkdir(dataDir, { recursive: true });
  const rooms = new Map();
  async function getRoom(name) {
    if (!rooms.has(name)) rooms.set(name, (async () => {
      let saved; try { saved = JSON.parse(await readFile(path.join(dataDir, name + '.json'), 'utf8')); validateProject(saved.project); } catch { saved = { project: newProject(), revision: 0 }; }
      return { ...saved, clients: new Set(), queue: Promise.resolve(), recent: new Map() };
    })());
    return rooms.get(name);
  }
  const broadcast = (r, payload) => { for (const client of r.clients) client.write(`data: ${JSON.stringify(payload)}\n\n`); };
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const json = (code, value) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
    try {
      if (url.pathname === '/api/config') {
        const port = server.address().port;
        return json(200, { urls: Object.values(os.networkInterfaces()).flat().filter(a => a.family === 'IPv4' && !a.internal).map(a => `http://${a.address}:${port}`) });
      }
      if (url.pathname.startsWith('/api/rooms/')) {
        const [, , , name, endpoint] = url.pathname.split('/');
        if (!/^[a-zA-Z0-9_-]{1,64}$/.test(name || '')) return json(400, { error: 'Invalid room name.' });
        const room = await getRoom(name.toLowerCase());
        if (endpoint === 'events' && req.method === 'GET') {
          res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
          room.clients.add(res);
          res.write(`data: ${JSON.stringify({ project: room.project, revision: room.revision, peers: room.clients.size })}\n\n`);
          broadcast(room, { peers: room.clients.size });
          const keep = setInterval(() => res.write(': heartbeat\n\n'), 20000);
          req.on('close', () => { clearInterval(keep); room.clients.delete(res); broadcast(room, { peers: room.clients.size }); }); return;
        }
        if (!endpoint && req.method === 'GET') return json(200, { project: room.project, revision: room.revision });
        if (endpoint === 'actions' && req.method === 'POST') {
          if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}` && req.headers.origin !== `https://${req.headers.host}`) return json(403, { error: 'Origin does not match this server.' });
          let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 2_000_000) return json(413, { error: 'Project is too large.' }); }
          const { action, actionId, expectedRevision } = JSON.parse(body);
          if (typeof actionId !== 'string' || actionId.length > 100) return json(400, { error: 'Missing action ID.' });
          room.queue = room.queue.catch(() => {}).then(async () => {
            if (room.recent.has(actionId)) return json(200, {project:room.project,revision:room.revision,actionId});
            if (action.type === 'project.replace' && expectedRevision !== room.revision) return json(409, { error: 'Another participant changed the project. Try again after reviewing their changes.' });
            const project = applyAction(room.project, action), revision = room.revision + 1;
            const target = path.join(dataDir, name + '.json');
            await writeFile(target + '.tmp', JSON.stringify({ project, revision })); await rename(target + '.tmp', target);
            room.project = project; room.revision = revision;
            const payload = { project, revision, actionId };
            room.recent.set(actionId, revision); if (room.recent.size > 1000) room.recent.delete(room.recent.keys().next().value);
            broadcast(room, payload); json(200, payload);
          }).catch(e => { if (!res.writableEnded) json(400, { error: e.message }); });
          return;
        }
        return json(404, { error: 'Endpoint not found.' });
      }
      if (!['GET','HEAD'].includes(req.method)) return json(405, { error: 'Method not allowed.' });
      const pathname = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
      const target = path.resolve(root, 'public', '.' + pathname);
      if (!target.startsWith(path.join(root, 'public') + path.sep)) return json(404, { error: 'Not found.' });
      const body = await readFile(target);
      res.writeHead(200, { 'Content-Type': ({ '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml' })[path.extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch (e) { if (!res.headersSent) json(e.code === 'ENOENT' ? 404 : 400, { error: e.code === 'ENOENT' ? 'Not found.' : e.message }); else res.end(); }
  });
  return server;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = await createWorkshopServer();
  server.listen(Number(process.env.PORT) || 3000, '0.0.0.0', () => {
    console.log(`Plague Tale GO workshop: http://localhost:${server.address().port}`);
    for (const a of Object.values(os.networkInterfaces()).flat().filter(a => a.family === 'IPv4' && !a.internal)) console.log(`Classroom: http://${a.address}:${server.address().port}`);
  });
}
