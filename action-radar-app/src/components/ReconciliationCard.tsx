/**
 * Hasil rekonsiliasi stock: angka sheet gudang vs hitung ulang dari transaksi.
 *
 * Inilah cross-check yang dulu dikerjakan manual. Yang penting bukan cuma
 * menampilkan selisih, tapi juga menyatakan dengan jelas ketika TIDAK ada
 * selisih — supaya user tahu dia sudah boleh berhenti mengecek.
 */

import { CheckCircle2, ScanSearch } from "lucide-react";
import type { Reconciliation } from "../lib/import/types";

interface ReconciliationCardProps {
  reconciliation: Reconciliation;
}

export function ReconciliationCard({ reconciliation }: ReconciliationCardProps) {
  if (!reconciliation.available) {
    return (
      <section className="rounded-md bg-surface p-3 shadow-card">
        <h2 className="flex items-center gap-2 text-body-strong text-primary">
          <ScanSearch size={16} strokeWidth={2} aria-hidden="true" />
          Rekonsiliasi stock
        </h2>
        <p className="mt-2 text-body text-secondary">
          Tidak bisa dijalankan: butuh sheet stock gudang (kolom Sisa Stock) dan sheet
          penjualan sekaligus, supaya angkanya bisa dibandingkan.
        </p>
      </section>
    );
  }

  const bermasalah = reconciliation.rows.filter((row) => row.selisih !== 0);
  const total = reconciliation.rows.length;

  return (
    <section className="rounded-md bg-surface p-3 shadow-card">
      <h2 className="flex items-center gap-2 text-body-strong text-primary">
        <ScanSearch size={16} strokeWidth={2} aria-hidden="true" />
        Rekonsiliasi stock
      </h2>
      <p className="mt-1 text-caption text-secondary">
        Sisa stock di sheet gudang dibandingkan dengan Stock Awal dikurangi seluruh qty
        terjual dari sheet penjualan.
      </p>

      {bermasalah.length === 0 ? (
        <div className="mt-3 flex items-start gap-2 rounded-md bg-safe-subtle p-3">
          <CheckCircle2
            size={16}
            strokeWidth={2}
            className="mt-0.5 shrink-0 text-safe"
            aria-hidden="true"
          />
          <p className="text-body text-primary">
            <span className="text-body-strong">{total} SKU cocok, tidak ada selisih.</span>{" "}
            <span className="text-secondary">
              Angka gudang konsisten dengan transaksi seller center — tidak ada yang perlu
              dicek ulang manual.
            </span>
          </p>
        </div>
      ) : (
        <>
          <p className="mt-3 text-body text-secondary">
            <span className="text-body-strong text-critical">
              {bermasalah.length} SKU selisih
            </span>{" "}
            dari {total} SKU. Selisih berarti stock fisik dan catatan penjualan tidak
            sinkron — cek dulu sebelum mengambil keputusan delist atau replenish.
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {bermasalah.map((row) => (
              <li
                key={row.sku}
                className="rounded-md border-l-[3px] border-l-critical bg-surface-raised p-3"
              >
                <p className="text-body-strong text-primary">{row.namaProduk}</p>
                <p className="mt-1 text-caption text-secondary">{row.sku}</p>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  <span className="flex flex-col">
                    <span className="text-caption text-secondary">Sheet gudang</span>
                    <span className="text-body-strong text-primary">
                      {row.sisaMenurutSheet.toLocaleString("id-ID")}
                    </span>
                  </span>
                  <span className="flex flex-col">
                    <span className="text-caption text-secondary">Hasil hitung</span>
                    <span className="text-body-strong text-primary">
                      {row.sisaHasilHitung.toLocaleString("id-ID")}
                    </span>
                  </span>
                  <span className="flex flex-col">
                    <span className="text-caption text-secondary">Selisih</span>
                    <span className="text-body-strong text-critical">
                      {row.selisih > 0 ? "+" : ""}
                      {row.selisih.toLocaleString("id-ID")}
                    </span>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
