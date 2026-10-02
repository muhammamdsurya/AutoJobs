# Deploy AutoJobs ke VPS (produksi)

Panduan langkah demi langkah memasang AutoJobs di satu VPS dengan Docker Compose, lalu menghubungkannya ke GitHub
supaya setiap perubahan yang di-push ke `main` diuji dan dideploy otomatis.

- Aplikasi: `https://autojobs.ayrusdigital.my.id`
- Konsol admin: `https://adminautojobs.ayrusdigital.my.id`

```text
Internet ──443──> Caddy (HTTPS otomatis) ──> web    (Next.js, port 3000: aplikasi + API ekstensi + notifikasi DANA)
                                         └─> admin  (Next.js, port 3001: konsol admin)
                  worker (pencarian lowongan, pemulihan antrean, kedaluwarsa top-up)
                  postgres (database, hanya di jaringan internal Docker)
                  ./data (CV, bukti transfer, QRIS: terenkripsi dengan ENCRYPTION_KEY)

GitHub push ke main ──> GitHub Actions: build + tes ──(lolos)──> SSH ke VPS ──> scripts/deploy.sh
                                                                   (git pull, build ulang, restart, migrasi otomatis)
```

Perintah di blok `text` dijalankan **di VPS** (lewat SSH). Perintah di blok `bash` dijalankan **di komputer Anda**.

## Daftar isi

- [A. Yang perlu disiapkan](#a-yang-perlu-disiapkan)
- [B. Simpan kode di GitHub](#b-simpan-kode-di-github)
- [C. Siapkan VPS](#c-siapkan-vps)
- [D. Hubungkan VPS ke GitHub](#d-hubungkan-vps-ke-github)
- [E. File .env produksi](#e-file-env-produksi)
- [F. Jalankan pertama kali](#f-jalankan-pertama-kali)
- [G. Deploy otomatis dari GitHub](#g-deploy-otomatis-dari-github)
- [H. Setup awal aplikasi](#h-setup-awal-aplikasi)
- [I. Ekstensi untuk pengguna](#i-ekstensi-untuk-pengguna)
- [J. Backup dan restore](#j-backup-dan-restore)
- [K. Log dan monitoring](#k-log-dan-monitoring)
- [L. Rollback](#l-rollback)
- [M. Checklist keamanan](#m-checklist-keamanan)
- [N. Troubleshooting](#n-troubleshooting)

---

## A. Yang perlu disiapkan

| Kebutuhan | Keterangan |
|---|---|
| VPS | Ubuntu 24.04 LTS, 2 vCPU, RAM 4 GB (bisa 2 GB + swap), SSD 40 GB, lokasi Jakarta/Singapura |
| Domain | Akses DNS `ayrusdigital.my.id` untuk membuat 2 A record |
| GitHub | Akun GitHub untuk repo privat |
| Email (SMTP) | Mis. Gmail dengan App Password, untuk kode verifikasi dan reset kata sandi |
| HP Android | DANA Bisnis + MacroDroid, untuk konfirmasi pembayaran token otomatis |
| Google OAuth | Opsional, untuk tombol "Masuk dengan Google" |

## B. Simpan kode di GitHub

1. Di github.com buat repository baru, **Private**, kosong (tanpa README), mis. `autojobs`.
2. Di folder proyek di komputer Anda:

```bash
git init -b main
```
```bash
git add -A
```
```bash
git status
```

Pastikan `.env` dan folder `data/` **tidak** ada di daftar (sudah dikecualikan `.gitignore`). Lalu:

```bash
git commit -m "Versi awal"
```
```bash
git remote add origin https://github.com/USERNAME/autojobs.git
```
```bash
git push -u origin main
```

## C. Siapkan VPS

### C1. Kunci SSH dan user `deploy`

Di komputer Anda (PowerShell), buat kunci SSH bila belum punya, lalu tampilkan kunci publiknya:

```bash
ssh-keygen -t ed25519
```

Tempel isi `C:\Users\<nama>\.ssh\id_ed25519.pub` di panel VPS (bagian SSH keys) saat membuat VPS, atau tambahkan ke
`/root/.ssh/authorized_keys`. Lalu masuk sebagai root dan buat user khusus:

```text
ssh root@IP_VPS
adduser deploy
usermod -aG sudo deploy
rsync --archive --chown=deploy:deploy ~/.ssh /home/deploy
```

Coba masuk dari jendela baru: `ssh deploy@IP_VPS`. **Setelah berhasil**, matikan login root dan login dengan kata sandi:

```text
sudo sed -i 's/^#\?PasswordAuthentication .*/PasswordAuthentication no/; s/^#\?PermitRootLogin .*/PermitRootLogin no/' /etc/ssh/sshd_config
sudo systemctl restart ssh
```

### C2. Firewall, fail2ban, update keamanan otomatis

```text
sudo apt update && sudo apt upgrade -y
sudo ufw allow OpenSSH
sudo ufw allow 80,443/tcp
sudo ufw enable
sudo apt install -y fail2ban unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades
```

Port database (5432), web (3000), dan admin (3001) di `docker-compose.yml` hanya terbuka untuk `127.0.0.1`, jadi
yang terbuka ke internet hanya 22, 80, dan 443.

### C3. Swap (supaya build tidak kehabisan memori)

```text
sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### C4. Docker, dengan batas ukuran log

```text
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker deploy
echo '{"log-driver":"json-file","log-opts":{"max-size":"10m","max-file":"5"}}' | sudo tee /etc/docker/daemon.json
sudo systemctl restart docker
exit
```

Masuk lagi (`ssh deploy@IP_VPS`) supaya grup `docker` berlaku. Batas log mencegah disk penuh oleh log container.

## D. Hubungkan VPS ke GitHub

VPS perlu bisa **membaca** repo privat (untuk `git pull`). Pakai *deploy key* khusus repo ini, hanya-baca:

```text
ssh-keygen -t ed25519 -C "autojobs-vps" -f ~/.ssh/github_autojobs -N ""
printf 'Host github.com\n  IdentityFile ~/.ssh/github_autojobs\n  IdentitiesOnly yes\n' >> ~/.ssh/config
cat ~/.ssh/github_autojobs.pub
```

Salin baris yang tampil ke GitHub: repo → **Settings → Deploy keys → Add deploy key**, beri nama `VPS`, **jangan**
centang *Allow write access*. Lalu:

```text
git clone git@github.com:USERNAME/autojobs.git ~/autojobs
```

## E. File .env produksi

Buat dari awal di VPS. **Jangan menyalin `.env` dari laptop** (berisi kunci dan akun uji pengembangan).

```text
cd ~/autojobs
cp .env.example .env
chmod 600 .env
mkdir -p data && sudo chown -R 1000:1000 data
openssl rand -base64 32
openssl rand -hex 24
nano .env
```

`chown 1000:1000 data`: aplikasi di dalam container berjalan sebagai user biasa `node` (uid 1000), bukan root, jadi
folder `data` harus miliknya.

Hasil `openssl rand -base64 32` untuk `ENCRYPTION_KEY`, hasil `openssl rand -hex 24` untuk `POSTGRES_PASSWORD`.
Isi/ubah baris berikut (`DATABASE_URL` dan `DATA_DIR` diatur oleh docker-compose, biarkan):

```ini
DOMAIN=autojobs.ayrusdigital.my.id
ADMIN_DOMAIN=adminautojobs.ayrusdigital.my.id
APP_URL=https://autojobs.ayrusdigital.my.id
ADMIN_URL=https://adminautojobs.ayrusdigital.my.id
POSTGRES_PASSWORD=hasil-openssl-rand-hex
ENCRYPTION_KEY=hasil-openssl-rand-base64
ADMIN_EMAILS=email-admin-anda@gmail.com
MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_ENCRYPTION=tls
MAIL_USERNAME=email-pengirim@gmail.com
MAIL_PASSWORD=app-password-gmail
MAIL_FROM_ADDRESS=email-pengirim@gmail.com
MAIL_FROM_NAME=AutoJobs
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

Penting:

- Simpan `ENCRYPTION_KEY` dan `POSTGRES_PASSWORD` di password manager. Tanpa `ENCRYPTION_KEY`, CV dan bukti transfer
  tidak bisa dibaca lagi, juga dari backup.
- `POSTGRES_PASSWORD` harus terisi **sebelum** langkah F: kata sandi ini hanya dipakai saat database dibuat pertama kali.
  `scripts/deploy.sh` menolak jalan bila `POSTGRES_PASSWORD`, `ENCRYPTION_KEY`, `APP_URL`, atau `ADMIN_URL` kosong.
- **SMTP wajib di produksi.** Kode verifikasi dan reset kata sandi tidak pernah dicetak ke log di produksi, jadi tanpa
  SMTP tidak ada yang bisa mendaftar. Batas aplikasi: 400 email per hari (kuota Gmail sekitar 500).
- **`ADMIN_EMAILS` adalah satu-satunya penentu admin.** Hanya akun yang emailnya sudah terverifikasi dan tercantum di
  sini yang bisa masuk konsol. Menghapus alamat dari daftar langsung mencabut aksesnya. Jangan memakai kata sandi akun
  uji dari laptop untuk akun admin produksi.

## F. Jalankan pertama kali

1. Di pengelola DNS `ayrusdigital.my.id`, buat 2 **A record** ke IP VPS: `autojobs` dan `adminautojobs`. Bila memakai
   Cloudflare, biarkan **DNS only** (awan abu-abu). Dengan proxy Cloudflare (awan oranye), semua pengunjung terlihat
   datang dari beberapa IP Cloudflare, sehingga batas percobaan per IP (login, daftar, lupa sandi) bisa mengunci banyak
   orang sekaligus. Bila tetap ingin memakai proxy, atur dulu `trusted_proxies` untuk rentang IP Cloudflare di Caddy.
2. Cek DNS sudah mengarah (hasilnya harus IP VPS):

```text
getent hosts autojobs.ayrusdigital.my.id adminautojobs.ayrusdigital.my.id
```

3. Build dan jalankan (pertama kali beberapa menit):

```text
cd ~/autojobs
docker compose --profile https up -d --build
docker compose ps
docker compose logs -f web
```

Log `web` harus menampilkan migrasi (`applied ...`) lalu Next.js siap. Tekan Ctrl+C untuk keluar dari log (container
tetap jalan). Buka `https://autojobs.ayrusdigital.my.id` dan `https://adminautojobs.ayrusdigital.my.id`.

## G. Deploy otomatis dari GitHub

Workflow `.github/workflows/deploy.yml` sudah ada di repo. Setiap push ke `main`:

1. **test**: `npm ci`, build kedua aplikasi (sekaligus cek tipe), migrasi ke PostgreSQL sementara, `npm test`.
2. **deploy** (hanya bila test lolos): SSH ke VPS memakai kunci khusus yang **hanya boleh** menjalankan
   `scripts/deploy.sh` (git pull, build ulang, restart; migrasi berjalan otomatis saat `web` menyala).

Pull request hanya menjalankan test, tidak deploy.

### G1. Kunci SSH khusus GitHub Actions (di VPS)

```text
ssh-keygen -t ed25519 -C "github-actions" -f ~/ci_key -N ""
echo "command=\"sh $HOME/autojobs/scripts/deploy.sh\",no-port-forwarding,no-agent-forwarding,no-X11-forwarding,no-pty $(cat ~/ci_key.pub)" >> ~/.ssh/authorized_keys
cat ~/ci_key
ssh-keyscan -t ed25519 IP_VPS
```

`command="..."` membuat kunci ini tidak bisa dipakai untuk hal lain selain deploy, walau bocor.

### G2. Secrets di GitHub

Repo → **Settings → Secrets and variables → Actions → New repository secret**:

| Nama | Isi |
|---|---|
| `VPS_HOST` | IP VPS |
| `VPS_USER` | `deploy` |
| `VPS_SSH_KEY` | seluruh isi `cat ~/ci_key` (termasuk baris `-----BEGIN` dan `-----END`) |
| `VPS_KNOWN_HOSTS` | baris hasil `ssh-keyscan -t ed25519 IP_VPS` |

Setelah tersimpan, hapus kunci privat dari VPS:

```text
rm ~/ci_key
```

Opsional: di **Settings → Environments → production** tambahkan *Required reviewers* bila setiap deploy harus
disetujui dulu.

### G3. Uji dan alur sehari-hari

- Uji sekali: GitHub → tab **Actions** → **Test and deploy** → **Run workflow**.
- Sehari-hari: ubah kode di komputer → commit → `git push`. Lihat progresnya di tab Actions (sekitar 5-10 menit).
- Deploy manual tanpa GitHub Actions: `ssh deploy@IP_VPS`, lalu `cd ~/autojobs && sh scripts/deploy.sh`.

## H. Setup awal aplikasi

1. **Akun admin**: daftar di `https://autojobs.ayrusdigital.my.id/signup` memakai email yang ada di `ADMIN_EMAILS`, lalu
   masukkan kode verifikasi dari email. Peran admin baru aktif setelah email terverifikasi.
2. Masuk ke `https://adminautojobs.ayrusdigital.my.id`, lalu:
   - **Pengaturan**: unggah gambar QRIS DANA Bisnis.
   - **Pengaturan → Notifikasi DANA**: buat kunci baru, salin URL-nya ke MacroDroid di HP (mengganti URL lama dari
     laptop). HP cukup terhubung ke internet.
   - **Harga**: atur paket token.
   - **Pengaturan aplikasi**: batas harian dan jeda antar-putaran.
3. **Google OAuth** (bila dipakai): di Google Cloud Console tambahkan *Authorized redirect URI*
   `https://autojobs.ayrusdigital.my.id/api/auth/google/callback`, dan ubah status *OAuth consent screen* menjadi
   **In production**.
4. **Uji alur penuh** dengan akun pengguna biasa: daftar → unduh dan pasang ekstensi (Koneksi Portal) → pairing → masuk
   ke portal → buat pencarian → uji coba di tiap portal → beli paket token terkecil dengan QRIS asli dan pastikan token
   masuk otomatis.
5. Pencarian JobStreet dan LinkedIn sekarang berjalan dari IP VPS. Bila hasilnya error (IP datacenter dibatasi
   portal), catat pesannya.
6. **Google Search Console** (supaya landing page cepat terindeks): buka search.google.com/search-console, tambahkan
   properti **Domain** `autojobs.ayrusdigital.my.id`, verifikasi dengan record **TXT** di DNS, lalu di menu *Sitemaps*
   kirim `https://autojobs.ayrusdigital.my.id/sitemap.xml`. `robots.txt` sudah mengizinkan halaman publik dan
   menutup halaman setelah login; konsol admin selalu `noindex`.

## I. Ekstensi untuk pengguna

Pengguna mengunduh ekstensi dari **Koneksi Portal → Unduh ekstensi (.zip)**. Zip dibuat server dari folder
`extension/` dengan alamat `APP_URL`, jadi tidak ada yang perlu diubah per server.

Bila kode ekstensi berubah, naikkan `version` di `extension/manifest.json`, lalu push. Pengguna mengunduh lagi, menimpa
folder yang sama, dan klik muat ulang di halaman ekstensi Chrome.

## J. Backup dan restore

### Backup harian

```text
mkdir -p ~/backup
cat > ~/backup.sh <<'EOF'
#!/bin/sh
set -eu
cd ~/autojobs
docker compose exec -T postgres pg_dump -U autojobs --clean --if-exists autojobs | gzip > ~/backup/db-$(date +%F).sql.gz
tar -czf ~/backup/data-$(date +%F).tgz data
find ~/backup -type f -mtime +14 -delete
EOF
chmod 700 ~/backup.sh
(crontab -l 2>/dev/null; echo "0 3 * * * $HOME/backup.sh") | crontab -
```

Backup berjalan tiap pukul 03.00 dan menyimpan 14 hari. **Salin juga ke luar VPS** (mis. Google Drive dengan
`rclone`), karena backup di VPS ikut hilang bila VPS rusak. Simpan `ENCRYPTION_KEY` terpisah dari file backup.

Dump database berisi email, profil, dan hash kata sandi pengguna: **enkripsi sebelum keluar dari VPS**. Contoh dengan
`age` (`sudo apt install -y age`; buat pasangan kunci sekali di komputer Anda dengan `age-keygen`, simpan kunci
privatnya di password manager, tempel kunci publiknya di bawah):

```text
age -r age1KUNCIPUBLIKANDA -o ~/backup/db-$(date +%F).sql.gz.age ~/backup/db-$(date +%F).sql.gz
```

Unggah hanya file `.age` ke luar VPS.

### Restore

```text
cd ~/autojobs
docker compose stop web admin worker
gunzip -c ~/backup/db-TANGGAL.sql.gz | docker compose exec -T postgres psql -U autojobs -d autojobs
tar -xzf ~/backup/data-TANGGAL.tgz
docker compose start web admin worker
```

## K. Log dan monitoring

```text
docker compose ps
docker compose logs -f --tail=200 web worker admin caddy
df -h && docker system df
```

- Pasang monitor uptime gratis (mis. UptimeRobot atau Better Stack) ke `https://autojobs.ayrusdigital.my.id` dan
  `https://adminautojobs.ayrusdigital.my.id`, dengan notifikasi email/Telegram.
- Konsol admin → **Ringkasan** menampilkan status HP notifikasi DANA dan kesehatan pencarian.
- **Audit** di konsol admin mencatat aksi penting (login admin, perubahan token, persetujuan pembayaran, dll.).

## L. Rollback

- Cara biasa: di komputer Anda `git revert <commit>` lalu `git push`. GitHub Actions mendeploy versi yang dibatalkan.
- Darurat langsung di VPS:

```text
cd ~/autojobs
git log --oneline -5
git checkout <commit-yang-baik>
docker compose --profile https up -d --build
```

Setelah masalah diperbaiki dan di-push, kembalikan ke `main`: `git checkout main && sh scripts/deploy.sh`.
Migrasi database hanya maju: bila versi baru sudah mengubah database dan perlu dibatalkan, restore backup (bagian J).

## M. Checklist keamanan

Hasil audit keamanan (OWASP Top 10, DDoS, XSS, SQL injection, dll.) yang sudah diperbaiki di kode, dan yang harus Anda
jaga saat mengoperasikan server.

### Sudah ditangani di kode

| Area | Yang dilakukan |
|---|---|
| Akses (A01) | Setiap halaman konsol admin memeriksa sesi admin sendiri (sebelumnya data pengguna bisa dibaca tanpa login lewat request RSC). Semua aksi dan API membatasi data ke pemiliknya. |
| Admin | Hanya akun **terverifikasi** yang tercantum di `ADMIN_EMAILS`; dicoret dari daftar = akses hilang seketika. |
| Login (A07) | Batas percobaan per akun dan per IP, kode OTP maksimal 8 per hari per akun, hash kata sandi scrypt setara OWASP (diperbarui otomatis saat login), reset sandi mencabut semua sesi dan ekstensi. |
| Google | Menautkan Google ke akun yang belum terverifikasi menghapus sandi, sesi, dan ekstensi milik pendaftar sebelumnya (mencegah pengambilalihan akun). Persetujuan pendaftaran tidak bisa dipalsukan lewat URL. |
| Injeksi (A03) | Semua SQL berparameter. Teks dari portal dirender sebagai teks. Sel CSV yang diawali `= + - @` dinetralkan. Regex yang bisa dibuat lambat (ReDoS) diganti versi linear. |
| Pembayaran | Nominal diambil hanya dari bagian "diterima"; nama pembayar dan saldo diabaikan; nominal ganda menunggu admin. Kode unik maksimal 10% dan tidak pernah jatuh ke harga bulat; nominal ditahan 48 jam; notifikasi ganda diabaikan 48 jam. |
| Token gratis | Sekali per alamat email (alias `+tag`, titik Gmail, dan daftar ulang tidak mendapat lagi). |
| Data bersama | Data Glints dari browser seorang pengguna hanya terlihat oleh pengguna itu. |
| DoS | Body request dibatasi (Caddy dan API ekstensi), satu pencarian aktif per pengguna, maksimal 15 menit per portal, 30 kali cari ulang per hari, kuota CV (5) dan bank jawaban (1.000), batas daftar per IP dan 400 email per hari. |
| Ekstensi | Hanya membuka host portal yang diizinkan, pairing wajib HTTPS, token kedaluwarsa setelah 60 hari tidak dipakai, pairing tercatat di audit. |
| Header (A05) | HSTS, CSP, Permissions-Policy, X-Frame-Options, nosniff. Container berjalan sebagai user biasa, image tanpa alat build. |
| Log (A09) | Audit untuk login berhasil/gagal, login admin gagal, permintaan reset sandi, pairing ekstensi, notifikasi DANA dengan kunci salah, dan unduhan data. Kode OTP tidak pernah ditulis ke log. |
| Komponen (A06) | `npm audit` bersih. Dependabot membuat PR pembaruan tiap minggu; deploy menarik image dasar terbaru. |

### Yang harus Anda jaga

- [ ] Login SSH hanya dengan kunci, root dan login sandi dimatikan, `ufw` + `fail2ban` + update otomatis aktif (C1, C2).
- [ ] `.env` hanya bisa dibaca user `deploy` (`chmod 600`), dan tidak pernah di-commit.
- [ ] `ENCRYPTION_KEY`, `POSTGRES_PASSWORD`, kunci `age`, dan kunci notifikasi DANA tersimpan di password manager.
- [ ] Backup harian terenkripsi tersalin ke luar VPS, dan restore pernah dicoba sekali (J).
- [ ] Batasi konsol admin ke IP Anda sendiri bila memungkinkan: di `Caddyfile`, aktifkan dua baris `@outside` /
      `respond @outside 403` dengan IP Anda, lalu `sh scripts/deploy.sh`.
- [ ] Aktifkan verifikasi dua langkah di akun GitHub, dan di **Settings → Branches** lindungi `main` (wajib lolos
      workflow *Test and deploy* sebelum merge).
- [ ] Gabungkan PR Dependabot setelah workflow-nya hijau.
- [ ] Sesekali buka **Audit** di konsol: banyak "Gagal masuk" dari satu IP atau "Notifikasi DANA ditolak" perlu
      diperiksa (kunci DANA bisa dibuat ulang di Pengaturan).
- [ ] Bila kunci notifikasi DANA bocor, buat kunci baru (yang lama langsung mati) dan perbarui MacroDroid.

## N. Troubleshooting

| Gejala | Penyebab umum dan solusi |
|---|---|
| HTTPS gagal / sertifikat tidak terbit | DNS belum mengarah ke VPS, port 80/443 tertutup, atau proxy Cloudflare aktif. Cek `docker compose logs caddy`. |
| Build berhenti / "Killed" | RAM kurang: pastikan swap aktif (C3). |
| Pairing ekstensi gagal | `APP_URL` di `.env` salah, atau pengguna memakai zip lama: unduh ulang dari Koneksi Portal. |
| Email kode tidak sampai | Isian `MAIL_*` salah; cek `docker compose logs web`. Gmail wajib App Password. |
| Token tidak masuk otomatis | URL/kunci di MacroDroid salah, atau HP offline; cek konsol admin → Pembayaran dan Ringkasan. |
| Deploy GitHub gagal di langkah SSH | Cek secret `VPS_*`, dan baris `command=` di `~/.ssh/authorized_keys`. |
| Halaman error 502 | Container `web`/`admin` sedang restart atau gagal: `docker compose ps` dan `docker compose logs web`. |
| `EACCES` / gagal menyimpan CV | Folder `data` bukan milik uid 1000: `sudo chown -R 1000:1000 ~/autojobs/data`. |
| Pengguna terkunci "Terlalu banyak percobaan" | Batas per akun/IP selama 15 menit (atau 1 jam untuk daftar). Bila banyak pengguna terkena sekaligus, cek apakah proxy Cloudflare aktif (F1). |
