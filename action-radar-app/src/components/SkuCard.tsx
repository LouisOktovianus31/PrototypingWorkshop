/**
 * Card SKU — design.md Section 5.2.
 * Urutan isi: badge status → nama SKU → baris metrik → rekomendasi tindakan.
 *
 * `extra` adalah konteks dari file Excel (breakdown platform, reorder point,
 * gudang) yang TIDAK ikut ke logic engine. Statusnya tetap murni hasil engine.
 */

import { Boxes, Clock, Gauge, Store, Wallet } from "lucide-react";
import type { SkuMetrics } from "../types";
import type { SkuExtra } from "../lib/import/types";
import { STATUS_TOKENS } from "../lib/statusTokens";
import { formatJamSampaiHabis, formatRunrate, formatRupiah } from "../lib/format";
import { StatusBadge } from "./StatusBadge";

interface MetricProps {
  icon: typeof Clock;
  label: string;
  value: string;
  valueClass?: string;
}

function Metric({ icon: Icon, label, value, valueClass }: MetricProps) {
  return (
    <div className="flex flex-col gap-1">
      <span className="flex items-center gap-1 text-caption text-secondary">
        <Icon size={12} strokeWidth={2} aria-hidden="true" />
        {label}
      </span>
      <span className={`text-body-strong ${valueClass ?? "text-primary"}`}>{value}</span>
    </div>
  );
}

interface SkuCardProps {
  metrics: SkuMetrics;
  extra: SkuExtra | undefined;
  isHighlighted: boolean;
}

export function SkuCard({ metrics, extra, isHighlighted }: SkuCardProps) {
  const overall = STATUS_TOKENS[metrics.overallStatus];
  const stock = STATUS_TOKENS[metrics.stockStatus];
  const margin = STATUS_TOKENS[metrics.marginStatus];

  const belowReorder =
    extra?.reorderPoint != null &&
    extra.reorderPoint > 0 &&
    metrics.totalSisaStock <= extra.reorderPoint;

  return (
    <article
      id={`sku-${metrics.sku}`}
      className={`scroll-mt-4 rounded-md border-l-[3px] p-3 shadow-card transition-colors duration-200 ease-out sm:p-4 ${overall.borderLeft} ${
        isHighlighted ? "bg-surface-raised" : "bg-surface"
      }`}
    >
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
        {belowReorder && !metrics.isOversold && (
          <span className="inline-flex items-center rounded-sm bg-warning-subtle px-2 py-1 text-badge uppercase text-warning">
            Di bawah reorder point
          </span>
        )}
      </div>

      <h3 className="mt-2 text-heading text-primary">{metrics.namaProduk}</h3>
      <p className="mt-1 text-caption text-secondary">
        {metrics.sku}
        {metrics.brand ? ` · ${metrics.brand}` : ""}
        {extra?.lokasi ? ` · ${extra.lokasi}` : ""}
      </p>

      <div className="mt-3 grid grid-cols-2 gap-3 border-t border-subtle pt-3">
        <Metric
          icon={Clock}
          label="Habis dalam"
          value={formatJamSampaiHabis(metrics.jamSampaiHabis)}
          valueClass={stock.text}
        />
        <Metric
          icon={Wallet}
          label="Margin vs COGS"
          value={formatRupiah(metrics.underCogs)}
          valueClass={margin.text}
        />
        <Metric
          icon={Boxes}
          label="Sisa stock gudang"
          value={`${metrics.totalSisaStock.toLocaleString("id-ID")} unit${
            extra?.reorderPoint != null && extra.reorderPoint > 0
              ? ` / min ${extra.reorderPoint}`
              : ""
          }`}
          valueClass={metrics.isOversold || belowReorder ? stock.text : undefined}
        />
        <Metric
          icon={Gauge}
          label="Runrate"
          value={formatRunrate(metrics.runratePerJam)}
        />
      </div>

      {/* Breakdown platform: menjawab "terjualnya di channel mana" tanpa buka CSV lagi. */}
      {extra && extra.perPlatform.length > 0 && (
        <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-secondary">
          <span className="flex items-center gap-1">
            <Store size={12} strokeWidth={2} aria-hidden="true" />
            Terjual periode ini:
          </span>
          {extra.perPlatform.map((entry) => (
            <span key={entry.platform}>
              {entry.platform}{" "}
              <span className="text-body-strong text-primary">{entry.qty}</span>
            </span>
          ))}
        </p>
      )}

      {extra && extra.belowCogsOrders > 0 && (
        <p className="mt-2 text-caption text-critical">
          {extra.belowCogsOrders} order di periode ini terjual di bawah COGS, total rugi{" "}
          {formatRupiah(extra.belowCogsLoss)}.
        </p>
      )}

      {/* Rekomendasi dari logic engine (teks rule-based, tidak diubah). */}
      <p className="mt-3 text-body text-secondary">{metrics.recommendation}</p>

      {/*
        Reorder point datang dari file user, bukan dari threshold engine. Dua hal ini
        bisa memberi kesimpulan berbeda pada SKU yang sama: runway masih panjang
        (status AMAN) tapi sisa unit sudah di bawah batas minimum gudang. Keduanya
        benar — yang satu mengukur waktu, yang satu mengukur jumlah. Jadi ditulis
        eksplisit alih-alih dibiarkan tampak bertentangan.
      */}
      {belowReorder && metrics.stockStatus === "AMAN" && extra?.reorderPoint != null && (
        <p className="mt-2 text-body text-warning">
          Catatan stock: sisa {metrics.totalSisaStock.toLocaleString("id-ID")} unit sudah di
          bawah reorder point {extra.reorderPoint} yang kamu set di sheet inventory. Runway
          masih panjang karena penjualannya lambat, tapi jumlah fisiknya sudah menipis.
        </p>
      )}
    </article>
  );
}
