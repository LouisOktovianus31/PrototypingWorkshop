/**
 * Action Radar — single page.
 *
 * Alur (TECH_SPEC.md Section 6):
 *   sample_data.json (static import, no fetch/network)
 *     → buildViewModel() [logic engine pre-verified]
 *     → render Empty / Loading / List + Badge / Toast
 *
 * State lokal saja. Tidak ada persistence — budgetCampaign hilang saat reload,
 * sesuai batasan "no DB, no write-back" di TECH_SPEC.md Section 1.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RadarIcon } from "lucide-react";

import sampleDataJson from "../sample_data.json";
import type { SampleData, SkuMetrics, UrgencyStatus } from "./types";
import { buildViewModel } from "./lib/logic";
import { formatJamSampaiHabis, formatRupiah } from "./lib/format";

import { BudgetSafeHeader } from "./components/BudgetSafeHeader";
import { EmptyState } from "./components/EmptyState";
import { InputZone } from "./components/InputZone";
import { SkeletonList } from "./components/SkeletonList";
import { SkuCard } from "./components/SkuCard";
import { Toast, type ToastPayload } from "./components/Toast";

const sampleData: SampleData = sampleDataJson;

/** Durasi loading simulasi. PRODUCT_SPEC.md Section 4.2: target di bawah 3 detik. */
const CALC_DURATION_MS = 1400;
const HIGHLIGHT_DURATION_MS = 2400;

type Phase = "empty" | "loading" | "ready";

/** Alasan singkat untuk toast — turunan dari status, bukan teks karangan baru. */
function buildToastReason(sku: SkuMetrics): string {
  if (sku.isOversold) {
    return `Stock tercatat ${sku.totalSisaStock} unit (oversell) — cek sinkronisasi gudang.`;
  }
  if (sku.stockStatus === "KRITIS" && sku.marginStatus === "KRITIS") {
    return `Habis ${formatJamSampaiHabis(sku.jamSampaiHabis)} dan rugi ${formatRupiah(sku.underCogs)}.`;
  }
  if (sku.stockStatus === "KRITIS") {
    return `Stock habis ${formatJamSampaiHabis(sku.jamSampaiHabis)}.`;
  }
  return `Terjual di bawah COGS, rugi ${formatRupiah(sku.underCogs)}.`;
}

export default function App() {
  const [phase, setPhase] = useState<Phase>("empty");
  const [budget, setBudget] = useState(0);
  const [isEditingBudget, setIsEditingBudget] = useState(false);
  const [toast, setToast] = useState<ToastPayload | null>(null);
  const [highlightedSku, setHighlightedSku] = useState<string | null>(null);

  /** Snapshot status sebelumnya, untuk deteksi transisi ke KRITIS (toast). */
  const previousStatuses = useRef<Map<string, UrgencyStatus> | null>(null);

  const viewModel = useMemo(
    () => buildViewModel(sampleData.campaign, sampleData.skus, budget),
    [budget],
  );

  const startCalculation = useCallback((nextBudget: number) => {
    setBudget(nextBudget);
    setIsEditingBudget(false);
    setPhase("loading");
    window.setTimeout(() => setPhase("ready"), CALC_DURATION_MS);
  }, []);

  const handleLoadSample = useCallback(() => {
    previousStatuses.current = null; // load ulang = anggap sesi baru
    startCalculation(sampleData.campaign.budgetCampaign);
  }, [startCalculation]);

  /**
   * Toast hanya untuk SKU yang BARU berpindah ke KRITIS (PRODUCT_SPEC.md 4.4).
   * Pada load pertama belum ada pembanding, jadi yang ditampilkan adalah SKU
   * paling prioritas. Perubahan budget tidak memicu toast (status SKU tidak berubah).
   */
  useEffect(() => {
    if (phase !== "ready" || !viewModel.hasData) return;

    const current = new Map(
      viewModel.skuList.map((sku) => [sku.sku, sku.overallStatus] as const),
    );
    const previous = previousStatuses.current;

    const alertSku =
      previous === null
        ? viewModel.skuList.find((sku) => sku.overallStatus === "KRITIS")
        : viewModel.skuList.find(
            (sku) =>
              sku.overallStatus === "KRITIS" &&
              previous.has(sku.sku) &&
              previous.get(sku.sku) !== "KRITIS",
          );

    previousStatuses.current = current;

    if (alertSku) {
      setToast({
        sku: alertSku.sku,
        namaProduk: alertSku.namaProduk,
        reason: buildToastReason(alertSku),
      });
    }
  }, [phase, viewModel]);

  const handleJump = useCallback((sku: string) => {
    setToast(null);
    setHighlightedSku(sku);
    document
      .getElementById(`sku-${sku}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => setHighlightedSku(null), HIGHLIGHT_DURATION_MS);
  }, []);

  const criticalCount = viewModel.skuList.filter(
    (sku) => sku.overallStatus === "KRITIS",
  ).length;

  const showEmptyState = phase === "empty" || !viewModel.hasData;

  return (
    <div className="mx-auto min-h-dvh w-full max-w-2xl px-4 pb-24">
      <header className="flex items-center gap-2 pt-8 pb-6">
        <RadarIcon size={24} strokeWidth={2} className="text-accent" aria-hidden="true" />
        <h1 className="text-display text-primary">Action Radar</h1>
      </header>

      {showEmptyState ? (
        <EmptyState>
          <InputZone
            budget={budget}
            sampleBudget={sampleData.campaign.budgetCampaign}
            onSubmit={startCalculation}
            onLoadSample={handleLoadSample}
          />
        </EmptyState>
      ) : (
        <main className="flex flex-col gap-6">
          <BudgetSafeHeader
            campaignName={viewModel.campaignName}
            budget={viewModel.budgetSafe}
            criticalCount={criticalCount}
            onEditBudget={() => setIsEditingBudget(true)}
          />

          {isEditingBudget && (
            <InputZone
              budget={budget}
              sampleBudget={sampleData.campaign.budgetCampaign}
              onSubmit={startCalculation}
              onLoadSample={handleLoadSample}
              isEditing
              onCancel={() => setIsEditingBudget(false)}
            />
          )}

          <section aria-label="Daftar SKU prioritas">
            <div className="mb-3 flex items-baseline justify-between gap-2">
              <h2 className="text-heading text-primary">Prioritas Tindakan</h2>
              <span className="text-caption text-secondary">
                {viewModel.skuList.length} SKU · jam ke-
                {sampleData.campaign.campaignElapsedHours} campaign
              </span>
            </div>

            {phase === "loading" ? (
              <SkeletonList />
            ) : (
              <div className="flex flex-col gap-2">
                {viewModel.skuList.map((sku) => (
                  <SkuCard
                    key={sku.sku}
                    metrics={sku}
                    isHighlighted={highlightedSku === sku.sku}
                  />
                ))}
              </div>
            )}
          </section>

          <p className="text-caption text-disabled">
            Sumber data: sample_data.json (static, tanpa API live). Action Radar hanya
            merekomendasikan — eksekusi delist/replenish tetap manual di seller center.
          </p>
        </main>
      )}

      {toast && (
        <Toast
          payload={toast}
          onJump={handleJump}
          onDismiss={() => setToast(null)}
        />
      )}
    </div>
  );
}
