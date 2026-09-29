import { type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const DEFAULT_PROXY_BASE = "https://absen-hub.web.id";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username, password } = body;

    if (!username || !username.trim() || !password) {
      return Response.json(
        { error: "Email / No. HP / NIK dan password wajib diisi." },
        { status: 400 }
      );
    }

    const proxyBase = process.env.KEMNAKER_PROXY_BASE_URL || DEFAULT_PROXY_BASE;
    const loginUrl = `${proxyBase}/api/kemnaker/login`;

    const upstreamRes = await fetch(loginUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      },
      body: JSON.stringify({
        username: username.trim(),
        password,
      }),
    });

    const data = await upstreamRes.json().catch(() => null);

    if (!upstreamRes.ok || !data) {
      const errorMessage =
        data?.error || `Login gagal ke server Kemnaker (HTTP ${upstreamRes.status}).`;
      return Response.json({ error: errorMessage }, { status: upstreamRes.status || 401 });
    }

    if (!data.access_token) {
      return Response.json(
        { error: data.error || "Token otentikasi tidak ditemukan dari server." },
        { status: 401 }
      );
    }

    // Success response containing access_token and user info
    return Response.json({
      access_token: data.access_token,
      user: data.user || null,
    });
  } catch (error: unknown) {
    console.error("Kemnaker login error:", error);
    const message =
      error instanceof Error ? error.message : "Terjadi kesalahan saat menghubungi server Kemnaker.";
    return Response.json({ error: message }, { status: 500 });
  }
}
