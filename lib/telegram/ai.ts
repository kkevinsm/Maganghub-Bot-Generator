/**
 * AI Generator untuk Telegram Bot Mobogen
 * Menggunakan Google Gemini API untuk menyusun narasi laporan Monev Kemnaker.
 */

const SYSTEM_INSTRUCTION_HADIR = `Kamu adalah asisten pelaporan harian Monitoring dan Evaluasi (Monev) untuk peserta program Magang Merdeka dari Kementerian Ketenagakerjaan Republik Indonesia (Kemnaker) melalui platform MagangHub bernama Mobogen.

TUGAS UTAMA:
Berdasarkan poin-poin singkat aktivitas harian yang diberikan user, buatkan 3 bagian laporan harian yang terstruktur, profesional, dan formal:

1. **Uraian Aktivitas**: Narasi detail kegiatan yang dilakukan hari ini. Tuliskan secara runtut, jelas, dan profesional. Jelaskan apa saja yang dikerjakan, konteks pekerjaannya, dan hasilnya.

2. **Pembelajaran yang Diperoleh**: Refleksi tentang wawasan, keterampilan, dan pengetahuan baru yang didapatkan dari aktivitas hari ini. Hubungkan dengan pengembangan kompetensi profesional.

3. **Kendala yang Dialami**: Hambatan, tantangan, atau kesulitan yang dihadapi selama menjalankan aktivitas. Jika tidak ada kendala besar, tetap tuliskan tantangan kecil atau area yang perlu ditingkatkan.

ATURAN WAJIB:
- Setiap bagian HARUS mengandung MINIMAL 100 karakter (ini adalah persyaratan wajib sistem Monev Kemnaker).
- Usahakan setiap bagian berisi 120-200 karakter agar terlihat alami dan tidak terlalu panjang.
- Gunakan bahasa Indonesia formal dan profesional (baku), sesuai standar penulisan laporan instansi pemerintah.
- JANGAN menggunakan bullet points, numbering, atau format markdown apa pun di dalam teks isi. Tulis sebagai paragraf narasi yang mengalir.
- JANGAN menyertakan label/judul seperti "Uraian Aktivitas:" di awal. Langsung tulis isinya saja.
- JANGAN mengarang aktivitas yang tidak disebutkan user.
- Pastikan setiap bagian berdiri sendiri sebagai satu paragraf utuh.

FORMAT OUTPUT (JSON):
{
  "uraian_aktivitas": "...",
  "pembelajaran": "...",
  "kendala": "..."
}

Hanya kembalikan JSON valid, tanpa blok kode, tanpa backtick, tanpa penjelasan tambahan.`;

const SYSTEM_INSTRUCTION_IZIN = `Kamu adalah asisten pelaporan harian Monitoring dan Evaluasi (Monev) untuk peserta program Magang Merdeka dari Kementerian Ketenagakerjaan Republik Indonesia (Kemnaker) melalui platform MagangHub bernama Mobogen.

TUGAS UTAMA:
User memilih status kehadiran "Tidak Hadir Dengan Keterangan" (Izin / Sakit / Keperluan Resmi).
Berdasarkan catatan/alasan singkat yang diberikan user, buatkan narasi resmi, sopan, dan profesional untuk bagian:
**Alasan Tidak Hadir**

ATURAN WAJIB:
- Panjang teks HARUS mengandung MINIMAL 100 karakter (ini adalah persyaratan wajib sistem Monev Kemnaker).
- Usahakan panjang teks antara 120-180 karakter agar jelas, sopan, dan formal.
- Gunakan bahasa Indonesia formal dan baku, menyampaikan permohonan izin atau keterangan kondisi dengan santun serta berkomitmen menyelesaikan kewajiban tugas bila memungkinkan.
- JANGAN menggunakan bullet points, numbering, atau format markdown apa pun. Tulis sebagai satu paragraf narasi mengalir.
- JANGAN menyertakan label atau judul seperti "Alasan Tidak Hadir:" di awal.

FORMAT OUTPUT (JSON):
{
  "alasan_tidak_hadir": "..."
}

Hanya kembalikan JSON valid, tanpa blok kode, tanpa backtick, tanpa penjelasan tambahan.`;

export interface GeneratedMonevReport {
  uraian_aktivitas?: string;
  pembelajaran?: string;
  kendala?: string;
  alasan_tidak_hadir?: string;
  modelUsed?: string;
}

export async function validateGeminiApiKey(apiKey: string): Promise<boolean> {
  if (!apiKey || !apiKey.trim()) return false;
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey.trim()}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: "hi" }] }],
        generationConfig: { maxOutputTokens: 5 },
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function generateMonevFromText(
  input: string,
  isIzin: boolean = false,
  customApiKey?: string
): Promise<GeneratedMonevReport> {
  const apiKey = (customApiKey || "").trim() || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY belum dikonfigurasi. Silakan masukkan API Key Gemini Anda dengan mengetik: /apikey <KEY_ANDA>"
    );
  }

  const primaryModel = process.env.GEMINI_MODEL || "gemini-flash-latest";
  const fallbackModels = [
    primaryModel,
    "gemini-3.7-flash",
    "gemini-3.5-flash-lite",
  ];

  const systemInstruction = isIzin ? SYSTEM_INSTRUCTION_IZIN : SYSTEM_INSTRUCTION_HADIR;

  const userPrompt = isIzin
    ? `Status Kehadiran: Tidak Hadir Dengan Keterangan\nCatatan Singkat User:\n${input}\n\nBuatkan narasi formal Alasan Tidak Hadir (minimal 100 karakter) sesuai standar Monev Kemnaker.`
    : `Status Kehadiran: Hadir\nCatatan Aktivitas Harian:\n${input}\n\nBuatkan 3 bagian laporan Monev harian (Uraian Aktivitas, Pembelajaran, Kendala masing-masing minimal 100 karakter).`;

  const requestBody = JSON.stringify({
    system_instruction: {
      parts: [{ text: systemInstruction }],
    },
    contents: [
      {
        parts: [{ text: userPrompt }],
      },
    ],
    generationConfig: {
      temperature: 0.7,
      topP: 0.9,
      topK: 40,
      maxOutputTokens: 1024,
      responseMimeType: "application/json",
    },
  });

  let lastError = "";

  for (const model of fallbackModels) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: requestBody,
      });

      if (res.ok) {
        const data = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) continue;

        const parsed = JSON.parse(text);
        return {
          uraian_aktivitas: parsed.uraian_aktivitas || "",
          pembelajaran: parsed.pembelajaran || "",
          kendala: parsed.kendala || "",
          alasan_tidak_hadir: parsed.alasan_tidak_hadir || "",
          modelUsed: model,
        };
      }

      if (res.status === 503 || res.status === 429) {
        lastError = `Model ${model} overloaded`;
        continue;
      }

      if (res.status === 400 || res.status === 403 || res.status === 401) {
        const errorData = await res.json().catch(() => null);
        throw new Error(
          errorData?.error?.message || "Gemini API Key tidak valid atau kuota habis."
        );
      }
    } catch (err) {
      if (err instanceof Error && (err.message.includes("tidak valid") || err.message.includes("API key"))) {
        throw err;
      }
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  throw new Error(`Gagal menghasilkan laporan AI: ${lastError || "Semua model Gemini sibuk."}`);
}
