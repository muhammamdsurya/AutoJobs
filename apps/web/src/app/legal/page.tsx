import { BackLink, Notice } from '@autojobs/shared/ui';
import type { Metadata } from 'next';

// Per request: canonical and preview URLs come from APP_URL, which the Docker build doesn't have.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Kebijakan privasi dan ketentuan',
  description: 'Kebijakan privasi, ketentuan layanan, dan hak Anda atas data di AutoJobs: data apa yang disimpan, untuk apa, dan cara menghapusnya.',
  alternates: { canonical: '/legal' },
};

// Draft for Phase 0 legal review (PRD): the facts are accurate for this system; the wording needs a lawyer before launch.
export default function LegalPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-10 text-sm leading-relaxed sm:py-14">
      <BackLink href="/">AutoJobs</BackLink>
      <article className="panel space-y-10 [&_li]:pl-1 [&_li::marker]:text-accent [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5 [&_ul]:text-muted [&_b]:text-ink">
        <section className="space-y-3">
          <h1 className="text-3xl">Ketentuan Layanan</h1>
          <p className="text-muted">AutoJobs membantu Anda mencari lowongan di JobStreet, Glints, dan LinkedIn serta mengirim lamaran atas nama Anda ke lowongan yang Anda pilih sendiri.</p>
          <ul>
            <li>Setiap pencarian Anda luncurkan sendiri setelah meninjau daftar lowongan. Lamaran dikirim bertahap oleh ekstensi AutoJobs di browser Anda sendiri, satu lamaran per portal tiap putaran dengan jeda antar-putaran, dan dengan batas harian.</li>
            <li>Ketentuan JobStreet, Glints, dan LinkedIn membatasi otomatisasi. Akun portal Anda dapat dibatasi atau ditangguhkan oleh portal tersebut; risiko ini Anda tanggung.</li>
            <li>AutoJobs tidak pernah menyelesaikan atau melewati CAPTCHA, verifikasi dua langkah, atau pemeriksaan anti-bot. Bila portal memintanya, prosesnya berhenti dan Anda yang menyelesaikannya.</li>
            <li>Jawaban pertanyaan penyaringan hanya diambil dari profil dan bank jawaban Anda. Pertanyaan wajib yang belum ada jawabannya tidak ditebak.</li>
            <li>Anda bertanggung jawab atas kebenaran data dalam profil, CV, dan bank jawaban Anda.</li>
          </ul>
        </section>
        <section id="privasi" className="scroll-mt-8 space-y-3 border-t border-white/8 pt-10">
          <h1 className="text-3xl">Kebijakan Privasi</h1>
          <p className="text-muted">Disusun mengacu pada UU No. 27 Tahun 2022 tentang Pelindungan Data Pribadi.</p>
          <ul>
            <li><b>Data yang disimpan:</b> email akun, profil kandidat (nama, kontak, alamat, pendidikan, pengalaman, gaji yang diharapkan), CV, bank jawaban, riwayat lamaran beserta salinan halaman formulir (dan tangkapan layar bila Anda mengizinkannya di ekstensi).</li>
            <li><b>Kata sandi dan sesi login portal tidak disimpan di server AutoJobs.</b> Anda masuk ke portal di browser Anda sendiri; ekstensi melamar di browser itu.</li>
            <li><b>Enkripsi:</b> CV, salinan halaman, dan tangkapan layar dienkripsi AES-256 saat disimpan; lalu lintas memakai TLS.</li>
            <li><b>Tujuan:</b> mengisi dan mengirim formulir lamaran ke portal yang Anda pilih, dan menampilkan laporan kepada Anda. Data dikirim ke portal hanya saat melamar.</li>
            <li><b>Masa simpan:</b> tangkapan layar dan salinan halaman dihapus otomatis setelah 90 hari (dapat diubah admin). Data lain disimpan sampai akun dihapus.</li>
            <li><b>Ekstensi:</b> hanya bekerja di situs JobStreet, Glints, dan LinkedIn (serta AutoJobs), dan hanya memproses lamaran yang Anda luncurkan.</li>
            <li><b>Hak Anda:</b> menghapus akun beserta seluruh datanya kapan saja (menu Profil, bagian Akun, Hapus akun).</li>
            <li><b>Pencegahan penyalahgunaan:</b> agar token gratis hanya diberikan sekali untuk satu alamat email, AutoJobs menyimpan sidik (hash) satu arah dari alamat email Anda, juga setelah akun dihapus. Sidik ini tidak bisa diubah kembali menjadi alamat email. Pendaftaran yang tidak diverifikasi dalam 7 hari dihapus otomatis.</li>
          </ul>
        </section>
      </article>
    </main>
  );
}
