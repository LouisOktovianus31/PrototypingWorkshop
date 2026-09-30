/**
 * Kontrak data Action Radar.
 * Sumber kebenaran: TECH_SPEC.md Section 2 (2.1 data mentah, 2.2 hasil kalkulasi).
 * Jangan menambah field di sini tanpa memperbarui TECH_SPEC.md terlebih dahulu.
 */

/* --- 2.1 Data mentah (bentuk sample_data.json) ---------------------------- */

export interface StockLocation {
  lokasi: string;
  sisaStock: number; // bisa negatif — edge case oversell (learnings.md #2)
}

export interface SkuRaw {
  sku: string;
  namaProduk: string;
  brand: string;
  subKategori: string;
  cogsPerUnit: number; // Rp, selalu > 0
  stockGudang: StockLocation[];
  qtyTerjualCampaignBerjalan: number; // total qty gabungan semua platform sejak campaign mulai
  revenueNetCampaignBerjalan: number; // Rp, net SEBELUM fee platform
  cogsCampaignBerjalan: number; // Rp
  note?: string; // dokumentasi sample data, tidak dirender di UI
}

export interface CampaignRaw {
  id: string;
  name: string;
  startDate: string; // ISO 8601
  endDate: string; // ISO 8601
  budgetCampaign: number; // Rp, input manual — 0 / tidak ada = Empty State
  campaignElapsedHours: number; // jam sejak campaign mulai — basis runrate real-time
}

export interface SampleData {
  campaign: CampaignRaw;
  skus: SkuRaw[];
}

/* --- 2.2 Hasil kalkulasi (bentuk yang dikonsumsi UI) --------------------- */

export type UrgencyStatus = "KRITIS" | "WASPADA" | "AMAN";

export interface SkuMetrics {
  sku: string;
  namaProduk: string;
  brand: string;

  // Runrate & runway
  totalSisaStock: number; // sum semua lokasi gudang, BISA NEGATIF (oversell)
  runratePerJam: number; // unit/jam, >= 0
  jamSampaiHabis: number | null; // null = runrate 0, tidak akan habis dari sisi kecepatan jual
  isOversold: boolean;

  // Under COGS
  underCogs: number; // Rp, = revenueNet - cogs. Negatif = rugi.
  isBelowCogs: boolean;

  // Status gabungan
  stockStatus: UrgencyStatus;
  marginStatus: UrgencyStatus;
  overallStatus: UrgencyStatus; // status TERBURUK dari stockStatus & marginStatus

  // Rekomendasi rule-based (teks statis)
  recommendation: string;
}

export interface BudgetSafeMetrics {
  budgetCampaign: number;
  akumulasiUnderCogs: number; // total kerugian absolut dari SKU yang isBelowCogs
  budgetSafe: number; // = budgetCampaign - akumulasiUnderCogs
  budgetSafePercentage: number; // desimal (0.1 = 10%)
  budgetStatus: UrgencyStatus;
}

export interface ActionRadarViewModel {
  campaignName: string;
  budgetSafe: BudgetSafeMetrics;
  skuList: SkuMetrics[]; // sudah terurut sesuai Prioritized Action Score
  hasData: boolean; // false jika skus kosong ATAU budgetCampaign <= 0 → Empty State
}

/* --- Detail lokasi gudang untuk rekomendasi replenish -------------------- */

export interface StockBreakdown {
  sku: string;
  lokasi: StockLocation[];
}
