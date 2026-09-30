<?php
/**
 * Mobogen Kemnaker Proxy for Hostinger
 * Menangani CORS dan meneruskan request login/absensi langsung ke Kemnaker
 * tanpa melalui absen-hub.web.id
 */

// Izinkan CORS dari semua domain (termasuk mobogen.vercel.app dan localhost)
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");

// Handle preflight request dari browser
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// Dapatkan path URL yang diminta
$requestPath = parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH);

// Jika hanya membuka root domain di browser, tampilkan status aktif
if ($requestPath === '/' || $requestPath === '' || $requestPath === '/index.php') {
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([
        'status' => 'online',
        'service' => 'Mobogen Kemnaker Direct Proxy',
        'message' => 'Server proxy aktif — koneksi langsung ke Kemnaker (tanpa absen-hub).'
    ], JSON_PRETTY_PRINT);
    exit;
}

// ── Login Handler ─────────────────────────────────────────────────────────────
if ($requestPath === '/api/kemnaker/login' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    header('Content-Type: application/json; charset=utf-8');

    $input = json_decode(file_get_contents('php://input'), true);
    $username = trim($input['username'] ?? '');
    $password = $input['password'] ?? '';

    if (empty($username) || empty($password)) {
        http_response_code(400);
        echo json_encode(['error' => 'Email / No. HP / NIK dan password wajib diisi.']);
        exit;
    }

    $ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
    $monevApi = 'https://monev-api.maganghub.kemnaker.go.id/api/v1';
    $kemnakerAccount = 'https://account.kemnaker.go.id';

    // Cookie file for this request
    $cookieFile = tempnam(sys_get_temp_dir(), 'kemnaker_');

    try {
        // Step 1: Get OAuth URL from Monev API
        $ch = curl_init("$monevApi/auth/login");
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => ['User-Agent: ' . $ua],
            CURLOPT_TIMEOUT => 15,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_HEADER => true,
            CURLOPT_COOKIEJAR => $cookieFile,
            CURLOPT_COOKIEFILE => $cookieFile,
        ]);
        $step1Res = curl_exec($ch);
        $step1HeaderSize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
        $step1Headers = substr($step1Res, 0, $step1HeaderSize);
        $oauthUrl = trim(substr($step1Res, $step1HeaderSize));
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        // Extract monev cookies (especially monev_oauth_state) from headers
        $monevCookies = [];
        preg_match_all('/Set-Cookie:\s*([^;\r\n]+)/i', $step1Headers, $cookieMatches);
        if (!empty($cookieMatches[1])) {
            $monevCookies = $cookieMatches[1];
        }

        // If JSON response, extract URL
        $jsonCheck = json_decode($oauthUrl, true);
        if ($jsonCheck) {
            $oauthUrl = $jsonCheck['redirectUrl'] ?? $jsonCheck['redirect_uri'] ?? $jsonCheck['url'] ?? '';
        }

        if (empty($oauthUrl) || strpos($oauthUrl, 'http') !== 0) {
            http_response_code(502);
            echo json_encode(['error' => 'Gagal mendapatkan URL otentikasi dari server Monev.']);
            exit;
        }

        // Parse state from OAuth URL
        $oauthParts = parse_url($oauthUrl);
        parse_str($oauthParts['query'] ?? '', $oauthParams);
        $oauthState = $oauthParams['state'] ?? '';

        // Step 2: Visit OAuth URL to get session cookies + CSRF
        $ch = curl_init($oauthUrl);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => [
                'User-Agent: ' . $ua,
                'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            ],
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_COOKIEJAR => $cookieFile,
            CURLOPT_COOKIEFILE => $cookieFile,
            CURLOPT_TIMEOUT => 15,
            CURLOPT_SSL_VERIFYPEER => true,
        ]);
        $loginPageHtml = curl_exec($ch);
        curl_close($ch);

        // Extract CSRF token
        preg_match('/csrf-token[^>]*content="([^"]+)"/', $loginPageHtml, $csrfMatch);
        $csrfToken = $csrfMatch[1] ?? '';

        if (empty($csrfToken)) {
            http_response_code(502);
            echo json_encode(['error' => 'Gagal mendapatkan CSRF token dari halaman login Kemnaker.']);
            exit;
        }

        // Step 3: POST credentials to Kemnaker login
        $ch = curl_init("$kemnakerAccount/auth/login");
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => json_encode(['username' => $username, 'password' => $password]),
            CURLOPT_HTTPHEADER => [
                'Content-Type: application/json',
                'Accept: application/json',
                'X-CSRF-TOKEN: ' . $csrfToken,
                'X-Requested-With: XMLHttpRequest',
                'Referer: ' . $kemnakerAccount . '/auth/login',
                'User-Agent: ' . $ua,
            ],
            CURLOPT_COOKIEJAR => $cookieFile,
            CURLOPT_COOKIEFILE => $cookieFile,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_TIMEOUT => 15,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_HEADER => true,
        ]);
        $loginResponse = curl_exec($ch);
        $loginHttpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $headerSize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
        $loginBody = substr($loginResponse, $headerSize);
        curl_close($ch);

        // Handle login errors
        if ($loginHttpCode === 422 || $loginHttpCode === 401) {
            $errData = json_decode($loginBody, true);
            $errMsg = $errData['errors']['username'][0] 
                ?? $errData['message'] 
                ?? 'No. HP / Email / NIK atau password tidak benar.';
            http_response_code(401);
            echo json_encode(['error' => $errMsg]);
            exit;
        }

        if ($loginHttpCode >= 400) {
            http_response_code($loginHttpCode);
            echo json_encode(['error' => "Login gagal ke Kemnaker (HTTP $loginHttpCode)."]);
            exit;
        }

        // Step 4: Re-visit OAuth URL — should now redirect to callback
        $callbackUrl = null;

        $ch = curl_init($oauthUrl);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => [
                'User-Agent: ' . $ua,
                'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            ],
            CURLOPT_COOKIEJAR => $cookieFile,
            CURLOPT_COOKIEFILE => $cookieFile,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_TIMEOUT => 15,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_HEADER => true,
        ]);
        $authResponse = curl_exec($ch);
        $authHttpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $authHeaderSize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
        $authHeaders = substr($authResponse, 0, $authHeaderSize);
        $authBody = substr($authResponse, $authHeaderSize);
        curl_close($ch);

        // Check for redirect to callback
        if (in_array($authHttpCode, [301, 302, 303, 307, 308])) {
            preg_match('/Location:\s*(.+)/i', $authHeaders, $locMatch);
            $location = trim($locMatch[1] ?? '');
            if (strpos($location, '/sso/callback') !== false || strpos($location, 'code=') !== false) {
                $callbackUrl = $location;
            } else if (!empty($location)) {
                // Follow one more redirect
                $absoluteUrl = (strpos($location, 'http') === 0) ? $location : $kemnakerAccount . $location;
                $ch = curl_init($absoluteUrl);
                curl_setopt_array($ch, [
                    CURLOPT_RETURNTRANSFER => true,
                    CURLOPT_HTTPHEADER => ['User-Agent: ' . $ua],
                    CURLOPT_COOKIEJAR => $cookieFile,
                    CURLOPT_COOKIEFILE => $cookieFile,
                    CURLOPT_FOLLOWLOCATION => false,
                    CURLOPT_TIMEOUT => 15,
                    CURLOPT_SSL_VERIFYPEER => true,
                    CURLOPT_HEADER => true,
                ]);
                $followResponse = curl_exec($ch);
                $followHeaderSize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
                $followHeaders = substr($followResponse, 0, $followHeaderSize);
                curl_close($ch);

                preg_match('/Location:\s*(.+)/i', $followHeaders, $followLocMatch);
                $followLocation = trim($followLocMatch[1] ?? '');
                if (strpos($followLocation, '/sso/callback') !== false || strpos($followLocation, 'code=') !== false) {
                    $callbackUrl = $followLocation;
                }
            }
        }

        // If not redirected, try POST /auth to approve OAuth
        if (empty($callbackUrl)) {
            preg_match('/csrf-token[^>]*content="([^"]+)"/', $authBody, $csrf2Match);
            $csrf2 = $csrf2Match[1] ?? $csrfToken;

            $ch = curl_init("$kemnakerAccount/auth");
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_POST => true,
                CURLOPT_POSTFIELDS => '{}',
                CURLOPT_HTTPHEADER => [
                    'Content-Type: application/json',
                    'Accept: application/json',
                    'X-CSRF-TOKEN: ' . $csrf2,
                    'X-Requested-With: XMLHttpRequest',
                    'Referer: ' . $oauthUrl,
                    'User-Agent: ' . $ua,
                ],
                CURLOPT_COOKIEJAR => $cookieFile,
                CURLOPT_COOKIEFILE => $cookieFile,
                CURLOPT_FOLLOWLOCATION => false,
                CURLOPT_TIMEOUT => 15,
                CURLOPT_SSL_VERIFYPEER => true,
                CURLOPT_HEADER => true,
            ]);
            $approveResponse = curl_exec($ch);
            $approveHttpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $approveHeaderSize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
            $approveHeaders = substr($approveResponse, 0, $approveHeaderSize);
            $approveBody = substr($approveResponse, $approveHeaderSize);
            curl_close($ch);

            if (in_array($approveHttpCode, [301, 302, 303, 307, 308])) {
                preg_match('/Location:\s*(.+)/i', $approveHeaders, $approveLocMatch);
                $approveLocation = trim($approveLocMatch[1] ?? '');
                if (strpos($approveLocation, '/sso/callback') !== false || strpos($approveLocation, 'code=') !== false) {
                    $callbackUrl = $approveLocation;
                }
            }

            // Check JSON response for redirect_uri
            if (empty($callbackUrl)) {
                $approveData = json_decode($approveBody, true);
                if (!empty($approveData['data']['redirect_uri'])) {
                    $callbackUrl = $approveData['data']['redirect_uri'];
                }
            }
        }

        if (empty($callbackUrl)) {
            http_response_code(502);
            echo json_encode(['error' => 'Login berhasil ke SIAPkerja namun gagal mendapatkan kode otorisasi. Silakan coba lagi.']);
            exit;
        }

        // Step 5: Extract code & state from callback URL
        if (strpos($callbackUrl, 'http') !== 0) {
            $callbackUrl = 'https://monev.maganghub.kemnaker.go.id' . $callbackUrl;
        }
        $cbParts = parse_url($callbackUrl);
        parse_str($cbParts['query'] ?? '', $cbParams);
        $authCode = $cbParams['code'] ?? '';
        $cbState = $cbParams['state'] ?? $oauthState;

        if (empty($authCode)) {
            http_response_code(502);
            echo json_encode(['error' => 'Kode otorisasi tidak ditemukan dalam callback.']);
            exit;
        }

        // Step 6: Exchange code for access_token
        $exchangeUrl = "$monevApi/auth/login/callback?" . http_build_query(['code' => $authCode, 'state' => $cbState]);
        $ch = curl_init($exchangeUrl);
        $exchangeHeaders = [
            'User-Agent: ' . $ua,
            'Accept: application/json',
            'Referer: https://monev.maganghub.kemnaker.go.id/sso/callback?code=' . urlencode($authCode) . '&state=' . urlencode($cbState),
        ];
        if (!empty($monevCookies)) {
            $exchangeHeaders[] = 'Cookie: ' . implode('; ', $monevCookies);
        }
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => $exchangeHeaders,
            CURLOPT_COOKIEJAR => $cookieFile,
            CURLOPT_COOKIEFILE => $cookieFile,
            CURLOPT_TIMEOUT => 15,
            CURLOPT_SSL_VERIFYPEER => true,
        ]);
        $exchangeResponse = curl_exec($ch);
        $exchangeHttpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        $exchangeData = json_decode($exchangeResponse, true);

        // Check if exchange failed (treat all 2xx as success, Monev API returns 201 Created)
        if ($exchangeHttpCode < 200 || $exchangeHttpCode >= 300 || empty($exchangeData)) {
            http_response_code($exchangeHttpCode ?: 502);
            $errMsg = $exchangeData['message'] ?? $exchangeData['error'] ?? "Pertukaran kode otorisasi gagal (HTTP $exchangeHttpCode).";
            echo json_encode(['error' => $errMsg]);
            exit;
        }

        $accessToken = $exchangeData['access_token'] 
            ?? $exchangeData['data']['access_token'] 
            ?? $exchangeData['accessToken'] 
            ?? $exchangeData['data']['accessToken'] 
            ?? $exchangeData['token'] 
            ?? $exchangeData['data']['token'] 
            ?? '';

        if (empty($accessToken)) {
            http_response_code(502);
            echo json_encode([
                'error' => 'Token otentikasi tidak ditemukan dari respons server Monev.',
                'response_keys' => array_keys($exchangeData ?? [])
            ]);
            exit;
        }

        $user = $exchangeData['user'] 
            ?? $exchangeData['data']['user'] 
            ?? $exchangeData['profile'] 
            ?? $exchangeData['data']['profile'] 
            ?? $exchangeData['data'] 
            ?? null;

        http_response_code(200);
        echo json_encode([
            'access_token' => $accessToken,
            'refresh_token' => $exchangeData['refresh_token'] ?? $exchangeData['data']['refresh_token'] ?? null,
            'user' => $user
        ]);

    } finally {
        // Clean up cookie file
        if (file_exists($cookieFile)) {
            unlink($cookieFile);
        }
    }
    exit;
}

// ── Submit Attendance Handler ─────────────────────────────────────────────────
if ($requestPath === '/api/kemnaker/submit-attendance' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    header('Content-Type: application/json; charset=utf-8');

    $input = json_decode(file_get_contents('php://input'), true);
    $token = $input['token'] ?? '';
    $payload = $input['payload'] ?? [];

    if (empty($token)) {
        http_response_code(401);
        echo json_encode(['error' => 'Token otentikasi Kemnaker tidak ditemukan. Silakan login ulang.']);
        exit;
    }

    $monevApi = 'https://monev-api.maganghub.kemnaker.go.id/api/v1';
    $ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

    $monevPayload = [
        'date' => $payload['date'] ?? '',
        'status' => $payload['status'] ?? '',
    ];

    if (($payload['status'] ?? '') === 'PRESENT') {
        $monevPayload['activity_log'] = $payload['activity_log'] ?? '';
        $monevPayload['lesson_learned'] = $payload['lesson_learned'] ?? '';
        $monevPayload['obstacles'] = $payload['obstacles'] ?? '';
    } else if (($payload['status'] ?? '') === 'ON_LEAVE') {
        $monevPayload['activity_log'] = $payload['leave_reason'] ?? $payload['activity_log'] ?? '';
    }

    $ch = curl_init("$monevApi/attendances/with-daily-log");
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => json_encode($monevPayload),
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/json',
            'Accept: application/json',
            'Authorization: Bearer ' . $token,
            'User-Agent: ' . $ua,
        ],
        CURLOPT_TIMEOUT => 30,
        CURLOPT_SSL_VERIFYPEER => true,
    ]);
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    $data = json_decode($response, true);

    http_response_code($httpCode ?: 200);

    if ($httpCode === 401) {
        echo json_encode(['error' => $data['message'] ?? 'Sesi Monev telah berakhir. Silakan login ulang.']);
    } else if ($httpCode >= 400 || empty($data)) {
        echo json_encode(['error' => $data['message'] ?? $data['error'] ?? "Pengiriman absensi gagal (HTTP $httpCode)."]);
    } else {
        echo json_encode([
            'success' => true,
            'message' => $data['message'] ?? 'Laporan absensi berhasil dikirim ke Monev Kemnaker.',
            'data' => $data['data'] ?? $data ?? null,
        ]);
    }
    exit;
}

// ── Fallback: Unknown endpoint ────────────────────────────────────────────────
http_response_code(404);
header('Content-Type: application/json; charset=utf-8');
echo json_encode(['error' => 'Endpoint tidak ditemukan.']);
