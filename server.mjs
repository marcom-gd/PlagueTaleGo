import http from 'node:http';
import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import { createHash, timingSafeEqual, randomInt } from 'node:crypto';
import { newProject, applyAction, validateProject } from './public/model.js';
import {behaviourNames} from './public/behaviour-schema.js';
import { createPresence } from './presence.mjs';
import { deckIds, validateDeck } from './public/cards-catalog.js';
import { initialWorkshop, validateWorkshop, updateWorkshop } from './public/workshop-programme.js';
import { exportInventory, snapshotKinds } from './inventory-export.mjs';
import { projectBackups } from './project-backups.mjs';
import { userTestStore } from './user-test-store.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
export async function createWorkshopServer({ dataDir = path.join(root, 'data'), cardsDir = path.join(root, 'cards'), online = null, host = null, userTest = false, feedbackDir = dataDir === path.join(root, 'data') ? path.join(root, 'User Test Feedback') : path.join(dataDir, 'User Test Feedback'), saveDir = dataDir === path.join(root, 'data') ? path.join(root, 'Saved Projects') : path.join(dataDir, 'Saved Projects'), autosaveIntervalMs = 5 * 60 * 1000 } = {}) {
  await mkdir(dataDir, { recursive: true });
  const backups = await projectBackups({ defaultSaveFolder: saveDir, preferencesFile: path.join(dataDir, 'backup-options.json') });
  const rooms = new Map();
  const tests = userTestStore(feedbackDir);
  const readDeck = async id => {
    if(!deckIds.includes(id))throw Error('Unknown card deck.');
    return validateDeck(JSON.parse(await readFile(path.join(cardsDir, `${id}.json`), 'utf8')), id);
  };
  let catalogQueue=Promise.resolve();
  async function getRoom(name) {
    if (!rooms.has(name)) rooms.set(name, (async () => {
      let saved;
      try {
        saved = JSON.parse(await readFile(path.join(dataDir, name + '.json'), 'utf8'));
        saved.project = validateProject(saved.project);
      } catch {
        const imported = await backups.latest();
        saved = { project: imported || newProject(), revision: 0 };
        // Persist a startup import so revisiting this room keeps its own design.
        if (imported) await writeFile(path.join(dataDir, name + '.json'), JSON.stringify(saved));
      }
      try { saved.workshop = validateWorkshop(saved.workshop); } catch { saved.workshop = initialWorkshop(); }
      try { saved.workshop = validateWorkshop(JSON.parse(await readFile(path.join(dataDir, name + '.workshop.json'), 'utf8'))); } catch {}
      return { ...saved, clients: new Set(), queue: Promise.resolve(), workshopQueue: Promise.resolve(), recent: new Map(), presence: createPresence() };
    })());
    return rooms.get(name);
  }
  const broadcast = (r, payload) => { for (const client of r.clients) client.write(`data: ${JSON.stringify(payload)}\n\n`); };
  const workshopPayload = room => ({ workshop: room.workshop, serverNow: Date.now() });
  const server = http.createServer(async (req, res) => {
    const isLocalHost = ['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress) && (!host || host.isLocal(req));
    if (host && await host.handle(req, res, isLocalHost)) return;
    if (online) {
      const expected = Buffer.from(`workshop:${online.password}`).toString('base64');
      const hash = value => createHash('sha256').update(value).digest();
      if (!online.password || !timingSafeEqual(hash(req.headers.authorization || ''), hash(`Basic ${expected}`))) {
        res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="Workshop", charset="UTF-8"', 'Cache-Control': 'no-store' });
        return res.end('Enter the workshop username and session password supplied by your host.');
      }
    }
    const url = new URL(req.url, 'http://localhost');
    const json = (code, value) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
    const canManageBackups = !online && isLocalHost;
    try {
      if (userTest && ['/api/options', '/api/decks'].some(route => url.pathname.startsWith(route)) && !['GET', 'HEAD'].includes(req.method)) return json(403, { error: 'Project editing is unavailable in User Test sessions.' });
      if (url.pathname === '/api/options') {
        if (req.method === 'GET') return json(200, { ...backups.snapshot(), canManageBackups });
        if (req.method !== 'PUT') return json(405, { error: 'Method not allowed.' });
        if (req.headers.origin && ![`http://${req.headers.host}`, `https://${req.headers.host}`].includes(req.headers.origin)) return json(403, { error: 'Origin does not match this server.' });
        let body = '';
        for await (const chunk of req) { body += chunk; if (body.length > 8192) return json(413, { error: 'Options are too large.' }); }
        const requested = JSON.parse(body);
        const currentFolder = backups.snapshot().saveFolder;
        if (!canManageBackups && requested.saveFolder !== undefined && requested.saveFolder !== currentFolder) return json(403, { error: 'Change the save folder from localhost on the workshop computer.' });
        await backups.update({ ...requested, saveFolder: requested.saveFolder ?? currentFolder });
        return json(200, { ...backups.snapshot(), canManageBackups });
      }
      if(url.pathname==='/api/decks' && req.method==='GET')return json(200,{decks:await Promise.all(deckIds.map(readDeck)),canEdit:!online && isLocalHost});
      if(url.pathname.startsWith('/api/decks/') && req.method==='PUT'){
        if(online || !isLocalHost)return json(403,{error:'Edit the repository card inventories from localhost on the host computer.'});
        if(req.headers.origin && ![`http://${req.headers.host}`,`https://${req.headers.host}`].includes(req.headers.origin))return json(403,{error:'Origin does not match this server.'});
        const id=url.pathname.split('/')[3];if(!deckIds.includes(id))return json(404,{error:'Unknown card deck.'});
        let body='';for await(const chunk of req){body+=chunk;if(body.length>1_000_000)return json(413,{error:'Card inventory is too large.'});}
        const {deck,original}=JSON.parse(body);validateDeck(deck,id);
        catalogQueue=catalogQueue.catch(()=>{}).then(async()=>{
          const current=await readDeck(id);
          if(JSON.stringify(current)!==JSON.stringify(original))return json(409,{error:'This inventory was edited elsewhere. Reload it before saving.'});
          const target=path.join(cardsDir,`${id}.json`);
          await writeFile(target+'.tmp',JSON.stringify(deck,null,2)+'\n');await rename(target+'.tmp',target);
          json(200,{deck});
        }).catch(error=>{if(!res.writableEnded)json(400,{error:error.message});});
        return;
      }
      if (url.pathname === '/api/config') {
        const config=value=>json(200,{...value,behaviourTypes:Object.keys(behaviourNames),levelTransferVersion:1});
        if (userTest) return config({ userTest: true, urls: host?.publicUrl ? [host.publicUrl] : online?.publicUrl ? [online.publicUrl] : [], ...(host ? { localOnly: !host.publicUrl, hostControls: isLocalHost } : {}), ...((online || host && !isLocalHost) ? { transport: 'poll' } : {}) });
        if (online) return config({ urls: online.publicUrl ? [online.publicUrl] : [], transport: 'poll' });
        if (host) return config({ urls: host.publicUrl ? [host.publicUrl] : [], localOnly: !host.publicUrl, hostControls: isLocalHost, ...(!isLocalHost ? { transport: 'poll' } : {}) });
        const port = server.address().port;
        return config({ urls: Object.values(os.networkInterfaces()).flat().filter(a => a.family === 'IPv4' && !a.internal).map(a => `http://${a.address}:${port}`) });
      }
      if (url.pathname.startsWith('/api/rooms/')) {
        const [, , , name, endpoint] = url.pathname.split('/');
        if (!/^[a-zA-Z0-9_-]{1,64}$/.test(name || '')) return json(400, { error: 'Invalid room name.' });
        const room = await getRoom(name.toLowerCase());
        if (endpoint === 'user-test') {
          if (!userTest) return json(404, { error: 'Start the User Test launcher to use this feature.' });
          if (req.method !== 'POST') return json(405, { error: 'Method not allowed.' });
          if (req.headers.origin && ![`http://${req.headers.host}`, `https://${req.headers.host}`].includes(req.headers.origin)) return json(403, { error: 'Origin does not match this server.' });
          const [, , , , , id, command] = url.pathname.split('/');
          let body = '';
          for await (const chunk of req) { body += chunk; if (body.length > 40000) return json(413, { error: 'Feedback is too large.' }); }
          await room.queue;
          return json(200, await tests({ room: name.toLowerCase(), id, command, body: JSON.parse(body || '{}'), project: room.project, revision: room.revision }));
        }
        if (userTest && ['actions', 'workshop', 'save'].includes(endpoint) && req.method !== 'GET') return json(403, { error: 'Project editing is unavailable in User Test sessions.' });
        if (endpoint === 'save' && req.method === 'POST') {
          if (!canManageBackups) return json(403, { error: 'Save to a folder from localhost on the workshop computer, or use Export project to download.' });
          if (req.headers.origin && ![`http://${req.headers.host}`, `https://${req.headers.host}`].includes(req.headers.origin)) return json(403, { error: 'Origin does not match this server.' });
          await room.queue;
          return json(200, await backups.save(name.toLowerCase(), room.project));
        }
        if (endpoint === 'inventory' && req.method === 'POST') {
          if (req.headers.origin && ![`http://${req.headers.host}`, `https://${req.headers.host}`].includes(req.headers.origin)) return json(403, { error: 'Origin does not match this server.' });
          const chunks = []; let bytes = 0;
          for await (const chunk of req) {
            bytes += chunk.length;
            if (bytes > 16_000_000) return json(413, { error: 'This snapshot is too large to export (16 MB maximum).' });
            chunks.push(chunk);
          }
          const request = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          if (!snapshotKinds.includes(request.snapshotKind)) return json(400, { error: 'Choose a supported inventory snapshot.' });
          if (!Number.isSafeInteger(request.revision) || request.revision < 0) return json(400, { error: 'Invalid source revision.' });
          const saved = request.snapshotKind === 'edit-design';
          if (saved && request.revision !== room.revision) return json(409, { error: 'The room changed before export. Review the latest saved design and export again.' });
          const workbook = exportInventory(saved ? room.project : request.project, { snapshotKind: request.snapshotKind, revision: request.revision, room: name.toLowerCase() });
          res.writeHead(200, {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': `attachment; filename="workshop-${name.toLowerCase()}-${request.snapshotKind}-inventory.xlsx"`,
            'Content-Length': workbook.length, 'Cache-Control': 'no-store'
          });
          return res.end(workbook);
        }
        if (endpoint === 'workshop' && req.method === 'POST') {
          if (req.headers.origin && ![`http://${req.headers.host}`, `https://${req.headers.host}`].includes(req.headers.origin)) return json(403, { error: 'Origin does not match this server.' });
          let body = '';
          for await (const chunk of req) { body += chunk; if (body.length > 2048) return json(413, { error: 'Workshop command is too large.' }); }
          const { command, expectedRevision } = JSON.parse(body);
          room.workshopQueue = room.workshopQueue.catch(() => {}).then(async () => {
            if (expectedRevision !== room.workshop.revision) return json(409, { ...workshopPayload(room), error: 'The workshop was just updated elsewhere. The latest step and timer are now shown.' });
            const workshop = updateWorkshop(room.workshop, command);
            const target = path.join(dataDir, name.toLowerCase() + '.workshop.json');
            await writeFile(target + '.tmp', JSON.stringify(workshop)); await rename(target + '.tmp', target);
            room.workshop = workshop;
            const payload = workshopPayload(room);
            broadcast(room, payload); json(200, payload);
          }).catch(error => { if (!res.writableEnded) json(400, { error: error.message }); });
          return;
        }
        if (endpoint === 'presence' && req.method === 'GET') {
          room.presence.prune();
          const current = room.presence.snapshot();
          if (Number(url.searchParams.get('since')) !== current.revision || !url.searchParams.has('since')) return json(200, current);
          const finish = value => { clearTimeout(timer); unsubscribe(); if (!res.destroyed) json(200, value); };
          const unsubscribe = room.presence.subscribe(finish);
          const timer = setTimeout(() => finish(room.presence.snapshot()), 15000);
          res.on('close', () => { clearTimeout(timer); unsubscribe(); });
          return;
        }
        if (endpoint === 'presence' && req.method === 'POST') {
          if (req.headers.origin && ![`http://${req.headers.host}`, `https://${req.headers.host}`].includes(req.headers.origin)) return json(403, { error: 'Origin does not match this server.' });
          let body = '';
          for await (const chunk of req) { body += chunk; if (body.length > 2048) return json(413, { error: 'Presence is too large.' }); }
          return json(200, room.presence.update({ ...JSON.parse(body), ...(userTest ? { cursor: null } : {}) }));
        }
        if (endpoint === 'events' && req.method === 'GET') {
          res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
          room.clients.add(res);
          res.write(`data: ${JSON.stringify({ project: room.project, revision: room.revision, peers: room.clients.size, ...workshopPayload(room) })}\n\n`);
          broadcast(room, { peers: room.clients.size });
          const keep = setInterval(() => res.write(': heartbeat\n\n'), 20000);
          req.on('close', () => { clearInterval(keep); room.clients.delete(res); broadcast(room, { peers: room.clients.size }); }); return;
        }
        if (!endpoint && req.method === 'GET') return json(200, { ...(Number(url.searchParams.get('since')) === room.revision && url.searchParams.has('since') ? {} : { project: room.project }), revision: room.revision, ...workshopPayload(room) });
        if (endpoint === 'actions' && req.method === 'POST') {
          if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}` && req.headers.origin !== `https://${req.headers.host}`) return json(403, { error: 'Origin does not match this server.' });
          let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 2_000_000) return json(413, { error: 'Project is too large.' }); }
          const { action, actionId, expectedRevision } = JSON.parse(body);
          if (typeof actionId !== 'string' || actionId.length > 100) return json(400, { error: 'Missing action ID.' });
          room.queue = room.queue.catch(() => {}).then(async () => {
            if (room.recent.has(actionId)) return json(200, {project:room.project,revision:room.revision,actionId});
            if (['project.replace','level.import'].includes(action.type) && expectedRevision !== room.revision) return json(409, { error: 'Another participant changed the project. Try again after reviewing their changes.' });
            if(action.type==='card.record')throw Error('Draw a card from its deck instead.');
            let resolvedAction=action;
            if(action.type==='card.claim'){
              const deck=await readDeck(action.data.draw.deckId),card=deck.cards.find(c=>c.id===action.data.draw.cardId);
              if(!card)throw Error('This card was removed. Refresh the inventory.');
              if(room.project.cardDraws.some(d=>d.deckId===deck.id&&d.cardId===card.id))throw Error('Another participant just drew that card. Draw again.');
              resolvedAction={type:'card.claim',data:{...action.data,draw:{...card,cardId:card.id,id:action.data.draw.id,deckId:deck.id}}};
            }
            if(action.type==='card.draw'){
              const deck=await readDeck(action.data.deckId);
              const used=new Set(room.project.cardDraws.filter(draw=>draw.deckId===deck.id).map(draw=>draw.cardId));
              const remaining=deck.cards.filter(card=>!used.has(card.id));
              if(!remaining.length)throw Error('This deck is empty. Reset it to draw again.');
              const card=remaining[randomInt(remaining.length)];
              resolvedAction={type:'card.record',data:{draw:{id:actionId,deckId:deck.id,cardId:card.id,title:card.title,task:card.task,reflection:card.reflection}}};
            }
            const project = applyAction(room.project, resolvedAction), revision = room.revision + 1;
            const target = path.join(dataDir, name + '.json');
            await writeFile(target + '.tmp', JSON.stringify({ project, revision, workshop: room.workshop })); await rename(target + '.tmp', target);
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
  const presenceCleanup = setInterval(async () => { for (const room of rooms.values()) (await room).presence.prune(); }, 5000);
  presenceCleanup.unref();
  let savingBackups = false;
  const autosaveTimer = setInterval(async () => {
    if (userTest || savingBackups || !backups.snapshot().autosave) return;
    savingBackups = true;
    try {
      for (const [name, pendingRoom] of rooms) {
        const room = await pendingRoom;
        await room.queue.catch(() => {});
        // The shared design is saved; private playtest changes stay in the browser.
        await backups.save(name, room.project, true).catch(() => {});
      }
    } finally { savingBackups = false; }
  }, autosaveIntervalMs);
  autosaveTimer.unref();
  server.on('close', () => { clearInterval(presenceCleanup); clearInterval(autosaveTimer); });
  return server;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = await createWorkshopServer();
  server.listen(Number(process.env.PORT) || 3000, '0.0.0.0', () => {
    console.log(`Plague Tale GO workshop: http://localhost:${server.address().port}`);
    for (const a of Object.values(os.networkInterfaces()).flat().filter(a => a.family === 'IPv4' && !a.internal)) console.log(`Classroom: http://${a.address}:${server.address().port}`);
  });
}
