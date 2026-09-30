/**
 * Indikator Budget Safe level campaign.
 * PRODUCT_SPEC.md Section 4.3 + Acceptance Criteria #3: kondisi budget harus
 * kebaca dari satu indikator, tanpa user menghitung manual.
 */

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
  /** Keterangan periode, mis. "24 – 30 Sep 2026 · 168 jam". */
  subtitle: string;
  budget: BudgetSafeMetrics;
  criticalCount: number;
}

export function BudgetSafeHeader({ subtitle, budget, criticalCount }: BudgetSafeHeaderProps) {
  const token = STATUS_TOKENS[budget.budgetStatus];

  return (
    <section
      aria-label="Ringkasan Budget Safe campaign"
      className="rounded-md bg-surface p-3 shadow-card sm:p-4"
    >
      <p className="truncate text-caption text-secondary">{subtitle}</p>
      <h2 className="mt-1 text-heading text-primary">Budget Safe</h2>

      <div className="mt-3 flex flex-wrap items-baseline gap-2">
        <span className={`text-display ${token.text}`}>
          {formatRupiahCompact(budget.budgetSafe)}
        </span>
        <span className="text-caption text-secondary">
          dari {formatRupiahCompact(budget.budgetCampaign)} ·{" "}
          {formatPercent(budget.budgetSafePercentage)} tersisa
        </span>
      </div>

      {/* Width di-clamp 0–100 supaya nilai negatif tidak meledak keluar container. */}
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
          Kerugian below COGS periode ini:{" "}
          <span
            className={`text-body-strong ${
              budget.akumulasiUnderCogs > 0 ? "text-critical" : "text-safe"
            }`}
          >
            {formatRupiah(budget.akumulasiUnderCogs)}
          </span>
        </span>
      </div>

      {criticalCount > 0 && (
        <p className="mt-2 text-body text-secondary">
          <span className="text-body-strong text-critical">{criticalCount} SKU</span> butuh
          tindakan sekarang.
        </p>
      )}
    </section>
  );
}
