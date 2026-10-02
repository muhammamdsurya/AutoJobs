// The browser extension as a download (users install it with "Load unpacked"), built from the repo's extension/
// folder: npm scripts and the Docker image both run from the repo root.
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { crc32, deflateRawSync } from 'node:zlib';

const DIR = path.join(process.cwd(), 'extension');

export async function extensionVersion(): Promise<string> {
  return JSON.parse(await readFile(path.join(DIR, 'manifest.json'), 'utf8')).version;
}

// Built once per process (the extension's files only change with a deploy, which restarts the server).
const built = new Map<string, Promise<Buffer>>();
export const extensionZip = (appUrl: string) => {
  if (!built.has(appUrl)) built.set(appUrl, buildZip(appUrl).catch((e) => (built.delete(appUrl), Promise.reject(e))));
  return built.get(appUrl)!;
};

// This server's address replaces the development one: in the permissions (the extension calls the API from its service
// worker, which needs host permission) and as the popup's default address, so users only type the pairing code.
async function buildZip(appUrl: string): Promise<Buffer> {
  const app = new URL(appUrl);
  const local = ['localhost', '127.0.0.1'].includes(app.hostname);
  const files: { name: string; data: Buffer }[] = [];
  for (const d of await readdir(DIR, { recursive: true, withFileTypes: true })) {
    if (!d.isFile()) continue;
    const name = path.relative(DIR, path.join(d.parentPath, d.name)).split(path.sep).join('/');
    let data = await readFile(path.join(d.parentPath, d.name));
    if (name === 'manifest.json' && !local) {
      const m = JSON.parse(data.toString('utf8'));
      m.host_permissions = [...m.host_permissions.filter((h: string) => !/^http:\/\/(localhost|127\.0\.0\.1)\//.test(h)), `${app.protocol}//${app.hostname}/*`];
      data = Buffer.from(JSON.stringify(m, null, 2));
    }
    if (name === 'popup.html') data = Buffer.from(data.toString('utf8').replace('http://localhost:3000', app.origin));
    files.push({ name, data });
  }
  return zip(files);
}

// 2026-01-01 00:00 in MS-DOS format (date << 16 | time): a fixed timestamp for every entry.
const DOS_TIME = (((2026 - 1980) << 9) | (1 << 5) | 1) << 16;

// Minimal ZIP writer (deflate, UTF-8 names, no zip64): enough for a few small files, no dependency.
export function zip(files: { name: string; data: Buffer }[]): Buffer {
  const out: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name, 'utf8');
    const body = deflateRawSync(f.data);
    const crc = crc32(f.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt32LE(DOS_TIME, 10);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(f.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4); // made by
    entry.writeUInt16LE(20, 6); // version needed
    entry.writeUInt16LE(0x0800, 8);
    entry.writeUInt16LE(8, 10);
    entry.writeUInt32LE(DOS_TIME, 12);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(body.length, 20);
    entry.writeUInt32LE(f.data.length, 24);
    entry.writeUInt16LE(name.length, 28);
    entry.writeUInt32LE(offset, 42);
    out.push(local, name, body);
    central.push(entry, name);
    offset += local.length + name.length + body.length;
  }
  const dir = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...out, dir, end]);
}
