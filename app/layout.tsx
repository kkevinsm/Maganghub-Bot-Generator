import type { Metadata } from "next";
import { Poppins, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Mobogen — Asisten Laporan Magang Kemnaker",
  description:
    "Mobogen - Generator otomatis laporan harian Monev MagangHub Kemnaker menggunakan AI. Buat uraian aktivitas, pembelajaran, dan kendala dalam hitungan detik.",
  keywords: [
    "monev",
    "maganghub",
    "kemnaker",
    "laporan magang",
    "generator",
    "AI",
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="id"
      className={`${poppins.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-gradient-to-br from-surface-50 via-white to-primary-50/30 font-[family-name:var(--font-poppins)]">
        {children}
      </body>
    </html>
  );
}
