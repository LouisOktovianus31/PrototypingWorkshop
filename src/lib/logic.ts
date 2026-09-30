/**
 * ============================================================================
 * Action Radar — Logic Engine (pre-verified)
 * ============================================================================
 * Implementasi 1:1 dari TECH_SPEC.md Section 3, dengan aturan pencegahan dari
 * learnings.md Section 1 (#1 s/d #5) sudah terpasang sebagai guard eksplisit.
 *
 * Batasan (TECH_SPEC.md Section 1 — Strict Edge Boundaries):
 *   - Semua fungsi di file ini adalah PURE FUNCTION.
 *   - Tidak ada fetch, network, DB, auth, atau side effect apa pun.
 *   - Read-only terhadap data SKU. Satu-satunya input manual: budgetCampaign.
 *
 * ATURAN ZERO-DIVISION (learnings.md #5, berlaku untuk SEMUA pembagian di sini):
 *   sebelum menulis `a / b`, WAJIB ada guard `if (b <= 0) return <default bermakna>`.
 *   Infinity dan NaN tidak boleh pernah keluar dari file ini.
 * ============================================================================
 */

import { THRESHOLDS } from "./thresholds";
import type {
  ActionRadarViewModel,
  BudgetSafeMetrics,
  CampaignRaw,
  SampleData,
  SkuMetrics,
  SkuRaw,
  UrgencyStatus,
} from "../types";

/* -------------------------------------------------------------------------- */
/* Section 3.1 — Runrate per Jam                                              */
/* -------------------------------------------------------------------------- */

/**
 * Basis runrate adalah kecepatan jual REAL-TIME selama campaign berjalan
 * (campaignElapsedHours), bukan rata-rata historis 30 hari. Pakai basis historis
 * membuat semua SKU tampak "aman" secara keliru saat Double-Day.
 */
export function calculateRunratePerJam(
  qtyTerjualCampaignBerjalan: number,
  campaignElapsedHours: number,
): number {
  // Guard (learnings.md #5): elapsed hours harus > 0. Data rusak / campaign belum
  // mulai → runrate 0, bukan divide by zero.
  if (campaignElapsedHours <= 0) return 0;
  return qtyTerjualCampaignBerjalan / campaignElapsedHours;
}

/* -------------------------------------------------------------------------- */
/* Section 3.2 — Jam Sampai Habis (Runway)                                    */
/* -------------------------------------------------------------------------- */

/**
 * Titik zero-division paling kritis di seluruh sistem (learnings.md #1 & #2).
 * @returns jumlah jam, atau `null` yang berarti "tidak terbatas" — BUKAN Infinity.
 */
export function calculateJamSampaiHabis(
  totalSisaStock: number,
  runratePerJam: number,
): number | null {
  // Edge case 1 (learnings.md #2): sudah oversold / habis. Konsep "jam sampai habis"
  // tidak relevan lagi — ini masalah sinkronisasi data, bukan stock menipis biasa.
  if (totalSisaStock <= 0) return 0;

  // Edge case 2 (learnings.md #1): runrate 0 → JANGAN divide by zero.
  // null = runway tidak terbatas, diinterpretasikan UI sebagai AMAN (bukan error).
  if (runratePerJam <= 0) return null;

  return totalSisaStock / runratePerJam;
}

/* -------------------------------------------------------------------------- */
/* Section 3.3 — Threshold Alert: Stock Status                                */
/* -------------------------------------------------------------------------- */

export function getStockStatus(
  jamSampaiHabis: number | null,
  isOversold: boolean,
): UrgencyStatus {
  if (isOversold) return "KRITIS"; // oversell selalu KRITIS, tanpa pengecualian
  if (jamSampaiHabis === null) return "AMAN"; // runrate 0 = tidak ada urgency stock
  if (jamSampaiHabis < THRESHOLDS.STOCK_CRITICAL_HOURS) return "KRITIS";
  if (jamSampaiHabis < THRESHOLDS.STOCK_WARNING_HOURS) return "WASPADA";
  return "AMAN";
}

/* -------------------------------------------------------------------------- */
/* Section 3.4 — Threshold Alert: Margin Status & Overall Status              */
/* -------------------------------------------------------------------------- */

export function getMarginStatus(
  underCogs: number,
  cogsPerUnit: number,
  qty: number,
): UrgencyStatus {
  if (underCogs < 0) return "KRITIS"; // rugi aktual = kritis, tidak ada gradasi

  const totalCogs = cogsPerUnit * qty;
  // Guard (learnings.md #5): tidak ada basis pembagi → tidak ada transaksi → aman.
  if (totalCogs <= 0) return "AMAN";

  const marginPercentage = underCogs / totalCogs;
  if (marginPercentage < THRESHOLDS.MARGIN_WARNING_RATIO) return "WASPADA";
  return "AMAN";
}

export const STATUS_SEVERITY: Record<UrgencyStatus, number> = {
  KRITIS: 2,
  WASPADA: 1,
  AMAN: 0,
};

export function getOverallStatus(
  stockStatus: UrgencyStatus,
  marginStatus: UrgencyStatus,
): UrgencyStatus {
  // Overall = yang paling parah di antara dua (PRODUCT_SPEC.md Section 2.4)
  return STATUS_SEVERITY[stockStatus] >= STATUS_SEVERITY[marginStatus]
    ? stockStatus
    : marginStatus;
}

/* -------------------------------------------------------------------------- */
/* Section 3.5 — Prioritized Action Score (Sorting)                           */
/* -------------------------------------------------------------------------- */

export function sortByPriority(list: SkuMetrics[]): SkuMetrics[] {
  return [...list].sort((a, b) => {
    // 1. Severity status keseluruhan, tertinggi dulu
    const severityDiff =
      STATUS_SEVERITY[b.overallStatus] - STATUS_SEVERITY[a.overallStatus];
    if (severityDiff !== 0) return severityDiff;

    // 2. Severity sama → SKU dengan KEDUA kondisi kritis naik lebih dulu
    const aBothCritical =
      a.stockStatus === "KRITIS" && a.marginStatus === "KRITIS" ? 1 : 0;
    const bBothCritical =
      b.stockStatus === "KRITIS" && b.marginStatus === "KRITIS" ? 1 : 0;
    if (bBothCritical !== aBothCritical) return bBothCritical - aBothCritical;

    // 3. Tie-breaker: jamSampaiHabis lebih kecil naik dulu. null selalu di bawah.
    const aJam = a.jamSampaiHabis ?? Infinity;
    const bJam = b.jamSampaiHabis ?? Infinity;
    return aJam - bJam;
  });
}

/* -------------------------------------------------------------------------- */
/* Section 3.6 — Budget Safe                                                  */
/* -------------------------------------------------------------------------- */

export function calculateBudgetSafe(
  budgetCampaign: number,
  skuList: SkuMetrics[],
): BudgetSafeMetrics {
  // learnings.md #3: akumulasi HANYA dari SKU yang benar-benar rugi.
  // SKU yang untung TIDAK menutup kerugian SKU lain — itu metrik berbeda.
  const akumulasiUnderCogs = skuList
    .filter((s) => s.isBelowCogs)
    .reduce((sum, s) => sum + Math.abs(s.underCogs), 0);

  const budgetSafe = budgetCampaign - akumulasiUnderCogs;

  // Guard defense-in-depth (learnings.md #4): budgetCampaign <= 0 seharusnya sudah
  // ditangkap sebagai Empty State di level view model, tapi tetap dijaga di sini.
  const budgetSafePercentage =
    budgetCampaign > 0 ? budgetSafe / budgetCampaign : 0;

  let budgetStatus: UrgencyStatus = "AMAN";
  if (budgetSafePercentage < THRESHOLDS.BUDGET_CRITICAL_RATIO) {
    budgetStatus = "KRITIS";
  } else if (budgetSafePercentage < THRESHOLDS.BUDGET_WARNING_RATIO) {
    budgetStatus = "WASPADA";
  }

  return {
    budgetCampaign,
    akumulasiUnderCogs,
    budgetSafe,
    budgetSafePercentage,
    budgetStatus,
  };
}

/* -------------------------------------------------------------------------- */
/* Section 3.7 — Rule-Based Recommendation                                    */
/* -------------------------------------------------------------------------- */

export function generateRecommendation(
  metrics: Omit<SkuMetrics, "recommendation">,
): string {
  const { isOversold, stockStatus, marginStatus, jamSampaiHabis } = metrics;

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

/* -------------------------------------------------------------------------- */
/* Section 6 — Data Flow: SkuRaw → SkuMetrics → ViewModel                     */
/* -------------------------------------------------------------------------- */

export function calculateSkuMetrics(
  raw: SkuRaw,
  campaignElapsedHours: number,
): SkuMetrics {
  const totalSisaStock = raw.stockGudang.reduce(
    (sum, lokasi) => sum + lokasi.sisaStock,
    0,
  );
  const isOversold = totalSisaStock < 0;

  const runratePerJam = calculateRunratePerJam(
    raw.qtyTerjualCampaignBerjalan,
    campaignElapsedHours,
  );
  const jamSampaiHabis = calculateJamSampaiHabis(totalSisaStock, runratePerJam);

  const underCogs =
    raw.revenueNetCampaignBerjalan - raw.cogsCampaignBerjalan;
  const isBelowCogs = underCogs < 0;

  const stockStatus = getStockStatus(jamSampaiHabis, isOversold);
  const marginStatus = getMarginStatus(
    underCogs,
    raw.cogsPerUnit,
    raw.qtyTerjualCampaignBerjalan,
  );
  const overallStatus = getOverallStatus(stockStatus, marginStatus);

  const withoutRecommendation: Omit<SkuMetrics, "recommendation"> = {
    sku: raw.sku,
    namaProduk: raw.namaProduk,
    brand: raw.brand,
    totalSisaStock,
    runratePerJam,
    jamSampaiHabis,
    isOversold,
    underCogs,
    isBelowCogs,
    stockStatus,
    marginStatus,
    overallStatus,
  };

  return {
    ...withoutRecommendation,
    recommendation: generateRecommendation(withoutRecommendation),
  };
}

/**
 * Nilai Budget Safe untuk kondisi Empty State.
 * learnings.md #4: saat budgetCampaign <= 0, `calculateBudgetSafe` TIDAK dipanggil
 * sama sekali. Ini konstanta eksplisit, bukan hasil pembagian.
 */
const EMPTY_BUDGET_SAFE: BudgetSafeMetrics = {
  budgetCampaign: 0,
  akumulasiUnderCogs: 0,
  budgetSafe: 0,
  budgetSafePercentage: 0,
  budgetStatus: "AMAN",
};

/**
 * Entry point logic engine. Satu panggilan: data mentah → view model siap render.
 *
 * @param campaign  metadata campaign (nama, elapsed hours)
 * @param skus      daftar SKU mentah
 * @param budgetCampaign  input manual Fiona. Override nilai di campaign.
 */
export function buildViewModel(
  campaign: CampaignRaw,
  skus: SkuRaw[],
  budgetCampaign: number,
): ActionRadarViewModel {
  const skuList = sortByPriority(
    skus.map((raw) => calculateSkuMetrics(raw, campaign.campaignElapsedHours)),
  );

  const hasData = skuList.length > 0 && budgetCampaign > 0;

  return {
    campaignName: campaign.name,
    // Guard learnings.md #4: jangan hitung persentase kalau belum ada budget valid.
    budgetSafe: hasData
      ? calculateBudgetSafe(budgetCampaign, skuList)
      : EMPTY_BUDGET_SAFE,
    skuList,
    hasData,
  };
}

/** Helper convenience untuk sumber data statis `sample_data.json`. */
export function buildViewModelFromSampleData(
  data: SampleData,
  budgetCampaign = data.campaign.budgetCampaign,
): ActionRadarViewModel {
  return buildViewModel(data.campaign, data.skus, budgetCampaign);
}
