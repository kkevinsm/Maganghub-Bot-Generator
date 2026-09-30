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
TELEGRAM_ENCRYPTION_SECRET=kunci_rahasia_acak_32_karakter
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

## 💬 Cara Penggunaan Bot di Telegram

1. **Buka Bot Anda** di Telegram dan klik **Start**.
2. **Hubungkan Akun Kemnaker (Hanya Sekali)**:
   ```text
   /login email@domain.com password123
   ```
   *(Atau cukup ketik `/login` untuk panduan bertahap).*

3. **Laporan & Absen Harian**:
   Cukup kirimkan poin kegiatan Anda:
   ```text
   Hari ini slicing UI dashboard, buat integrasi Bot Telegram, dan fixing bug CORS
   ```
4. **Konfirmasi & Kirim**:
   AI akan menyusun 3 bagian narasi formal ($\ge$ 100 karakter):
   - **Uraian Aktivitas**
   - **Pembelajaran yang Diperoleh**
   - **Kendala yang Dialami**
   
   Klik tombol **[ 🚀 Kirim Absensi Sekarang ]**. Laporan langsung terkirim resmi ke server Monev Kemnaker! ✅

5. **Izin Tidak Hadir**:
   ```text
   /izin Sakit demam dan istirahat dokter
   ```

6. **Perintah Lainnya**:
   - `/status` : Cek status akun & draft aktif
   - `/help` : Panduan penggunaan
   - `/logout` : Menghapus data akun dari bot
