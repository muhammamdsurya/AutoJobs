import { Coins } from 'lucide-react';
import Link from 'next/link';
import { ActionForm, Submit } from '@autojobs/shared/forms';
import { BackLink, EmptyState, PageHeader } from '@autojobs/shared/ui';
import { requireUser } from '@autojobs/shared/auth';
import { sql } from '@autojobs/shared/db';
import { getSettings } from '@autojobs/shared/settings';
import { createCampaign } from '../actions';
import { CampaignFields, EMPTY_CAMPAIGN } from '../campaign-fields';

export default async function NewCampaignPage() {
  const user = await requireUser();
  const [{ tokens }] = await sql<{ tokens: number }[]>`select tokens from users where id = ${user.id}`;
  const unlimited = user.role === 'admin';
  return (
    <>
      <BackLink href="/campaigns">Cari Loker</BackLink>
      <PageHeader title="Pencarian baru" subtitle="Tentukan lowongan yang dicari. Anda akan meninjau hasilnya sebelum ada lamaran yang dikirim." />
      {!unlimited && tokens === 0 ? (
        <section className="card max-w-4xl">
          <EmptyState icon={Coins} title="Token Anda habis" action={<Link href="/token" className="btn btn-primary"><Coins aria-hidden />Isi token</Link>}>
            Setiap pencarian baru memakai 1 token. Isi token lewat QRIS, lalu kembali ke sini.
          </EmptyState>
        </section>
      ) : (
        <ActionForm action={createCampaign} className="panel max-w-4xl space-y-6">
          <CampaignFields d={EMPTY_CAMPAIGN} settings={await getSettings()} />
          <div className="flex flex-col-reverse gap-3 border-t border-white/8 pt-6 sm:flex-row sm:items-center sm:justify-between [&>button]:w-full sm:[&>button]:w-auto">
            <p className="text-sm leading-relaxed text-muted">
              {unlimited ? 'Akun admin: pencarian tidak memakai token.'
                : <>Memakai 1 token (sisa <b className="num font-medium text-ink">{tokens}</b>). Mencari ulang sebelum diluncurkan gratis.</>}
            </p>
            <Submit>Cari lowongan</Submit>
          </div>
        </ActionForm>
      )}
    </>
  );
}
