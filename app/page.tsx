"use client";

import { useState, useEffect, useCallback } from "react";

// ─── Types ───────────────────────────────────────────────────────────────────
type Status =
  | "Hadir"
  | "Tidak Hadir Dengan Keterangan"
  | "Tidak Hadir Tanpa Keterangan";

interface GeneratedReport {
  uraian_aktivitas?: string;
  pembelajaran?: string;
  kendala?: string;
  alasan_tidak_hadir?: string;
  model?: string;
}

interface KemnakerUser {
  id?: string | number;
  name?: string;
  email?: string;
  phone?: string;
  nik?: string;
  [key: string]: unknown;
}

const STATUS_MAP: Record<Status, "PRESENT" | "ON_LEAVE" | "ABSENT"> = {
  "Hadir": "PRESENT",
  "Tidak Hadir Dengan Keterangan": "ON_LEAVE",
  "Tidak Hadir Tanpa Keterangan": "ABSENT",
};

const KEMNAKER_PROXY_BASE =
  process.env.NEXT_PUBLIC_KEMNAKER_PROXY_BASE_URL || "https://absen-hub.web.id";

// ─── Helper Functions ────────────────────────────────────────────────────────
function isTokenExpired(token: string): boolean {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return true;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    if (typeof payload.exp === "number") {
      return payload.exp * 1000 < Date.now();
    }
    return false;
  } catch {
    return false;
  }
}

function getWibDateString(): string {
  const d = new Date();
  const tzOffset = d.getTimezoneOffset(); // in minutes
  // WIB is UTC+7 (420 minutes)
  const wibTime = new Date(d.getTime() + (420 + tzOffset) * 60000);
  return wibTime.toISOString().split("T")[0];
}

// ─── Helper Components ───────────────────────────────────────────────────────

function CharBadge({ count, min = 100 }: { count: number; min?: number }) {
  const isValid = count >= min;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold transition-all duration-300 animate-count-up ${isValid
        ? "bg-green-50 text-green-700 border border-green-200"
        : "bg-red-50 text-red-600 border border-red-200"
        }`}
    >
      {isValid ? (
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01" />
        </svg>
      )}
      {count}/{min}
    </span>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement("textarea");
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <button
      onClick={handleCopy}
      disabled={!text}
      title={`Salin ${label}`}
      className="p-1.5 rounded-lg transition-all duration-200 hover:bg-surface-100 disabled:opacity-30 disabled:cursor-not-allowed group cursor-pointer"
    >
      {copied ? (
        <svg className="w-4 h-4 text-success-600 animate-bounce-in" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg className="w-4 h-4 text-surface-400 group-hover:text-surface-700 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      )}
    </button>
  );
}

function ReportSection({
  title,
  icon,
  content,
  onEdit,
  colorClass,
  placeholder,
}: {
  title: string;
  icon: React.ReactNode;
  content: string;
  onEdit: (val: string) => void;
  colorClass: string;
  placeholder?: string;
}) {
  return (
    <div className="animate-slide-up">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className={`p-1 rounded-md ${colorClass}`}>{icon}</span>
          <h3 className="text-sm font-semibold text-surface-800">{title}</h3>
        </div>
        <div className="flex items-center gap-1.5">
          <CharBadge count={content.length} />
          <CopyButton text={content} label={title} />
        </div>
      </div>
      <textarea
        value={content}
        onChange={(e) => onEdit(e.target.value)}
        rows={4}
        className="w-full px-3.5 py-2.5 rounded-xl border border-surface-200 bg-white text-sm text-surface-800 leading-relaxed resize-none transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary-400/40 focus:border-primary-400 hover:border-surface-300 placeholder:text-surface-400"
        placeholder={placeholder || `${title} akan muncul di sini setelah di-generate...`}
      />
      <p className="text-[11px] text-surface-400 mt-1">Minimal 100 karakter</p>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function Home() {
  const [status, setStatus] = useState<Status>("Hadir");
  const [aktivitas, setAktivitas] = useState("");
  const [report, setReport] = useState<GeneratedReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [currentTime, setCurrentTime] = useState("");
  const [currentDate, setCurrentDate] = useState("");
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [copyAllDone, setCopyAllDone] = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(false);

  // ─── Kemnaker Auth & Submit State ───
  const [kemnakerToken, setKemnakerToken] = useState("");
  const [kemnakerUser, setKemnakerUser] = useState<KemnakerUser | null>(null);
  const [showKemnakerModal, setShowKemnakerModal] = useState(false);
  const [kemnakerUsername, setKemnakerUsername] = useState("");
  const [kemnakerPassword, setKemnakerPassword] = useState("");
  const [showKemnakerPassword, setShowKemnakerPassword] = useState(false);
  const [kemnakerLoginLoading, setKemnakerLoginLoading] = useState(false);
  const [kemnakerLoginError, setKemnakerLoginError] = useState("");
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitResult, setSubmitResult] = useState<{ ok: boolean; msg: string } | null>(null);

  // Load saved data from localStorage
  useEffect(() => {
    const savedApiKey = localStorage.getItem("monev_api_key");
    if (savedApiKey) {
      setApiKey(savedApiKey);
      setApiKeyInput(savedApiKey);
    }

    try {
      const savedToken = localStorage.getItem("kemnaker_monev_token");
      if (savedToken) {
        if (isTokenExpired(savedToken)) {
          localStorage.removeItem("kemnaker_monev_token");
          localStorage.removeItem("kemnaker_monev_user");
        } else {
          setKemnakerToken(savedToken);
          const savedUser = localStorage.getItem("kemnaker_monev_user");
          if (savedUser) {
            setKemnakerUser(JSON.parse(savedUser));
          }
        }
      }
    } catch {
      // ignore JSON parse errors
    }
  }, []);

  // Reset report and validation when status changes
  const handleStatusChange = (newStatus: Status) => {
    setStatus(newStatus);
    setReport(null);
    setError("");
    setSubmitResult(null);
  };

  // Live clock
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString("id-ID", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          timeZone: "Asia/Jakarta",
        })
      );
      setCurrentDate(
        now.toLocaleDateString("id-ID", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
          timeZone: "Asia/Jakarta",
        })
      );
    };
    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleSaveApiKey = () => {
    if (apiKeyInput.trim()) {
      localStorage.setItem("monev_api_key", apiKeyInput.trim());
      setApiKey(apiKeyInput.trim());
    } else {
      localStorage.removeItem("monev_api_key");
      setApiKey("");
    }
    setShowApiKeyModal(false);
  };

  const handleKemnakerLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!kemnakerUsername.trim() || !kemnakerPassword) {
      setKemnakerLoginError("Email / No. HP / NIK dan password wajib diisi.");
      return;
    }

    setKemnakerLoginLoading(true);
    setKemnakerLoginError("");

    try {
      const res = await fetch(`${KEMNAKER_PROXY_BASE}/api/kemnaker/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: kemnakerUsername.trim(),
          password: kemnakerPassword,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.access_token) {
        throw new Error(data?.error || `Login gagal (HTTP ${res.status}).`);
      }

      setKemnakerToken(data.access_token);
      setKemnakerUser(data.user || null);
      localStorage.setItem("kemnaker_monev_token", data.access_token);
      if (data.user) {
        localStorage.setItem("kemnaker_monev_user", JSON.stringify(data.user));
      }

      setKemnakerPassword("");
      setShowKemnakerModal(false);
      setSubmitResult(null);
    } catch (err: unknown) {
      setKemnakerLoginError(err instanceof Error ? err.message : "Login gagal.");
    } finally {
      setKemnakerLoginLoading(false);
    }
  };

  const handleKemnakerLogout = () => {
    setKemnakerToken("");
    setKemnakerUser(null);
    localStorage.removeItem("kemnaker_monev_token");
    localStorage.removeItem("kemnaker_monev_user");
    setSubmitResult(null);
  };

  const handleGenerate = useCallback(async () => {
    if (!aktivitas.trim()) {
      setError(
        status === "Tidak Hadir Dengan Keterangan"
          ? "Silakan isi catatan atau alasan tidak hadir terlebih dahulu."
          : "Silakan isi catatan aktivitas harian terlebih dahulu."
      );
      return;
    }

    setLoading(true);
    setError("");
    setReport(null);
    setSubmitResult(null);

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          aktivitas: aktivitas.trim(),
          status,
          customApiKey: apiKey || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Gagal menghasilkan laporan.");
      }

      setReport(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan.");
    } finally {
      setLoading(false);
    }
  }, [aktivitas, status, apiKey]);

  const handleSubmitToMonev = async () => {
    if (!kemnakerToken) {
      setKemnakerLoginError("");
      setShowKemnakerModal(true);
      return;
    }

    if (!isConfirmed) {
      setSubmitResult({
        ok: false,
        msg: "Harap centang pernyataan peninjauan isian laporan terlebih dahulu sebelum mengirim.",
      });
      return;
    }

    const kemnakerStatus = STATUS_MAP[status];

    // Validation for Hadir
    if (kemnakerStatus === "PRESENT") {
      if (!report) {
        setSubmitResult({
          ok: false,
          msg: "Generate laporan terlebih dahulu sebelum mengirim ke Monev.",
        });
        return;
      }
      const shortFields: string[] = [];
      if ((report.uraian_aktivitas || "").trim().length < 100) {
        shortFields.push("Uraian Aktivitas");
      }
      if ((report.pembelajaran || "").trim().length < 100) {
        shortFields.push("Pembelajaran yang Diperoleh");
      }
      if ((report.kendala || "").trim().length < 100) {
        shortFields.push("Kendala yang Dialami");
      }

      if (shortFields.length > 0) {
        setSubmitResult({
          ok: false,
          msg: `Sistem Monev mensyaratkan minimal 100 karakter untuk: ${shortFields.join(
            ", "
          )}. Perpanjang isian Anda lalu coba kirim kembali.`,
        });
        return;
      }
    }

    // Validation for Tidak Hadir Dengan Keterangan
    if (kemnakerStatus === "ON_LEAVE") {
      const reason = (report?.alasan_tidak_hadir || aktivitas).trim();
      if (reason.length < 100) {
        setSubmitResult({
          ok: false,
          msg: "Sistem Monev mensyaratkan minimal 100 karakter untuk Alasan Tidak Hadir. Silakan lengkapi alasan Anda.",
        });
        return;
      }
    }

    setSubmitLoading(true);
    setSubmitResult(null);

    const wibDate = getWibDateString();

    try {
      const payloadData: {
        date: string;
        status: "PRESENT" | "ON_LEAVE" | "ABSENT";
        activity_log?: string;
        lesson_learned?: string;
        obstacles?: string;
        leave_reason?: string;
        participant_id?: string | number;
      } = {
        date: wibDate,
        status: kemnakerStatus,
        participant_id: kemnakerUser?.id,
      };

      if (kemnakerStatus === "PRESENT" && report) {
        payloadData.activity_log = report.uraian_aktivitas || "";
        payloadData.lesson_learned = report.pembelajaran || "";
        payloadData.obstacles = report.kendala || "";
      } else if (kemnakerStatus === "ON_LEAVE") {
        const leaveText = (report?.alasan_tidak_hadir || aktivitas).trim();
        payloadData.leave_reason = leaveText;
        payloadData.activity_log = leaveText; // Fallback compatibility
      }

      const res = await fetch(`${KEMNAKER_PROXY_BASE}/api/kemnaker/submit-attendance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: kemnakerToken,
          payload: payloadData,
        }),
      });

      const data = await res.json().catch(() => null);

      if (res.status === 401) {
        handleKemnakerLogout();
        throw new Error(
          data?.error || "Sesi Monev telah berakhir atau token kedaluwarsa. Silakan login ulang."
        );
      }

      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `Pengiriman gagal (HTTP ${res.status}).`);
      }

      setSubmitResult({
        ok: true,
        msg: `Laporan kehadiran "${status}" berhasil tercatat di Monev Kemnaker untuk tanggal ${wibDate}.`,
      });
    } catch (err: unknown) {
      setSubmitResult({
        ok: false,
        msg: err instanceof Error ? err.message : "Pengiriman absensi gagal.",
      });
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleCopyAll = async () => {
    if (!report) return;
    let fullText = "";
    if (status === "Hadir") {
      fullText = `Uraian Aktivitas:\n${report.uraian_aktivitas || ""}\n\nPembelajaran yang Diperoleh:\n${report.pembelajaran || ""}\n\nKendala yang Dialami:\n${report.kendala || ""}`;
    } else if (status === "Tidak Hadir Dengan Keterangan") {
      fullText = `Alasan Tidak Hadir:\n${report.alasan_tidak_hadir || ""}`;
    }
    if (!fullText) return;
    try {
      await navigator.clipboard.writeText(fullText);
      setCopyAllDone(true);
      setTimeout(() => setCopyAllDone(false), 2500);
    } catch {
      /* fallback silently */
    }
  };

  const statusOptions: { key: Status; label: string; badgeColor: string; activeClass: string }[] = [
    {
      key: "Hadir",
      label: "Hadir",
      badgeColor: "bg-green-50 text-green-700 border-green-200",
      activeClass: "bg-green-600 border-green-600 text-white shadow-md shadow-green-200",
    },
    {
      key: "Tidak Hadir Dengan Keterangan",
      label: "Tidak Hadir Dengan Keterangan",
      badgeColor: "bg-amber-50 text-amber-700 border-amber-200",
      activeClass: "bg-amber-500 border-amber-500 text-white shadow-md shadow-amber-200",
    },
    {
      key: "Tidak Hadir Tanpa Keterangan",
      label: "Tidak Hadir Tanpa Keterangan",
      badgeColor: "bg-rose-50 text-rose-700 border-rose-200",
      activeClass: "bg-rose-500 border-rose-500 text-white shadow-md shadow-rose-200",
    },
  ];

  const allValid =
    status === "Hadir"
      ? Boolean(
        report &&
        (report.uraian_aktivitas || "").length >= 100 &&
        (report.pembelajaran || "").length >= 100 &&
        (report.kendala || "").length >= 100
      )
      : status === "Tidak Hadir Dengan Keterangan"
        ? Boolean(report && (report.alasan_tidak_hadir || "").length >= 100)
        : true; // Tanpa keterangan doesn't require written report

  const wibToday = getWibDateString();

  return (
    <main className="flex-1 flex flex-col">
      {/* ─── Header ──────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 glass-panel border-b border-surface-200/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Logo */}
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center shadow-lg shadow-primary-200">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <h1 className="text-base font-bold text-surface-900 tracking-tight">
                Mobogen
              </h1>
              <p className="text-xs text-surface-500 hidden sm:block">
                Asisten Laporan Magang Kemnaker
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* Kemnaker Auth Status in Header */}
            {kemnakerToken ? (
              <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-green-50 border border-green-200 text-xs text-green-700">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className="font-medium max-w-[130px] truncate">
                  {kemnakerUser?.name || "Kemnaker Terhubung"}
                </span>
              </div>
            ) : null}

            {/* API Key Button */}
            <button
              onClick={() => setShowApiKeyModal(true)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 border cursor-pointer ${apiKey
                ? "bg-green-50 border-green-200 text-green-700 hover:bg-green-100"
                : "bg-surface-50 border-surface-200 text-surface-600 hover:bg-surface-100"
                }`}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
              <span className="hidden sm:inline">{apiKey ? "API Key Aktif" : "API Key"}</span>
            </button>

            {/* Date & Time */}
            <div className="hidden md:flex items-center gap-2 text-xs text-surface-500">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span>{currentDate}</span>
            </div>

            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-100/80 text-xs font-mono text-surface-600">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {currentTime} <span className="text-surface-400">WIB</span>
            </div>
          </div>
        </div>
      </header>

      {/* ─── Content ─────────────────────────────────────────────────────── */}
      <div className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* Top banner with date on mobile */}
        <div className="md:hidden mb-4 text-center">
          <p className="text-sm text-surface-500">{currentDate}</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* ─── Left Panel: Input ──────────────────────────────────────── */}
          <div className="lg:col-span-5 space-y-5 animate-fade-in">
            {/* Status Kehadiran (Updated to actual Monev Kemnaker options) */}
            <section className="bg-white rounded-2xl border border-surface-200 shadow-sm p-5 space-y-3">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold uppercase tracking-wider text-primary-600">
                  Kehadiran (Status Aktual Monev)
                </label>
                <span className="text-[10px] text-surface-400 font-mono">
                  monev.maganghub
                </span>
              </div>

              {/* Status options as stacked clear buttons */}
              <div className="space-y-2">
                {statusOptions.map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => handleStatusChange(opt.key)}
                    className={`w-full py-2.5 px-3.5 rounded-xl text-xs font-semibold border-2 transition-all duration-200 cursor-pointer flex items-center justify-between text-left ${status === opt.key
                      ? opt.activeClass
                      : "bg-white border-surface-200 text-surface-700 hover:border-surface-300 hover:bg-surface-50"
                      }`}
                  >
                    <span>{opt.label}</span>
                    {status === opt.key ? (
                      <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <span className="w-3.5 h-3.5 rounded-full border border-surface-300 shrink-0" />
                    )}
                  </button>
                ))}
              </div>

              {/* Kemnaker Official Rule Banner for Tidak Hadir Dengan Keterangan */}
              {status === "Tidak Hadir Dengan Keterangan" && (
                <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-start gap-2.5 animate-slide-up">
                  <svg className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                  <p className="leading-relaxed">
                    <strong>Ketentuan Monev:</strong> Izin hingga 3 hari per periode dibayar. Izin ke-4 dan seterusnya tidak dibayar, tetapi tidak dihitung untuk peringatan atau pemberhentian akibat ketidakhadiran.
                  </p>
                </div>
              )}
            </section>

            {/* Input Form based on Status */}
            {status === "Hadir" ? (
              <section className="bg-white rounded-2xl border border-surface-200 shadow-sm p-5 animate-fade-in">
                <label
                  htmlFor="aktivitas-input"
                  className="block text-xs font-bold uppercase tracking-wider text-primary-600 mb-1"
                >
                  Catatan Aktivitas Harian
                </label>
                <p className="text-[11px] text-surface-400 mb-2.5">
                  Tulis poin-poin singkat kegiatan hari ini. Tekan Enter untuk baris baru.
                </p>
                <textarea
                  id="aktivitas-input"
                  value={aktivitas}
                  onChange={(e) => setAktivitas(e.target.value)}
                  rows={7}
                  placeholder={`- briefing proyek X\n- setup database\n- diskusi dengan mentor tentang SDLC\n- tidak ada kesulitan/lancar saja hari ini`}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-surface-200 text-sm text-surface-800 bg-white placeholder:text-surface-400 resize-none focus:outline-none focus:ring-2 focus:ring-primary-400/40 focus:border-primary-400 hover:border-surface-300 transition-all duration-200 font-mono leading-relaxed"
                />
              </section>
            ) : status === "Tidak Hadir Dengan Keterangan" ? (
              <section className="bg-white rounded-2xl border border-surface-200 shadow-sm p-5 animate-fade-in">
                <label
                  htmlFor="izin-input"
                  className="block text-xs font-bold uppercase tracking-wider text-amber-600 mb-1"
                >
                  Catatan / Poin Alasan Tidak Hadir
                </label>
                <p className="text-[11px] text-surface-400 mb-2.5">
                  Tuliskan alasan izin/sakit secara singkat. AI akan menyusunkan narasi formal dan santun minimal 100 karakter.
                </p>
                <textarea
                  id="izin-input"
                  value={aktivitas}
                  onChange={(e) => setAktivitas(e.target.value)}
                  rows={6}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-surface-200 text-sm text-surface-800 bg-white placeholder:text-surface-400 resize-none focus:outline-none focus:ring-2 focus:ring-amber-400/40 focus:border-amber-400 hover:border-surface-300 transition-all duration-200 font-mono leading-relaxed"
                />
              </section>
            ) : (
              <section className="bg-white rounded-2xl border border-surface-200 shadow-sm p-5 animate-fade-in space-y-2">
                <div className="flex items-center gap-2 text-rose-600 text-xs font-bold uppercase tracking-wider">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Informasi Status Tanpa Keterangan
                </div>
                <p className="text-xs text-surface-600 leading-relaxed">
                  Status <strong>Tidak Hadir Tanpa Keterangan</strong> tidak memerlukan pengisian uraian aktivitas ataupun alasan laporan. Anda dapat langsung mencentang pernyataan peninjauan dan mengirim status ke server Monev.
                </p>
              </section>
            )}

            {/* Generate Button (only for Hadir & Tidak Hadir Dengan Keterangan) */}
            {status !== "Tidak Hadir Tanpa Keterangan" ? (
              <button
                id="generate-button"
                onClick={handleGenerate}
                disabled={loading || !aktivitas.trim()}
                className={`w-full px-4 py-3.5 rounded-2xl font-bold text-sm transition-all duration-300 cursor-pointer flex items-center justify-center gap-2 ${loading
                  ? "bg-surface-200 text-surface-400 cursor-wait"
                  : !aktivitas.trim()
                    ? "bg-surface-100 text-surface-400 cursor-not-allowed border border-surface-200"
                    : status === "Tidak Hadir Dengan Keterangan"
                      ? "bg-gradient-to-r from-amber-500 to-amber-600 text-white shadow-lg shadow-amber-200 hover:shadow-xl hover:shadow-amber-300 hover:-translate-y-0.5 active:translate-y-0 animate-pulse-glow"
                      : "bg-gradient-to-r from-primary-500 to-primary-600 text-white shadow-lg shadow-primary-200 hover:shadow-xl hover:shadow-primary-300 hover:-translate-y-0.5 active:translate-y-0 animate-pulse-glow"
                  }`}
              >
                {loading ? (
                  <>
                    <svg className="w-4 h-4 animate-spin shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    AI Sedang Menulis...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    {status === "Tidak Hadir Dengan Keterangan"
                      ? "Generate Alasan Tidak Hadir"
                      : "Generate Laporan Monev"}
                  </>
                )}
              </button>
            ) : null}

            {/* Error message */}
            {error && (
              <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2.5 animate-slide-up">
                <svg className="w-4 h-4 text-red-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <p className="font-semibold">Terjadi Kesalahan</p>
                  <p className="mt-0.5 text-red-600">{error}</p>
                </div>
              </div>
            )}
          </div>

          {/* ─── Right Panel: Preview & Kirim Otomatis ───────────────────── */}
          <div className="lg:col-span-7 flex flex-col space-y-5 animate-fade-in">
            {/* 1. Preview Card */}
            <div className="bg-white rounded-2xl border border-surface-200 shadow-sm overflow-hidden flex flex-col">
              {/* Preview Header */}
              <div className="px-5 py-4 border-b border-surface-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-primary-50 text-primary-600 flex items-center justify-center">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  </div>
                  <h2 className="text-sm font-bold text-surface-800">
                    Preview Laporan Monev
                  </h2>
                </div>

                <div className="flex items-center gap-2">
                  {allValid && report && (
                    <span className="px-2 py-1 rounded-full bg-green-50 text-green-700 text-[10px] font-bold border border-green-200 animate-bounce-in">
                      ✓ SIAP KIRIM
                    </span>
                  )}
                  {report && (
                    <button
                      onClick={handleCopyAll}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary-50 text-primary-700 border border-primary-200 hover:bg-primary-100 transition-all duration-200 cursor-pointer"
                    >
                      {copyAllDone ? (
                        <>
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          Tersalin!
                        </>
                      ) : (
                        <>
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                          Salin
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>

              {/* Preview Body */}
              <div className="flex-1 p-5 space-y-5">
                {status === "Tidak Hadir Tanpa Keterangan" ? (
                  // Tanpa keterangan view
                  <div className="flex flex-col items-center justify-center py-12 text-center space-y-3">
                    <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center">
                      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-surface-700 text-sm font-semibold">
                        Status: Tidak Hadir Tanpa Keterangan
                      </p>
                      <p className="text-surface-400 text-xs mt-1 max-w-sm">
                        Sesuai sistem Monev Kemnaker, status ini tidak memerlukan isian laporan harian. Silakan langsung verifikasi dan kirim pada panel di bawah.
                      </p>
                    </div>
                  </div>
                ) : !report && !loading ? (
                  // Empty state
                  <div className="flex flex-col items-center justify-center h-full py-16 text-center">
                    <div className="w-20 h-20 rounded-2xl bg-surface-100 flex items-center justify-center mb-4">
                      <svg className="w-10 h-10 text-surface-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <p className="text-surface-500 text-sm font-medium">Laporan akan muncul di sini</p>
                    <p className="text-surface-400 text-xs mt-1">
                      {status === "Tidak Hadir Dengan Keterangan"
                        ? "Isi catatan alasan tidak hadir lalu klik tombol Generate"
                        : "Isi catatan aktivitas harian lalu klik tombol Generate"}
                    </p>
                  </div>
                ) : loading ? (
                  // Loading skeleton
                  <div className="space-y-5">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="space-y-2" style={{ animationDelay: `${i * 0.1}s` }}>
                        <div className="h-4 w-32 shimmer rounded-md" />
                        <div className="h-24 shimmer rounded-xl" />
                      </div>
                    ))}
                  </div>
                ) : report ? (
                  status === "Tidak Hadir Dengan Keterangan" ? (
                    // Generated reason for Tidak Hadir Dengan Keterangan
                    <>
                      <ReportSection
                        title="Alasan Tidak Hadir"
                        colorClass="bg-amber-50 text-amber-600"
                        icon={
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                          </svg>
                        }
                        content={report.alasan_tidak_hadir || ""}
                        onEdit={(val) => setReport({ ...report, alasan_tidak_hadir: val })}
                        placeholder="Alasan tidak hadir minimal 100 karakter..."
                      />

                      {report.model && (
                        <div className="flex items-center justify-end gap-1.5 pt-2">
                          <span className="text-[10px] text-surface-400">Dibuat dengan</span>
                          <span className="px-2 py-0.5 rounded-full bg-surface-100 text-[10px] text-surface-500 font-mono">
                            {report.model}
                          </span>
                        </div>
                      )}
                    </>
                  ) : (
                    // Generated report for Hadir (3 parts)
                    <>
                      <ReportSection
                        title="Uraian Aktivitas"
                        colorClass="bg-blue-50 text-blue-600"
                        icon={
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        }
                        content={report.uraian_aktivitas || ""}
                        onEdit={(val) => setReport({ ...report, uraian_aktivitas: val })}
                      />
                      <ReportSection
                        title="Pembelajaran yang Diperoleh"
                        colorClass="bg-emerald-50 text-emerald-600"
                        icon={
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                          </svg>
                        }
                        content={report.pembelajaran || ""}
                        onEdit={(val) => setReport({ ...report, pembelajaran: val })}
                      />
                      <ReportSection
                        title="Kendala yang Dialami"
                        colorClass="bg-amber-50 text-amber-600"
                        icon={
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                          </svg>
                        }
                        content={report.kendala || ""}
                        onEdit={(val) => setReport({ ...report, kendala: val })}
                      />

                      {/* Model badge */}
                      {report.model && (
                        <div className="flex items-center justify-end gap-1.5 pt-2">
                          <span className="text-[10px] text-surface-400">
                            Dibuat dengan
                          </span>
                          <span className="px-2 py-0.5 rounded-full bg-surface-100 text-[10px] text-surface-500 font-mono">
                            {report.model}
                          </span>
                        </div>
                      )}
                    </>
                  )
                ) : null}
              </div>
            </div>

            {/* 2. Kirim Otomatis ke Monev Card (Fase 2) */}
            <div className="bg-white rounded-2xl border border-surface-200 shadow-sm p-5 space-y-4">
              {/* Header section */}
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-accent-50 text-accent-600 flex items-center justify-center shrink-0">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-sm font-bold text-surface-800">
                      Kirim Otomatis ke Monev
                    </h2>
                    <p className="text-[11px] text-surface-400">
                      Sinkronisasi langsung ke portal monev.maganghub.kemnaker.go.id
                    </p>
                  </div>
                </div>

                {/* Account badge */}
                <div className="shrink-0">
                  {kemnakerToken ? (
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9.5px] sm:text-[11px] font-bold bg-green-50 text-green-700 border border-green-200 whitespace-nowrap">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                        TERHUBUNG
                      </span>
                      <button
                        onClick={handleKemnakerLogout}
                        title="Keluar dari akun Kemnaker"
                        className="text-xs text-surface-400 hover:text-red-500 hover:underline transition-colors cursor-pointer"
                      >
                        Keluar
                      </button>
                    </div>
                  ) : (
                    <span className="inline-flex flex-col sm:flex-row items-center justify-center px-2.5 py-1 rounded-2xl sm:rounded-full text-[9px] sm:text-[11px] font-medium bg-surface-100 text-surface-500 border border-surface-200 text-center leading-tight">
                      <span>BELUM</span>
                      <span className="sm:ml-1">LOGIN</span>
                    </span>
                  )}
                </div>
              </div>

              {/* Status & Information Box */}
              <div className="p-3.5 rounded-xl bg-surface-50 border border-surface-200/80 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-surface-500 flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5 text-surface-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    Tanggal Absensi:
                  </span>
                  <span className="font-semibold text-surface-800 font-mono">
                    {wibToday}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-surface-500 flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5 text-surface-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Kehadiran:
                  </span>
                  <span className="font-semibold text-surface-800">
                    {status} {kemnakerUser?.name ? `· ${kemnakerUser.name}` : ""}
                  </span>
                </div>

                <div className="flex items-start justify-between text-[11px] text-surface-400 pt-1 border-t border-surface-200/50">
                  <span className="flex items-center gap-1">
                    <svg className="w-3 h-3 text-surface-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Waktu Server: {currentTime} WIB (GMT+7)
                  </span>
                </div>
              </div>

              {/* Confirmation Checkbox (matching actual Monev Kemnaker form) */}
              <div className="pt-1">
                <label className="flex items-start gap-2.5 p-2 rounded-xl hover:bg-surface-50 cursor-pointer select-none transition-colors border border-transparent hover:border-surface-200">
                  <input
                    type="checkbox"
                    checked={isConfirmed}
                    onChange={(e) => setIsConfirmed(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded border-surface-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
                  />
                  <span className="text-xs text-surface-700 leading-snug">
                    Saya menyatakan telah meninjau dan memastikan isian laporan ini sudah benar
                  </span>
                </label>
              </div>

              {/* Validation warning if fields under 100 chars */}
              {report && !allValid && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-start gap-2 animate-fade-in">
                  <svg className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                  <p>
                    <strong>Perhatian:</strong> Sistem Monev mensyaratkan setiap isian minimal 100 karakter. Lengkapi catatan pada kotak di atas sebelum mengirim.
                  </p>
                </div>
              )}

              {/* Submit result feedback */}
              {submitResult && (
                <div
                  className={`p-3.5 rounded-xl border text-xs flex items-start gap-2.5 animate-slide-up ${submitResult.ok
                    ? "bg-green-50 border-green-200 text-green-800"
                    : "bg-red-50 border-red-200 text-red-800"
                    }`}
                >
                  {submitResult.ok ? (
                    <svg className="w-4 h-4 text-green-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4 text-red-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  )}
                  <p className="leading-relaxed">{submitResult.msg}</p>
                </div>
              )}

              {/* Action Button */}
              <div className="space-y-1.5">
                <button
                  onClick={handleSubmitToMonev}
                  disabled={
                    submitLoading ||
                    (Boolean(kemnakerToken) && (!isConfirmed || (status !== "Tidak Hadir Tanpa Keterangan" && !report)))
                  }
                  className={`w-full px-4 py-3.5 rounded-xl font-bold text-sm transition-all duration-200 flex items-center justify-center cursor-pointer ${!kemnakerToken
                    ? "bg-surface-800 hover:bg-surface-900 text-white shadow-md"
                    : submitLoading
                      ? "bg-surface-200 text-surface-400 cursor-wait"
                      : !isConfirmed || (status !== "Tidak Hadir Tanpa Keterangan" && !report)
                        ? "bg-surface-100 text-surface-400 cursor-not-allowed border border-surface-200"
                        : "bg-gradient-to-r from-accent-600 to-primary-600 hover:from-accent-700 hover:to-primary-700 text-white shadow-lg shadow-accent-200"
                    }`}
                >
                  {submitLoading ? (
                    <span className="text-center leading-snug">
                      <span className="inline-flex items-center gap-2 align-middle">
                        <svg className="w-4 h-4 animate-spin shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        <span>Mengirim</span>
                      </span>{" "}
                      ke Monev Kemnaker...
                    </span>
                  ) : !kemnakerToken ? (
                    <span className="text-center leading-snug">
                      <span className="inline-flex items-center gap-2 align-middle">
                        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                        </svg>
                        <span>Hubungkan</span>
                      </span>{" "}
                      Akun Kemnaker untuk Mengirim
                    </span>
                  ) : (
                    <span className="text-center leading-snug">
                      <span className="inline-flex items-center gap-2 align-middle">
                        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                        </svg>
                        <span>Simpan</span>
                      </span>{" "}
                      dan Kirim ke Monev
                    </span>
                  )}
                </button>

                {kemnakerToken && !isConfirmed && (
                  <p className="text-center text-[11px] text-amber-600">
                    Centang pernyataan di atas untuk mengaktifkan tombol kirim.
                  </p>
                )}
                {kemnakerToken && isConfirmed && status !== "Tidak Hadir Tanpa Keterangan" && !report && (
                  <p className="text-center text-[11px] text-surface-400">
                    Generate laporan terlebih dahulu sebelum mengirim ke Monev.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Footer ──────────────────────────────────────────────────────── */}
      <footer className="border-t border-surface-200/60 py-4">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 text-center">
          <p className="text-xs text-surface-400">
            Mobogen &middot; Alat bantu pelaporan harian MagangHub Kemnaker
          </p>
        </div>
      </footer>

      {/* ─── API Key Modal ────────────────────────────────────────────── */}
      {showApiKeyModal && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/25 backdrop-blur-sm animate-fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowApiKeyModal(false);
          }}
        >
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-surface-200 p-6 animate-scale-in">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-surface-800">
                Pengaturan API Key
              </h3>
              <button
                onClick={() => setShowApiKeyModal(false)}
                className="p-1 rounded-lg hover:bg-surface-100 transition-colors cursor-pointer"
              >
                <svg className="w-5 h-5 text-surface-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <p className="text-sm text-surface-500 mb-4">
              Masukkan API Key Google Gemini Anda. Key tersimpan di browser dan tidak dikirim ke server manapun selain Google.
            </p>

            <div className="space-y-3">
              <input
                type="password"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder="AIzaSy..."
                className="w-full px-3.5 py-2.5 rounded-xl border border-surface-200 text-sm text-surface-800 bg-white placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-primary-400/40 focus:border-primary-400 font-mono"
              />
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-accent-600 hover:text-accent-700 transition-colors"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                Dapatkan API Key di Google AI Studio
              </a>
            </div>

            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setShowApiKeyModal(false)}
                className="flex-1 py-2.5 rounded-xl border border-surface-200 text-sm font-medium text-surface-600 hover:bg-surface-50 transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                onClick={handleSaveApiKey}
                className="flex-1 py-2.5 rounded-xl bg-primary-500 text-white text-sm font-bold hover:bg-primary-600 transition-colors cursor-pointer"
              >
                Simpan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Kemnaker Login Modal (Fase 2) ────────────────────────────── */}
      {showKemnakerModal && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/35 backdrop-blur-sm animate-fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget && !kemnakerLoginLoading) {
              setShowKemnakerModal(false);
            }
          }}
        >
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-surface-200 p-6 animate-scale-in">
            {/* Modal Header */}
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-accent-50 text-accent-600 flex items-center justify-center border border-accent-100">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-base font-bold text-surface-800">
                    Masuk Akun Kemnaker
                  </h3>
                  <p className="text-xs text-surface-400">
                    SIAPkerja ID &middot; MagangHub
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowKemnakerModal(false)}
                disabled={kemnakerLoginLoading}
                className="p-1 rounded-lg hover:bg-surface-100 transition-colors text-surface-400 cursor-pointer disabled:opacity-30"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <p className="text-xs text-surface-500 mb-4 leading-relaxed">
              Login menggunakan akun SIAPkerja untuk memungkinkan Mobogen mengirim presensi dan laporan Monev langsung ke portal Kemnaker.
            </p>

            <form onSubmit={handleKemnakerLogin} className="space-y-3.5">
              {/* Username Input */}
              <div>
                <label className="block text-xs font-semibold text-surface-700 mb-1">
                  Email / Nomor HP / NIK
                </label>
                <input
                  type="text"
                  value={kemnakerUsername}
                  onChange={(e) => setKemnakerUsername(e.target.value)}
                  placeholder="contoh@email.com atau 0812xxxxxxxx"
                  disabled={kemnakerLoginLoading}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-surface-200 text-sm text-surface-800 bg-white placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-primary-400/40 focus:border-primary-400"
                />
              </div>

              {/* Password Input */}
              <div>
                <label className="block text-xs font-semibold text-surface-700 mb-1">
                  Kata Sandi (Password)
                </label>
                <div className="relative">
                  <input
                    type={showKemnakerPassword ? "text" : "password"}
                    value={kemnakerPassword}
                    onChange={(e) => setKemnakerPassword(e.target.value)}
                    placeholder="••••••••"
                    disabled={kemnakerLoginLoading}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-surface-200 text-sm text-surface-800 bg-white placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-primary-400/40 focus:border-primary-400 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKemnakerPassword(!showKemnakerPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-600 cursor-pointer"
                  >
                    {showKemnakerPassword ? (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {/* Security statement box */}
              <div className="p-3 rounded-xl bg-surface-50 border border-surface-200/70 text-[11px] text-surface-500 flex items-start gap-2">
                <svg className="w-4 h-4 text-accent-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                <span>
                  Kredensial Anda aman dan hanya diproses langsung untuk mendapatkan sesi otorisasi ke server Kemnaker.
                </span>
              </div>

              {/* Error message */}
              {kemnakerLoginError && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-start gap-2">
                  <svg className="w-4 h-4 text-red-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p>{kemnakerLoginError}</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowKemnakerModal(false)}
                  disabled={kemnakerLoginLoading}
                  className="flex-1 py-2.5 rounded-xl border border-surface-200 text-sm font-medium text-surface-600 hover:bg-surface-50 transition-colors cursor-pointer disabled:opacity-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={kemnakerLoginLoading || !kemnakerUsername.trim() || !kemnakerPassword}
                  className="flex-1 py-2.5 rounded-xl bg-accent-600 text-white text-sm font-bold hover:bg-accent-700 transition-colors cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {kemnakerLoginLoading ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      Menghubungkan...
                    </>
                  ) : (
                    "Masuk & Hubungkan"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
