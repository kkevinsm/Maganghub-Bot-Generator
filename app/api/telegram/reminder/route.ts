import { type NextRequest } from "next/server";
import { getAllUsers } from "@/lib/telegram/store";
import { telegram } from "@/lib/telegram/client";

export const dynamic = "force-dynamic";

/**
 * Cron / Reminder Endpoint: Mengirim pesan pengingat absensi harian ke semua peserta
 * Dipanggil otomatis setiap hari pukul 16:30 WIB (09:30 UTC)
 */
export async function GET(request: NextRequest) {
  return handleReminder(request);
}

export async function POST(request: NextRequest) {
  return handleReminder(request);
}

async function handleReminder(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const users = getAllUsers();
  const eligibleUsers = users.filter(
    (u) => u.username && u.password && u.reminderEnabled !== false
  );

  let successCount = 0;
  let failCount = 0;

  for (const user of eligibleUsers) {
    const reminderText = `⏰ *PENGINGAT PRESENSI MONEV (16:30 WIB)*\n\nHai *${
      user.name || "Sobat Magang"
    }*! Waktu kerja magang hari ini telah selesai.\n\nJangan lupa untuk mengisi presensi & laporan Monev MagangHub hari ini. Silakan pilih salah satu opsi di bawah atau langsung kirimkan ringkasan kegiatan Anda ke chat ini: 🚀`;

    const sent = await telegram.sendMessage(user.chatId, reminderText, {
      reply_markup: {
        inline_keyboard: [
          [{ text: "🟢 1. Absen Hadir", callback_data: "MENU_HADIR" }],
          [{ text: "🟡 2. Izin (Dengan Keterangan)", callback_data: "MENU_IZIN" }],
          [{ text: "🔴 3. Tanpa Keterangan (Alpha)", callback_data: "MENU_ABSENT" }],
        ],
      },
    });

    if (sent) {
      successCount++;
    } else {
      failCount++;
    }
  }

  return Response.json({
    status: "completed",
    totalEligible: eligibleUsers.length,
    sent: successCount,
    failed: failCount,
    timestamp: new Date().toISOString(),
  });
}
