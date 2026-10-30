import { mkdir, readFile, writeFile, rename, unlink, readdir, stat, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { validateProject } from './public/model.js';

export function backupFilename(room, autosave = false, date = new Date()) {
  if (!/^[a-z0-9_-]{1,64}$/.test(room)) throw Error('Invalid room name.');
  const stamp = [date.getDate(), date.getMonth() + 1, date.getFullYear() % 100].map(n => String(n).padStart(2, '0')).join('');
  const time = [date.getHours(), date.getMinutes()].map(n => String(n).padStart(2, '0')).join('');
  return `plague-tale-go-${room}${autosave ? `-autosave_${stamp}_${time}` : ''}.json`;
}

export async function projectBackups({ defaultSaveFolder, preferencesFile }) {
  defaultSaveFolder = path.resolve(defaultSaveFolder);
  const projectFolder = path.dirname(defaultSaveFolder);
  let options = { autosave: true, loadLatest: true, saveFolder: defaultSaveFolder }, queue = Promise.resolve();
  let lastAutosave = null, lastError = null;
  const validate = value => {
    if (typeof value.autosave !== 'boolean') throw Error('Choose whether autosave is enabled.');
    if (value.loadLatest !== undefined && typeof value.loadLatest !== 'boolean') throw Error('Choose whether to load the latest saved project.');
    if (typeof value.saveFolder !== 'string' || !value.saveFolder.trim() || value.saveFolder.length > 4096 || value.saveFolder.includes('\0')) throw Error('Enter a valid save folder.');
    return { autosave: value.autosave, loadLatest: value.loadLatest ?? true, saveFolder: path.resolve(projectFolder, value.saveFolder.trim()) };
  };
  try { options = validate(JSON.parse(await readFile(preferencesFile, 'utf8'))); } catch (error) { if (error.code !== 'ENOENT') lastError = 'Saved backup options could not be read; defaults are in use.'; }
  if (options.saveFolder !== defaultSaveFolder) {
    try {
      if (!(await stat(options.saveFolder)).isDirectory()) throw Error('Not a folder.');
      await access(options.saveFolder, constants.R_OK | constants.W_OK);
    } catch {
      options.saveFolder = defaultSaveFolder;
      lastError = 'The configured save folder is unavailable on this computer. Using Saved Projects instead.';
    }
  }
  const serialize = operation => { const result = queue.catch(() => {}).then(operation); queue = result; return result; };
  return {
    snapshot: () => ({ ...options, defaultSaveFolder, lastAutosave, lastError }),
    latest: async () => {
      if (!options.loadLatest) return null;
      try {
        const folder = options.saveFolder;
        const entries = await readdir(folder, { withFileTypes: true });
        const candidates = await Promise.all(entries.filter(entry => entry.isFile() && /\.json$/i.test(entry.name)).map(async entry => {
          const filename = path.join(folder, entry.name);
          try { return { filename, modified: (await stat(filename)).mtimeMs }; } catch { return null; }
        }));
        for (const candidate of candidates.filter(Boolean).sort((a, b) => b.modified - a.modified || a.filename.localeCompare(b.filename))) {
          try { return validateProject(JSON.parse(await readFile(candidate.filename, 'utf8'))); } catch { /* Skip unreadable or invalid projects. */ }
        }
      } catch (error) {
        if (error.code !== 'ENOENT') lastError = `Could not read the save folder: ${error.message}`;
      }
      return null;
    },
    update: value => serialize(async () => {
      const next = validate({ ...value, loadLatest: value.loadLatest ?? options.loadLatest });
      await mkdir(next.saveFolder, { recursive: true });
      const relativeFolder = path.relative(projectFolder, next.saveFolder);
      const portableFolder = !path.isAbsolute(relativeFolder) && relativeFolder !== '..' && !relativeFolder.startsWith('..' + path.sep) ? relativeFolder || '.' : next.saveFolder;
      await writeFile(preferencesFile + '.tmp', JSON.stringify({ ...next, saveFolder: portableFolder }, null, 2));
      await rename(preferencesFile + '.tmp', preferencesFile);
      options = next; lastError = null;
    }),
    save: (room, project, autosave = false, date = new Date()) => serialize(async () => {
      if (autosave && !options.autosave) return;
      const filename = backupFilename(room, autosave, date), target = path.join(options.saveFolder, filename);
      const temporary = `${target}.${randomUUID()}.tmp`;
      try {
        await mkdir(options.saveFolder, { recursive: true });
        await writeFile(temporary, JSON.stringify(project, null, 2) + '\n');
        await rename(temporary, target);
        if (autosave) lastAutosave = new Date().toISOString();
        lastError = null;
        return { filename, folder: options.saveFolder };
      } catch (error) { await unlink(temporary).catch(() => {}); lastError = `Could not save project backup: ${error.message}`; throw error; }
    }),
  };
}
