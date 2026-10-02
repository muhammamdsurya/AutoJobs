import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

function key() {
  const k = Buffer.from(process.env.ENCRYPTION_KEY ?? '', 'base64');
  if (k.length !== 32) throw new Error('ENCRYPTION_KEY must be 32 bytes, base64-encoded');
  return k;
}

// AES-256-GCM. Layout: iv(12) | auth tag(16) | ciphertext. Tampering makes decrypt throw.
export function encrypt(plain: Buffer | string): Buffer {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(), iv);
  const body = Buffer.concat([c.update(plain), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), body]);
}

export function decrypt(blob: Buffer): Buffer {
  const d = createDecipheriv('aes-256-gcm', key(), blob.subarray(0, 12));
  d.setAuthTag(blob.subarray(12, 28));
  return Buffer.concat([d.update(blob.subarray(28)), d.final()]);
}

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
export const randomToken = () => randomBytes(32).toString('base64url');

// Encrypted file store for CVs, screenshots and HTML snapshots. Keys are random UUIDs (no user input reaches the path).
const filesDir = () => path.resolve(process.env.DATA_DIR ?? './data', 'files');
const KEY_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export async function saveFile(data: Buffer | string): Promise<string> {
  const k = randomUUID();
  await mkdir(filesDir(), { recursive: true });
  await writeFile(path.join(filesDir(), k), encrypt(data));
  return k;
}

export async function loadFile(k: string): Promise<Buffer> {
  if (!KEY_RE.test(k)) throw new Error('invalid file key');
  return decrypt(await readFile(path.join(filesDir(), k)));
}

export async function deleteFile(k: string | null | undefined) {
  if (k && KEY_RE.test(k)) await rm(path.join(filesDir(), k), { force: true });
}
