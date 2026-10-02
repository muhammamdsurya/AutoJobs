import { Plus } from 'lucide-react';
import { ActionForm, Submit } from '@autojobs/shared/forms';
import { getPacks } from '@autojobs/shared/payments';
import { FREE_SEARCHES, rp } from '@autojobs/shared/tokens';
import { Field, Notice, PackList, PageHeader } from '@autojobs/shared/ui';
import { createPack, updatePack } from './actions';
import { requireAdmin } from '@autojobs/shared/auth';

export default async function PricingPage() {
  await requireAdmin();
  const packs = await getPacks(true);
  const active = packs.filter((p) => p.active);
  return (
    <>
      <PageHeader title="Harga token" subtitle={`1 token = 1x Cari Loker. Setiap akun baru mendapat ${FREE_SEARCHES} token gratis. Perubahan berlaku untuk pembelian berikutnya; pembelian yang sudah dimulai tetap memakai harganya.`} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start">
        <div className="min-w-0 space-y-6">
          <section className="glass-dense overflow-hidden rounded-card" aria-labelledby="h-paket">
            <h2 id="h-paket" className="px-4 pb-3 pt-5 sm:px-6">Paket</h2>
            <ul className="divide-y divide-white/6">
              {packs.map((p) => (
                <li key={p.id} className={`px-4 py-4 sm:px-6 ${p.active ? '' : 'opacity-60'}`}>
                  <ActionForm action={updatePack.bind(null, p.id)} className="flex flex-wrap items-end gap-3">
                    <Field label="Token" className="w-24"><input className="input num" type="number" name="tokens" min={1} max={1000} defaultValue={p.tokens} required /></Field>
                    <Field label="Harga (Rp)" className="w-36"><input className="input num" type="number" name="price" min={1} max={10000000} step={1} defaultValue={p.price} required /></Field>
                    <p className="pb-2.5 text-sm text-muted"><span className="num">{rp(Math.round(p.price / p.tokens))}</span>/token</p>
                    <label className="chip-toggle mb-0.5"><input type="checkbox" name="active" defaultChecked={p.active} className="accent-accent" />Dijual</label>
                    <Submit className="btn btn-secondary">Simpan</Submit>
                  </ActionForm>
                </li>
              ))}
            </ul>
          </section>

          <ActionForm action={createPack} resetOnOk className="card space-y-4">
            <h2>Tambah paket</h2>
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Token" className="w-24"><input className="input num" type="number" name="tokens" min={1} max={1000} placeholder="2" required /></Field>
              <Field label="Harga (Rp)" className="w-36"><input className="input num" type="number" name="price" min={1} max={10000000} step={1} placeholder="40000" required /></Field>
              <Submit className="btn btn-primary"><Plus aria-hidden />Tambah</Submit>
            </div>
            <p className="hint">Paket tidak bisa dihapus agar riwayat penjualan tetap utuh; hilangkan centang &quot;Dijual&quot; untuk menyembunyikannya.</p>
            <p className="hint">Harga sangat kecil (mis. Rp1 untuk uji coba) tidak bisa dikurangi kode unik: dibayar persis, satu pembeli dalam satu waktu.</p>
          </ActionForm>
        </div>

        <aside className="space-y-3 lg:sticky lg:top-32">
          <h2>Tampilan untuk pengguna</h2>
          {active.length ? <PackList packs={active} /> : <Notice>Tidak ada paket yang dijual: pengguna tidak bisa membeli token.</Notice>}
          <p className="hint">&quot;Hemat&quot; dihitung terhadap harga per token paket terkecil; harga per token terendah ditandai &quot;Paling hemat&quot;. Sama di halaman utama dan halaman Token.</p>
        </aside>
      </div>
    </>
  );
}
