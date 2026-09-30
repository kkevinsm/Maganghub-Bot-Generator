export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export interface TelegramChat {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
  title?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
}

export interface TelegramInlineKeyboardButton {
  text: string;
  callback_data?: string;
  url?: string;
}

export interface TelegramInlineKeyboardMarkup {
  inline_keyboard: TelegramInlineKeyboardButton[][];
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
  reply_markup?: TelegramInlineKeyboardMarkup;
}

export interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
  chat_instance?: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

export interface UserDraftReport {
  date: string; // YYYY-MM-DD
  status: "PRESENT" | "ON_LEAVE";
  uraian_aktivitas?: string;
  pembelajaran?: string;
  kendala?: string;
  alasan_tidak_hadir?: string;
  rawInput?: string;
}

export interface UserAccount {
  chatId: number;
  name?: string;
  telegramUsername?: string;
  username?: string; // Encrypted Kemnaker Email/NIK/No HP
  password?: string; // Encrypted Kemnaker Password
  token?: string; // Cached token
  draftReport?: UserDraftReport | null;
  step?: "idle" | "awaiting_login_email" | "awaiting_login_password" | "awaiting_confirm";
  tempLoginEmail?: string;
  reminderEnabled?: boolean;
  createdAt?: string;
  updatedAt?: string;
}
