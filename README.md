# Mobogen (MagangHub Monev Generator)

Asisten pelaporan harian Monitoring dan Evaluasi (Monev) untuk peserta program Magang Merdeka dari Kementerian Ketenagakerjaan Republik Indonesia (Kemnaker) melalui platform MagangHub.

---

## Fitur Utama

- **Generator Laporan Pintar (AI)**:
  - Menyusun 3 bagian laporan harian (**Uraian Aktivitas**, **Pembelajaran yang Diperoleh**, dan **Kendala yang Dialami**) secara otomatis dari poin-poin singkat kegiatan harian.
  - Memastikan setiap bagian memenuhi syarat formal instansi pemerintah dengan standar **minimal 100 karakter**.
  - Mendukung pembuatan narasi formal untuk opsi **Tidak Hadir Dengan Keterangan**.
- **Real-time Character Counter & Copy**:
  - Penghitung karakter interaktif (`count/100`) untuk memastikan kelayakan pengiriman.
  - Fitur 1-Click Copy untuk tiap bagian maupun seluruh laporan.
- **Kirim Otomatis ke Monev Kemnaker**:
  - Otentikasi langsung dengan akun SIAPkerja ID peserta magang tanpa kendala CORS.
  - Sinkronisasi langsung ke sistem Monev Kemnaker (`monev.maganghub.kemnaker.go.id`).
  - Sesuai dengan opsi status kehadiran aktual:
    - `Hadir`
    - `Tidak Hadir Dengan Keterangan`
    - `Tidak Hadir Tanpa Keterangan`
- **Keamanan Terjamin**:
  - *Zero-Knowledge Credential Storage*: Password Anda tidak pernah disimpan di database server.
  - Dilengkapi *Security Headers* (HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy).

---

## Memulai

### 1. Instalasi Dependensi
```bash
npm install
```

### 2. Konfigurasi Lingkungan
Salin `.env.example` ke `.env.local`:
```bash
cp .env.example .env.local
```
Lalu masukkan API Key Gemini Anda di `GEMINI_API_KEY` (atau Anda dapat mengisinya langsung melalui UI aplikasi).

### 3. Menjalankan Server Pengembangan
```bash
npm run dev
```
Buka [http://localhost:3000](http://localhost:3000) di browser Anda.

---

## Lisensi
MIT
