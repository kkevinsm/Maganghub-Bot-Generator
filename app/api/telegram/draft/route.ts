import { type NextRequest } from "next/server";
import { getUser, saveUser, decryptData } from "@/lib/telegram/store";
import { generateMonevFromText } from "@/lib/telegram/ai";
import { loginKemnaker, submitAttendanceToKemnaker } from "@/lib/telegram/kemnaker";

export const dynamic = "force-dynamic";

/**
 * GET: Mengambil draft aktif user untuk Mini App Editor
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const chatId = Number(searchParams.get("chatId"));

  if (!chatId) {
    return Response.json({ error: "chatId wajib disertakan." }, { status: 400 });
  }

  const user = getUser(chatId);
  const hasAccount = Boolean(user.username && user.password);

  return Response.json({
    chatId: user.chatId,
    name: user.name || "Peserta Magang",
    hasAccount,
    role: user.role || "general",
    draft: user.draftReport || null,
  });
}

/**
 * POST: Menyimpan atau submit draft dari Mini App Editor
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { chatId, action, draft, promptAktivitas, status } = body;

    if (!chatId) {
      return Response.json({ error: "chatId wajib disertakan." }, { status: 400 });
    }

    const user = getUser(Number(chatId));

    // Action: Generate via AI di Mini App
    if (action === "generate") {
      const isIzin = status === "ON_LEAVE";
      const report = await generateMonevFromText(promptAktivitas || "", isIzin);

      const today = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Jakarta",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());

      const updatedDraft = {
        date: today,
        status: status || "PRESENT",
        uraian_aktivitas: report.uraian_aktivitas || "",
        pembelajaran: report.pembelajaran || "",
        kendala: report.kendala || "",
        alasan_tidak_hadir: report.alasan_tidak_hadir || "",
        rawInput: promptAktivitas || "",
        createdAt: Date.now(),
      };

      user.draftReport = updatedDraft;
      saveUser(user);

      return Response.json({
        success: true,
        draft: updatedDraft,
      });
    }

    // Action: Simpan Draft
    if (action === "save") {
      user.draftReport = {
        ...draft,
        createdAt: user.draftReport?.createdAt || Date.now(),
      };
      saveUser(user);
      return Response.json({ success: true, message: "Draft berhasil disimpan." });
    }

    // Action: Submit Langsung ke Kemnaker
    if (action === "submit") {
      if (!user.username || !user.password) {
        return Response.json(
          { error: "Akun Kemnaker belum terhubung. Silakan login via Telegram terlebih dahulu." },
          { status: 401 }
        );
      }

      const rawUsername = decryptData(user.username);
      const rawPassword = decryptData(user.password);

      const loginRes = await loginKemnaker(rawUsername, rawPassword);
      if (!loginRes.success || !loginRes.accessToken) {
        return Response.json(
          { error: `Gagal login ke Kemnaker: ${loginRes.error || "Password/Email salah"}` },
          { status: 401 }
        );
      }

      const token = loginRes.accessToken;
      const targetDraft = draft || user.draftReport;

      if (!targetDraft) {
        return Response.json({ error: "Draft laporan kosong." }, { status: 400 });
      }

      const submitPayload = {
        date: targetDraft.date,
        status: targetDraft.status,
        activity_log:
          targetDraft.status === "PRESENT"
            ? targetDraft.uraian_aktivitas
            : targetDraft.status === "ON_LEAVE"
            ? targetDraft.alasan_tidak_hadir
            : undefined,
        lesson_learned: targetDraft.status === "PRESENT" ? targetDraft.pembelajaran : undefined,
        obstacles: targetDraft.status === "PRESENT" ? targetDraft.kendala : undefined,
        leave_reason: targetDraft.status === "ON_LEAVE" ? targetDraft.alasan_tidak_hadir : undefined,
      };

      const submitRes = await submitAttendanceToKemnaker(token, submitPayload);

      if (!submitRes.success) {
        return Response.json(
          { error: submitRes.error || "Gagal submit ke Kemnaker." },
          { status: 500 }
        );
      }

      // Clear draft on success
      user.draftReport = null;
      user.step = "idle";
      saveUser(user);

      return Response.json({
        success: true,
        message: "Laporan presensi Monev berhasil dikirim resmi ke Kemnaker!",
      });
    }

    return Response.json({ error: "Action tidak dikenal." }, { status: 400 });
  } catch (err) {
    console.error("Telegram draft API error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
