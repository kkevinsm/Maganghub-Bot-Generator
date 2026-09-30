"use client";

import { useEffect, useState, useTransition } from "react";

interface DraftReport {
  date: string;
  status: "PRESENT" | "ON_LEAVE" | "ABSENT";
  uraian_aktivitas?: string;
  pembelajaran?: string;
  kendala?: string;
  alasan_tidak_hadir?: string;
  rawInput?: string;
}

export default function TelegramEditorPage() {
  const [chatId, setChatId] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>("Peserta Magang");
  const [hasAccount, setHasAccount] = useState<boolean>(true);
  const [hasGeminiKey, setHasGeminiKey] = useState<boolean>(true);
  const [apiKeyInput, setApiKeyInput] = useState<string>("");
  const [showApiKeyBox, setShowApiKeyBox] = useState<boolean>(false);
  const [status, setStatus] = useState<"PRESENT" | "ON_LEAVE" | "ABSENT">("PRESENT");

  const [uraian, setUraian] = useState("");
  const [pembelajaran, setPembelajaran] = useState("");
  const [kendala, setKendala] = useState("");
  const [alasanIzin, setAlasanIzin] = useState("");
  const [rawInput, setRawInput] = useState("");

  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    // Inisialisasi Telegram WebApp
    if (typeof window !== "undefined") {
      const tg = (window as unknown as { Telegram?: { WebApp?: { ready: () => void; expand: () => void; close: () => void; initDataUnsafe?: { user?: { id: number; first_name?: string } } } } }).Telegram?.WebApp;
      if (tg) {
        tg.ready();
        tg.expand();
      }

      // Ambil chatId dari query param atau Telegram initData
      const urlParams = new URLSearchParams(window.location.search);
      const paramChatId = urlParams.get("chatId") || String(tg?.initDataUnsafe?.user?.id || "");

      if (paramChatId) {
        setChatId(paramChatId);
        fetchDraft(paramChatId);
      } else {
        setLoading(false);
      }
    }
  }, []);

  async function fetchDraft(cId: string) {
    try {
      setLoading(true);
      const res = await fetch(`/api/telegram/draft?chatId=${cId}`);
      if (res.ok) {
        const data = await res.json();
        setUserName(data.name || "Peserta Magang");
        setHasAccount(data.hasAccount ?? true);
        setHasGeminiKey(data.hasGeminiKey ?? true);
        if (!data.hasGeminiKey) {
          setShowApiKeyBox(true);
        }
        if (data.draft) {
          const d: DraftReport = data.draft;
          setStatus(d.status || "PRESENT");
          setUraian(d.uraian_aktivitas || "");
          setPembelajaran(d.pembelajaran || "");
          setKendala(d.kendala || "");
          setAlasanIzin(d.alasan_tidak_hadir || "");
          setRawInput(d.rawInput || "");
        }
      }
    } catch (err) {
      console.error("Failed to fetch draft:", err);
    } finally {
      setLoading(false);
    }
  }

  const handleSaveApiKey = () => {
    if (!apiKeyInput.trim()) {
      setMessage({ type: "error", text: "Silakan masukkan API Key Gemini Anda." });
      return;
    }

    startTransition(async () => {
      setMessage(null);
      try {
        const res = await fetch("/api/telegram/draft", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chatId,
            action: "set_apikey",
            apiKey: apiKeyInput.trim(),
          }),
        });

        const data = await res.json();
        if (res.ok && data.success) {
          setHasGeminiKey(true);
          setShowApiKeyBox(false);
          setApiKeyInput("");
          setMessage({ type: "success", text: "🔑 Gemini API Key berhasil disimpan dan aktif!" });
        } else {
          setMessage({ type: "error", text: data.error || "Gagal menyimpan API Key." });
        }
      } catch {
        setMessage({ type: "error", text: "Gagal menyimpan API Key." });
      }
    });
  };

  const handleGenerateAI = () => {
    if (!rawInput.trim()) {
      setMessage({ type: "error", text: "Silakan masukkan poin kegiatan terlebih dahulu." });
      return;
    }

    startTransition(async () => {
      setMessage(null);
      try {
        const res = await fetch("/api/telegram/draft", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chatId,
            action: "generate",
            status,
            promptAktivitas: rawInput,
            apiKey: apiKeyInput.trim() || undefined,
          }),
        });

        const data = await res.json();
        if (res.ok && data.draft) {
          setUraian(data.draft.uraian_aktivitas || "");
          setPembelajaran(data.draft.pembelajaran || "");
          setKendala(data.draft.kendala || "");
          setAlasanIzin(data.draft.alasan_tidak_hadir || "");
          setMessage({ type: "success", text: "Laporan berhasil disusun otomatis oleh AI!" });
        } else {
          if (data.error && data.error.includes("GEMINI_API_KEY")) {
            setShowApiKeyBox(true);
          }
          setMessage({ type: "error", text: data.error || "Gagal generate laporan AI." });
        }
      } catch {
        setMessage({ type: "error", text: "Terjadi kesalahan koneksi server." });
      }
    });
  };

  const handleSaveDraft = () => {
    startTransition(async () => {
      setMessage(null);
      try {
        const today = new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Jakarta",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date());

        const draftPayload: DraftReport = {
          date: today,
          status,
          uraian_aktivitas: uraian,
          pembelajaran,
          kendala,
          alasan_tidak_hadir: alasanIzin,
          rawInput,
        };

        const res = await fetch("/api/telegram/draft", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chatId,
            action: "save",
            draft: draftPayload,
          }),
        });

        const data = await res.json();
        if (res.ok) {
          setMessage({ type: "success", text: "Draft berhasil disimpan ke Telegram Bot!" });
        } else {
          setMessage({ type: "error", text: data.error || "Gagal menyimpan draft." });
        }
      } catch {
        setMessage({ type: "error", text: "Gagal menyimpan draft." });
      }
    });
  };

  const handleSubmitKemnaker = () => {
    if (status === "PRESENT") {
      if (uraian.length < 100 || pembelajaran.length < 100 || kendala.length < 100) {
        setMessage({
          type: "error",
          text: "Semua isian (Uraian, Pembelajaran, Kendala) wajib minimal 100 karakter!",
        });
        return;
      }
    } else if (status === "ON_LEAVE") {
      if (alasanIzin.length < 100) {
        setMessage({
          type: "error",
          text: "Alasan tidak hadir wajib minimal 100 karakter!",
        });
        return;
      }
    }

    startTransition(async () => {
      setMessage(null);
      try {
        const today = new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Jakarta",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date());

        const draftPayload: DraftReport = {
          date: today,
          status,
          uraian_aktivitas: uraian,
          pembelajaran,
          kendala,
          alasan_tidak_hadir: alasanIzin,
          rawInput,
        };

        const res = await fetch("/api/telegram/draft", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chatId,
            action: "submit",
            draft: draftPayload,
          }),
        });

        const data = await res.json();
        if (res.ok && data.success) {
          setMessage({
            type: "success",
            text: "🎉 Alhamdulillah! Presensi berhasil dikirim resmi ke Kemnaker!",
          });
          setTimeout(() => {
            const tg = (window as unknown as { Telegram?: { WebApp?: { close: () => void } } }).Telegram?.WebApp;
            if (tg) tg.close();
          }, 2000);
        } else {
          setMessage({ type: "error", text: data.error || "Pengiriman presensi gagal." });
        }
      } catch {
        setMessage({ type: "error", text: "Terjadi kesalahan saat submit ke Kemnaker." });
      }
    });
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 pb-12 font-sans antialiased selection:bg-blue-600 selection:text-white">
      {/* Header */}
      <div className="max-w-xl mx-auto mb-5">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-blue-400 bg-blue-950/60 border border-blue-800/40 px-2.5 py-0.5 rounded-full">
              Telegram Mini App
            </span>
            <h1 className="text-xl font-bold mt-1 text-white tracking-tight">
              Editor Presensi Monev
            </h1>
            <p className="text-xs text-slate-400">
              Hai, <span className="font-semibold text-slate-200">{userName}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowApiKeyBox(!showApiKeyBox)}
            className="text-xs bg-slate-900 border border-slate-700 hover:border-slate-500 text-slate-300 px-3 py-1.5 rounded-xl font-medium transition flex items-center gap-1.5 shadow-sm"
          >
            <span>🔑 API Key</span>
            <span
              className={`h-2 w-2 rounded-full ${
                hasGeminiKey ? "bg-emerald-400" : "bg-amber-400 animate-pulse"
              }`}
            />
          </button>
        </div>

        {/* Gemini API Key Box */}
        {showApiKeyBox && (
          <div className="mt-3 p-3.5 bg-slate-900/95 border border-indigo-800/50 rounded-2xl shadow-xl space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-indigo-300">
                🔑 Google Gemini API Key
              </span>
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noreferrer"
                className="text-[11px] text-blue-400 hover:underline"
              >
                Dapatkan Key Gratis ↗
              </a>
            </div>
            <p className="text-[11px] text-slate-400">
              Masukkan API Key Gemini Anda untuk mengaktifkan AI Generator:
            </p>
            <div className="flex gap-2">
              <input
                type="password"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder="AIzaSy..."
                className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
              />
              <button
                type="button"
                onClick={handleSaveApiKey}
                disabled={isPending}
                className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs px-3.5 py-1.5 rounded-xl font-semibold transition"
              >
                Simpan
              </button>
            </div>
          </div>
        )}

        {!hasAccount && (
          <div className="mt-3 p-3 bg-amber-950/40 border border-amber-800/60 rounded-xl text-xs text-amber-200">
            ⚠️ <strong>Perhatian:</strong> Akun Kemnaker belum login di bot. Silakan ketik <code>/login</code> di Telegram sebelum melakukan pengiriman.
          </div>
        )}

        {message && (
          <div
            className={`mt-3 p-3 rounded-xl text-xs font-medium border animate-in fade-in duration-200 ${
              message.type === "success"
                ? "bg-emerald-950/50 border-emerald-700/60 text-emerald-200"
                : "bg-rose-950/50 border-rose-700/60 text-rose-200"
            }`}
          >
            {message.text}
          </div>
        )}
      </div>

      <div className="max-w-xl mx-auto space-y-4">
        {/* Status Selection */}
        <div className="bg-slate-900/80 border border-slate-800/80 p-3.5 rounded-2xl backdrop-blur-md">
          <label className="text-xs font-semibold text-slate-300 block mb-2">
            Status Kehadiran Hari Ini
          </label>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setStatus("PRESENT")}
              className={`py-2 px-2 rounded-xl text-xs font-semibold transition-all text-center border ${
                status === "PRESENT"
                  ? "bg-emerald-600 border-emerald-500 text-white shadow-md shadow-emerald-600/30"
                  : "bg-slate-800/60 border-slate-700/50 text-slate-300 hover:bg-slate-800"
              }`}
            >
              🟢 Hadir
            </button>
            <button
              type="button"
              onClick={() => setStatus("ON_LEAVE")}
              className={`py-2 px-2 rounded-xl text-xs font-semibold transition-all text-center border ${
                status === "ON_LEAVE"
                  ? "bg-amber-600 border-amber-500 text-white shadow-md shadow-amber-600/30"
                  : "bg-slate-800/60 border-slate-700/50 text-slate-300 hover:bg-slate-800"
              }`}
            >
              🟡 Izin / Sakit
            </button>
            <button
              type="button"
              onClick={() => setStatus("ABSENT")}
              className={`py-2 px-2 rounded-xl text-xs font-semibold transition-all text-center border ${
                status === "ABSENT"
                  ? "bg-rose-600 border-rose-500 text-white shadow-md shadow-rose-600/30"
                  : "bg-slate-800/60 border-slate-700/50 text-slate-300 hover:bg-slate-800"
              }`}
            >
              🔴 Alpha
            </button>
          </div>
        </div>

        {/* AI Quick Generator Box */}
        {status !== "ABSENT" && (
          <div className="bg-slate-900/80 border border-slate-800/80 p-3.5 rounded-2xl backdrop-blur-md">
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-300">
                🤖 Generator AI (Ketik Poin Singkat)
              </label>
              <button
                type="button"
                onClick={handleGenerateAI}
                disabled={isPending}
                className="text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-3 py-1 rounded-lg font-medium transition shadow-sm"
              >
                {isPending ? "Menyusun..." : "✨ Buat Narasi"}
              </button>
            </div>
            <textarea
              rows={2}
              value={rawInput}
              onChange={(e) => setRawInput(e.target.value)}
              placeholder="Contoh: Slicing UI dashboard, implementasi API auth, fixing bug navigasi..."
              className="w-full bg-slate-950/80 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>
        )}

        {/* Form Fields: PRESENT */}
        {status === "PRESENT" && (
          <div className="space-y-3.5">
            {/* 1. Uraian Aktivitas */}
            <div className="bg-slate-900/80 border border-slate-800/80 p-3.5 rounded-2xl">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold text-slate-200">
                  1️⃣ Uraian Aktivitas
                </span>
                <span
                  className={`text-[11px] font-mono px-2 py-0.5 rounded-md ${
                    uraian.length >= 100
                      ? "bg-emerald-950 text-emerald-400 border border-emerald-800/50"
                      : "bg-rose-950 text-rose-400 border border-rose-800/50"
                  }`}
                >
                  {uraian.length}/100 Karakter
                </span>
              </div>
              <textarea
                rows={4}
                value={uraian}
                onChange={(e) => setUraian(e.target.value)}
                placeholder="Tuliskan detail aktivitas magang Anda hari ini..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 focus:outline-none focus:border-blue-500 leading-relaxed"
              />
            </div>

            {/* 2. Pembelajaran */}
            <div className="bg-slate-900/80 border border-slate-800/80 p-3.5 rounded-2xl">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold text-slate-200">
                  2️⃣ Pembelajaran yang Diperoleh
                </span>
                <span
                  className={`text-[11px] font-mono px-2 py-0.5 rounded-md ${
                    pembelajaran.length >= 100
                      ? "bg-emerald-950 text-emerald-400 border border-emerald-800/50"
                      : "bg-rose-950 text-rose-400 border border-rose-800/50"
                  }`}
                >
                  {pembelajaran.length}/100 Karakter
                </span>
              </div>
              <textarea
                rows={4}
                value={pembelajaran}
                onChange={(e) => setPembelajaran(e.target.value)}
                placeholder="Refleksi wawasan atau keterampilan baru yang didapatkan..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 focus:outline-none focus:border-blue-500 leading-relaxed"
              />
            </div>

            {/* 3. Kendala */}
            <div className="bg-slate-900/80 border border-slate-800/80 p-3.5 rounded-2xl">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold text-slate-200">
                  3️⃣ Kendala yang Dialami
                </span>
                <span
                  className={`text-[11px] font-mono px-2 py-0.5 rounded-md ${
                    kendala.length >= 100
                      ? "bg-emerald-950 text-emerald-400 border border-emerald-800/50"
                      : "bg-rose-950 text-rose-400 border border-rose-800/50"
                  }`}
                >
                  {kendala.length}/100 Karakter
                </span>
              </div>
              <textarea
                rows={4}
                value={kendala}
                onChange={(e) => setKendala(e.target.value)}
                placeholder="Tantangan teknis atau area perbaikan selama pengerjaan tugas..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 focus:outline-none focus:border-blue-500 leading-relaxed"
              />
            </div>
          </div>
        )}

        {/* Form Fields: ON_LEAVE */}
        {status === "ON_LEAVE" && (
          <div className="bg-slate-900/80 border border-slate-800/80 p-3.5 rounded-2xl">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold text-slate-200">
                📄 Alasan Tidak Hadir
              </span>
              <span
                className={`text-[11px] font-mono px-2 py-0.5 rounded-md ${
                  alasanIzin.length >= 100
                    ? "bg-emerald-950 text-emerald-400 border border-emerald-800/50"
                    : "bg-rose-950 text-rose-400 border border-rose-800/50"
                }`}
              >
                {alasanIzin.length}/100 Karakter
              </span>
            </div>
            <textarea
              rows={5}
              value={alasanIzin}
              onChange={(e) => setAlasanIzin(e.target.value)}
              placeholder="Tuliskan keterangan permohonan izin atau kondisi sakit secara formal..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 focus:outline-none focus:border-blue-500 leading-relaxed"
            />
          </div>
        )}

        {/* Form Fields: ABSENT */}
        {status === "ABSENT" && (
          <div className="bg-slate-900/80 border border-rose-900/40 p-4 rounded-2xl text-center">
            <p className="text-sm font-semibold text-rose-300">
              Konfirmasi Tidak Hadir Tanpa Keterangan
            </p>
            <p className="text-xs text-slate-400 mt-1">
              Opsi ini akan mengirimkan status Alpha tanpa lampiran laporan harian ke sistem Kemnaker.
            </p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="pt-2 space-y-2.5">
          <button
            type="button"
            onClick={handleSubmitKemnaker}
            disabled={isPending || loading}
            className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white py-3.5 px-4 rounded-xl font-bold text-sm transition shadow-lg shadow-emerald-600/25 flex items-center justify-center gap-2"
          >
            {isPending ? "🚀 Mengirim ke Kemnaker..." : "🚀 Kirim Langsung ke Monev Kemnaker"}
          </button>

          <button
            type="button"
            onClick={handleSaveDraft}
            disabled={isPending || loading}
            className="w-full bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 py-3 px-4 rounded-xl font-semibold text-xs transition border border-slate-700 flex items-center justify-center gap-2"
          >
            💾 Simpan Draft ke Bot Telegram
          </button>
        </div>
      </div>
    </div>
  );
}
