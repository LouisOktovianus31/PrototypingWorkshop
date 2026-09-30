/**
 * Temuan lintas sheet sepanjang SELURUH file (bukan hanya window analisa).
 *
 * Bedanya dengan list prioritas di atasnya: list prioritas menjawab "apa yang
 * harus dikerjakan sekarang", panel ini menjawab "pola apa yang terjadi di data
 * ini" — kebocoran margin per platform, SKU yang menyentuh reorder point, dan
 * harga jual yang menurut file sendiri sudah di bawah COGS.
 */

import { PackageSearch, Tag, TrendingDown } from "lucide-react";
import type { Findings } from "../lib/import/types";
import { formatRupiah } from "../lib/format";

interface FindingsPanelProps {
  findings: Findings;
  /** Jumlah transaksi yang diperiksa, untuk konteks angka. */
  totalTransaksi: number;
}

export function FindingsPanel({ findings, totalTransaksi }: FindingsPanelProps) {
  const adaTemuan =
    findings.belowCogs.length > 0 ||
    findings.reorder.length > 0 ||
    findings.priceGap.length > 0;

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-heading text-primary">Temuan dari seluruh file</h2>
        <p className="mt-1 text-caption text-secondary">
          Dihitung dari {totalTransaksi.toLocaleString("id-ID")} transaksi, lepas dari
          periode analisa di atas.
        </p>
      </div>

      {!adaTemuan && (
        <p className="rounded-md bg-surface p-3 text-body text-secondary shadow-card">
          Tidak ada order di bawah COGS, tidak ada SKU yang menyentuh reorder point, dan
          tidak ada harga jual di bawah COGS menurut file. Tidak ada yang perlu
          ditindaklanjuti dari sisi ini.
        </p>
      )}

      {/* --- Kebocoran margin per SKU --- */}
      {findings.belowCogs.length > 0 && (
        <div className="rounded-md bg-surface p-3 shadow-card">
          <h3 className="flex items-center gap-2 text-body-strong text-primary">
            <TrendingDown size={16} strokeWidth={2} className="text-critical" aria-hidden="true" />
            Order terjual di bawah COGS
          </h3>
          <p className="mt-1 text-caption text-secondary">
            {findings.totalBelowCogsOrders} order dari {totalTransaksi.toLocaleString("id-ID")}{" "}
            transaksi. Dihitung dari angka revenue vs COGS, bukan dari kolom status di file.
            {findings.statusColumnDisagreements > 0 && (
              <>
                {" "}
                <span className="text-warning">
                  {findings.statusColumnDisagreements} baris kolom statusnya tidak sinkron
                  dengan angkanya sendiri.
                </span>
              </>
            )}
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {findings.belowCogs.slice(0, 10).map((item) => (
              <li
                key={item.sku}
                className="rounded-md border-l-[3px] border-l-critical bg-surface-raised p-3"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-body-strong text-primary">{item.namaProduk}</span>
                  <span className="text-body-strong text-critical">
                    -{formatRupiah(item.totalLoss)}
                  </span>
                </div>
                <p className="mt-1 text-caption text-secondary">
                  {item.sku} · {item.orderCount} order rugi
                </p>
                <p className="mt-2 flex flex-wrap gap-x-3 text-caption text-secondary">
                  {item.perPlatform.map((plat) => (
                    <span key={plat.platform}>
                      {plat.platform}:{" "}
                      <span className="text-body-strong text-primary">{plat.orderCount} order</span>{" "}
                      ({formatRupiah(plat.loss)})
                    </span>
                  ))}
                </p>
              </li>
            ))}
          </ul>
          {findings.belowCogs.length > 10 && (
            <p className="mt-2 text-caption text-disabled">
              Menampilkan 10 SKU dengan kerugian terbesar dari {findings.belowCogs.length} SKU.
            </p>
          )}
        </div>
      )}

      {/* --- Reorder point --- */}
      {findings.reorder.length > 0 && (
        <div className="rounded-md bg-surface p-3 shadow-card">
          <h3 className="flex items-center gap-2 text-body-strong text-primary">
            <PackageSearch size={16} strokeWidth={2} className="text-warning" aria-hidden="true" />
            Sudah menyentuh reorder point
          </h3>
          <p className="mt-1 text-caption text-secondary">
            Sisa stock pada akhir periode analisa sudah sama atau di bawah batas minimum
            yang ditetapkan di sheet inventory.
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {findings.reorder.map((item) => (
              <li key={item.sku} className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="min-w-0">
                  <span className="block truncate text-body text-primary">{item.namaProduk}</span>
                  <span className="text-caption text-secondary">
                    {item.sku} · {item.gudang}
                  </span>
                </span>
                <span
                  className={`text-body-strong ${item.sisaStock < 0 ? "text-critical" : "text-warning"}`}
                >
                  {item.sisaStock.toLocaleString("id-ID")} / min {item.reorderPoint}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* --- Gap harga --- */}
      {findings.priceGap.length > 0 && (
        <div className="rounded-md bg-surface p-3 shadow-card">
          <h3 className="flex items-center gap-2 text-body-strong text-primary">
            <Tag size={16} strokeWidth={2} className="text-critical" aria-hidden="true" />
            Harga jual di bawah COGS menurut file
          </h3>
          <p className="mt-1 text-caption text-secondary">
            Diambil dari sheet daftar harga. Ini sinyal harga rata-rata, terpisah dari
            order per transaksi di atas.
          </p>
          <ul className="mt-3 flex flex-col gap-3">
            {findings.priceGap.map((item) => (
              <li key={item.sku}>
                <p className="text-body text-primary">{item.namaProduk}</p>
                <p className="mt-1 text-caption text-secondary">
                  {item.sku}
                  {item.hargaInternal !== null
                    ? ` · harga internal ${formatRupiah(item.hargaInternal)}`
                    : ""}
                </p>
                <p className="mt-1 flex flex-wrap gap-2">
                  {item.flagged.map((flag) => (
                    <span
                      key={flag.label}
                      className="rounded-sm bg-critical-subtle px-2 py-1 text-badge uppercase text-critical"
                    >
                      {flag.label}: {flag.status}
                    </span>
                  ))}
                </p>
                {item.keterangan && (
                  <p className="mt-1 text-caption text-secondary">{item.keterangan}</p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
