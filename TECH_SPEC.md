# TECH_SPEC.md — Data & Logic

Dokumen ini adalah sumber kebenaran untuk struktur data dan logika kalkulasi Action Radar. Referensi silang: `PRODUCT_SPEC.md` (Section 2, definisi data point) dan `design.md` (token visual untuk badge status yang dihasilkan logika ini).

---

## 1. Strict Edge Boundaries

Batasan ini tidak bisa dilanggar tanpa merevisi PRODUCT_SPEC.md terlebih dahulu:

- **No auth.** Tidak ada login, session, role, atau permission check. Prototype ini single-user context (Fiona), tidak butuh multi-tenant.
- **No DB.** Tidak ada database, tidak ada persistence layer, tidak ada network call ke backend. Semua data berasal dari `sample_data.json` yang di-load sebagai static asset saat aplikasi start.
- **No live API integration** ke Shopee/TikTok/Tokopedia — sudah dinyatakan di PRODUCT_SPEC.md Section 6 (Out of Scope).
- **No write-back.** Aplikasi ini read-only terhadap data SKU. Input manual satu-satunya yang diterima adalah `budgetCampaign` (disimpan di memory/state lokal selama sesi berjalan, tidak dipersist).
- Konsekuensi teknis: semua logika di bawah adalah **pure functions** — menerima data, mengembalikan hasil kalkulasi, tanpa side effect ke luar (tidak fetch, tidak nulis file, tidak network).

---

## 2. TypeScript Interfaces

### 2.1 Data Mentah (bentuk `sample_data.json`)

```typescript
interface StockLocation {
  lokasi: string;
  sisaStock: number; // bisa negatif — lihat Section 4.1 (edge case oversell)
}

interface SkuRaw {
  sku: string;
  namaProduk: string;
  brand: string;
  subKategori: string;
  cogsPerUnit: number; // Rp, selalu > 0
  stockGudang: StockLocation[];
  qtyTerjualCampaignBerjalan: number; // total qty terjual, gabungan semua platform, SEJAK campaign mulai (real-time)
  revenueNetCampaignBerjalan: number; // Rp, revenue net SEBELUM fee platform, sejak campaign mulai
  cogsCampaignBerjalan: number; // Rp, = qtyTerjualCampaignBerjalan * cogsPerUnit (biasanya)
  note?: string; // catatan konteks, tidak dipakai di UI produksi — hanya dokumentasi sample data
}

interface CampaignRaw {
  id: string;
  name: string;
  startDate: string; // ISO 8601
  endDate: string; // ISO 8601
  budgetCampaign: number; // Rp, input manual dari Fiona — 0 atau tidak ada = Empty State
  campaignElapsedHours: number; // jumlah jam sejak campaign mulai berjalan — basis runrate real-time
}

interface SampleData {
  campaign: CampaignRaw;
  skus: SkuRaw[];
}
```

### 2.2 Hasil Kalkulasi (bentuk yang dikonsumsi UI)

```typescript
type UrgencyStatus = "KRITIS" | "WASPADA" | "AMAN";

interface SkuMetrics {
  sku: string;
  namaProduk: string;
  brand: string;

  // Runrate & runway
  totalSisaStock: number; // sum semua lokasi gudang, BISA NEGATIF (oversell)
  runratePerJam: number; // unit/jam, >= 0, lihat Section 3.1
  jamSampaiHabis: number | null; // null = Infinity (runrate 0, tidak akan pernah habis dari sisi kecepatan jual)
  isOversold: boolean; // true jika totalSisaStock < 0

  // Under COGS
  underCogs: number; // Rp, = revenueNetCampaignBerjalan - cogsCampaignBerjalan. Negatif = rugi.
  isBelowCogs: boolean; // true jika underCogs < 0

  // Status gabungan
  stockStatus: UrgencyStatus;
  marginStatus: UrgencyStatus;
  overallStatus: UrgencyStatus; // status TERBURUK dari stockStatus dan marginStatus (lihat Section 3.4)

  // Rekomendasi (rule-based, teks statis)
  recommendation: string;
}

interface BudgetSafeMetrics {
  budgetCampaign: number;
  akumulasiUnderCogs: number; // total underCogs negatif dari seluruh SKU (hanya yang isBelowCogs true), dijumlahkan sebagai nilai kerugian absolut
  budgetSafe: number; // = budgetCampaign - akumulasiUnderCogs
  budgetSafePercentage: number; // budgetSafe / budgetCampaign, dalam desimal (0.1 = 10%)
  budgetStatus: UrgencyStatus;
}

interface ActionRadarViewModel {
  campaignName: string;
  budgetSafe: BudgetSafeMetrics;
  skuList: SkuMetrics[]; // sudah terurut sesuai Section 3.5 (Prioritized Action Score)
  hasData: boolean; // false jika skus kosong ATAU budgetCampaign <= 0 → trigger Empty State
}
```

---

## 3. Runway Math & Threshold Alert Rules

### 3.1 Runrate per Jam

Dihitung dari kecepatan penjualan **real-time selama campaign berjalan** (`campaignElapsedHours`), bukan rata-rata historis 30 hari biasa. Ini penting: lonjakan order saat Double-Day Mega Campaign jauh lebih cepat dari hari normal — memakai basis historis 30 hari akan membuat semua SKU tampak "aman" secara keliru dan gagal mendeteksi urgency yang sebenarnya terjadi malam itu.

```typescript
function calculateRunratePerJam(qtyTerjualCampaignBerjalan: number, campaignElapsedHours: number): number {
  if (campaignElapsedHours <= 0) return 0; // guard: elapsed hours harus > 0, default ke 0 jika data rusak (mis. campaign belum mulai)
  return qtyTerjualCampaignBerjalan / campaignElapsedHours;
}
```

### 3.2 Jam Sampai Habis (Runway)

**Ini adalah titik zero-division paling kritis di seluruh sistem.** Lihat `learnings.md` untuk detail insiden dan aturan pencegahan.

```typescript
function calculateJamSampaiHabis(totalSisaStock: number, runratePerJam: number): number | null {
  // Edge case 1: sudah oversold, stock sudah negatif — SKU ini KRITIS MUTLAK,
  // konsep "jam sampai habis" tidak relevan lagi karena sudah habis (dan lebih).
  if (totalSisaStock <= 0) return 0;

  // Edge case 2: runrate 0 (tidak ada penjualan sama sekali dalam periode).
  // JANGAN divide by zero. Runway dianggap "tidak terbatas" (aman dari sisi stock).
  if (runratePerJam <= 0) return null; // null direpresentasikan sebagai "Infinity" / "AMAN" di UI, BUKAN error

  return totalSisaStock / runratePerJam;
}
```

### 3.3 Threshold Alert — Stock Status

```typescript
function getStockStatus(jamSampaiHabis: number | null, isOversold: boolean): UrgencyStatus {
  if (isOversold) return "KRITIS"; // oversell selalu KRITIS, tidak ada pengecualian
  if (jamSampaiHabis === null) return "AMAN"; // runrate 0 = tidak ada urgency stock
  if (jamSampaiHabis < 6) return "KRITIS";
  if (jamSampaiHabis < 24) return "WASPADA";
  return "AMAN";
}
```

### 3.4 Threshold Alert — Margin Status & Overall Status

```typescript
function getMarginStatus(underCogs: number, cogsPerUnit: number, qty: number): UrgencyStatus {
  if (underCogs < 0) return "KRITIS"; // rugi aktual = kritis, tidak ada gradasi
  const totalCogs = cogsPerUnit * qty;
  if (totalCogs <= 0) return "AMAN"; // guard: tidak ada basis pembagi, anggap aman (tidak ada transaksi)
  const marginPercentage = underCogs / totalCogs;
  if (marginPercentage < 0.1) return "WASPADA"; // margin < 10% dari COGS dianggap menipis
  return "AMAN";
}

const STATUS_SEVERITY: Record<UrgencyStatus, number> = {
  KRITIS: 2,
  WASPADA: 1,
  AMAN: 0,
};

function getOverallStatus(stockStatus: UrgencyStatus, marginStatus: UrgencyStatus): UrgencyStatus {
  // Overall status = yang paling parah di antara dua, sesuai PRODUCT_SPEC.md Section 2.4
  return STATUS_SEVERITY[stockStatus] >= STATUS_SEVERITY[marginStatus] ? stockStatus : marginStatus;
}
```

### 3.5 Prioritized Action Score (Sorting)

```typescript
function sortByPriority(list: SkuMetrics[]): SkuMetrics[] {
  return [...list].sort((a, b) => {
    // 1. Overall status severity, tertinggi dulu
    const severityDiff = STATUS_SEVERITY[b.overallStatus] - STATUS_SEVERITY[a.overallStatus];
    if (severityDiff !== 0) return severityDiff;

    // 2. Jika severity sama, SKU dengan KEDUA kondisi kritis (stock DAN margin) naik lebih dulu
    const aBothCritical = a.stockStatus === "KRITIS" && a.marginStatus === "KRITIS" ? 1 : 0;
    const bBothCritical = b.stockStatus === "KRITIS" && b.marginStatus === "KRITIS" ? 1 : 0;
    if (bBothCritical !== aBothCritical) return bBothCritical - aBothCritical;

    // 3. Tie-breaker: jamSampaiHabis lebih kecil (lebih urgent) naik dulu. null (Infinity) selalu di bawah.
    const aJam = a.jamSampaiHabis ?? Infinity;
    const bJam = b.jamSampaiHabis ?? Infinity;
    return aJam - bJam;
  });
}
```

### 3.6 Budget Safe

```typescript
function calculateBudgetSafe(budgetCampaign: number, skuList: SkuMetrics[]): BudgetSafeMetrics {
  // Akumulasi hanya dari SKU yang benar-benar rugi (underCogs negatif).
  // SKU yang untung TIDAK mengurangi akumulasi kerugian (tidak saling menutup).
  const akumulasiUnderCogs = skuList
    .filter((s) => s.isBelowCogs)
    .reduce((sum, s) => sum + Math.abs(s.underCogs), 0);

  const budgetSafe = budgetCampaign - akumulasiUnderCogs;

  // Guard: budgetCampaign 0 atau negatif seharusnya sudah ditangkap sebagai Empty State
  // di level ActionRadarViewModel (hasData: false), bukan dihitung persentasenya di sini.
  const budgetSafePercentage = budgetCampaign > 0 ? budgetSafe / budgetCampaign : 0;

  let budgetStatus: UrgencyStatus = "AMAN";
  if (budgetSafePercentage < 0.1) budgetStatus = "KRITIS";
  else if (budgetSafePercentage < 0.3) budgetStatus = "WASPADA";

  return { budgetCampaign, akumulasiUnderCogs, budgetSafe, budgetSafePercentage, budgetStatus };
}
```

### 3.7 Rule-Based Recommendation

```typescript
function generateRecommendation(metrics: Omit<SkuMetrics, "recommendation">): string {
  const { isOversold, stockStatus, marginStatus, jamSampaiHabis, namaProduk } = metrics;

  if (isOversold) {
    return `Stock tercatat oversell — cek alokasi gudang vs seller center, kemungkinan data belum sinkron. Jangan langsung anggap habis.`;
  }
  if (stockStatus === "KRITIS" && marginStatus === "KRITIS") {
    return `Stock habis dalam ${jamSampaiHabis?.toFixed(1)} jam DAN sedang dijual rugi. Prioritas: delist sementara untuk hentikan kerugian, lalu evaluasi replenish.`;
  }
  if (stockStatus === "KRITIS") {
    return `Stock habis dalam ${jamSampaiHabis?.toFixed(1)} jam. Replenish dari gudang lain jika tersedia, atau siapkan komunikasi ke merchant sebelum out-of-stock benar terjadi.`;
  }
  if (marginStatus === "KRITIS") {
    return `Sedang dijual di bawah COGS. Cek voucher/diskon yang aktif — kemungkinan voucher stack error. Pertimbangkan delist sementara atau turunkan alokasi voucher.`;
  }
  if (stockStatus === "WASPADA") {
    return `Stock mendekati batas aman (6–24 jam ke depan). Pantau, siapkan replenish jika tren penjualan berlanjut.`;
  }
  if (marginStatus === "WASPADA") {
    return `Margin menipis (di bawah 10% dari COGS). Perhatikan diskon/voucher tambahan yang bisa mendorong ke bawah COGS.`;
  }
  return `Stock dan margin dalam kondisi sehat. Tidak ada tindakan mendesak.`;
}
```

---

## 4. Edge Case Reference (ringkas — detail insiden di `learnings.md`)

| # | Edge Case | Contoh SKU di sample_data.json | Penanganan |
|---|---|---|---|
| 1 | Stock negatif (oversell) | `FR-002` (sisaStock: -3) | `jamSampaiHabis = 0`, `isOversold = true`, status KRITIS mutlak, rekomendasi khusus (bukan "replenish", tapi "cek sinkronisasi data") |
| 2 | Runrate = 0 (tidak ada penjualan) | `BC-999` (qty: 0) | `jamSampaiHabis = null` (bukan `Infinity` literal, bukan `NaN`), diinterpretasikan UI sebagai AMAN |
| 3 | Qty sangat rendah, hampir 0 | `MU-005` (qty: 2 unit / 4 jam campaign) | Runrate kecil tapi valid, dihitung normal — bukan edge case, tapi test case untuk memastikan angka desimal kecil tidak error |
| 4 | `budgetCampaign` belum diisi (0 atau undefined) | `campaign.budgetCampaign` jika diset 0 | `hasData: false` → Empty State, TIDAK dihitung `budgetSafePercentage` (guard di Section 3.6) |
| 5 | `campaignElapsedHours` 0 atau negatif (data rusak / campaign belum mulai) | — (guard defensif, tidak ada di sample data) | `calculateRunratePerJam` return 0, tidak divide by zero |
| 6 | Semua SKU status AMAN | — | List tetap tampil terurut (oleh `jamSampaiHabis` sebagai tie-breaker), tidak ada badge merah di mana pun — ini kondisi valid, bukan bug |

---

## 5. Konstanta Threshold (single source — jangan hardcode ulang di tempat lain)

```typescript
export const THRESHOLDS = {
  STOCK_CRITICAL_HOURS: 6,
  STOCK_WARNING_HOURS: 24,
  MARGIN_WARNING_RATIO: 0.1, // margin < 10% dari COGS = WASPADA
  BUDGET_CRITICAL_RATIO: 0.1, // budgetSafe < 10% dari budgetCampaign = KRITIS
  BUDGET_WARNING_RATIO: 0.3, // budgetSafe < 30% dari budgetCampaign = WASPADA
} as const;
```

Jika threshold ini berubah (lihat PRODUCT_SPEC.md Section 7, Open Question #3 — belum divalidasi ke user riil), update HANYA di sini. Semua fungsi di atas harus mengambil dari `THRESHOLDS`, bukan angka literal.

---

## 6. Data Flow (ringkas)

```
sample_data.json
  → load static (no fetch, no network)
  → SkuRaw[] + CampaignRaw
  → untuk setiap SkuRaw: hitung SkuMetrics (Section 3.1–3.4, 3.7)
  → sortByPriority(SkuMetrics[]) (Section 3.5)
  → calculateBudgetSafe(campaign.budgetCampaign, SkuMetrics[]) (Section 3.6)
  → ActionRadarViewModel
  → render UI (Empty/Loading/Badges/Toast sesuai PRODUCT_SPEC.md Section 4)
```

Tidak ada langkah yang melibatkan network, auth, atau database di jalur ini.
