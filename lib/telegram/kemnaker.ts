/**
 * Kemnaker API Helper untuk Telegram Bot
 * Menghubungkan bot dengan Proxy Kemnaker (Hostinger / api.mobogen.online)
 */

const DEFAULT_PROXY_BASE = "https://api.mobogen.online";

export interface KemnakerLoginResult {
  success: boolean;
  accessToken?: string;
  user?: {
    name?: string;
    email?: string;
    nik?: string;
    [key: string]: unknown;
  };
  error?: string;
}

export interface KemnakerSubmitResult {
  success: boolean;
  message?: string;
  error?: string;
}

export async function loginKemnaker(username: string, password: string): Promise<KemnakerLoginResult> {
  const proxyBase = process.env.KEMNAKER_PROXY_BASE_URL || DEFAULT_PROXY_BASE;
  const loginUrl = `${proxyBase}/api/kemnaker/login`;

  try {
    const res = await fetch(loginUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      },
      body: JSON.stringify({ username: username.trim(), password }),
    });

    const data = await res.json().catch(() => null);

    if (!res.ok || !data || !data.access_token) {
      return {
        success: false,
        error: data?.error || `Login gagal ke Kemnaker (HTTP ${res.status}).`,
      };
    }

    return {
      success: true,
      accessToken: data.access_token,
      user: data.user || undefined,
    };
  } catch (error) {
    console.error("[Kemnaker] Login error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Gagal terhubung ke proxy Kemnaker.",
    };
  }
}

export async function submitAttendanceToKemnaker(
  token: string,
  payload: {
    date: string;
    status: "PRESENT" | "ON_LEAVE" | "ABSENT";
    activity_log?: string;
    lesson_learned?: string;
    obstacles?: string;
    leave_reason?: string;
  }
): Promise<KemnakerSubmitResult> {
  const proxyBase = process.env.KEMNAKER_PROXY_BASE_URL || DEFAULT_PROXY_BASE;
  const submitUrl = `${proxyBase}/api/kemnaker/submit-attendance`;

  try {
    const res = await fetch(submitUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      },
      body: JSON.stringify({ token, payload }),
    });

    const data = await res.json().catch(() => null);

    if (res.status === 401) {
      return {
        success: false,
        error: "Sesi login Anda di Kemnaker telah berakhir. Silakan login ulang via Telegram.",
      };
    }

    if (!res.ok || !data || !data.success) {
      return {
        success: false,
        error: data?.error || `Gagal mengirim absensi (HTTP ${res.status}).`,
      };
    }

    return {
      success: true,
      message: data.message || "Absensi Monev berhasil dikirim ke Kemnaker!",
    };
  } catch (error) {
    console.error("[Kemnaker] Submit attendance error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Gagal terhubung ke server Monev Kemnaker.",
    };
  }
}
