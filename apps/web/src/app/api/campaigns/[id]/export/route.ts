import { currentUser } from '@autojobs/shared/auth';
import { csvHeaders, excelCsv, wib } from '@autojobs/shared/csv';
import { audit, sql } from '@autojobs/shared/db';
import { PORTAL_LABEL, type Portal } from '@autojobs/shared/portals';

type Row = {
  submittedAt: Date; title: string; company: string; location: string; portal: Portal; url: string; applyUrl: string | null;
  confirmationText: string | null; answers: { question: string; answer: string }[] | null;
};

// Sent applications of one campaign as a spreadsheet file (opens in Excel).
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user?.emailVerifiedAt) return new Response('Unauthorized', { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response('Not found', { status: 404 });
  const [c] = await sql<{ name: string }[]>`select name from campaigns where id = ${id} and user_id = ${user.id}`;
  if (!c) return new Response('Not found', { status: 404 });
  const rows = await sql<Row[]>`
    select a.submitted_at, l.title, l.company, l.location, l.portal, l.url, l.apply_url, a.confirmation_text, a.answers
    from applications a join job_listings l on l.id = a.listing_id
    where a.campaign_id = ${id} and a.user_id = ${user.id} and a.status = 'submitted' and not a.dry_run
    order by a.submitted_at`;

  const table = [
    ['Tanggal kirim (WIB)', 'Posisi', 'Perusahaan', 'Lokasi', 'Portal', 'Link lowongan', 'Link lamaran perusahaan', 'Konfirmasi portal', 'Jawaban yang dikirim'],
    ...rows.map((r) => [
      wib(r.submittedAt), r.title, r.company, r.location, PORTAL_LABEL[r.portal], r.url, r.applyUrl ?? '', r.confirmationText ?? '',
      (r.answers ?? []).filter((a) => a.answer).map((a) => `${a.question}: ${a.answer}`).join(' | '),
    ]),
  ];

  const name = (c.name || 'pencarian').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'pencarian';
  await audit(user.id, 'data_exported', { campaignId: id, rows: rows.length });
  return new Response(new Uint8Array(excelCsv(table)), { headers: csvHeaders(`lamaran-terkirim-${name}.csv`) });
}
