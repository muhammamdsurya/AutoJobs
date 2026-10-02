import { currentUser } from '@autojobs/shared/auth';
import { loadFile } from '@autojobs/shared/crypto';
import { sql } from '@autojobs/shared/db';
import { getQris } from '@autojobs/shared/settings';

// Decrypts and serves the owner's CVs, screenshots and HTML snapshots. Owner-only (admins don't get users' files).
export async function GET(_: Request, { params }: { params: Promise<{ kind: string; id: string }> }) {
  const user = await currentUser();
  if (!user?.emailVerifiedAt) return new Response('Unauthorized', { status: 401 });
  const { kind, id } = await params;
  let file: { key: string | null; type: string; name: string; inline: boolean } | null = null;

  if (kind === 'cv' && /^[0-9a-f-]{36}$/.test(id)) {
    const [r] = await sql<{ fileKey: string; fileName: string; mime: string }[]>`select file_key, file_name, mime from cv_documents where id = ${id} and user_id = ${user.id}`;
    if (r) file = { key: r.fileKey, type: r.mime, name: r.fileName, inline: false };
  } else if (kind === 'shot' && /^[0-9a-f-]{36}$/.test(id)) {
    const [r] = await sql<{ screenshotKey: string | null }[]>`select screenshot_key from applications where id = ${id} and user_id = ${user.id}`;
    if (r) file = { key: r.screenshotKey, type: 'image/png', name: `bukti-${id}.png`, inline: true };
  } else if (kind === 'event' && /^\d+$/.test(id)) {
    const [r] = await sql<{ fileKey: string | null; event: string }[]>`select e.file_key, e.event from application_events e
      join applications a on a.id = e.application_id where e.id = ${id} and a.user_id = ${user.id}`;
    // Captured portal HTML is served as plain-text download so it can never run as a page on our origin.
    if (r) file = r.event === 'screenshot'
      ? { key: r.fileKey, type: 'image/png', name: `layar-${id}.png`, inline: true }
      : { key: r.fileKey, type: 'text/plain; charset=utf-8', name: `halaman-${id}.html.txt`, inline: false };
  } else if (kind === 'qris') {
    // The payment QRIS (Token page) is for every signed-in user; only the current one is served.
    const q = await getQris();
    if (q?.fileKey === id) file = { key: id, type: q.mime, name: `QRIS-AutoJobs.${q.mime.split('/')[1]}`, inline: true };
  }

  if (!file?.key) return new Response('Tidak ditemukan', { status: 404 });
  const data = await loadFile(file.key).catch(() => null);
  if (!data) return new Response('File sudah dihapus (masa simpan habis)', { status: 404 });
  return new Response(new Uint8Array(data), {
    headers: {
      'content-type': file.type,
      'content-disposition': `${file.inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}
