/**
 * Main Telegram Bot Conversation Handler untuk Mobogen
 * Fitur:
 * 1. 3 Macam Opsi Presensi Monev (Hadir, Izin, Alpha)
 * 2. Telegram Mini App (In-App Editor Interaktif)
 * 3. Role-based Smart Suggestions (Rekomendasi Kegiatan Sesuai Posisi)
 * 4. Auto-Submit Safeguard Tracking
 * 5. Gemini API Key Configuration per User
 */

import { telegram } from "./client";
import {
  getUser,
  saveUser,
  encryptData,
  decryptData,
  deleteUser,
} from "./store";
import { generateMonevFromText, validateGeminiApiKey } from "./ai";
import { loginKemnaker, submitAttendanceToKemnaker } from "./kemnaker";
import { ROLES } from "./suggestions";
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

export async function handleTelegramUpdate(update: TelegramUpdate) {
  // 1. Handle Callback Query (Tombol Inline yang diklik user)
  if (update.callback_query) {
    const cb = update.callback_query;
    const chatId = cb.message?.chat.id || cb.from.id;
    const data = cb.data || "";
    const user = getUser(chatId);

    // Answer callback query immediately
    await telegram.answerCallbackQuery(cb.id);

    // Menu Action Buttons
    if (data === "MENU_HADIR") {
      user.step = "awaiting_hadir_input";
      saveUser(user);
      return telegram.sendMessage(
        chatId,
        "🟢 *Presensi: Hadir*\n\nSilakan kirimkan ringkasan kegiatan harian Anda (misal: _'Slicing UI dashboard dan testing API'_).\n\n_Atau klik tombol di bawah jika ingin melihat rekomendasi ide kegiatan sesuai posisimu:_",
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: "💡 Rekomendasi Ide Kegiatan", callback_data: "SUGGEST_IDEAS" }],
              [{ text: "✏️ Buka Editor Interaktif", web_app: { url: `${getAppBaseUrl()}/editor?chatId=${chatId}` } }],
            ],
          },
        }
      );
    }

    if (data === "MENU_IZIN") {
      user.step = "awaiting_izin_input";
      saveUser(user);
      return telegram.sendMessage(
        chatId,
        "🟡 *Presensi: Tidak Hadir Dengan Keterangan (Izin/Sakit)*\n\nSilakan kirimkan alasan atau keterangan ketidakhadiran Anda (misal: _'Sakit demam dan berobat ke klinik dokter'_).\n\nAI Mobogen akan menyusun narasi permohonan izin resmi minimal 100 karakter."
      );
    }

    if (data === "MENU_ABSENT") {
      return handlePrepareAbsent(user);
    }

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
          "❌ Draft presensi berhasil dibatalkan. Silakan pilih opsi presensi kembali kapan saja."
        );
      }
      return telegram.sendMessage(
        chatId,
        "❌ Draft presensi berhasil dibatalkan. Silakan pilih opsi presensi kembali kapan saja."
      );
    }

    // Role Selection Handlers
    if (data.startsWith("SET_ROLE_")) {
      const roleId = data.replace("SET_ROLE_", "");
      user.role = roleId;
      saveUser(user);
      const roleInfo = ROLES[roleId] || ROLES.general;

      return telegram.sendMessage(
        chatId,
        `✅ *Posisi Magang Diatur:* ${roleInfo.icon} *${roleInfo.name}*\n\nSekarang Anda dapat meminta ide rekomendasi kegiatan harian otomatis sesuai posisi ini!`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: "💡 Lihat Rekomendasi Ide Kegiatan", callback_data: "SUGGEST_IDEAS" }],
              [{ text: "📋 Kembali ke Menu", callback_data: "BTN_MENU" }],
            ],
          },
        }
      );
    }

    if (data === "SUGGEST_IDEAS" || data === "SHOW_ROLES") {
      return sendRoleSuggestionsMenu(user);
    }

    if (data.startsWith("USE_SUGGESTION_")) {
      const index = Number(data.replace("USE_SUGGESTION_", ""));
      const suggestions = (ROLES[user.role || "general"] || ROLES.general).suggestions;
      const selectedPrompt = suggestions[index] || suggestions[0];
      return handleGenerateHadir(user, selectedPrompt);
    }

    if (data === "TOGGLE_REMINDER") {
      user.reminderEnabled = user.reminderEnabled === false ? true : false;
      saveUser(user);
      const isEnabled = user.reminderEnabled;
      const text = isEnabled
        ? "🔔 *Pengingat Harian (16:30 WIB) Diaktifkan!*\n\nAnda akan menerima notifikasi presensi otomatis setiap sore."
        : "🔕 *Pengingat Harian (16:30 WIB) Dinonaktifkan.*";

      if (cb.message?.message_id) {
        return telegram.editMessageText(chatId, cb.message.message_id, text);
      }
      return telegram.sendMessage(chatId, text);
    }

    if (data === "BTN_LOGIN") {
      user.step = "awaiting_login_email";
      saveUser(user);
      return telegram.sendMessage(
        chatId,
        "🔐 *Hubungkan Akun SIAPkerja Kemnaker*\n\nSilakan kirimkan *Email, No. HP, atau NIK* akun Kemnaker Anda:"
      );
    }

    if (data === "BTN_SET_APIKEY") {
      user.step = "awaiting_gemini_key";
      saveUser(user);
      return telegram.sendMessage(
        chatId,
        "🔑 *Masukkan Gemini API Key Anda*\n\nDapatkan API Key gratis di [Google AI Studio](https://aistudio.google.com/app/apikey), lalu kirimkan key tersebut ke chat ini:"
      );
    }

    if (data === "BTN_HELP" || data === "BTN_MENU") {
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

  // Command: /start, /help, /menu, /absen
  if (
    lowerText === "/start" ||
    lowerText === "/help" ||
    lowerText === "menu" ||
    lowerText === "/menu" ||
    lowerText === "/absen"
  ) {
    return sendHelpMenu(user);
  }

  // Command: /apikey (Input API Key Gemini)
  if (lowerText.startsWith("/apikey ") || lowerText.startsWith("/key ") || lowerText.startsWith("/setkey ")) {
    const keyInput = rawText.replace(/^[/!](apikey|key|setkey)\s+/i, "").trim();
    return handleSaveApiKey(user, keyInput);
  }

  if (lowerText === "/apikey" || lowerText === "/key") {
    user.step = "awaiting_gemini_key";
    saveUser(user);
    return telegram.sendMessage(
      chatId,
      "🔑 *Konfigurasi Google Gemini API Key*\n\nSilakan kirimkan API Key Gemini Anda ke chat ini:\n_(Dapatkan gratis di https://aistudio.google.com/app/apikey)_"
    );
  }

  // Step Handler: Menunggu Input API Key
  if (user.step === "awaiting_gemini_key") {
    user.step = "idle";
    return handleSaveApiKey(user, rawText);
  }

  // Command: /role (Pilih Posisi Magang)
  if (lowerText === "/role" || lowerText === "/posisi") {
    return sendRoleSelectionMenu(user);
  }

  // Command: /ide atau /suggest (Ide Kegiatan Harian)
  if (lowerText === "/ide" || lowerText === "/suggest" || lowerText === "/rekomendasi") {
    return sendRoleSuggestionsMenu(user);
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

    // Cek apakah API key sudah ada
    const hasKey = Boolean(user.geminiApiKey || process.env.GEMINI_API_KEY);
    if (!hasKey) {
      user.step = "awaiting_gemini_key";
      saveUser(user);
      return telegram.sendMessage(
        chatId,
        `🎉 *Berhasil Terhubung ke Kemnaker!* ✅\n\nSelamat datang, *${user.name}*!\n\n👉 *Langkah 2 (Terakhir):* Silakan kirimkan **Gemini API Key** Anda ke chat ini:\n_(Dapatkan gratis di https://aistudio.google.com/app/apikey)_`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: "🔑 Masukkan Gemini API Key", callback_data: "BTN_SET_APIKEY" }],
            ],
          },
        }
      );
    }

    return telegram.sendMessage(
      chatId,
      `🎉 *Berhasil Terhubung!*\n\nAkun atas nama *${user.name}* telah aktif dan siap. 🚀\n\nSilakan pilih opsi presensi Anda di bawah ini:`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: "🟢 1. Absen Hadir", callback_data: "MENU_HADIR" }],
            [{ text: "🟡 2. Izin (Dengan Keterangan)", callback_data: "MENU_IZIN" }],
            [{ text: "🔴 3. Tanpa Keterangan (Alpha)", callback_data: "MENU_ABSENT" }],
            [{ text: "✏️ Buka Editor Interaktif", web_app: { url: `${getAppBaseUrl()}/editor?chatId=${chatId}` } }],
          ],
        },
      }
    );
  }

  // 1. Step Handler: Menunggu Password (Diproses PERTAMA agar password dengan karakter '@' tidak salah terdeteksi sebagai email)
  if (user.step === "awaiting_login_password" || (user.tempLoginEmail && !user.username && !lowerText.startsWith("/"))) {
    const email = user.tempLoginEmail || "";
    const password = rawText;
    user.tempLoginEmail = undefined;
    user.step = "idle";
    saveUser(user);

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

    const hasKey = Boolean(user.geminiApiKey || process.env.GEMINI_API_KEY);
    if (!hasKey) {
      user.step = "awaiting_gemini_key";
      saveUser(user);
      return telegram.sendMessage(
        chatId,
        `🎉 *Berhasil Terhubung ke Kemnaker!* ✅\n\nSelamat datang, *${user.name}*!\n\n👉 *Langkah 2 (Terakhir):* Silakan kirimkan **Gemini API Key** Anda ke chat ini:\n_(Dapatkan gratis di https://aistudio.google.com/app/apikey)_`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: "🔑 Masukkan Gemini API Key", callback_data: "BTN_SET_APIKEY" }],
            ],
          },
        }
      );
    }

    saveUser(user);
    return telegram.sendMessage(
      chatId,
      `🎉 *Berhasil Terhubung!*\n\nSelamat datang, *${user.name}*!\nAkun SIAPkerja Kemnaker Anda telah aktif. 🚀\n\nSilakan pilih opsi presensi Anda di bawah ini:`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: "🟢 1. Absen Hadir", callback_data: "MENU_HADIR" }],
            [{ text: "🟡 2. Izin (Dengan Keterangan)", callback_data: "MENU_IZIN" }],
            [{ text: "🔴 3. Tanpa Keterangan (Alpha)", callback_data: "MENU_ABSENT" }],
            [{ text: "✏️ Buka Editor Interaktif", web_app: { url: `${getAppBaseUrl()}/editor?chatId=${chatId}` } }],
          ],
        },
      }
    );
  }

  // 2. Step Handler: Menunggu Email / Username
  const isEmailFormat = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawText);
  const isPhoneOrNik = /^[0-9]{10,16}$/.test(rawText);

  if (!user.username && (isEmailFormat || isPhoneOrNik || user.step === "awaiting_login_email") && !lowerText.startsWith("/")) {
    user.tempLoginEmail = rawText;
    user.step = "awaiting_login_password";
    saveUser(user);
    return telegram.sendMessage(
      chatId,
      `🔑 Email *${rawText}* diterima!\n\nSekarang, silakan masukkan *Password* akun SIAPkerja Kemnaker Anda:\n_(Password dienkripsi aman secara otomatis)_`
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
    const hasKey = Boolean(user.geminiApiKey || process.env.GEMINI_API_KEY);
    const apiKeyStatus = hasKey ? "✅ Terpasang" : "⚠️ Belum Diset (Ketik /apikey)";

    let draftStatus = "\n\n📝 *Draft*: Tidak ada draft aktif";
    if (user.draftReport) {
      const statusLabel =
        user.draftReport.status === "PRESENT"
          ? "Hadir"
          : user.draftReport.status === "ON_LEAVE"
            ? "Tidak Hadir Dengan Keterangan"
            : "Tidak Hadir Tanpa Keterangan";
      draftStatus = `\n\n📝 *Draft Tersimpan*: ${statusLabel} (Siap dikirim)`;
    }

    const currentRole = ROLES[user.role || "general"] || ROLES.general;
    const reminderStatus = user.reminderEnabled !== false ? "✅ Aktif (Setiap 16:30 WIB)" : "❌ Nonaktif";

    return telegram.sendMessage(
      chatId,
      `📊 *Status Bot Mobogen*\n\n👤 Nama: *${user.name || "Peserta"}*\n💼 Posisi: ${currentRole.icon} *${currentRole.name}*\n🔗 Akun Kemnaker: ${hasAccount ? `✅ Terhubung (${emailDecrypted})` : "❌ Belum login"
      }\n🔑 Gemini AI Key: *${apiKeyStatus}*\n⏰ Pengingat Sore (16:30 WIB): *${reminderStatus}*\n📅 Tanggal Hari Ini: *${getTodayDateString()}*${draftStatus}`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: user.reminderEnabled !== false ? "🔕 Matikan Pengingat 16:30" : "🔔 Aktifkan Pengingat 16:30",
                callback_data: "TOGGLE_REMINDER",
              },
            ],
            [{ text: "🔑 Atur Gemini API Key", callback_data: "BTN_SET_APIKEY" }],
            [{ text: "✏️ Buka Editor Interaktif", web_app: { url: `${getAppBaseUrl()}/editor?chatId=${chatId}` } }],
            [{ text: "💼 Ganti Posisi Magang", callback_data: "SHOW_ROLES" }],
          ],
        },
      }
    );
  }

  // Command: /reminder on / off
  if (lowerText === "/reminder on" || lowerText === "/reminder aktif") {
    user.reminderEnabled = true;
    saveUser(user);
    return telegram.sendMessage(
      chatId,
      "🔔 *Pengingat Harian Diaktifkan!*\n\nBot akan otomatis mengingatkan Anda untuk presensi setiap hari kerja pukul *16:30 WIB*."
    );
  }

  if (lowerText === "/reminder off" || lowerText === "/reminder nonaktif") {
    user.reminderEnabled = false;
    saveUser(user);
    return telegram.sendMessage(
      chatId,
      "🔕 *Pengingat Harian Dinonaktifkan.*\n\nKetik `/reminder on` kapan saja untuk mengaktifkannya kembali."
    );
  }

  // Command: /alpha atau /absent atau /tanpaket (Opsi 3: Tidak Hadir Tanpa Keterangan)
  if (
    lowerText === "/alpha" ||
    lowerText === "/absent" ||
    lowerText === "/tanpaket" ||
    lowerText === "/tidakhadir"
  ) {
    return handlePrepareAbsent(user);
  }

  // Command: /izin <alasan> (Opsi 2: Tidak Hadir Dengan Keterangan)
  if (lowerText.startsWith("/izin") || lowerText.startsWith("!izin")) {
    const reasonInput = rawText.replace(/^[/!]izin\s*/i, "").trim();
    if (!reasonInput) {
      user.step = "awaiting_izin_input";
      saveUser(user);
      return telegram.sendMessage(
        chatId,
        "🟡 *Presensi: Tidak Hadir Dengan Keterangan*\n\nSilakan kirimkan alasan izin Anda (misal: _'Sakit demam dan disarankan istirahat dokter'_):"
      );
    }
    return handleGenerateIzin(user, reasonInput);
  }

  // Command: /hadir <kegiatan> (Opsi 1: Hadir)
  if (lowerText.startsWith("/hadir") || lowerText.startsWith("!hadir")) {
    const actInput = rawText.replace(/^[/!]hadir\s*/i, "").trim();
    if (!actInput) {
      user.step = "awaiting_hadir_input";
      saveUser(user);
      return telegram.sendMessage(
        chatId,
        "🟢 *Presensi: Hadir*\n\nSilakan kirimkan poin kegiatan Anda hari ini:"
      );
    }
    return handleGenerateHadir(user, actInput);
  }

  // Step Handler: Menunggu input izin
  if (user.step === "awaiting_izin_input") {
    user.step = "idle";
    saveUser(user);
    return handleGenerateIzin(user, rawText);
  }

  // Step Handler / Default Text: Presensi Hadir
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

/**
 * Helper: Menyimpan Gemini API Key
 */
async function handleSaveApiKey(user: UserAccount, keyInput: string) {
  if (!keyInput) {
    return telegram.sendMessage(
      user.chatId,
      "⚠️ API Key tidak boleh kosong. Gunakan format:\n`/apikey AIzaSy...`\n\nDapatkan gratis di https://aistudio.google.com/app/apikey"
    );
  }

  await telegram.sendChatAction(user.chatId, "typing");
  await telegram.sendMessage(user.chatId, "⏳ Sedang memvalidasi Gemini API Key Anda...");

  const isValid = await validateGeminiApiKey(keyInput);
  if (!isValid) {
    return telegram.sendMessage(
      user.chatId,
      "❌ *Gemini API Key Tidak Valid*\n\nPastikan Anda menyalin key lengkap dari [Google AI Studio](https://aistudio.google.com/app/apikey), lalu coba kembali dengan:\n`/apikey <KEY_ANDA>`"
    );
  }

  user.geminiApiKey = encryptData(keyInput);
  saveUser(user);

  return telegram.sendMessage(
    user.chatId,
    "🎉 *Gemini API Key Berhasil Disimpan & Aktif!* ✅\n\nSekarang Anda sudah bisa langsung membuat laporan Monev harian otomatis dengan AI. Silakan coba kirimkan poin kegiatan Anda sekarang! 🚀",
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: "🟢 1. Absen Hadir Sekarang", callback_data: "MENU_HADIR" }],
          [{ text: "💡 Rekomendasi Ide Kegiatan", callback_data: "SUGGEST_IDEAS" }],
        ],
      },
    }
  );
}

/**
 * Handler Opsi 1: Hadir (PRESENT)
 */
async function handleGenerateHadir(user: UserAccount, input: string) {
  const customKey = user.geminiApiKey ? decryptData(user.geminiApiKey) : undefined;
  const hasKey = Boolean(customKey || process.env.GEMINI_API_KEY);

  if (!hasKey) {
    return telegram.sendMessage(
      user.chatId,
      "🔑 *Gemini API Key Diperlukan*\n\nUntuk menyusun laporan otomatis dengan AI, silakan masukkan Gemini API Key Anda terlebih dahulu (Gratis):\n\n1️⃣ Buka https://aistudio.google.com/app/apikey\n2️⃣ Buat API Key baru\n3️⃣ Kirim ke bot ini: `/apikey <KEY_ANDA>`",
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: "🔑 Masukkan Gemini API Key", callback_data: "BTN_SET_APIKEY" }],
            [{ text: "✏️ Buka Editor Interaktif", web_app: { url: `${getAppBaseUrl()}/editor?chatId=${user.chatId}` } }],
          ],
        },
      }
    );
  }

  await telegram.sendChatAction(user.chatId, "typing");
  await telegram.sendMessage(
    user.chatId,
    "🤖 Sedang menyusun 3 bagian laporan Monev formal dengan AI (Uraian, Pembelajaran, Kendala)... Mohon tunggu sebentar ⏳"
  );

  try {
    const report = await generateMonevFromText(input, false, customKey);
    const today = getTodayDateString();

    const draft: UserDraftReport = {
      date: today,
      status: "PRESENT",
      uraian_aktivitas: report.uraian_aktivitas,
      pembelajaran: report.pembelajaran,
      kendala: report.kendala,
      rawInput: input,
      createdAt: Date.now(),
      safeguardNudgeSent: false,
    };

    user.draftReport = draft;
    user.step = "awaiting_confirm";
    saveUser(user);

    const message = `📋 *PREVIEW LAPORAN MONEV (${today})*
Status: *1. Hadir (PRESENT)*

1️⃣ *Uraian Aktivitas* (${draft.uraian_aktivitas?.length || 0} karakter):
${draft.uraian_aktivitas}

2️⃣ *Pembelajaran yang Diperoleh* (${draft.pembelajaran?.length || 0} karakter):
${draft.pembelajaran}

3️⃣ *Kendala yang Dialami* (${draft.kendala?.length || 0} karakter):
${draft.kendala}

---------------------------------
Apakah Anda ingin mengirimkan laporan kehadiran ini ke Monev Kemnaker?`;

    return telegram.sendMessage(user.chatId, message, {
      reply_markup: {
        inline_keyboard: [
          [{ text: "🚀 Kirim Absensi Hadir", callback_data: "SUBMIT_REPORT" }],
          [{ text: "✏️ Buka Editor Interaktif", web_app: { url: `${getAppBaseUrl()}/editor?chatId=${user.chatId}` } }],
          [
            { text: "🔄 Buat Ulang", callback_data: "REGENERATE_REPORT" },
            { text: "❌ Batalkan", callback_data: "CANCEL_REPORT" },
          ],
        ],
      },
    });
  } catch (error) {
    console.error("Error generating Hadir report:", error);
    const errMsg = error instanceof Error ? error.message : "Terjadi kesalahan.";
    return telegram.sendMessage(
      user.chatId,
      `⚠️ Gagal menyusun laporan AI: ${errMsg}\n\nSilakan periksa API Key Anda via \`/apikey\` atau coba kirim ulang poin kegiatan Anda.`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: "🔑 Atur Gemini API Key", callback_data: "BTN_SET_APIKEY" }],
            [{ text: "✏️ Buka Editor Interaktif", web_app: { url: `${getAppBaseUrl()}/editor?chatId=${user.chatId}` } }],
          ],
        },
      }
    );
  }
}

/**
 * Handler Opsi 2: Tidak Hadir Dengan Keterangan (ON_LEAVE)
 */
async function handleGenerateIzin(user: UserAccount, reasonInput: string) {
  const customKey = user.geminiApiKey ? decryptData(user.geminiApiKey) : undefined;
  const hasKey = Boolean(customKey || process.env.GEMINI_API_KEY);

  if (!hasKey) {
    return telegram.sendMessage(
      user.chatId,
      "🔑 *Gemini API Key Diperlukan*\n\nSilakan masukkan Gemini API Key Anda terlebih dahulu (Gratis):\n`/apikey <KEY_ANDA>`",
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: "🔑 Masukkan Gemini API Key", callback_data: "BTN_SET_APIKEY" }],
          ],
        },
      }
    );
  }

  await telegram.sendChatAction(user.chatId, "typing");
  await telegram.sendMessage(
    user.chatId,
    "🤖 Sedang menyusun narasi formal keterangan izin... Mohon tunggu sebentar ⏳"
  );

  try {
    const report = await generateMonevFromText(reasonInput, true, customKey);
    const today = getTodayDateString();

    const draft: UserDraftReport = {
      date: today,
      status: "ON_LEAVE",
      alasan_tidak_hadir: report.alasan_tidak_hadir,
      rawInput: reasonInput,
      createdAt: Date.now(),
      safeguardNudgeSent: false,
    };

    user.draftReport = draft;
    user.step = "awaiting_confirm";
    saveUser(user);

    const message = `📋 *PREVIEW LAPORAN IZIN (${today})*
Status: *2. Tidak Hadir Dengan Keterangan (ON_LEAVE)*

📄 *Alasan Tidak Hadir* (${draft.alasan_tidak_hadir?.length || 0} karakter):
${draft.alasan_tidak_hadir}

---------------------------------
Apakah Anda ingin mengirimkan laporan izin ini ke Monev Kemnaker?`;

    return telegram.sendMessage(user.chatId, message, {
      reply_markup: {
        inline_keyboard: [
          [{ text: "🚀 Kirim Keterangan Izin", callback_data: "SUBMIT_REPORT" }],
          [{ text: "✏️ Buka Editor Interaktif", web_app: { url: `${getAppBaseUrl()}/editor?chatId=${user.chatId}` } }],
          [
            { text: "🔄 Buat Ulang", callback_data: "REGENERATE_REPORT" },
            { text: "❌ Batalkan", callback_data: "CANCEL_REPORT" },
          ],
        ],
      },
    });
  } catch (error) {
    console.error("Error generating Izin report:", error);
    const errMsg = error instanceof Error ? error.message : "Terjadi kesalahan.";
    return telegram.sendMessage(
      user.chatId,
      `⚠️ Gagal menyusun keterangan izin: ${errMsg}\n\nSilakan periksa API Key Anda via \`/apikey\``,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: "🔑 Atur Gemini API Key", callback_data: "BTN_SET_APIKEY" }],
          ],
        },
      }
    );
  }
}

/**
 * Handler Opsi 3: Tidak Hadir Tanpa Keterangan (ABSENT)
 */
async function handlePrepareAbsent(user: UserAccount) {
  const today = getTodayDateString();

  const draft: UserDraftReport = {
    date: today,
    status: "ABSENT",
    createdAt: Date.now(),
    safeguardNudgeSent: false,
  };

  user.draftReport = draft;
  user.step = "awaiting_confirm";
  saveUser(user);

  const message = `⚠️ *KONFIRMASI PRESENSI (${today})*
Status: *3. Tidak Hadir Tanpa Keterangan (ABSENT)*

_Catatan: Pada opsi ini, Anda tercatat tidak hadir tanpa alasan/surat keterangan dan tidak memerlukan isian narasi laporan harian._

---------------------------------
Apakah Anda yakin ingin mengirimkan status ketidakhadiran tanpa keterangan ini ke Kemnaker?`;

  return telegram.sendMessage(user.chatId, message, {
    reply_markup: {
      inline_keyboard: [
        [{ text: "🚀 Ya, Kirim Tanpa Keterangan", callback_data: "SUBMIT_REPORT" }],
        [{ text: "❌ Batalkan", callback_data: "CANCEL_REPORT" }],
      ],
    },
  });
}

async function handleRegenerateDraft(user: UserAccount, messageId?: number) {
  if (!user.draftReport || !user.draftReport.rawInput) {
    return telegram.sendMessage(
      user.chatId,
      "⚠️ Tidak ada draft yang bisa dibuat ulang. Silakan pilih menu presensi kembali."
    );
  }

  if (user.draftReport.status === "ON_LEAVE") {
    return handleGenerateIzin(user, user.draftReport.rawInput);
  } else if (user.draftReport.status === "PRESENT") {
    return handleGenerateHadir(user, user.draftReport.rawInput);
  }
}

async function handleConfirmSubmit(user: UserAccount, messageId?: number) {
  if (!user.draftReport) {
    return telegram.sendMessage(
      user.chatId,
      "⚠️ Tidak ada draft presensi yang siap dikirim. Silakan pilih menu presensi terlebih dahulu."
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
    activity_log:
      draft.status === "PRESENT"
        ? draft.uraian_aktivitas
        : draft.status === "ON_LEAVE"
          ? draft.alasan_tidak_hadir
          : undefined,
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

  const statusTitle =
    draft.status === "PRESENT"
      ? "Hadir (PRESENT)"
      : draft.status === "ON_LEAVE"
        ? "Tidak Hadir Dengan Keterangan (ON_LEAVE)"
        : "Tidak Hadir Tanpa Keterangan (ABSENT)";

  // Success! Clear draft
  user.draftReport = null;
  user.step = "idle";
  saveUser(user);

  return telegram.sendMessage(
    user.chatId,
    `🎉 *PRESENSI BERHASIL DIKIRIM!* ✅\n\n📅 Tanggal: *${draft.date}*\n📌 Status: *${statusTitle}*\n\nLaporan Monev harian Anda telah tercatat resmi di sistem MagangHub Kemnaker. Sampai jumpa besok! 👋✨`
  );
}

function sendRoleSelectionMenu(user: UserAccount) {
  const buttons = Object.values(ROLES).map((role) => [
    { text: `${role.icon} ${role.name}`, callback_data: `SET_ROLE_${role.id}` },
  ]);

  return telegram.sendMessage(
    user.chatId,
    "💼 *Pilih Posisi / Bidang Magang Anda:*\n\n_Pilihan ini membantu bot memberikan rekomendasi ide kegiatan harian yang relevan dengan tugas divisi Anda._",
    {
      reply_markup: {
        inline_keyboard: buttons,
      },
    }
  );
}

function sendRoleSuggestionsMenu(user: UserAccount) {
  const currentRole = ROLES[user.role || "general"] || ROLES.general;
  const suggestions = currentRole.suggestions;

  const buttons = suggestions.map((sug, idx) => [
    {
      text: `${idx + 1}. ${sug.length > 35 ? sug.slice(0, 35) + "..." : sug}`,
      callback_data: `USE_SUGGESTION_${idx}`,
    },
  ]);

  buttons.push([
    { text: "💼 Ganti Posisi Magang", callback_data: "SHOW_ROLES" },
    { text: "📋 Menu Utama", callback_data: "BTN_MENU" },
  ]);

  return telegram.sendMessage(
    user.chatId,
    `💡 *Rekomendasi Ide Kegiatan Harian*\nPosisi: ${currentRole.icon} *${currentRole.name}*\n\n_Klik salah satu ide kegiatan di bawah ini untuk langsung menyusun laporan Monev dengan AI:_`,
    {
      reply_markup: {
        inline_keyboard: buttons,
      },
    }
  );
}

function sendHelpMenu(user: UserAccount) {
  // Sync native Telegram commands popup menu
  telegram.setMyCommands().catch(() => null);

  const hasAccount = Boolean(user.username && user.password);
  const statusIcon = hasAccount ? "✅ Terhubung" : "❌ Belum Terhubung";
  const hasKey = Boolean(user.geminiApiKey || process.env.GEMINI_API_KEY);
  const keyIcon = hasKey ? "✅ Terpasang" : "⚠️ Belum Diset";
  const currentRole = ROLES[user.role || "general"] || ROLES.general;

  const actionText = !hasAccount
    ? "\n\n👉 *Langkah 1:* Silakan hubungkan akun Kemnaker (SIAPkerja) Anda terlebih dahulu."
    : !hasKey
      ? "\n\n🎉 *Akun Kemnaker Terhubung!* ✅\n👉 *Langkah 2 (Terakhir):* Masukkan Gemini API Key gratis Anda untuk mengaktifkan AI Generator."
      : "\n\n👇 *Klik tombol di bawah untuk akses cepat:*";

  const message = `🤖 *SELAMAT DATANG DI MOBOGEN BOT!* 👋
Asisten Laporan Harian Monev MagangHub Kemnaker berbasis AI.

📋 *DAFTAR PERINTAH (COMMANDS):*
🔹 \`/start\` / \`/help\` : Tampilkan menu & daftar perintah ini
🔹 \`/login\` : Hubungkan akun SIAPkerja Kemnaker Anda
🔹 \`/hadir <kegiatan>\` : Absen hadir (AI buat 3 bagian laporan)
🔹 \`/izin <alasan>\` : Absen izin / sakit dengan alasan
🔹 \`/alpha\` : Absen tidak hadir tanpa keterangan
🔹 \`/status\` : Cek status akun, API key, & draft tersimpan
🔹 \`/apikey <KEY>\` : Masukkan Gemini API Key gratis
🔹 \`/role\` : Pilih posisi magang (Frontend, UI/UX, Data, dll)
🔹 \`/ide\` : Dapatkan rekomendasi ide kegiatan harian
🔹 \`/reminder on/off\` : Atur notifikasi pengingat sore (16:30 WIB)
🔹 \`/logout\` : Hapus data akun dari bot

───────────────
📌 *Status Anda*:
• Akun Kemnaker: *${statusIcon}*
• Gemini API Key: *${keyIcon}*
• Posisi Magang: ${currentRole.icon} *${currentRole.name}*${actionText}`;

  const inline_keyboard = !hasAccount
    ? [
      [{ text: "🔐 1. Hubungkan Akun Kemnaker", callback_data: "BTN_LOGIN" }],
    ]
    : !hasKey
      ? [
        [{ text: "🔑 2. Masukkan Gemini API Key", callback_data: "BTN_SET_APIKEY" }],
        [{ text: "✏️ Buka Editor Interaktif", web_app: { url: `${getAppBaseUrl()}/editor?chatId=${user.chatId}` } }],
      ]
      : [
        [{ text: "🟢 1. Absen Hadir", callback_data: "MENU_HADIR" }],
        [{ text: "🟡 2. Izin (Dengan Keterangan)", callback_data: "MENU_IZIN" }],
        [{ text: "🔴 3. Tanpa Keterangan (Alpha)", callback_data: "MENU_ABSENT" }],
        [{ text: "✏️ Buka Editor Interaktif", web_app: { url: `${getAppBaseUrl()}/editor?chatId=${user.chatId}` } }],
        [
          { text: "🔑 Atur Gemini API Key", callback_data: "BTN_SET_APIKEY" },
          { text: "💡 Ide Kegiatan", callback_data: "SUGGEST_IDEAS" },
        ],
        [{ text: "💼 Ganti Posisi", callback_data: "SHOW_ROLES" }],
      ];

  return telegram.sendMessage(user.chatId, message, {
    reply_markup: {
      inline_keyboard,
    },
  });
}
