/**
 * Role-based Smart Suggestions Database untuk Mobogen Telegram Bot
 * Memberikan inspirasi poin aktivitas harian sesuai posisi magang peserta
 */

export interface RoleInfo {
  id: string;
  name: string;
  icon: string;
  suggestions: string[];
}

export const ROLES: Record<string, RoleInfo> = {
  frontend: {
    id: "frontend",
    name: "Frontend Developer",
    icon: "💻",
    suggestions: [
      "Slicing UI dashboard interaktif, integrasi state management, dan optimasi responsivitas mobile",
      "Refactoring komponen reusable, perbaikan styling komponen web, dan penanganan bug navigasi",
      "Integrasi REST API ke form frontend, implementasi validasi input, dan error handling",
      "Optimasi performa rendering halaman web dan perbaikan accessibility tampilan antarmuka",
    ],
  },
  backend: {
    id: "backend",
    name: "Backend Developer",
    icon: "⚙️",
    suggestions: [
      "Pengembangan RESTful API endpoint, validasi request payload, dan optimasi skema database",
      "Implementasi alur autentikasi/otorisasi token, pembuatan middleware, dan error handling server",
      "Unit testing endpoint API, penulisan dokumentasi API, dan fixing issue koneksi database",
      "Optimasi query SQL database, refactoring service layer, dan integrasi webhook layanan eksternal",
    ],
  },
  uiux: {
    id: "uiux",
    name: "UI/UX Designer",
    icon: "🎨",
    suggestions: [
      "Pembuatan wireframe & high-fidelity prototype di Figma untuk alur fitur baru aplikasi",
      "Melakukan evaluasi user flow, riset benchmark kompetitor, dan analisis feedback user testing",
      "Penyusunan komponen Design System (komponen tombol, warna, typography) dan design handover ke developer",
      "Eksplorasi layout antarmuka mobile, perbaikan mikro-interaksi, dan dokumentasi guideline desain",
    ],
  },
  data: {
    id: "data",
    name: "Data Analyst / AI",
    icon: "📊",
    suggestions: [
      "Pembersihan dan eksplorasi dataset (EDA) menggunakan SQL/Python serta visualisasi grafik tren",
      "Pembuatan dashboard monitoring metrik performa bisnis dan penyusunan ringkasan insight data",
      "Penulisan query database agregasi berkala dan validasi kualitas kebersihan data",
      "Eksplorasi eksperimen model prediktif dan evaluasi metrik akurasi output data",
    ],
  },
  pm_qa: {
    id: "pm_qa",
    name: "Product Management / QA",
    icon: "📋",
    suggestions: [
      "Penyusunan User Stories & acceptance criteria backlog sprint bersama tim pengembang",
      "Melakukan manual testing skenario fitur baru, mencatat laporan bug/issue, dan validasi fungsional",
      "Analisis kebutuhan pengguna, review hasil testing sprint, dan penyusunan laporan progres fitur",
      "Koordinasi sinkronisasi timeline tugas harian dan persiapan demo fitur mingguan",
    ],
  },
  marketing: {
    id: "marketing",
    name: "Digital Marketing & Content",
    icon: "🚀",
    suggestions: [
      "Penyusunan content plan mingguan untuk media sosial dan riset tren topik terkini",
      "Copywriting materi publikasi, analisis performa engagement konten, dan riset kata kunci SEO",
      "Monitoring metrik campaign promosi dan penyusunan laporan evaluasi interaksi audiens",
      "Eksplorasi materi visual promosi dan evaluasi strategi distribusi channel media",
    ],
  },
  hr: {
    id: "hr",
    name: "HR & People Development",
    icon: "👥",
    suggestions: [
      "Screening CV kandidat, koordinasi jadwal sesi interview, dan updating database talent pool",
      "Penyusunan materi program orientasi peserta magang baru dan rekapitulasi data kehadiran",
      "Membantu persiapan kegiatan employee engagement internal dan evaluasi survei kepuasan tim",
      "Penyusunan modul pembelajaran pelatihan kompetensi internal dan dokumentasi administrasi HR",
    ],
  },
  general: {
    id: "general",
    name: "Umum / Divisi Lainnya",
    icon: "✨",
    suggestions: [
      "Koordinasi tugas harian dengan mentor, penyelesaian dokumentasi proyek, dan evaluasi hasil kerja",
      "Riset materi referensi pendukung pekerjaan, penyusunan laporan progres harian, dan diskusi tim",
      "Penyelesaian penugasan harian divisi, meeting evaluasi berkala, dan perapian catatan kerja",
      "Mengikuti sesi sharing session internal tim dan menyusun ringkasan pembelajaran teknis",
    ],
  },
};

export function getRoleSuggestions(roleId?: string): { roleName: string; suggestions: string[] } {
  const role = ROLES[roleId || "general"] || ROLES.general;
  return {
    roleName: `${role.icon} ${role.name}`,
    suggestions: role.suggestions,
  };
}
