import { requireAdmin } from '@autojobs/shared/auth';
import { loadFile } from '@autojobs/shared/crypto';
import { sql } from '@autojobs/shared/db';
import { getQris } from '@autojobs/shared/settings';

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' };

// Transfer proofs (Pembayaran) and the current QRIS image (Pengaturan), decrypted for signed-in admins only.
export async function GET(_: Request, { params }: { params: Promise<{ kind: string; id: string }> }) {
  await requireAdmin();
  const { kind, id } = await params;
  let file: { key: string; type: string; name: string } | null = null;
  if (kind === 'proof' && /^[0-9a-f-]{36}$/.test(id)) {
    const [t] = await sql<{ proofKey: string | null; proofMime: string }[]>`select proof_key, proof_mime from topups where id = ${id}`;
    if (t?.proofKey) file = { key: t.proofKey, type: t.proofMime, name: `bukti-${id}.${EXT[t.proofMime] ?? 'bin'}` };
  } else if (kind === 'qris') {
    const q = await getQris();
    if (q?.fileKey === id) file = { key: id, type: q.mime, name: `QRIS-AutoJobs.${EXT[q.mime] ?? 'png'}` };
  }
  const data = file && (await loadFile(file.key).catch(() => null));
  if (!file || !data) return new Response('Tidak ditemukan', { status: 404 });
  return new Response(new Uint8Array(data), {
    headers: {
      'content-type': file.type,
      'content-disposition': `inline; filename="${file.name}"`,
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}
