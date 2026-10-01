import { type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

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
- JANGAN menggunakan bullet points, numbering, atau format markdown apa pun. Tulis sebagai paragraf narasi yang mengalir.
- JANGAN menyertakan label/judul seperti "Uraian Aktivitas:" di awal. Langsung tulis isinya saja.
- JANGAN mengarang aktivitas yang tidak disebutkan user.
- Tulislah dengan gaya bahasa profesional khas laporan magang/instansi pemerintah.
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

async function tryFetchModel(
  model: string,
  apiKey: string,
  requestBody: string,
  timeoutMs: number = 8000
): Promise<{ text?: string; model?: string; error?: string; status?: number }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: requestBody,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const data = await res.json().catch(() => null);

    if (res.ok && data) {
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) {
        return { text, model };
      }
    }

    const errMsg = data?.error?.message || `HTTP ${res.status}`;
    return { error: errMsg, status: res.status };
  } catch (err) {
    clearTimeout(timeoutId);
    return { error: err instanceof Error ? err.message : "Timeout", status: 500 };
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { aktivitas, status, customApiKey } = body;

    const isIzin = status === "Tidak Hadir Dengan Keterangan";

    if (!aktivitas || aktivitas.trim().length === 0) {
      return Response.json(
        {
          error: isIzin
            ? "Catatan / alasan izin tidak boleh kosong."
            : "Catatan aktivitas harian tidak boleh kosong.",
        },
        { status: 400 }
      );
    }

    // Determine API key: prefer custom key from client, fallback to env
    const apiKey = (customApiKey || "").trim() || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return Response.json(
        {
          error:
            "API Key belum dikonfigurasi. Masukkan API Key Gemini Anda di pengaturan atau atur GEMINI_API_KEY di file .env.local",
        },
        { status: 401 }
      );
    }

    // Model kuota tinggi (1.500 RPD) sebagai prioritas utama
    const speedTierModels = [
      "gemini-1.5-flash",
      "gemini-2.0-flash",
      "gemini-1.5-flash-8b",
      "gemini-flash-latest",
      "gemini-2.5-flash",
    ];

    const preferredModel = process.env.GEMINI_MODEL;
    if (preferredModel && !speedTierModels.includes(preferredModel)) {
      speedTierModels.unshift(preferredModel);
    }

    const systemInstruction = isIzin
      ? SYSTEM_INSTRUCTION_IZIN
      : SYSTEM_INSTRUCTION_HADIR;

    const userPrompt = isIzin
      ? `Status Kehadiran: Tidak Hadir Dengan Keterangan\nCatatan Singkat User:\n${aktivitas}\n\nBuatkan narasi formal Alasan Tidak Hadir (minimal 100 karakter) sesuai standar Monev Kemnaker.`
      : `Status Kehadiran: Hadir\nCatatan Aktivitas Harian:\n${aktivitas}\n\nBuatkan 3 bagian laporan Monev harian (Uraian Aktivitas, Pembelajaran, Kendala masing-masing minimal 100 karakter).`;

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
        maxOutputTokens: 1024,
        responseMimeType: "application/json",
      },
    });

    let chosenResult = null;
    let lastError = "";

    for (const model of speedTierModels) {
      const res = await tryFetchModel(model, apiKey, requestBody, 8000);
      if (res && res.text) {
        chosenResult = res;
        break;
      }
      if (res && res.error) {
        lastError = `[${model}] ${res.error}`;
        if (res.status === 400 && res.error.includes("API key not valid")) {
          return Response.json(
            { error: "API Key Gemini Anda tidak valid. Silakan periksa kembali key di Google AI Studio." },
            { status: 400 }
          );
        }
      }
    }

    if (!chosenResult || !chosenResult.text) {
      const isQuotaError =
        lastError.includes("Quota") ||
        lastError.includes("RESOURCE_EXHAUSTED") ||
        lastError.includes("429");

      return Response.json(
        {
          error: isQuotaError
            ? "Limit (kuota harian) pada Google API Key Anda telah habis (Rate Limit Exceeded). Buat API Key baru di https://aistudio.google.com/app/apikey"
            : `Gagal menghasilkan laporan AI (${lastError || "Semua model sibuk"}). Coba lagi beberapa saat lagi.`,
        },
        { status: isQuotaError ? 429 : 503 }
      );
    }

    const parsed = JSON.parse(chosenResult.text);

    if (isIzin) {
      return Response.json({
        alasan_tidak_hadir: parsed.alasan_tidak_hadir || "",
        model: chosenResult.model,
      });
    }

    return Response.json({
      uraian_aktivitas: parsed.uraian_aktivitas || "",
      pembelajaran: parsed.pembelajaran || "",
      kendala: parsed.kendala || "",
      model: chosenResult.model,
    });
  } catch (error: unknown) {
    console.error("Generate API error:", error);
    const message =
      error instanceof SyntaxError
        ? "Gagal mem-parsing respons AI. Silakan coba lagi."
        : "Terjadi kesalahan internal server.";
    return Response.json({ error: message }, { status: 500 });
  }
}
