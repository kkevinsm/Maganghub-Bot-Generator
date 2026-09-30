import { type NextRequest } from "next/server";
import { getAllUsers, saveUser } from "@/lib/telegram/store";
import { telegram } from "@/lib/telegram/client";

export const dynamic = "force-dynamic";

function getAppBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return "https://mobogen.vercel.app";
}

/**
 * Cron / Reminder Endpoint:
 * 1. Mengirim pengingat presensi harian pukul 16:30 WIB
 * 2. Menjalankan Safeguard: Mengingatkan user jika memiliki draft yang belum diklik kirim >= 30 menit
 */
export async function GET(request: NextRequest) {
  return handleProcess(request);
}

export async function POST(request: NextRequest) {
  return handleProcess(request);
}

async function handleProcess(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const users = getAllUsers();
  const now = Date.now();

  let reminderSentCount = 0;
  let safeguardSentCount = 0;

  for (const user of users) {
    if (!user.username || !user.password) continue;

    // 1. Safeguard Check: Draft dibuat >= 30 menit lalu dan belum dikirim
    if (user.draftReport && !user.draftReport.safeguardNudgeSent) {
      const draftAgeMinutes = user.draftReport.createdAt
        ? (now - user.draftReport.createdAt) / (1000 * 60)
        : 60;

      if (draftAgeMinutes >= 30) {
        const statusLabel =
          user.draftReport.status === "PRESENT"
            ? "Hadir"
            : user.draftReport.status === "ON_LEAVE"
            ? "Izin"
            : "Tanpa Keterangan";

        const safeguardMsg = `⚠️ *PERINGATAN: DRAFT PRESENSI BELUM TERKIRIM!*\n\nHai *${
          user.name || "Sobat Magang"
        }*, Anda memiliki draft presensi (*${statusLabel}*) yang belum dikonfirmasi kirim ke server Kemnaker.\n\nJangan sampai terlewat sebelum batas harian berakhir pukul 23:59 WIB! ⏰`;

        const sent = await telegram.sendMessage(user.chatId, safeguardMsg, {
          reply_markup: {
            inline_keyboard: [
              [{ text: "🚀 Kirim Presensi Sekarang", callback_data: "SUBMIT_REPORT" }],
              [{ text: "✏️ Buka Editor Interaktif", web_app: { url: `${getAppBaseUrl()}/editor?chatId=${user.chatId}` } }],
              [{ text: "❌ Batalkan Draft", callback_data: "CANCEL_REPORT" }],
            ],
          },
        });

        if (sent) {
          user.draftReport.safeguardNudgeSent = true;
          user.lastSafeguardNudge = now;
          saveUser(user);
          safeguardSentCount++;
        }
        continue;
      }
    }

    // 2. Regular 16:30 Daily Reminder
    if (user.reminderEnabled !== false && !user.draftReport) {
      const reminderText = `⏰ *PENGINGAT PRESENSI MONEV (16:30 WIB)*\n\nHai *${
        user.name || "Sobat Magang"
      }*! Waktu kerja magang hari ini telah selesai.\n\nJangan lupa untuk mengisi presensi & laporan Monev MagangHub hari ini. Silakan pilih salah satu opsi di bawah atau langsung kirimkan ringkasan kegiatan Anda ke chat ini: 🚀`;

      const sent = await telegram.sendMessage(user.chatId, reminderText, {
        reply_markup: {
          inline_keyboard: [
            [{ text: "🟢 1. Absen Hadir", callback_data: "MENU_HADIR" }],
            [{ text: "🟡 2. Izin (Dengan Keterangan)", callback_data: "MENU_IZIN" }],
            [{ text: "🔴 3. Tanpa Keterangan (Alpha)", callback_data: "MENU_ABSENT" }],
            [{ text: "💡 Ide Kegiatan Harian", callback_data: "SUGGEST_IDEAS" }],
            [{ text: "✏️ Buka Editor Interaktif", web_app: { url: `${getAppBaseUrl()}/editor?chatId=${user.chatId}` } }],
          ],
        },
      });

      if (sent) {
        reminderSentCount++;
      }
    }
  }

  return Response.json({
    status: "completed",
    totalUsers: users.length,
    remindersSent: reminderSentCount,
    safeguardsSent: safeguardSentCount,
    timestamp: new Date().toISOString(),
  });
}
