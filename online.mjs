import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createWorkshopServer } from './server.mjs';

const online = { password: randomBytes(12).toString('hex'), publicUrl: '' };
const server = await createWorkshopServer({ online });
await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
const port = server.address().port;
console.log('Starting a password-protected online workshop. Keep this window open.');
console.log('Username: workshop');
console.log(`Session password: ${online.password}`);
console.log('Everyone with this password can edit all rooms. Share it privately.');
console.log('Press Ctrl+C to stop sharing. Your saved projects stay in data/.');
const tunnel = spawn(fileURLToPath(new URL('./tools/cloudflared.exe', import.meta.url)),
  ['tunnel', '--url', `http://127.0.0.1:${port}`, '--no-autoupdate'],
  { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
let stopped = false;
function stop(code = 0) {
  if (stopped) return;
  stopped = true;
  tunnel.kill();
  server.close();
  server.closeAllConnections();
  process.exitCode = code;
}
let output = '';
function log(chunk) {
  const text = chunk.toString();
  process.stdout.write(text);
  output = (output + text).slice(-16000);
  const url = output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com\b/i)?.[0];
  if (url && !online.publicUrl) {
    online.publicUrl = url;
    console.log(`\nOpen and share: ${url}/?room=class-a`);
    console.log('Sign in as workshop with the session password printed above.');
    console.log('Use Share workshop inside any room to copy its online link.\n');
  }
}
tunnel.stdout.on('data', log);
tunnel.stderr.on('data', log);
tunnel.on('error', error => { console.error(`Tunnel could not start: ${error.message}`); stop(1); });
tunnel.on('exit', code => { if (!stopped) { console.log('Tunnel stopped.'); stop(code || 0); } });
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
process.on('exit', () => tunnel.kill());
