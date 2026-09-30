# 🤖 Panduan Setup Telegram Bot untuk Mobogen

Dengan Telegram Bot, Anda dan rekan magang dapat melakukan absensi dan laporan harian Monev MagangHub Kemnaker **hanya dalam beberapa detik via chat Telegram**, 100% gratis tanpa batasan kuota dan tanpa verifikasi akun bisnis!

---

## ⚡ Langkah 1: Buat Bot di Telegram (Hanya 30 Detik)

1. Buka aplikasi **Telegram** di HP atau Desktop.
2. Cari akun resmi **[@BotFather](https://t.me/BotFather)** (yang ada centang biru resmi) lalu klik **Start**.
3. Kirim perintah:
   ```text
   /newbot
   ```
4. Masukkan **Nama Bot** Anda (contoh: `Mobogen Magang Assistant`).
5. Masukkan **Username Bot** yang berakhiran `bot` (contoh: `mobogen_magang_bot` atau `kevin_monev_bot`).
6. BotFather akan memberikan **HTTP API Token** Anda (contoh: `7123456789:AAFg8Z...`).

---

## 🔑 Langkah 2: Konfigurasi Environment Variable

Buka file `.env.local` pada project Anda, lalu masukkan token tersebut:

```env
TELEGRAM_BOT_TOKEN=7123456789:AAFg8Z...
TELEGRAM_WEBHOOK_SECRET=mobogen_telegram_secret_2026
TELEGRAM_ENCRYPTION_SECRET=mobogen_kemnaker_secure_salt_2026
```

---

## 🌐 Langkah 3: Aktifkan Webhook Bot ke Server Anda

Setelah aplikasi Anda di-deploy (misalnya ke Vercel di `https://domain-kamu.vercel.app`), aktifkan webhook dengan membuka URL berikut di browser:

```text
https://api.telegram.org/bot<TOKEN_BOT_ANDA>/setWebhook?url=https://<DOMAIN_ANDA>/api/telegram/webhook&secret_token=mobogen_telegram_secret_2026
```

*(Ganti `<TOKEN_BOT_ANDA>` dan `<DOMAIN_ANDA>` dengan data asli Anda)*.

Jika muncul respons `{"ok":true,"result":true,"description":"Webhook was set"}`, berarti bot sudah aktif 100%! 🎉

---

## 💬 3 Macam Opsi Presensi di Telegram Bot

1. **🟢 Opsi 1: Hadir (PRESENT)**
   - Cukup kirim poin-poin kegiatan harian Anda (atau ketik `/hadir <poin>`):
     ```text
     Hari ini slicing UI dashboard, integrasi Bot Telegram, dan fixing bug CORS
     ```
   - AI menyusun 3 narasi formal (Uraian Aktivitas, Pembelajaran, Kendala masing-masing $\ge$ 100 karakter).
   - Klik tombol **[ 🚀 Kirim Absensi Hadir ]**.

2. **🟡 Opsi 2: Tidak Hadir Dengan Keterangan (ON_LEAVE)**
   - Ketik `/izin <alasan>` (atau pilih menu Izin):
     ```text
     /izin Sakit demam dan berobat ke klinik dokter
     ```
   - AI menyusun narasi keterangan izin resmi ($\ge$ 100 karakter).
   - Klik tombol **[ 🚀 Kirim Keterangan Izin ]**.

3. **🔴 Opsi 3: Tidak Hadir Tanpa Keterangan (ABSENT / Alpha)**
   - Ketik `/alpha` atau klik menu **[ 🔴 Tanpa Keterangan ]**.
   - Klik konfirmasi **[ 🚀 Ya, Kirim Tanpa Keterangan ]** untuk mengirim status tidak hadir tanpa lampiran/alasan ke Kemnaker.

---

## 📋 Daftar Perintah Bot:
- `/start` atau `/help` atau `/menu` : Menampilkan menu utama & 3 opsi presensi
- `/login <email> <password>` : Menghubungkan akun SIAPkerja Kemnaker
- `/status` : Cek status koneksi akun & tanggal hari ini
- `/hadir <kegiatan>` : Absen hadir
- `/izin <alasan>` : Absen izin tidak hadir
- `/alpha` : Absen tidak hadir tanpa keterangan
- `/logout` : Menghapus data akun dari bot
