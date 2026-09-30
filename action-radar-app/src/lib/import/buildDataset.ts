/**
 * Baris hasil parse → `SkuRaw[]` siap masuk logic engine, plus rekonsiliasi & temuan.
 *
 * INI bagian yang menggantikan pekerjaan 45 menit milik Fiona: menggabungkan
 * transaksi dari beberapa sheet seller center dengan sheet gudang, per SKU,
 * dalam satu window waktu. Logic engine di ../logic.ts sengaja TIDAK diubah —
 * dia tetap menerima `SkuRaw` yang sudah bersih, jadi hasil kalkulasinya tetap
 * identik dengan yang sudah lolos checkpoint test.
 */

import type { SkuRaw } from "../../types";
import type {
  AnalysisWindow,
  BelowCogsFinding,
  Dataset,
  Findings,
  ParsedWorkbook,
  Reconciliation,
  ReconciliationRow,
  ReorderFinding,
  PriceGapFinding,
  SalesRow,
  SkuExtra,
} from "./types";

export interface DatasetResult {
  skus: SkuRaw[];
  dataset: Dataset;
}

interface MasterEntry {
  sku: string;
  namaProduk: string;
  brand: string;
  subKategori: string;
  cogsPerUnit: number;
  reorderPoint: number | null;
  lokasi: { lokasi: string; stockAwal: number }[];
  totalStockAwal: number;
  /** true kalau stock awal memang ada di file (bukan hasil fallback). */
  punyaStockAwal: boolean;
}

interface WindowAgg {
  qty: number;
  revenueNet: number;
  totalCogs: number;
  perPlatform: Map<string, number>;
  /** Order below COGS di dalam window (dihitung dari angka, bukan kolom status). */
  belowCogsOrders: number;
  belowCogsLoss: number;
}

const MS_PER_DAY = 86_400_000;

/** Awal hari UTC, supaya perbandingan window bebas dari zona waktu. */
export function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function daysBetweenInclusive(start: Date, end: Date): number {
  const diff = Math.round((startOfUtcDay(end).getTime() - startOfUtcDay(start).getTime()) / MS_PER_DAY);
  return Math.max(1, diff + 1);
}

/** Window default: 7 hari terakhir yang ada datanya. */
export function defaultWindow(range: { min: Date; max: Date } | null): AnalysisWindow {
  if (!range) {
    const today = startOfUtcDay(new Date());
    return { start: today, end: today, elapsedHours: 24 };
  }
  const end = startOfUtcDay(range.max);
  const candidate = new Date(end.getTime() - 6 * MS_PER_DAY);
  const start = candidate < startOfUtcDay(range.min) ? startOfUtcDay(range.min) : candidate;
  return { start, end, elapsedHours: daysBetweenInclusive(start, end) * 24 };
}

function inWindow(row: SalesRow, window: AnalysisWindow): boolean {
  if (!row.date) return false;
  const t = row.date.getTime();
  return t >= window.start.getTime() && t <= window.end.getTime();
}

/* -------------------------------------------------------------------------- */
/* Master SKU                                                                 */
/* -------------------------------------------------------------------------- */

function buildMaster(parsed: ParsedWorkbook): Map<string, MasterEntry> {
  const master = new Map<string, MasterEntry>();

  const ensure = (sku: string): MasterEntry => {
    let entry = master.get(sku);
    if (!entry) {
      entry = {
        sku,
        namaProduk: "",
        brand: "",
        subKategori: "",
        cogsPerUnit: 0,
        reorderPoint: null,
        lokasi: [],
        totalStockAwal: 0,
        punyaStockAwal: false,
      };
      master.set(sku, entry);
    }
    return entry;
  };

  // 1. Sheet inventory adalah sumber utama identitas + stock awal + COGS.
  for (const row of parsed.inventory) {
    const entry = ensure(row.sku);
    if (!entry.namaProduk) entry.namaProduk = row.namaProduk;
    if (!entry.brand) entry.brand = row.brand;
    if (!entry.subKategori) entry.subKategori = row.subKategori;
    if (entry.cogsPerUnit === 0 && row.cogsPerUnit > 0) entry.cogsPerUnit = row.cogsPerUnit;
    if (entry.reorderPoint === null) entry.reorderPoint = row.reorderPoint;
    // Satu SKU bisa punya beberapa baris gudang.
    entry.lokasi.push({ lokasi: row.gudang, stockAwal: row.stockAwal });
    entry.totalStockAwal += row.stockAwal;
    entry.punyaStockAwal = true;
  }

  // 2. Stock Check melengkapi SKU yang tidak ada di sheet inventory.
  for (const row of parsed.stockCheck) {
    const entry = ensure(row.sku);
    if (!entry.namaProduk) entry.namaProduk = row.namaProduk;
    if (!entry.punyaStockAwal && row.stockAwal !== null) {
      entry.lokasi.push({ lokasi: "Gudang (dari Stock Check)", stockAwal: row.stockAwal });
      entry.totalStockAwal += row.stockAwal;
      entry.punyaStockAwal = true;
    }
  }

  // 3. Sales melengkapi nama produk, dan mengungkap SKU yang tidak ada di master.
  for (const row of parsed.sales) {
    const entry = ensure(row.sku);
    if (!entry.namaProduk) entry.namaProduk = row.namaProduk;
  }

  return master;
}

/* -------------------------------------------------------------------------- */
/* Entry point                                                                */
/* -------------------------------------------------------------------------- */

export function buildDataset(parsed: ParsedWorkbook, window: AnalysisWindow): DatasetResult {
  const master = buildMaster(parsed);

  // Agregat di dalam window (basis runrate & margin campaign berjalan).
  const windowAgg = new Map<string, WindowAgg>();
  // Total qty terjual SEPANJANG FILE (basis rekonsiliasi stock).
  const soldAll = new Map<string, number>();
  // Qty terjual sampai akhir window (basis sisa stock pada akhir window).
  const soldUpToEnd = new Map<string, number>();
  // Qty terjual SETELAH akhir window (untuk membalik sisa stock sheet ke akhir window).
  const soldAfterEnd = new Map<string, number>();

  const bump = (map: Map<string, number>, sku: string, value: number) => {
    map.set(sku, (map.get(sku) ?? 0) + value);
  };

  for (const row of parsed.sales) {
    bump(soldAll, row.sku, row.qty);

    // Transaksi tanpa tanggal tidak bisa ditempatkan di window mana pun, tapi
    // barangnya tetap keluar dari gudang — jadi tetap dihitung pada sisa stock.
    const afterEnd = row.date !== null && row.date.getTime() > window.end.getTime();
    if (afterEnd) bump(soldAfterEnd, row.sku, row.qty);
    else bump(soldUpToEnd, row.sku, row.qty);

    if (!inWindow(row, window)) continue;
    let agg = windowAgg.get(row.sku);
    if (!agg) {
      agg = {
        qty: 0,
        revenueNet: 0,
        totalCogs: 0,
        perPlatform: new Map(),
        belowCogsOrders: 0,
        belowCogsLoss: 0,
      };
      windowAgg.set(row.sku, agg);
    }
    agg.qty += row.qty;
    agg.revenueNet += row.revenueNet;
    agg.totalCogs += row.totalCogs;
    agg.perPlatform.set(row.platform, (agg.perPlatform.get(row.platform) ?? 0) + row.qty);
    const marginRow = row.revenueNet - row.totalCogs;
    if (marginRow < 0) {
      agg.belowCogsOrders += 1;
      agg.belowCogsLoss += Math.abs(marginRow);
    }
  }

  const sisaSheetBySku = new Map(parsed.stockCheck.map((row) => [row.sku, row.sisaStock]));

  /** Sisa stock pada akhir window. */
  const sisaPadaAkhirWindow = (entry: MasterEntry): number => {
    if (entry.punyaStockAwal) {
      return entry.totalStockAwal - (soldUpToEnd.get(entry.sku) ?? 0);
    }
    // Tanpa stock awal: mundur dari sisa stock sheet dengan menambahkan kembali
    // penjualan yang terjadi SETELAH akhir window.
    const sisaSekarang = sisaSheetBySku.get(entry.sku);
    if (sisaSekarang !== undefined) return sisaSekarang + (soldAfterEnd.get(entry.sku) ?? 0);
    return 0;
  };

  /* --- SkuRaw untuk engine ---------------------------------------------- */

  const skus: SkuRaw[] = [];
  const lokasiPerSku = new Map<string, { lokasi: string; stockAwal: number }[]>();
  const extras = new Map<string, SkuExtra>();

  for (const entry of master.values()) {
    const agg = windowAgg.get(entry.sku);
    const qty = agg?.qty ?? 0;
    const revenueNet = agg?.revenueNet ?? 0;
    const totalCogs = agg?.totalCogs ?? 0;
    const sisa = sisaPadaAkhirWindow(entry);

    // COGS per unit: dari sheet inventory; kalau tidak ada, turunkan dari
    // Total COGS ÷ qty pada window (dengan guard pembagi nol).
    const cogsPerUnit =
      entry.cogsPerUnit > 0 ? entry.cogsPerUnit : qty > 0 ? totalCogs / qty : 0;

    // Beberapa gudang tidak bisa dipetakan ke penjualan per gudang (file tidak
    // menyebut gudang mana yang memenuhi order), jadi sisa disajikan agregat.
    const lokasiList = entry.lokasi.length > 0 ? entry.lokasi : [{ lokasi: "Gudang", stockAwal: 0 }];
    lokasiPerSku.set(entry.sku, lokasiList);
    const stockGudang =
      lokasiList.length === 1
        ? [{ lokasi: lokasiList[0]?.lokasi ?? "Gudang", sisaStock: sisa }]
        : [{ lokasi: `Gabungan ${lokasiList.length} gudang`, sisaStock: sisa }];

    skus.push({
      sku: entry.sku,
      namaProduk: entry.namaProduk || entry.sku,
      brand: entry.brand,
      subKategori: entry.subKategori,
      cogsPerUnit,
      stockGudang,
      qtyTerjualCampaignBerjalan: qty,
      revenueNetCampaignBerjalan: revenueNet,
      cogsCampaignBerjalan: totalCogs,
    });

    extras.set(entry.sku, {
      perPlatform: [...(agg?.perPlatform ?? new Map<string, number>()).entries()]
        .map(([platform, platQty]) => ({ platform, qty: platQty }))
        .sort((a, b) => b.qty - a.qty),
      reorderPoint: entry.reorderPoint,
      lokasi: lokasiList.map((l) => l.lokasi).join(", "),
      belowCogsOrders: agg?.belowCogsOrders ?? 0,
      belowCogsLoss: agg?.belowCogsLoss ?? 0,
    });
  }

  skus.sort((a, b) => a.sku.localeCompare(b.sku));

  /* --- Rekonsiliasi ----------------------------------------------------- */

  const reconciliation = buildReconciliation(parsed, master, soldAll);

  /* --- Temuan ----------------------------------------------------------- */

  const findings = buildFindings(parsed, master, sisaPadaAkhirWindow);

  return {
    skus,
    dataset: {
      parsed,
      reconciliation,
      findings,
      skuAktifDalamWindow: windowAgg.size,
      lokasiPerSku,
      extras,
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Rekonsiliasi stock: sheet gudang vs hitungan dari transaksi                */
/* -------------------------------------------------------------------------- */

function buildReconciliation(
  parsed: ParsedWorkbook,
  master: Map<string, MasterEntry>,
  soldAll: Map<string, number>,
): Reconciliation {
  if (parsed.stockCheck.length === 0 || parsed.sales.length === 0) {
    return { available: false, rows: [], cocok: 0, selisih: 0 };
  }

  const rows: ReconciliationRow[] = [];
  let cocok = 0;
  let selisih = 0;

  for (const stock of parsed.stockCheck) {
    const entry = master.get(stock.sku);
    // Butuh stock awal dari sheet inventory (atau dari stock check itu sendiri)
    // untuk bisa menghitung ulang secara independen.
    const stockAwal = entry?.punyaStockAwal ? entry.totalStockAwal : stock.stockAwal;
    if (stockAwal === null || stockAwal === undefined) continue;

    const sisaHasilHitung = stockAwal - (soldAll.get(stock.sku) ?? 0);
    const delta = stock.sisaStock - sisaHasilHitung;
    if (delta === 0) cocok += 1;
    else selisih += 1;

    rows.push({
      sku: stock.sku,
      namaProduk: stock.namaProduk || entry?.namaProduk || stock.sku,
      sisaMenurutSheet: stock.sisaStock,
      sisaHasilHitung,
      selisih: delta,
    });
  }

  // Yang selisih ditaruh di atas — itu yang butuh perhatian.
  rows.sort((a, b) => Math.abs(b.selisih) - Math.abs(a.selisih));

  return { available: true, rows, cocok, selisih };
}

/* -------------------------------------------------------------------------- */
/* Temuan lintas sheet                                                        */
/* -------------------------------------------------------------------------- */

const BELOW_COGS_PATTERN = /below\s*cogs|bawah\s*cogs|rugi/i;

function buildFindings(
  parsed: ParsedWorkbook,
  master: Map<string, MasterEntry>,
  sisaPadaAkhirWindow: (entry: MasterEntry) => number,
): Findings {
  /* Order yang terjual di bawah COGS — dihitung dari angka, bukan dari kolom status. */
  interface Acc {
    orderCount: number;
    totalLoss: number;
    perPlatform: Map<string, { orderCount: number; loss: number }>;
  }
  const belowAcc = new Map<string, Acc>();
  let totalBelowCogsOrders = 0;
  let statusColumnDisagreements = 0;

  for (const row of parsed.sales) {
    const margin = row.revenueNet - row.totalCogs;
    const isBelow = margin < 0;

    // Cross-check terhadap kolom status di file, kalau ada.
    if (row.statusMarginFile !== null) {
      const fileSaysBelow = BELOW_COGS_PATTERN.test(row.statusMarginFile);
      if (fileSaysBelow !== isBelow) statusColumnDisagreements += 1;
    }

    if (!isBelow) continue;
    totalBelowCogsOrders += 1;

    let acc = belowAcc.get(row.sku);
    if (!acc) {
      acc = { orderCount: 0, totalLoss: 0, perPlatform: new Map() };
      belowAcc.set(row.sku, acc);
    }
    acc.orderCount += 1;
    acc.totalLoss += Math.abs(margin);
    const plat = acc.perPlatform.get(row.platform) ?? { orderCount: 0, loss: 0 };
    plat.orderCount += 1;
    plat.loss += Math.abs(margin);
    acc.perPlatform.set(row.platform, plat);
  }

  const belowCogs: BelowCogsFinding[] = [...belowAcc.entries()]
    .map(([sku, acc]) => ({
      sku,
      namaProduk: master.get(sku)?.namaProduk || sku,
      orderCount: acc.orderCount,
      totalLoss: acc.totalLoss,
      perPlatform: [...acc.perPlatform.entries()]
        .map(([platform, v]) => ({ platform, orderCount: v.orderCount, loss: v.loss }))
        .sort((a, b) => b.loss - a.loss),
    }))
    .sort((a, b) => b.totalLoss - a.totalLoss);

  /* Sisa stock sudah menyentuh reorder point. */
  const reorder: ReorderFinding[] = [];
  for (const entry of master.values()) {
    if (entry.reorderPoint === null || entry.reorderPoint <= 0) continue;
    const sisa = sisaPadaAkhirWindow(entry);
    if (sisa <= entry.reorderPoint) {
      reorder.push({
        sku: entry.sku,
        namaProduk: entry.namaProduk || entry.sku,
        sisaStock: sisa,
        reorderPoint: entry.reorderPoint,
        gudang: entry.lokasi.map((l) => l.lokasi).join(", ") || "—",
      });
    }
  }
  reorder.sort((a, b) => a.sisaStock - b.sisaStock);

  /* Harga jual di bawah COGS menurut sheet price list. */
  const priceGap: PriceGapFinding[] = [];
  for (const row of parsed.priceList) {
    const flagged = row.statuses.filter((s) => BELOW_COGS_PATTERN.test(s.status));
    if (flagged.length === 0) continue;
    priceGap.push({
      sku: row.sku,
      namaProduk: master.get(row.sku)?.namaProduk || row.sku,
      hargaInternal: row.hargaInternal,
      flagged,
      keterangan: row.keterangan,
    });
  }

  return {
    belowCogs,
    reorder,
    priceGap,
    totalBelowCogsOrders,
    statusColumnDisagreements,
  };
}
