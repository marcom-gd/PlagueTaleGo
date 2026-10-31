import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { access, mkdir, rename, rm } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const executable = fileURLToPath(new URL('./tools/cloudflared.exe', import.meta.url));

async function ensureTunnel(signal, onProgress) {
  try { await access(executable); return; } catch {}
  if (process.platform !== 'win32' || !['x64', 'arm64'].includes(process.arch)) throw Error('Online hosting requires 64-bit Windows or Windows ARM64.');
  onProgress('Downloading the online sharing tool. This is only needed the first time…');
  await mkdir(fileURLToPath(new URL('./tools/', import.meta.url)), { recursive: true });
  const download = executable + `.${process.pid}.download`;
  try {
    const response = await fetch(`https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-${process.arch === 'arm64' ? 'arm64' : 'amd64'}.exe`, { signal: AbortSignal.any([signal, AbortSignal.timeout(120000)]) });
    if (!response.ok) throw Error(`Download failed (${response.status}). Check your internet connection and try again.`);
    await pipeline(Readable.fromWeb(response.body), createWriteStream(download), { signal });
    signal.throwIfAborted();
    await rename(download, executable);
  } finally { await rm(download, { force: true }).catch(() => {}); }
}

export async function startTunnel({ target, signal, onProgress = () => {}, onExit = () => {} }) {
  await ensureTunnel(signal, onProgress);
  signal.throwIfAborted();
  onProgress('Connecting your session to the internet…');
  return new Promise((resolve, reject) => {
    const child = spawn(executable, ['tunnel', '--url', target, '--no-autoupdate'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '', url = '', connected = false, ready = false, stopped = false;
    const stop = () => { stopped = true; clearTimeout(timeout); signal.removeEventListener('abort', abort); child.kill(); };
    const fail = error => { stop(); reject(error); };
    const abort = () => fail(Error('Online sharing cancelled.'));
    const timeout = setTimeout(() => fail(Error('Online sharing took too long to connect. Check your connection and try again.')), 90000);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) return abort();
    const receive = chunk => {
      output = (output + chunk.toString()).slice(-16000);
      url ||= output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com\b/i)?.[0] || '';
      connected ||= /Registered tunnel connection/.test(output);
      if (url && connected && !ready && !stopped) {
        ready = true; clearTimeout(timeout);
        resolve({ url, stop });
      }
    };
    child.stdout.on('data', receive);
    child.stderr.on('data', receive);
    child.on('error', error => {
      if (ready && !stopped) { stop(); onExit(`Online sharing stopped: ${error.message}`); }
      else fail(Error(`The sharing tool could not start: ${error.message}. Remove tools/cloudflared.exe and retry if it is damaged.`));
    });
    child.on('exit', () => {
      clearTimeout(timeout); signal.removeEventListener('abort', abort);
      if (stopped) return;
      stopped = true;
      const message = 'Online sharing disconnected. Check your internet connection and try again.';
      if (ready) onExit(message); else reject(Error(message));
    });
  });
}

export function createSharing({ target, connect = startTunnel }) {
  let state = 'local', message = '', password = '', publicUrl = '', active = null, controller = null, pending = null, stopping = null;
  return {
    snapshot: () => ({ state, message, username: password ? 'workshop' : '', password, publicUrl }),
    start(newPassword) {
      if (stopping || state === 'starting' || state === 'online') return;
      state = 'starting'; message = 'Preparing online sharing…'; password = newPassword;
      const attempt = controller = new AbortController();
      pending = (async () => {
        try {
          const tunnel = await connect({ target, signal: attempt.signal,
            onProgress: value => { if (controller === attempt) message = value; },
            onExit: value => { if (controller === attempt) { state = 'error'; message = value; publicUrl = ''; password = ''; active = null; } }
          });
          if (controller !== attempt || attempt.signal.aborted) return tunnel.stop();
          active = tunnel; publicUrl = tunnel.url; state = 'online'; message = 'Your session is ready to share.';
        } catch (error) {
          if (controller === attempt) { state = 'error'; message = error.message; password = ''; publicUrl = ''; }
        }
      })();
    },
    async stop() {
      if (stopping) return stopping;
      const finishing = pending;
      controller?.abort(); controller = null;
      active?.stop(); active = null;
      state = 'local'; message = ''; password = ''; publicUrl = '';
      stopping = Promise.resolve(finishing).finally(() => { stopping = null; });
      await stopping;
    }
  };
}
