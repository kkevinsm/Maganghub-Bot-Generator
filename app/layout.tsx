import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
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
      className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-gradient-to-br from-surface-50 via-white to-primary-50/30 font-[family-name:var(--font-inter)]">
        {children}
      </body>
    </html>
  );
}
