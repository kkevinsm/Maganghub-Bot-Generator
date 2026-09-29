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
    const apiKey = customApiKey || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return Response.json(
        {
          error:
            "API Key belum dikonfigurasi. Masukkan API Key Gemini Anda di pengaturan atau atur GEMINI_API_KEY di file .env.local",
        },
        { status: 401 }
      );
    }

    // Model fallback chain: try primary first, then alternatives if overloaded
    const primaryModel = process.env.GEMINI_MODEL || "gemini-flash-latest";
    const fallbackModels = [
      primaryModel,
      "gemini-3.7-flash",
      "gemini-3.5-flash-lite",
    ];

    const systemInstruction = isIzin
      ? SYSTEM_INSTRUCTION_IZIN
      : SYSTEM_INSTRUCTION_HADIR;

    const userPrompt = isIzin
      ? `Status Kehadiran: Tidak Hadir Dengan Keterangan
Catatan Singkat User:
${aktivitas}

Buatkan narasi formal Alasan Tidak Hadir (minimal 100 karakter) sesuai standar Monev Kemnaker.`
      : `Status Kehadiran: Hadir
Catatan Aktivitas Harian:
${aktivitas}

Buatkan 3 bagian laporan Monev harian (Uraian Aktivitas, Pembelajaran, Kendala masing-masing minimal 100 karakter).`;

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

    let geminiData = null;
    let usedModel = primaryModel;
    let lastError = "";

    for (const model of fallbackModels) {
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

      const geminiResponse = await fetch(geminiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: requestBody,
      });

      if (geminiResponse.ok) {
        geminiData = await geminiResponse.json();
        usedModel = model;
        break;
      }

      // If overloaded (503) or rate limited (429), try next model
      if (geminiResponse.status === 503 || geminiResponse.status === 429) {
        const errorData = await geminiResponse.json().catch(() => ({}));
        lastError = errorData?.error?.message || `Model ${model} sedang sibuk`;
        console.log(`Model ${model} overloaded, trying next fallback...`);
        continue;
      }

      // For other errors, return immediately
      const errorData = await geminiResponse.json().catch(() => ({}));
      const errorMessage =
        errorData?.error?.message || `Gemini API error: ${geminiResponse.status}`;
      return Response.json({ error: errorMessage }, { status: geminiResponse.status });
    }

    if (!geminiData) {
      return Response.json(
        { error: `Semua model sedang sibuk. Coba lagi dalam beberapa saat. (${lastError})` },
        { status: 503 }
      );
    }

    // Extract generated text
    const generatedText =
      geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!generatedText) {
      return Response.json(
        { error: "Gagal mendapatkan respons dari AI. Silakan coba lagi." },
        { status: 500 }
      );
    }

    // Parse JSON response
    const parsed = JSON.parse(generatedText);

    if (isIzin) {
      return Response.json({
        alasan_tidak_hadir: parsed.alasan_tidak_hadir || "",
        model: usedModel,
      });
    }

    return Response.json({
      uraian_aktivitas: parsed.uraian_aktivitas || "",
      pembelajaran: parsed.pembelajaran || "",
      kendala: parsed.kendala || "",
      model: usedModel,
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
