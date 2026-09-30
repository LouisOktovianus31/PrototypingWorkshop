/**
 * Action Radar — upload Excel → list SKU prioritas.
 *
 * Alur:
 *   File .xlsx (dipilih user)
 *     → readWorkbook()   : unzip + parse SpreadsheetML, di browser
 *     → parseWorkbook()  : klasifikasi sheet, pemetaan kolom, buang baris ringkasan
 *     → buildDataset()   : gabungkan lintas sheet untuk satu window waktu
 *     → buildViewModel() : logic engine (TIDAK diubah dari TECH_SPEC.md)
 *     → render
 *
 * Batasan yang dipertahankan dari TECH_SPEC.md Section 1: tidak ada auth,
 * tidak ada database, tidak ada backend. File user tidak pernah dikirim keluar
 * dari perangkatnya.
 *
 * Satu penyimpangan yang sadar dari TECH_SPEC.md: di sana `budgetCampaign <= 0`
 * membuat `hasData: false` sehingga SELURUH layar jadi Empty State. Di sini list
 * SKU tetap ditampilkan walau budget belum diisi, karena list itu sudah berguna
 * hanya dengan data penjualan + stock, sementara budget tidak ada di file Excel.
 * Yang disembunyikan hanya kartu Budget Safe. Logic engine-nya sendiri tidak
 * disentuh — `hasData` tetap dihitung, cuma tidak dipakai untuk memblokir list.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileUp, Filter, RadarIcon } from "lucide-react";

import type { CampaignRaw, SkuMetrics, UrgencyStatus } from "./types";
import type { AnalysisWindow, ParsedWorkbook } from "./lib/import/types";
import { readWorkbook, XlsxError } from "./lib/xlsx/reader";
import { parseWorkbook } from "./lib/import/parseWorkbook";
import { buildDataset, daysBetweenInclusive, defaultWindow } from "./lib/import/buildDataset";
import { buildViewModel } from "./lib/logic";
import { formatJamSampaiHabis, formatRupiah } from "./lib/format";

import { AnalysisControls } from "./components/AnalysisControls";
import { BudgetSafeHeader } from "./components/BudgetSafeHeader";
import { FindingsPanel } from "./components/FindingsPanel";
import { ImportSummary } from "./components/ImportSummary";
import { ReconciliationCard } from "./components/ReconciliationCard";
import { SkeletonList } from "./components/SkeletonList";
import { SkuCard } from "./components/SkuCard";
import { Toast, type ToastPayload } from "./components/Toast";
import { UploadZone } from "./components/UploadZone";

type Phase = "idle" | "parsing" | "ready";
type StatusFilter = "ALL" | UrgencyStatus;

const SAMPLE_URL = "/contoh-data-penjualan.xlsx";
const HIGHLIGHT_DURATION_MS = 2400;

function formatDateShort(date: Date): string {
  return date.toLocaleDateString("id-ID", { day: "numeric", month: "short", timeZone: "UTC" });
}

function formatDateLong(date: Date): string {
  return date.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Alasan singkat untuk toast — diturunkan dari status, bukan teks baru. */
function buildToastReason(sku: SkuMetrics): string {
  if (sku.isOversold) {
    return `Stock tercatat ${sku.totalSisaStock} unit (oversell) — cek sinkronisasi gudang.`;
  }
  if (sku.stockStatus === "KRITIS" && sku.marginStatus === "KRITIS") {
    return `Habis ${formatJamSampaiHabis(sku.jamSampaiHabis)} dan rugi ${formatRupiah(sku.underCogs)}.`;
  }
  if (sku.stockStatus === "KRITIS") return `Stock habis ${formatJamSampaiHabis(sku.jamSampaiHabis)}.`;
  return `Terjual di bawah COGS, rugi ${formatRupiah(sku.underCogs)}.`;
}

export default function App() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<ParsedWorkbook | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [analysisWindow, setAnalysisWindow] = useState<AnalysisWindow | null>(null);
  const [budget, setBudget] = useState(0);
  const [filter, setFilter] = useState<StatusFilter>("ALL");
  const [toast, setToast] = useState<ToastPayload | null>(null);
  const [highlightedSku, setHighlightedSku] = useState<string | null>(null);

  /** Menjaga toast hanya muncul sekali per file, bukan setiap kali window diubah. */
  const toastShownForFile = useRef(false);

  /* --- Import ------------------------------------------------------------ */

  const ingest = useCallback(async (bytes: Uint8Array, name: string) => {
    setPhase("parsing");
    setError(null);
    setFileName(name);
    // Beri browser satu frame untuk menggambar skeleton sebelum parsing sinkron.
    await new Promise((resolve) => window.setTimeout(resolve, 0));

    try {
      const nextParsed = parseWorkbook(readWorkbook(bytes));
      const blocking = nextParsed.issues.filter((issue) => issue.level === "error");

      if (nextParsed.sales.length === 0 || nextParsed.dateRange === null) {
        setError(
          blocking[0]?.message ??
            "Tidak ada transaksi penjualan bertanggal yang bisa dibaca dari file ini.",
        );
        setPhase("idle");
        setParsed(null);
        return;
      }

      setParsed(nextParsed);
      setAnalysisWindow(defaultWindow(nextParsed.dateRange));
      toastShownForFile.current = false;
      setFilter("ALL");
      setPhase("ready");
    } catch (caught) {
      setError(
        caught instanceof XlsxError
          ? caught.message
          : `Gagal membaca file: ${caught instanceof Error ? caught.message : "penyebab tidak diketahui"}`,
      );
      setPhase("idle");
      setParsed(null);
    }
  }, []);

  const handleFile = useCallback(
    (file: File) => {
      void file.arrayBuffer().then((buffer) => ingest(new Uint8Array(buffer), file.name));
    },
    [ingest],
  );

  const handleUseSample = useCallback(() => {
    // Asset statis dari origin sendiri, bukan pihak ketiga.
    void fetch(SAMPLE_URL)
      .then((response) => {
        if (!response.ok) throw new Error(`status ${response.status}`);
        return response.arrayBuffer();
      })
      .then((buffer) => ingest(new Uint8Array(buffer), "contoh-data-penjualan.xlsx"))
      .catch((caught: unknown) => {
        setError(
          `File contoh tidak bisa dimuat (${caught instanceof Error ? caught.message : "tidak diketahui"}).`,
        );
        setPhase("idle");
      });
  }, [ingest]);

  const handleReset = useCallback(() => {
    setPhase("idle");
    setParsed(null);
    setAnalysisWindow(null);
    setFileName("");
    setError(null);
    setToast(null);
  }, []);

  /* --- Kalkulasi -------------------------------------------------------- */

  const built = useMemo(() => {
    if (!parsed || !analysisWindow) return null;
    return buildDataset(parsed, analysisWindow);
  }, [parsed, analysisWindow]);

  const viewModel = useMemo(() => {
    if (!built || !analysisWindow) return null;
    const campaign: CampaignRaw = {
      id: "excel-import",
      name: `${formatDateLong(analysisWindow.start)} – ${formatDateLong(analysisWindow.end)}`,
      startDate: analysisWindow.start.toISOString(),
      endDate: analysisWindow.end.toISOString(),
      budgetCampaign: budget,
      campaignElapsedHours: analysisWindow.elapsedHours,
    };
    return buildViewModel(campaign, built.skus, budget);
  }, [built, analysisWindow, budget]);

  /* --- Auto-load file contoh via ?sample=1 ------------------------------ */

  /**
   * Memudahkan demo dan pengujian otomatis: buka `/?sample=1` dan file contoh
   * langsung dimuat tanpa klik. Hanya membaca asset statis dari origin sendiri.
   */
  const autoLoadDone = useRef(false);
  useEffect(() => {
    if (autoLoadDone.current) return;
    if (!new URLSearchParams(window.location.search).has("sample")) return;
    autoLoadDone.current = true;
    handleUseSample();
  }, [handleUseSample]);

  /* --- Toast: sekali per import ----------------------------------------- */

  useEffect(() => {
    if (phase !== "ready" || !viewModel || toastShownForFile.current) return;
    toastShownForFile.current = true;
    const target = viewModel.skuList.find((sku) => sku.overallStatus === "KRITIS");
    if (target) {
      setToast({
        sku: target.sku,
        namaProduk: target.namaProduk,
        reason: buildToastReason(target),
      });
    }
  }, [phase, viewModel]);

  const handleJump = useCallback((sku: string) => {
    setToast(null);
    setFilter("ALL");
    setHighlightedSku(sku);
    window.setTimeout(() => {
      document
        .getElementById(`sku-${sku}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 0);
    window.setTimeout(() => setHighlightedSku(null), HIGHLIGHT_DURATION_MS);
  }, []);

  /* --- Render ----------------------------------------------------------- */

  const counts = useMemo(() => {
    const base: Record<StatusFilter, number> = { ALL: 0, KRITIS: 0, WASPADA: 0, AMAN: 0 };
    if (!viewModel) return base;
    base.ALL = viewModel.skuList.length;
    for (const sku of viewModel.skuList) base[sku.overallStatus] += 1;
    return base;
  }, [viewModel]);

  const visibleSkus = useMemo(() => {
    if (!viewModel) return [];
    if (filter === "ALL") return viewModel.skuList;
    return viewModel.skuList.filter((sku) => sku.overallStatus === filter);
  }, [viewModel, filter]);

  const showUpload = phase === "idle";

  return (
    <div className="mx-auto min-h-dvh w-full max-w-2xl px-4 pb-28">
      <header className="flex items-center justify-between gap-2 pt-8 pb-6">
        <div className="flex items-center gap-2">
          <RadarIcon size={24} strokeWidth={2} className="text-accent" aria-hidden="true" />
          <h1 className="text-display text-primary">Action Radar</h1>
        </div>
        {phase === "ready" && (
          <button
            type="button"
            onClick={handleReset}
            className="tap-target flex items-center gap-2 rounded-md border border-subtle px-3 py-2 text-caption text-secondary transition-colors duration-[120ms] ease-out hover:bg-surface hover:text-primary"
          >
            <FileUp size={16} strokeWidth={2} aria-hidden="true" />
            Ganti file
          </button>
        )}
      </header>

      {showUpload && (
        <UploadZone
          onFile={handleFile}
          onUseSample={handleUseSample}
          error={error}
          disabled={false}
        />
      )}

      {phase === "parsing" && (
        <div className="flex flex-col gap-6">
          <p className="text-body text-secondary">
            Membaca {fileName} dan menggabungkan data antar sheet...
          </p>
          <SkeletonList />
        </div>
      )}

      {phase === "ready" && parsed && built && viewModel && analysisWindow && parsed.dateRange && (
        <main className="flex flex-col gap-6">
          <ImportSummary parsed={parsed} fileName={fileName} />

          <ReconciliationCard reconciliation={built.dataset.reconciliation} />

          <AnalysisControls
            window={analysisWindow}
            onWindowChange={setAnalysisWindow}
            range={parsed.dateRange}
            budget={budget}
            onBudgetChange={setBudget}
          />

          {budget > 0 ? (
            <BudgetSafeHeader
              subtitle={`${formatDateShort(analysisWindow.start)} – ${formatDateLong(
                analysisWindow.end,
              )} · ${analysisWindow.elapsedHours} jam`}
              budget={viewModel.budgetSafe}
              criticalCount={counts.KRITIS}
            />
          ) : (
            <p className="rounded-md border border-dashed border-subtle p-3 text-body text-secondary">
              Isi Budget Campaign di atas untuk mengaktifkan indikator Budget Safe. List SKU di
              bawah tetap akurat tanpa itu — budget hanya dipakai untuk menghitung sisa
              anggaran yang termakan kerugian.
            </p>
          )}

          {/* --- List prioritas --- */}
          <section aria-label="Daftar SKU prioritas">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-heading text-primary">Prioritas Tindakan</h2>
              <span className="text-caption text-secondary">
                {built.dataset.skuAktifDalamWindow} dari {counts.ALL} SKU ada transaksi di
                periode ini
              </span>
            </div>

            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Filter size={16} strokeWidth={2} className="text-secondary" aria-hidden="true" />
              {(["ALL", "KRITIS", "WASPADA", "AMAN"] as StatusFilter[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setFilter(option)}
                  aria-pressed={filter === option}
                  className={`tap-target flex items-center rounded-md border px-3 py-2 text-caption transition-colors duration-[120ms] ease-out ${
                    filter === option
                      ? "border-accent bg-accent text-white"
                      : "border-subtle text-secondary hover:bg-surface"
                  }`}
                >
                  {option === "ALL" ? "Semua" : option} ({counts[option]})
                </button>
              ))}
            </div>

            {visibleSkus.length === 0 ? (
              <p className="rounded-md bg-surface p-3 text-body text-secondary shadow-card">
                Tidak ada SKU dengan status {filter.toLowerCase()} di periode ini.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {visibleSkus.map((sku) => (
                  <SkuCard
                    key={sku.sku}
                    metrics={sku}
                    extra={built.dataset.extras.get(sku.sku)}
                    isHighlighted={highlightedSku === sku.sku}
                  />
                ))}
              </div>
            )}
          </section>

          <FindingsPanel
            findings={built.dataset.findings}
            totalTransaksi={parsed.sales.length}
          />

          <footer className="border-t border-subtle pt-4 text-caption text-disabled">
            <p>
              Runrate dihitung dari qty terjual dalam periode dibagi{" "}
              {analysisWindow.elapsedHours} jam ({daysBetweenInclusive(
                analysisWindow.start,
                analysisWindow.end,
              )}{" "}
              hari). Threshold: stock kritis di bawah 6 jam, waspada di bawah 24 jam.
            </p>
            <p className="mt-2">
              Action Radar hanya merekomendasikan. Eksekusi delist, ubah harga, atau
              replenish tetap dilakukan manual di seller center masing-masing.
            </p>
          </footer>
        </main>
      )}

      {toast && (
        <Toast payload={toast} onJump={handleJump} onDismiss={() => setToast(null)} />
      )}
    </div>
  );
}
