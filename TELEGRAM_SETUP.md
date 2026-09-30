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

## ✨ Fitur Unggulan Mobogen Bot:

### 1. 📱 Telegram Mini App (In-App Editor Interaktif)
- Klik tombol **`[ ✏️ Buka Editor Interaktif ]`** untuk membuka form pengeditan visual langsung di dalam aplikasi Telegram tanpa membuka browser eksternal.
- Real-time character counter (`count/100`), generator AI instan, dan tombol submit langsung ke Kemnaker.

### 2. 💡 Role-based Smart Suggestions (Inspirasi Kegiatan Harian)
- Atur posisi magang Anda via `/role` (Frontend, Backend, UI/UX, Data, PM/QA, Marketing, HR, Umum).
- Dapatkan 3 rekomendasi ide kegiatan harian yang relevan dengan tugas divisi Anda via tombol **`[ 💡 Ide Kegiatan ]`** atau `/ide`.

### 3. 🛡️ Auto-Submit Safeguard (Pengingat Draft Tertunda)
- Jika Anda telah membuat draft laporan tapi lupa menekan tombol konfirmasi kirim dalam $\ge$ 30 menit, bot akan otomatis mengirimkan notifikasi pengingat agar absensi Anda tidak terlewat sebelum pukul 23:59 WIB.

### 4. ⏰ Pengingat Sore Otomatis (16:30 WIB)
- Bot otomatis menyapa Anda setiap hari Senin–Jumat pukul 16:30 WIB untuk mengisi laporan presensi harian.

---

## 💬 3 Macam Opsi Presensi:

1. **🟢 Hadir (PRESENT)**
   - Chat ringkasan kegiatan (atau `/hadir <poin>`), AI membuat 3 bagian narasi formal (Uraian, Pembelajaran, Kendala $\ge$ 100 char), klik **Kirim Absensi Hadir**.

2. **🟡 Tidak Hadir Dengan Keterangan (ON_LEAVE)**
   - Ketik `/izin <alasan>`, AI membuat narasi izin formal $\ge$ 100 char, klik **Kirim Keterangan Izin**.

3. **🔴 Tidak Hadir Tanpa Keterangan (ABSENT)**
   - Ketik `/alpha` atau klik menu Tanpa Keterangan, klik konfirmasi untuk kirim status Alpha resmi ke Kemnaker.

---

## 📋 Daftar Perintah Bot:
- `/start` / `/help` / `/menu` : Menu utama & 3 opsi presensi
- `/login <email> <password>` : Menghubungkan akun SIAPkerja Kemnaker
- `/status` : Cek status akun, posisi, pengingat, & draft aktif
- `/role` : Memilih posisi magang (Frontend, UI/UX, Data, dll)
- `/ide` : Menampilkan rekomendasi ide kegiatan harian
- `/hadir <kegiatan>` : Absen hadir
- `/izin <alasan>` : Absen izin tidak hadir
- `/alpha` : Absen tidak hadir tanpa keterangan
- `/reminder on` / `off` : Mengatur pengingat 16:30 WIB
- `/logout` : Menghapus data akun dari bot
