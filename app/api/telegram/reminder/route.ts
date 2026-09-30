import { type NextRequest } from "next/server";
import { getAllUsers } from "@/lib/telegram/store";
import { telegram } from "@/lib/telegram/client";

export const dynamic = "force-dynamic";

/**
 * Cron / Reminder Endpoint: Mengirim pesan pengingat absensi harian ke semua peserta
 * Dipanggil via Vercel Cron (setiap Senin-Jumat jam 16:00 WIB / 09:00 UTC)
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
    const reminderText = `⏰ *PENGINGAT ABSENSI MONEV MAGANGHUB*\n\nHai *${
      user.name || "Sobat Magang"
    }*! Jam kerja magang hari ini telah usai.\n\nApa saja yang kamu kerjakan hari ini? Balas pesan ini dengan poin-poin kegiatanmu (misal: _"Slicing UI dashboard dan testing API"_), dan AI Mobogen akan langsung menyusun 3 bagian laporan Monev Anda! 🚀`;

    const sent = await telegram.sendMessage(user.chatId, reminderText);
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
