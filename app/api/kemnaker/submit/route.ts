import { type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Direct attendance submission to Monev Kemnaker API — no third-party proxy.
 *
 * Endpoint: POST /api/v1/attendances/with-daily-log
 * Auth: Bearer token from the OAuth login flow
 */

const MONEV_API = "https://monev-api.maganghub.kemnaker.go.id/api/v1";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

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

    // ── Build the attendance payload for Monev API ─────────────────────
    const monevPayload: Record<string, unknown> = {
      date: payload.date,
      status: payload.status,
    };

    if (payload.status === "PRESENT") {
      monevPayload.activity_log = payload.activity_log || "";
      monevPayload.lesson_learned = payload.lesson_learned || "";
      monevPayload.obstacles = payload.obstacles || "";
    } else if (payload.status === "ON_LEAVE") {
      monevPayload.activity_log =
        payload.leave_reason || payload.activity_log || "";
    }

    // ── Submit directly to Monev API ──────────────────────────────────
    const submitUrl = `${MONEV_API}/attendances/with-daily-log`;

    const upstreamRes = await fetch(submitUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        "User-Agent": UA,
      },
      body: JSON.stringify(monevPayload),
    });

    const data = await upstreamRes.json().catch(() => null);

    if (upstreamRes.status === 401) {
      return Response.json(
        {
          error:
            data?.message ||
            data?.error ||
            "Sesi Monev telah berakhir atau token kedaluwarsa. Silakan login ulang.",
        },
        { status: 401 }
      );
    }

    if (!upstreamRes.ok || !data) {
      const errorMessage =
        data?.message ||
        data?.error ||
        `Pengiriman absensi gagal (HTTP ${upstreamRes.status}).`;
      return Response.json(
        { error: errorMessage },
        { status: upstreamRes.status || 500 }
      );
    }

    return Response.json({
      success: true,
      message:
        data.message ||
        "Laporan absensi berhasil dikirim ke Monev Kemnaker.",
      data: data.data || data || null,
    });
  } catch (error: unknown) {
    console.error("Kemnaker submit error:", error);
    const message =
      error instanceof Error
        ? error.message
        : "Terjadi kesalahan saat mengirim absensi ke Monev.";
    return Response.json({ error: message }, { status: 500 });
  }
}
