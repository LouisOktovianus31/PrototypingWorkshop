/**
 * Indikator Budget Safe level campaign — PRODUCT_SPEC.md Section 4.3 (badge campaign)
 * dan Acceptance Criteria #3: kondisi budget harus kebaca dari satu indikator di atas layar.
 */

import { SlidersHorizontal } from "lucide-react";
import type { BudgetSafeMetrics } from "../types";
import { STATUS_TOKENS } from "../lib/statusTokens";
import {
  clampPercentWidth,
  formatPercent,
  formatRupiah,
  formatRupiahCompact,
} from "../lib/format";
import { StatusBadge } from "./StatusBadge";

interface BudgetSafeHeaderProps {
  campaignName: string;
  budget: BudgetSafeMetrics;
  criticalCount: number;
  onEditBudget: () => void;
}

export function BudgetSafeHeader({
  campaignName,
  budget,
  criticalCount,
  onEditBudget,
}: BudgetSafeHeaderProps) {
  const token = STATUS_TOKENS[budget.budgetStatus];

  return (
    <section
      aria-label="Ringkasan Budget Safe campaign"
      className="rounded-md bg-surface p-3 shadow-card sm:p-4"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-caption text-secondary">{campaignName}</p>
          <h2 className="mt-1 text-heading text-primary">Budget Safe</h2>
        </div>
        <button
          type="button"
          onClick={onEditBudget}
          aria-label="Ubah Budget Campaign"
          className="tap-target -mr-2 -mt-2 flex items-center justify-center rounded-md p-2 text-secondary transition-colors duration-[120ms] ease-out hover:text-primary"
        >
          <SlidersHorizontal size={20} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-baseline gap-2">
        <span className={`text-display ${token.text}`}>
          {formatRupiahCompact(budget.budgetSafe)}
        </span>
        <span className="text-caption text-secondary">
          dari {formatRupiahCompact(budget.budgetCampaign)} ·{" "}
          {formatPercent(budget.budgetSafePercentage)} tersisa
        </span>
      </div>

      {/* Progress bar sisa budget. Width di-clamp 0–100 supaya nilai negatif tidak meledak. */}
      <div
        className="mt-3 h-2 w-full overflow-hidden rounded-full bg-surface-raised"
        role="img"
        aria-label={`Sisa budget ${formatPercent(budget.budgetSafePercentage)}`}
      >
        <div
          className={`h-full rounded-full transition-all duration-200 ease-out ${token.fill}`}
          style={{ width: `${clampPercentWidth(budget.budgetSafePercentage)}%` }}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-subtle pt-3">
        <StatusBadge status={budget.budgetStatus} prefix="Budget" />
        <span className="text-caption text-secondary">
          Kerugian below COGS:{" "}
          <span className="text-body-strong text-critical">
            {formatRupiah(budget.akumulasiUnderCogs)}
          </span>
        </span>
      </div>

      {criticalCount > 0 && (
        <p className="mt-2 text-body text-secondary">
          <span className="text-body-strong text-critical">
            {criticalCount} SKU
          </span>{" "}
          butuh tindakan sekarang.
        </p>
      )}
    </section>
  );
}
