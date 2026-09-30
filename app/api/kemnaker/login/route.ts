import { type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Direct Kemnaker SSO Login — no third-party proxy.
 *
 * Flow:
 *  1. GET  monev-api /auth/login          → OAuth authorize URL
 *  2. GET  account.kemnaker /auth?…       → login page (grab CSRF + cookies)
 *  3. POST account.kemnaker /auth/login   → authenticate (with CSRF + cookies)
 *  4. POST account.kemnaker /auth         → approve OAuth (auto-approve, follows redirect)
 *  5. Capture redirect to callback        → extract ?code=…&state=…
 *  6. GET  monev-api /auth/login/callback  → exchange code for access_token
 */

const MONEV_API = "https://monev-api.maganghub.kemnaker.go.id/api/v1";
const KEMNAKER_ACCOUNT = "https://account.kemnaker.go.id";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

// ---------------------------------------------------------------------------
// Cookie-jar helper (lightweight, handles Set-Cookie parsing + sending)
// ---------------------------------------------------------------------------
class CookieJar {
  private cookies: Map<string, string> = new Map();

  /** Parse Set-Cookie headers from a Response and store them. */
  absorb(response: Response): void {
    // response.headers.getSetCookie() returns an array of raw Set-Cookie values
    const rawCookies: string[] =
      (response.headers as unknown as { getSetCookie?: () => string[] })
        .getSetCookie?.() ?? [];

    // Fallback: some runtimes don't support getSetCookie
    if (rawCookies.length === 0) {
      const singleHeader = response.headers.get("set-cookie");
      if (singleHeader) {
        // Multiple cookies may be comma-separated, but be careful with
        // expiry dates that also contain commas. Split on ", " followed by
        // a token= pattern.
        for (const part of singleHeader.split(/,\s*(?=[A-Za-z_][A-Za-z0-9_]*=)/)) {
          this.parseSingle(part);
        }
      }
      return;
    }

    for (const raw of rawCookies) {
      this.parseSingle(raw);
    }
  }

  private parseSingle(raw: string): void {
    const idx = raw.indexOf("=");
    if (idx === -1) return;
    const name = raw.substring(0, idx).trim();
    // Value is everything up to the first ";"
    const rest = raw.substring(idx + 1);
    const semiIdx = rest.indexOf(";");
    const value = semiIdx === -1 ? rest.trim() : rest.substring(0, semiIdx).trim();
    this.cookies.set(name, value);
  }

  /** Return a Cookie header value string. */
  header(): string {
    return [...this.cookies.entries()]
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract CSRF token from HTML meta tag: <meta name="csrf-token" content="…"> */
function extractCsrf(html: string): string | null {
  const match = html.match(/csrf-token[^>]*content="([^"]+)"/);
  return match?.[1] ?? null;
}

/**
 * Perform a fetch that does NOT auto-follow redirects so we can capture
 * Location headers ourselves.
 */
async function fetchNoRedirect(
  url: string,
  init: RequestInit & { headers?: Record<string, string> }
): Promise<Response> {
  return fetch(url, { ...init, redirect: "manual" });
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
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

    const jar = new CookieJar();

    // ── Step 1: Get OAuth authorize URL from Monev API ────────────────
    const oauthUrlRes = await fetch(`${MONEV_API}/auth/login`, {
      headers: { "User-Agent": UA },
      redirect: "manual",
    });
    let oauthUrl: string;
    const ct = oauthUrlRes.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      const j = await oauthUrlRes.json();
      oauthUrl = j.redirectUrl ?? j.redirect_uri ?? j.url ?? "";
    } else {
      oauthUrl = (await oauthUrlRes.text()).trim();
    }

    if (!oauthUrl || !oauthUrl.startsWith("http")) {
      return Response.json(
        { error: "Gagal mendapatkan URL otentikasi dari server Monev." },
        { status: 502 }
      );
    }

    // Parse state from the OAuth URL
    const oauthParsed = new URL(oauthUrl);
    const oauthState = oauthParsed.searchParams.get("state") || "";

    // ── Step 2: Visit the OAuth authorize URL to get session cookies ──
    const authPageRes = await fetch(oauthUrl, {
      headers: { "User-Agent": UA, Accept: "text/html" },
      redirect: "follow",
    });
    jar.absorb(authPageRes);
    const authPageHtml = await authPageRes.text();
    const csrfToken = extractCsrf(authPageHtml);

    if (!csrfToken) {
      return Response.json(
        { error: "Gagal mendapatkan CSRF token dari halaman login Kemnaker." },
        { status: 502 }
      );
    }

    // ── Step 3: POST credentials to Kemnaker login ────────────────────
    const loginRes = await fetchNoRedirect(`${KEMNAKER_ACCOUNT}/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-CSRF-TOKEN": csrfToken,
        "X-Requested-With": "XMLHttpRequest",
        Referer: `${KEMNAKER_ACCOUNT}/auth/login`,
        "User-Agent": UA,
        Cookie: jar.header(),
      },
      body: JSON.stringify({
        username: username.trim(),
        password,
      }),
    });
    jar.absorb(loginRes);

    // Handle login errors
    if (loginRes.status === 422 || loginRes.status === 401) {
      const errData = await loginRes.json().catch(() => null);
      const errMsg =
        errData?.errors?.username?.[0] ??
        errData?.message ??
        "Username atau password SIAPkerja salah.";
      return Response.json({ error: errMsg }, { status: 401 });
    }

    if (loginRes.status >= 400) {
      return Response.json(
        { error: `Login gagal ke Kemnaker (HTTP ${loginRes.status}).` },
        { status: loginRes.status }
      );
    }

    // If 302/301, follow manually; if 200, it was a JSON success response
    // In either case, the session cookies are now set.

    // ── Step 4: Visit the OAuth authorize endpoint to approve ─────────
    // After login, the session is active. Now we re-visit the original
    // OAuth URL which should now auto-authorize and redirect to callback.

    // First, refresh CSRF token from the session
    const authPage2Res = await fetch(oauthUrl, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html",
        Cookie: jar.header(),
      },
      redirect: "manual",
    });
    jar.absorb(authPage2Res);

    let callbackUrl: string | null = null;

    // Case A: The server immediately redirects (302) to the callback
    if ([301, 302, 303, 307, 308].includes(authPage2Res.status)) {
      const loc = authPage2Res.headers.get("location") || "";
      if (loc.includes("/sso/callback") || loc.includes("code=")) {
        callbackUrl = loc;
      } else {
        // It redirects somewhere else — follow it
        const followRes = await fetch(loc.startsWith("http") ? loc : `${KEMNAKER_ACCOUNT}${loc}`, {
          headers: {
            "User-Agent": UA,
            Accept: "text/html",
            Cookie: jar.header(),
          },
          redirect: "manual",
        });
        jar.absorb(followRes);
        const followLoc = followRes.headers.get("location") || "";
        if (followLoc.includes("/sso/callback") || followLoc.includes("code=")) {
          callbackUrl = followLoc;
        }
      }
    }

    // Case B: The page returns HTML with the auth-authorize component
    // We need to POST /auth to approve
    if (!callbackUrl) {
      const authHtml2 = await authPage2Res.text();
      const csrf2 = extractCsrf(authHtml2) || csrfToken;

      // POST /auth to approve the OAuth authorization
      const approveRes = await fetchNoRedirect(`${KEMNAKER_ACCOUNT}/auth`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "X-CSRF-TOKEN": csrf2,
          "X-Requested-With": "XMLHttpRequest",
          Referer: oauthUrl,
          "User-Agent": UA,
          Cookie: jar.header(),
        },
        body: "{}",
      });
      jar.absorb(approveRes);

      if ([301, 302, 303, 307, 308].includes(approveRes.status)) {
        const loc = approveRes.headers.get("location") || "";
        if (loc.includes("/sso/callback") || loc.includes("code=")) {
          callbackUrl = loc;
        }
      }

      // If JSON response with redirect_uri
      if (!callbackUrl) {
        const approveData = await approveRes.json().catch(() => null);
        if (approveData?.data?.redirect_uri) {
          callbackUrl = approveData.data.redirect_uri;
        }
      }
    }

    // ── Step 4b: If still no callback, try following redirects deeper ──
    if (!callbackUrl) {
      // Sometimes we need to follow multiple redirects
      let currentUrl = oauthUrl;
      for (let i = 0; i < 5; i++) {
        const res = await fetchNoRedirect(currentUrl, {
          headers: {
            "User-Agent": UA,
            Accept: "text/html",
            Cookie: jar.header(),
          },
        });
        jar.absorb(res);

        if ([301, 302, 303, 307, 308].includes(res.status)) {
          const loc = res.headers.get("location") || "";
          const absoluteLoc = loc.startsWith("http")
            ? loc
            : `${new URL(currentUrl).origin}${loc}`;

          if (loc.includes("/sso/callback") || loc.includes("code=")) {
            callbackUrl = absoluteLoc;
            break;
          }
          currentUrl = absoluteLoc;
        } else {
          break;
        }
      }
    }

    if (!callbackUrl) {
      return Response.json(
        {
          error:
            "Login berhasil ke SIAPkerja namun gagal mendapatkan kode otorisasi. Silakan coba lagi.",
        },
        { status: 502 }
      );
    }

    // ── Step 5: Extract code & state from callback URL ────────────────
    const cbParsed = new URL(
      callbackUrl.startsWith("http")
        ? callbackUrl
        : `https://monev.maganghub.kemnaker.go.id${callbackUrl}`
    );
    const authCode = cbParsed.searchParams.get("code");
    const cbState = cbParsed.searchParams.get("state") || oauthState;

    if (!authCode) {
      return Response.json(
        { error: "Kode otorisasi tidak ditemukan dalam callback. Silakan coba lagi." },
        { status: 502 }
      );
    }

    // ── Step 6: Exchange code for access_token via Monev API ──────────
    const exchangeUrl = `${MONEV_API}/auth/login/callback?code=${encodeURIComponent(authCode)}&state=${encodeURIComponent(cbState)}`;
    const exchangeRes = await fetch(exchangeUrl, {
      headers: { "User-Agent": UA },
    });
    const exchangeData = await exchangeRes.json().catch(() => null);

    if (!exchangeRes.ok || !exchangeData) {
      const errMsg =
        exchangeData?.message ??
        exchangeData?.error ??
        `Pertukaran kode otorisasi gagal (HTTP ${exchangeRes.status}).`;
      return Response.json({ error: errMsg }, { status: exchangeRes.status || 502 });
    }

    // The response should contain access_token — find it
    const accessToken =
      exchangeData.access_token ??
      exchangeData.data?.access_token ??
      exchangeData.token ??
      exchangeData.data?.token;

    if (!accessToken) {
      return Response.json(
        {
          error:
            "Token otentikasi tidak ditemukan dari respons server Monev. Silakan coba lagi.",
        },
        { status: 502 }
      );
    }

    // Extract user info if available
    const user =
      exchangeData.user ??
      exchangeData.data?.user ??
      exchangeData.data ??
      null;

    return Response.json({
      access_token: accessToken,
      user,
    });
  } catch (error: unknown) {
    console.error("Kemnaker login error:", error);
    const message =
      error instanceof Error
        ? error.message
        : "Terjadi kesalahan saat menghubungi server Kemnaker.";
    return Response.json({ error: message }, { status: 500 });
  }
}
