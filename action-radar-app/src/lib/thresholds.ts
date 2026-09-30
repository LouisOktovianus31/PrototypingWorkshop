/**
 * TECH_SPEC.md Section 5 — Konstanta Threshold.
 * SINGLE SOURCE. Jangan hardcode angka threshold ini di tempat lain.
 * Kalau threshold berubah (PRODUCT_SPEC.md Section 7, Open Question #3), ubah HANYA di sini.
 */
export const THRESHOLDS = {
  STOCK_CRITICAL_HOURS: 6,
  STOCK_WARNING_HOURS: 24,
  MARGIN_WARNING_RATIO: 0.1, // margin < 10% dari COGS = WASPADA
  BUDGET_CRITICAL_RATIO: 0.1, // budgetSafe < 10% dari budgetCampaign = KRITIS
  BUDGET_WARNING_RATIO: 0.3, // budgetSafe < 30% dari budgetCampaign = WASPADA
} as const;
