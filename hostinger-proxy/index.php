<?php
/**
 * Mobogen Kemnaker Proxy for Hostinger
 * Menangani CORS dan meneruskan request login/absensi dari IP Hostinger ke Kemnaker
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
        'service' => 'Mobogen Kemnaker Proxy',
        'message' => 'Server proxy aktif dan siap digunakan.'
    ], JSON_PRETTY_PRINT);
    exit;
}

// Upstream URL ke server backend Kemnaker
$upstreamUrl = 'https://absen-hub.web.id' . $requestPath;

// Baca data JSON dari body request
$input = file_get_contents('php://input');

$ch = curl_init($upstreamUrl);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $_SERVER['REQUEST_METHOD']);
if (!empty($input)) {
    curl_setopt($ch, CURLOPT_POSTFIELDS, $input);
}
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Content-Type: application/json',
    'Accept: application/json',
    'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
]);
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
curl_setopt($ch, CURLOPT_TIMEOUT, 30);
curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlError = curl_error($ch);
curl_close($ch);

if ($response === false) {
    http_response_code(502);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([
        'error' => 'Gagal menghubungi server upstream: ' . $curlError
    ]);
    exit;
}

http_response_code($httpCode ?: 200);
header('Content-Type: application/json; charset=utf-8');
echo $response;
