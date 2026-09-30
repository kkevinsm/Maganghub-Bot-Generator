/**
 * Main Telegram Bot Conversation Handler untuk Mobogen
 */

import { telegram } from "./client";
import {
  getUser,
  saveUser,
  encryptData,
  decryptData,
  deleteUser,
} from "./store";
import { generateMonevFromText } from "./ai";
import { loginKemnaker, submitAttendanceToKemnaker } from "./kemnaker";
import { TelegramUpdate, UserAccount, UserDraftReport } from "./types";

function getTodayDateString(): string {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(now);
}

export async function handleTelegramUpdate(update: TelegramUpdate) {
  // 1. Handle Callback Query (Tombol Inline yang diklik user)
  if (update.callback_query) {
    const cb = update.callback_query;
    const chatId = cb.message?.chat.id || cb.from.id;
    const data = cb.data || "";
    const user = getUser(chatId);

    // Answer callback query immediately to stop the loading spinner on button
    await telegram.answerCallbackQuery(cb.id);

    if (data === "SUBMIT_REPORT") {
      return handleConfirmSubmit(user, cb.message?.message_id);
    }

    if (data === "REGENERATE_REPORT") {
      return handleRegenerateDraft(user, cb.message?.message_id);
    }

    if (data === "CANCEL_REPORT") {
      user.draftReport = null;
      user.step = "idle";
      saveUser(user);
      if (cb.message?.message_id) {
        return telegram.editMessageText(
          chatId,
          cb.message.message_id,
          "❌ Draft laporan berhasil dibatalkan. Silakan kirimkan poin-poin kegiatan baru kapan saja."
        );
      }
      return telegram.sendMessage(
        chatId,
        "❌ Draft laporan berhasil dibatalkan. Silakan kirimkan poin-poin kegiatan baru kapan saja."
      );
    }

    if (data === "BTN_LOGIN") {
      user.step = "awaiting_login_email";
      saveUser(user);
      return telegram.sendMessage(
        chatId,
        "🔐 *Hubungkan Akun SIAPkerja Kemnaker*\n\nSilakan kirimkan *Email, No. HP, atau NIK* akun Kemnaker Anda:"
      );
    }

    if (data === "BTN_HELP") {
      return sendHelpMenu(user);
    }

    return;
  }

  // 2. Handle Incoming Message Teks
  if (!update.message || !update.message.text) {
    return;
  }

  const msg = update.message;
  const chatId = msg.chat.id;
  const rawText = (msg.text || "").trim();
  const lowerText = rawText.toLowerCase();

  const user = getUser(chatId);
  if (msg.from?.first_name) {
    user.name = [msg.from.first_name, msg.from.last_name].filter(Boolean).join(" ");
  }
  if (msg.from?.username) {
    user.telegramUsername = msg.from.username;
  }

  // Command: /start, /help, menu
  if (lowerText === "/start" || lowerText === "/help" || lowerText === "menu") {
    return sendHelpMenu(user);
  }

  // Command: /login
  if (lowerText === "/login") {
    user.step = "awaiting_login_email";
    saveUser(user);
    return telegram.sendMessage(
      chatId,
      "🔐 *Hubungkan Akun SIAPkerja Kemnaker*\n\nSilakan kirimkan *Email, No. HP, atau NIK* akun Kemnaker Anda:"
    );
  }

  // Command: /login email password (Direct One-line)
  if (lowerText.startsWith("/login ")) {
    const parts = rawText.slice(7).trim().split(/\s+/);
    if (parts.length < 2) {
      return telegram.sendMessage(
        chatId,
        "⚠️ Format salah. Gunakan:\n`/login email@domain.com password123`\natau cukup ketik `/login` untuk panduan bertahap."
      );
    }
    const [email, ...pwParts] = parts;
    const password = pwParts.join(" ");

    await telegram.sendChatAction(chatId, "typing");
    await telegram.sendMessage(chatId, "⏳ Sedang memverifikasi akun Anda ke server Kemnaker...");

    const loginRes = await loginKemnaker(email, password);
    if (!loginRes.success || !loginRes.accessToken) {
      return telegram.sendMessage(
        chatId,
        `❌ *Gagal Terhubung ke Kemnaker*\n\n${loginRes.error || "Email/NIK atau password salah."}`
      );
    }

    user.username = encryptData(email);
    user.password = encryptData(password);
    user.token = loginRes.accessToken;
    user.name = (loginRes.user?.name as string) || user.name || "Peserta Magang";
    user.step = "idle";
    saveUser(user);

    return telegram.sendMessage(
      chatId,
      `🎉 *Berhasil Terhubung!*\n\nAkun atas nama *${user.name}* telah aktif dan siap.\n\nSekarang Anda cukup mengirimkan poin-poin kegiatan harian Anda ke chat ini, AI Mobogen akan menyusun laporan dan mengirimkan absensi Anda otomatis! 🚀`
    );
  }

  // Multi-step Login: Menunggu Email
  if (user.step === "awaiting_login_email") {
    user.tempLoginEmail = rawText;
    user.step = "awaiting_login_password";
    saveUser(user);
    return telegram.sendMessage(
      chatId,
      "🔑 Sekarang, silakan masukkan *Password* akun Kemnaker Anda:\n_(Password dienkripsi aman secara otomatis)_"
    );
  }

  // Multi-step Login: Menunggu Password
  if (user.step === "awaiting_login_password") {
    const email = user.tempLoginEmail || "";
    const password = rawText;
    user.tempLoginEmail = undefined;
    user.step = "idle";

    await telegram.sendChatAction(chatId, "typing");
    await telegram.sendMessage(chatId, "⏳ Sedang memverifikasi akun Anda ke server Kemnaker...");

    const loginRes = await loginKemnaker(email, password);
    if (!loginRes.success || !loginRes.accessToken) {
      saveUser(user);
      return telegram.sendMessage(
        chatId,
        `❌ *Gagal Terhubung ke Kemnaker*\n\n${loginRes.error || "Email/NIK atau password salah."}\n\nSilakan coba lagi dengan mengetik \`/login\``
      );
    }

    user.username = encryptData(email);
    user.password = encryptData(password);
    user.token = loginRes.accessToken;
    user.name = (loginRes.user?.name as string) || user.name || "Peserta Magang";
    saveUser(user);

    return telegram.sendMessage(
      chatId,
      `🎉 *Berhasil Terhubung!*\n\nSelamat datang, *${user.name}*!\nAkun SIAPkerja Kemnaker Anda telah aktif.\n\nKirimkan ringkasan kegiatan harian Anda kapan saja untuk membuat laporan Monev otomatis! 🚀`
    );
  }

  // Command: /logout
  if (lowerText === "/logout") {
    deleteUser(chatId);
    return telegram.sendMessage(
      chatId,
      "🔒 Data akun Anda telah dihapus dari bot. Ketik `/login` kapan saja jika ingin menghubungkannya kembali."
    );
  }

  // Command: /status
  if (lowerText === "/status") {
    const hasAccount = Boolean(user.username && user.password);
    const emailDecrypted = hasAccount ? decryptData(user.username!) : null;
    const draftStatus = user.draftReport
      ? `\n\n📝 *Draft Tersimpan*: ${user.draftReport.status === "PRESENT" ? "Hadir" : "Izin"} (Siap dikirim)`
      : "\n\n📝 *Draft*: Tidak ada draft aktif";

    return telegram.sendMessage(
      chatId,
      `📊 *Status Bot Mobogen*\n\n👤 Nama: *${user.name || "Peserta"}*\n🔗 Akun Kemnaker: ${
        hasAccount ? `✅ Terhubung (${emailDecrypted})` : "❌ Belum login"
      }\n📅 Tanggal Hari Ini: *${getTodayDateString()}*${draftStatus}`
    );
  }

  // Command: /izin <alasan>
  if (lowerText.startsWith("/izin") || lowerText.startsWith("!izin")) {
    const reasonInput = rawText.replace(/^[/!]izin\s*/i, "").trim();
    if (!reasonInput) {
      return telegram.sendMessage(
        chatId,
        "⚠️ Silakan sertakan alasan izin. Contoh:\n`/izin Sakit demam dan istirahat dokter`"
      );
    }
    return handleGenerateIzin(user, reasonInput);
  }

  // General Text: Generate Daily Report
  if (!user.username || !user.password) {
    return telegram.sendMessage(
      chatId,
      "👋 Halo! Anda belum menghubungkan akun Kemnaker ke Mobogen.\n\nSilakan login terlebih dahulu agar laporan absensi dapat dikirimkan secara otomatis.",
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: "🔐 Hubungkan Akun Sekarang", callback_data: "BTN_LOGIN" }],
            [{ text: "ℹ️ Panduan Penggunaan", callback_data: "BTN_HELP" }],
          ],
        },
      }
    );
  }

  return handleGenerateHadir(user, rawText);
}

async function handleGenerateHadir(user: UserAccount, input: string) {
  await telegram.sendChatAction(user.chatId, "typing");
  await telegram.sendMessage(
    user.chatId,
    "🤖 Sedang menyusun 3 bagian laporan Monev formal dengan AI (Uraian, Pembelajaran, Kendala)... Mohon tunggu sebentar ⏳"
  );

  try {
    const report = await generateMonevFromText(input, false);
    const today = getTodayDateString();

    const draft: UserDraftReport = {
      date: today,
      status: "PRESENT",
      uraian_aktivitas: report.uraian_aktivitas,
      pembelajaran: report.pembelajaran,
      kendala: report.kendala,
      rawInput: input,
    };

    user.draftReport = draft;
    user.step = "awaiting_confirm";
    saveUser(user);

    const message = `📋 *PREVIEW LAPORAN MONEV (${today})*
Status: *Hadir (PRESENT)*

1️⃣ *Uraian Aktivitas* (${draft.uraian_aktivitas?.length || 0} karakter):
${draft.uraian_aktivitas}

2️⃣ *Pembelajaran yang Diperoleh* (${draft.pembelajaran?.length || 0} karakter):
${draft.pembelajaran}

3️⃣ *Kendala yang Dialami* (${draft.kendala?.length || 0} karakter):
${draft.kendala}

---------------------------------
Apakah Anda ingin mengirimkan laporan ini ke sistem Monev Kemnaker?`;

    return telegram.sendMessage(user.chatId, message, {
      reply_markup: {
        inline_keyboard: [
          [{ text: "🚀 Kirim Absensi Sekarang", callback_data: "SUBMIT_REPORT" }],
          [
            { text: "🔄 Buat Ulang", callback_data: "REGENERATE_REPORT" },
            { text: "❌ Batalkan", callback_data: "CANCEL_REPORT" },
          ],
        ],
      },
    });
  } catch (error) {
    console.error("Error generating Hadir report:", error);
    return telegram.sendMessage(
      user.chatId,
      `⚠️ Gagal menyusun laporan AI: ${error instanceof Error ? error.message : "Terjadi kesalahan."}\nSilakan coba kirim ulang poin kegiatan Anda.`
    );
  }
}

async function handleGenerateIzin(user: UserAccount, reasonInput: string) {
  await telegram.sendChatAction(user.chatId, "typing");
  await telegram.sendMessage(
    user.chatId,
    "🤖 Sedang menyusun narasi formal keterangan izin... Mohon tunggu sebentar ⏳"
  );

  try {
    const report = await generateMonevFromText(reasonInput, true);
    const today = getTodayDateString();

    const draft: UserDraftReport = {
      date: today,
      status: "ON_LEAVE",
      alasan_tidak_hadir: report.alasan_tidak_hadir,
      rawInput: reasonInput,
    };

    user.draftReport = draft;
    user.step = "awaiting_confirm";
    saveUser(user);

    const message = `📋 *PREVIEW LAPORAN IZIN (${today})*
Status: *Tidak Hadir Dengan Keterangan (ON_LEAVE)*

📄 *Alasan / Keterangan* (${draft.alasan_tidak_hadir?.length || 0} karakter):
${draft.alasan_tidak_hadir}

---------------------------------
Apakah Anda ingin mengirimkan keterangan izin ini ke Kemnaker?`;

    return telegram.sendMessage(user.chatId, message, {
      reply_markup: {
        inline_keyboard: [
          [{ text: "🚀 Kirim Keterangan Izin", callback_data: "SUBMIT_REPORT" }],
          [
            { text: "🔄 Buat Ulang", callback_data: "REGENERATE_REPORT" },
            { text: "❌ Batalkan", callback_data: "CANCEL_REPORT" },
          ],
        ],
      },
    });
  } catch (error) {
    console.error("Error generating Izin report:", error);
    return telegram.sendMessage(
      user.chatId,
      `⚠️ Gagal menyusun keterangan izin: ${error instanceof Error ? error.message : "Terjadi kesalahan."}`
    );
  }
}

async function handleRegenerateDraft(user: UserAccount, messageId?: number) {
  if (!user.draftReport || !user.draftReport.rawInput) {
    return telegram.sendMessage(
      user.chatId,
      "⚠️ Tidak ada draft yang bisa dibuat ulang. Silakan kirimkan poin kegiatan baru Anda."
    );
  }

  if (user.draftReport.status === "ON_LEAVE") {
    return handleGenerateIzin(user, user.draftReport.rawInput);
  } else {
    return handleGenerateHadir(user, user.draftReport.rawInput);
  }
}

async function handleConfirmSubmit(user: UserAccount, messageId?: number) {
  if (!user.draftReport) {
    return telegram.sendMessage(
      user.chatId,
      "⚠️ Tidak ada draft laporan yang siap dikirim. Silakan ketik poin kegiatan Anda hari ini terlebih dahulu."
    );
  }

  if (!user.username || !user.password) {
    return telegram.sendMessage(
      user.chatId,
      "⚠️ Anda belum login. Silakan ketik `/login` terlebih dahulu."
    );
  }

  await telegram.sendChatAction(user.chatId, "typing");
  await telegram.sendMessage(
    user.chatId,
    "🚀 Sedang mengirimkan absensi & laporan Monev ke server Kemnaker..."
  );

  const rawUsername = decryptData(user.username);
  const rawPassword = decryptData(user.password);

  const loginRes = await loginKemnaker(rawUsername, rawPassword);
  if (!loginRes.success || !loginRes.accessToken) {
    return telegram.sendMessage(
      user.chatId,
      `❌ Gagal login ke Kemnaker: ${loginRes.error || "Silakan login ulang dengan mengetik /login"}`
    );
  }

  const token = loginRes.accessToken;
  const draft = user.draftReport;

  const submitPayload = {
    date: draft.date,
    status: draft.status,
    activity_log: draft.status === "PRESENT" ? draft.uraian_aktivitas : draft.alasan_tidak_hadir,
    lesson_learned: draft.status === "PRESENT" ? draft.pembelajaran : undefined,
    obstacles: draft.status === "PRESENT" ? draft.kendala : undefined,
    leave_reason: draft.status === "ON_LEAVE" ? draft.alasan_tidak_hadir : undefined,
  };

  const submitRes = await submitAttendanceToKemnaker(token, submitPayload);

  if (!submitRes.success) {
    return telegram.sendMessage(
      user.chatId,
      `❌ *Pengiriman Absensi Gagal*\n\n${submitRes.error || "Terjadi kesalahan di server Monev Kemnaker."}\n\nDraft laporan tetap tersimpan. Anda dapat mencoba klik kirim ulang.`
    );
  }

  // Success! Clear draft
  user.draftReport = null;
  user.step = "idle";
  saveUser(user);

  return telegram.sendMessage(
    user.chatId,
    `🎉 *ALHAMDULILLAH, ABSENSI BERHASIL DIKIRIM!* ✅\n\n📅 Tanggal: *${draft.date}*\n📌 Status: *${
      draft.status === "PRESENT" ? "Hadir" : "Tidak Hadir Dengan Keterangan"
    }*\n\nLaporan Monev harian Anda telah tercatat resmi di sistem MagangHub Kemnaker. Sampai jumpa besok! 👋✨`
  );
}

function sendHelpMenu(user: UserAccount) {
  const hasAccount = Boolean(user.username && user.password);
  const statusIcon = hasAccount ? "✅ Terhubung" : "❌ Belum Terhubung";

  const message = `🤖 *BANTUAN & PANDUAN MOBOGEN TELEGRAM BOT*

Status Akun: *${statusIcon}*

*Cara Cepat Absen Harian:*
1️⃣ Cukup kirim poin-poin kegiatan Anda ke chat ini:
_Contoh: "Hari ini slicing UI dashboard, integrasi Bot Telegram, fixing bug CORS"_
2️⃣ Bot AI akan menyusun 3 bagian laporan (Uraian, Pembelajaran, Kendala $\\ge$ 100 karakter).
3️⃣ Klik tombol *[ 🚀 Kirim Absensi Sekarang ]*.

*Daftar Perintah:*
- \`/login\` : Menghubungkan akun SIAPkerja Kemnaker
- \`/status\` : Cek status koneksi & tanggal hari ini
- \`/izin <alasan>\` : Absen izin tidak hadir
- \`/logout\` : Menghapus data akun dari bot
- \`/help\` : Menampilkan panduan ini`;

  return telegram.sendMessage(user.chatId, message, {
    reply_markup: {
      inline_keyboard: hasAccount
        ? [[{ text: "📊 Cek Status Akun", callback_data: "BTN_HELP" }]]
        : [[{ text: "🔐 Hubungkan Akun Sekarang", callback_data: "BTN_LOGIN" }]],
    },
  });
}
