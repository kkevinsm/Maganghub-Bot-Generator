/**
 * Telegram Bot API Client
 * Mengirim pesan, inline keyboard, dan notifikasi ke Telegram Bot API.
 */

import { TelegramInlineKeyboardMarkup } from "./types";

export class TelegramClient {
  private botToken: string;

  constructor() {
    this.botToken = process.env.TELEGRAM_BOT_TOKEN || "";
  }

  private getBaseUrl(): string {
    return `https://api.telegram.org/bot${this.botToken}`;
  }

  private isConfigured(): boolean {
    return Boolean(this.botToken);
  }

  /**
   * Mengirim pesan teks ke user Telegram (mendukung Markdown & Inline Keyboard)
   */
  async sendMessage(
    chatId: number,
    text: string,
    options?: {
      parse_mode?: "Markdown" | "HTML";
      reply_markup?: TelegramInlineKeyboardMarkup;
    }
  ): Promise<boolean> {
    if (!this.isConfigured()) {
      console.warn("[TelegramClient] TELEGRAM_BOT_TOKEN belum dikonfigurasi.");
      return false;
    }

    try {
      const response = await fetch(`${this.getBaseUrl()}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: options?.parse_mode ?? "Markdown",
          reply_markup: options?.reply_markup,
        }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        console.error("[TelegramClient] Failed to send message:", data);
        // Fallback: Jika gagal dengan Markdown formatting error, coba kirim plain text
        if (options?.parse_mode) {
          return this.sendMessage(chatId, text, { reply_markup: options?.reply_markup });
        }
        return false;
      }

      return true;
    } catch (error) {
      console.error("[TelegramClient] Error sending message:", error);
      return false;
    }
  }

  /**
   * Mengedit pesan yang sudah ada (misal setelah user klik tombol)
   */
  async editMessageText(
    chatId: number,
    messageId: number,
    text: string,
    options?: {
      parse_mode?: "Markdown" | "HTML";
      reply_markup?: TelegramInlineKeyboardMarkup;
    }
  ): Promise<boolean> {
    if (!this.isConfigured()) return false;

    try {
      const response = await fetch(`${this.getBaseUrl()}/editMessageText`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          message_id: messageId,
          text,
          parse_mode: options?.parse_mode ?? "Markdown",
          reply_markup: options?.reply_markup,
        }),
      });

      return response.ok;
    } catch (error) {
      console.error("[TelegramClient] Error editing message:", error);
      return false;
    }
  }

  /**
   * Menampilkan efek "sedang mengetik..." di Telegram
   */
  async sendChatAction(chatId: number, action: "typing" = "typing"): Promise<void> {
    if (!this.isConfigured()) return;
    try {
      await fetch(`${this.getBaseUrl()}/sendChatAction`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, action }),
      });
    } catch {
      // Ignore chat action error
    }
  }

  /**
   * Mengonfirmasi callback query dari tombol inline
   */
  async answerCallbackQuery(
    callbackQueryId: string,
    text?: string,
    showAlert: boolean = false
  ): Promise<void> {
    if (!this.isConfigured()) return;
    try {
      await fetch(`${this.getBaseUrl()}/answerCallbackQuery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          callback_query_id: callbackQueryId,
          text,
          show_alert: showAlert,
        }),
      });
    } catch {
      // Ignore callback query response error
    }
  }

  /**
   * Mengeset daftar perintah resmi di tombol menu Telegram (popup / menu)
   */
  async setMyCommands(): Promise<boolean> {
    if (!this.isConfigured()) return false;
    try {
      const response = await fetch(`${this.getBaseUrl()}/setMyCommands`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          commands: [
            { command: "start", description: "Buka menu utama & daftar perintah" },
            { command: "login", description: "Hubungkan akun SIAPkerja Kemnaker" },
            { command: "hadir", description: "Absen hadir harian" },
            { command: "izin", description: "Absen izin / sakit dengan keterangan" },
            { command: "alpha", description: "Absen tidak hadir tanpa keterangan" },
            { command: "status", description: "Cek status akun, API key, & draft" },
            { command: "apikey", description: "Masukkan Gemini API Key gratis" },
            { command: "role", description: "Pilih posisi magang (Frontend, UI/UX, dll)" },
            { command: "ide", description: "Dapatkan rekomendasi ide kegiatan" },
            { command: "reminder", description: "Pengaturan pengingat sore" },
            { command: "logout", description: "Hapus data akun dari bot" },
            { command: "help", description: "Panduan lengkap penggunaan bot" },
          ],
        }),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

export const telegram = new TelegramClient();
