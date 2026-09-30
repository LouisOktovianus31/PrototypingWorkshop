/**
 * Card SKU — design.md Section 5.2.
 * Urutan isi: Badge status → Nama SKU → baris metrik → rekomendasi tindakan.
 * border-left 3px = indikator urgency yang kebaca tanpa perlu baca teks.
 */

import { Boxes, Clock, Gauge, Wallet } from "lucide-react";
import type { SkuMetrics } from "../types";
import { STATUS_TOKENS } from "../lib/statusTokens";
import {
  formatJamSampaiHabis,
  formatRunrate,
  formatRupiah,
} from "../lib/format";
import { StatusBadge } from "./StatusBadge";

interface MetricProps {
  icon: typeof Clock;
  label: string;
  value: string;
  /** Class warna dari STATUS_TOKENS; default text-primary. */
  valueClass?: string;
}

function Metric({ icon: Icon, label, value, valueClass }: MetricProps) {
  return (
    <div className="flex flex-col gap-1">
      <span className="flex items-center gap-1 text-caption text-secondary">
        <Icon size={12} strokeWidth={2} aria-hidden="true" />
        {label}
      </span>
      <span className={`text-body-strong ${valueClass ?? "text-primary"}`}>
        {value}
      </span>
    </div>
  );
}

interface SkuCardProps {
  metrics: SkuMetrics;
  /** true saat card baru saja dituju dari toast — pakai elevasi 2 (bg-surface-raised). */
  isHighlighted: boolean;
}

export function SkuCard({ metrics, isHighlighted }: SkuCardProps) {
  const overall = STATUS_TOKENS[metrics.overallStatus];
  const stock = STATUS_TOKENS[metrics.stockStatus];
  const margin = STATUS_TOKENS[metrics.marginStatus];

  return (
    <article
      id={`sku-${metrics.sku}`}
      className={`scroll-mt-4 rounded-md border-l-[3px] p-3 shadow-card transition-colors duration-200 ease-out sm:p-4 ${overall.borderLeft} ${
        isHighlighted ? "bg-surface-raised" : "bg-surface"
      }`}
    >
      {/* Badge status */}
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={metrics.overallStatus} />
        {metrics.isOversold && (
          <span className="inline-flex items-center rounded-sm bg-critical-subtle px-2 py-1 text-badge uppercase text-critical">
            Oversell
          </span>
        )}
        {!metrics.isOversold && metrics.stockStatus !== "AMAN" && (
          <StatusBadge status={metrics.stockStatus} prefix="Stock" />
        )}
        {metrics.marginStatus !== "AMAN" && (
          <StatusBadge status={metrics.marginStatus} prefix="Margin" />
        )}
      </div>

      {/* Nama SKU */}
      <h3 className="mt-2 text-heading text-primary">{metrics.namaProduk}</h3>
      <p className="mt-1 text-caption text-secondary">
        {metrics.sku} · {metrics.brand}
      </p>

      {/* Baris metrik */}
      <div className="mt-3 grid grid-cols-2 gap-3 border-t border-subtle pt-3">
        <Metric
          icon={Clock}
          label="Habis dalam"
          value={formatJamSampaiHabis(metrics.jamSampaiHabis)}
          valueClass={stock.text}
        />
        <Metric
          icon={Wallet}
          label="Under COGS"
          value={formatRupiah(metrics.underCogs)}
          valueClass={margin.text}
        />
        <Metric
          icon={Boxes}
          label="Sisa stock gudang"
          value={`${metrics.totalSisaStock.toLocaleString("id-ID")} unit`}
          valueClass={metrics.isOversold ? stock.text : undefined}
        />
        <Metric
          icon={Gauge}
          label="Runrate"
          value={formatRunrate(metrics.runratePerJam)}
        />
      </div>

      {/* Rekomendasi tindakan */}
      <p className="mt-3 text-body text-secondary">{metrics.recommendation}</p>
    </article>
  );
}
