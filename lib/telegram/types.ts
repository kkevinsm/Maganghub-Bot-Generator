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
  web_app?: {
    url: string;
  };
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
  web_app_data?: {
    data: string;
    button_text: string;
  };
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
  status: "PRESENT" | "ON_LEAVE" | "ABSENT";
  uraian_aktivitas?: string;
  pembelajaran?: string;
  kendala?: string;
  alasan_tidak_hadir?: string;
  rawInput?: string;
  createdAt?: number;
  safeguardNudgeSent?: boolean;
}

export interface UserAccount {
  chatId: number;
  name?: string;
  telegramUsername?: string;
  username?: string; // Encrypted Kemnaker Email/NIK/No HP
  password?: string; // Encrypted Kemnaker Password
  token?: string; // Cached token
  role?: string; // 'frontend' | 'backend' | 'uiux' | 'data' | 'pm_qa' | 'marketing' | 'hr' | 'general'
  draftReport?: UserDraftReport | null;
  step?:
    | "idle"
    | "awaiting_login_email"
    | "awaiting_login_password"
    | "awaiting_hadir_input"
    | "awaiting_izin_input"
    | "awaiting_role_selection"
    | "awaiting_confirm";
  tempLoginEmail?: string;
  reminderEnabled?: boolean;
  lastSafeguardNudge?: number;
  createdAt?: string;
  updatedAt?: string;
}
