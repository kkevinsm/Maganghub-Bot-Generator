import { type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const DEFAULT_PROXY_BASE = "https://absen-hub.web.id";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token, payload } = body;

    if (!token) {
      return Response.json(
        { error: "Token otentikasi Kemnaker tidak ditemukan. Silakan login ulang." },
        { status: 401 }
      );
    }

    if (!payload || !payload.date || !payload.status) {
      return Response.json(
        { error: "Tanggal dan status kehadiran wajib diisi." },
        { status: 400 }
      );
    }

    // Validation for Hadir (PRESENT)
    if (payload.status === "PRESENT") {
      const shortFields: string[] = [];
      if ((payload.activity_log || "").trim().length < 100) {
        shortFields.push("Uraian Aktivitas");
      }
      if ((payload.lesson_learned || "").trim().length < 100) {
        shortFields.push("Pembelajaran yang Diperoleh");
      }
      if ((payload.obstacles || "").trim().length < 100) {
        shortFields.push("Kendala yang Dialami");
      }

      if (shortFields.length > 0) {
        return Response.json(
          {
            error: `Sistem Monev mensyaratkan minimal 100 karakter untuk: ${shortFields.join(
              ", "
            )}. Perpanjang isian Anda lalu coba kirim kembali.`,
          },
          { status: 400 }
        );
      }
    }

    // Validation for Tidak Hadir Dengan Keterangan (ON_LEAVE)
    if (payload.status === "ON_LEAVE") {
      const reason = (payload.leave_reason || payload.activity_log || "").trim();
      if (reason.length < 100) {
        return Response.json(
          {
            error:
              "Sistem Monev mensyaratkan minimal 100 karakter untuk Alasan Tidak Hadir. Silakan lengkapi alasan Anda.",
          },
          { status: 400 }
        );
      }
    }

    const proxyBase = process.env.KEMNAKER_PROXY_BASE_URL || DEFAULT_PROXY_BASE;
    const submitUrl = `${proxyBase}/api/kemnaker/submit-attendance`;

    const clientIp =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip");

    const upstreamHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    };

    if (clientIp) {
      upstreamHeaders["X-Forwarded-For"] = clientIp;
    }

    const upstreamRes = await fetch(submitUrl, {
      method: "POST",
      headers: upstreamHeaders,
      body: JSON.stringify({ token, payload }),
    });

    const data = await upstreamRes.json().catch(() => null);

    if (upstreamRes.status === 401) {
      return Response.json(
        {
          error:
            data?.error || "Sesi Monev telah berakhir atau token kedaluwarsa. Silakan login ulang.",
        },
        { status: 401 }
      );
    }

    if (!upstreamRes.ok || !data || !data.success) {
      const errorMessage =
        data?.error || `Pengiriman absensi gagal (HTTP ${upstreamRes.status}).`;
      return Response.json({ error: errorMessage }, { status: upstreamRes.status || 500 });
    }

    return Response.json({
      success: true,
      message: data.message || "Laporan absensi berhasil dikirim ke Monev Kemnaker.",
      data: data.data || null,
    });
  } catch (error: unknown) {
    console.error("Kemnaker submit error:", error);
    const message =
      error instanceof Error ? error.message : "Terjadi kesalahan saat mengirim absensi ke Monev.";
    return Response.json({ error: message }, { status: 500 });
  }
}
