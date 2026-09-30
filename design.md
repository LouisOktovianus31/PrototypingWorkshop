# design.md — Anti-UI Drift Tokens

Dokumen ini adalah sumber kebenaran tunggal untuk seluruh keputusan visual: warna, spacing, tipografi, radius, shadow, dan state komponen. Tujuannya mencegah "UI drift" — implementasi yang menyimpang dari komponen ke komponen karena setiap orang (atau AI) menebak style sendiri-sendiri.

**Aturan dasar:** jika sebuah nilai visual tidak tercantum di sini, JANGAN dikarang. Tambahkan ke dokumen ini dulu, baru dipakai di kode.

- **Base:** Tailwind CSS (token di bawah = konfigurasi `tailwind.config` + custom CSS variables)
- **Mode:** Dark mode sebagai default. Dashboard ini dipakai tengah malam saat campaign berjalan — dark background mengurangi silau dan membuat warna urgency (merah/kuning/hijau) lebih kontras dan cepat dibaca.
- **Target utama:** Mobile viewport (375–430px). Desktop mengikuti skala yang sama dengan breakpoint tambahan, bukan redesain terpisah.
- **Prinsip visual:** Kontras tinggi, warna urgency yang tegas (bukan gradasi tipis), area tap besar untuk penggunaan satu tangan/thumb.

---

## 1. Color Palette

### 1.1 Base / Neutral (Dark Mode)
| Token | Hex | Penggunaan |
|---|---|---|
| `bg-base` | `#0B0F14` | Background utama layar |
| `bg-surface` | `#141A21` | Background card/komponen (elevasi 1) |
| `bg-surface-raised` | `#1C242D` | Background card yang di-highlight/aktif (elevasi 2) |
| `border-subtle` | `#2A333D` | Border antar card, divider |
| `text-primary` | `#F5F7FA` | Teks utama, judul SKU |
| `text-secondary` | `#9AA5B1` | Teks sekunder, label, metadata |
| `text-disabled` | `#5A6472` | Teks nonaktif, placeholder |

### 1.2 Urgency / Status (Badge Colors)
Warna ini WAJIB konsisten di semua tempat — badge, border card, ikon, teks status. Tidak ada gradasi custom di luar ini.

| Status | Token | Hex (fill) | Hex (text on fill) | Hex (subtle bg) | Penggunaan |
|---|---|---|---|---|---|
| 🔴 Kritis | `status-critical` | `#E5484D` | `#FFFFFF` | `#3A1618` | Stock < 6 jam, dan/atau margin negatif signifikan |
| 🟡 Waspada | `status-warning` | `#F5A623` | `#1A1400` | `#3A2A0A` | Stock 6–24 jam, margin menipis |
| 🟢 Aman | `status-safe` | `#2ECC71` | `#062012` | `#122A1C` | Stock cukup, margin sehat |
| 🔵 Info | `status-info` | `#4A9EFF` | `#FFFFFF` | `#122436` | Notifikasi netral, tips, info budget |

### 1.3 Brand Accent
Karena tidak ada brand guideline existing, dipakai satu accent color netral untuk elemen interaktif (tombol, link, focus ring) yang tidak konflik dengan warna urgency.

| Token | Hex | Penggunaan |
|---|---|---|
| `accent-primary` | `#6C63FF` | Primary button, active tab, focus ring |
| `accent-primary-hover` | `#8079FF` | Hover/pressed state primary button |

---

## 2. Typography

Font: `Inter` (fallback: `-apple-system, sans-serif`). Dipilih karena keterbacaan tinggi di ukuran kecil — penting untuk mobile dan kondisi baca cepat/lelah.

| Token | Size (mobile) | Weight | Line-height | Penggunaan |
|---|---|---|---|---|
| `text-display` | 24px | 700 (Bold) | 1.3 | Judul layar ("Action Radar") |
| `text-heading` | 18px | 600 (Semibold) | 1.4 | Nama SKU, judul card |
| `text-body` | 14px | 400 (Regular) | 1.5 | Deskripsi, rekomendasi tindakan |
| `text-body-strong` | 14px | 600 (Semibold) | 1.5 | Angka penting (Rp, jam tersisa) |
| `text-caption` | 12px | 400 (Regular) | 1.4 | Metadata, timestamp, label kecil |
| `text-badge` | 11px | 700 (Bold), uppercase, letter-spacing 0.03em | 1 | Teks di dalam badge status |

---

## 3. Spacing Scale

Skala 4px base, konsisten dengan Tailwind default (`p-1` = 4px, dst). Tidak ada nilai custom di luar skala ini.

| Token | Value | Penggunaan |
|---|---|---|
| `space-1` | 4px | Gap antar ikon dan teks kecil |
| `space-2` | 8px | Padding internal badge, gap antar elemen inline |
| `space-3` | 12px | Padding internal card (mobile) |
| `space-4` | 16px | Margin antar card, padding layar (horizontal) |
| `space-6` | 24px | Gap antar section |
| `space-8` | 32px | Margin atas/bawah section utama |

---

## 4. Border Radius & Shadow

| Token | Value | Penggunaan |
|---|---|---|
| `radius-sm` | 6px | Badge, chip |
| `radius-md` | 12px | Card SKU, input field |
| `radius-lg` | 16px | Modal, bottom sheet |
| `radius-full` | 9999px | Avatar, dot indicator |
| `shadow-card` | `0 2px 8px rgba(0,0,0,0.24)` | Elevasi card di atas background dark |
| `shadow-toast` | `0 4px 16px rgba(0,0,0,0.4)` | Toast notification (elevasi tertinggi) |

---

## 5. Component Tokens

### 5.1 Badge Status
```
padding: space-2 (8px) horizontal, 4px vertical
border-radius: radius-sm (6px)
font: text-badge
background: [status]-subtle-bg
text-color: [status] fill color (bukan text-on-fill, agar tetap terbaca di subtle bg)
icon: 12px, di kiri teks, warna sama dengan teks
```

### 5.2 Card SKU (list item utama)
```
padding: space-3 (12px) mobile / space-4 (16px) desktop
border-radius: radius-md (12px)
background: bg-surface
border-left: 3px solid [status color] — indikator urgency tanpa perlu baca teks
shadow: shadow-card
margin-bottom: space-2 (8px) antar card
```
Isi card (top to bottom): Badge status → Nama SKU (`text-heading`) → Baris metrik (Runrate, Under COGS) dalam `text-body-strong` → Rekomendasi tindakan (`text-body`, warna `text-secondary`).

### 5.3 Button
| Variant | Background | Text | Padding | Penggunaan |
|---|---|---|---|---|
| Primary | `accent-primary` | `#FFFFFF` | 12px vertical, 20px horizontal | Aksi utama (mis. "Set Budget Campaign") |
| Secondary | transparent, border `border-subtle` | `text-primary` | 12px vertical, 20px horizontal | Aksi sekunder (mis. "Lihat Detail") |
| Ghost/Icon | transparent | `text-secondary` | 8px (square, min 44x44px tap area) | Dismiss, close, icon-only action |

Semua button: `border-radius: radius-md`, min-height 44px (thumb-friendly tap target).

### 5.4 Toast Notification
```
position: fixed, bottom (mobile) — di atas thumb zone, tidak menutupi navigasi utama
background: bg-surface-raised
border-left: 3px solid status-critical (atau status sesuai jenis alert)
border-radius: radius-lg
shadow: shadow-toast
padding: space-4 (16px)
auto-dismiss: 6 detik, dengan tombol dismiss manual (ghost icon button, 44x44px)
max-width: 92vw (mobile), tidak pernah full-bleed edge-to-edge
```

### 5.5 Empty State
```
icon/illustration: 64px, warna text-disabled
heading: text-heading, "Belum ada campaign aktif"
body: text-body, text-secondary
CTA: Primary button, centered
padding vertikal: space-8 (32px) atas dan bawah
```

### 5.6 Loading State (Skeleton)
```
background skeleton block: bg-surface-raised
animation: pulse, 1.5s ease-in-out infinite
shape: mengikuti bentuk card SKU (radius-md, height sama dengan card asli)
jumlah skeleton ditampilkan: 3 card
```

### 5.7 Input Field (Budget Campaign form)
```
background: bg-surface
border: 1px solid border-subtle
border-radius: radius-md
padding: space-3 (12px)
focus-ring: 2px solid accent-primary
text: text-body-strong (karena isinya nominal Rp, perlu tegas terbaca)
min-height: 44px
```

---

## 6. Iconography

- Set ikon: [Lucide](https://lucide.dev) (outline style, konsisten stroke-width 2px) — dipilih karena open-source, ringan, dan punya coverage lengkap untuk ikon status/aksi.
- Ukuran standar: 16px (inline dengan teks), 20px (dalam button), 24px (standalone/navigasi).
- Warna ikon selalu mengikuti warna teks di kontennya, kecuali ikon status (mengikuti warna urgency token di atas).

---

## 7. Motion

Minimal dan fungsional — bukan dekoratif. Konteks penggunaan adalah situasi genting, animasi tidak boleh memperlambat pembacaan informasi.

| Token | Value | Penggunaan |
|---|---|---|
| `transition-fast` | 120ms ease-out | Hover, tap feedback |
| `transition-base` | 200ms ease-out | Toast masuk/keluar, badge status berubah |
| `transition-skeleton` | 1.5s ease-in-out infinite | Loading pulse |

Tidak ada animasi bounce, elastic, atau decorative motion lain di luar yang tercantum.

---

## 8. Checklist Anti-Drift

Sebelum menambah komponen baru atau style baru, cek:
- [ ] Warna yang dipakai ada di Section 1? Jika tidak ada, tambahkan ke dokumen ini dulu — jangan pakai hex baru langsung di kode.
- [ ] Spacing mengikuti skala di Section 3 (multiples of 4px)?
- [ ] Radius mengikuti Section 4 (sm/md/lg/full saja, tidak ada nilai custom)?
- [ ] Tap target tombol/ikon minimal 44x44px?
- [ ] Warna status (merah/kuning/hijau/biru) hanya dipakai sesuai makna di Section 1.2 — tidak dipakai untuk dekorasi.
