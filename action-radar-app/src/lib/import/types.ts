/**
 * Kontrak data untuk layer import (Excel → dataset siap dihitung).
 *
 * Layer ini sengaja dipisah dari `src/types.ts` (kontrak logic engine).
 * Engine tetap menerima `SkuRaw` yang sudah bersih dan sudah tergabung —
 * semua kerumitan "cross-check antar sheet" berhenti di sini.
 */

export type SheetRole = "inventory" | "sales" | "stock-check" | "price-list" | "unknown";

/** Severity untuk temuan kualitas data saat import. */
export type IssueLevel = "error" | "warning" | "info";

export interface ImportIssue {
  level: IssueLevel;
  sheet: string;
  message: string;
  /** Jumlah kejadian, kalau isu yang sama terulang di banyak baris. */
  count?: number;
}

/* --- Baris hasil parse per jenis sheet ----------------------------------- */

export interface InventoryRow {
  sku: string;
  namaProduk: string;
  brand: string;
  subKategori: string;
  cogsPerUnit: number;
  stockAwal: number;
  reorderPoint: number | null;
  gudang: string;
}

export interface SalesRow {
  sku: string;
  namaProduk: string;
  /** Nama platform. Diambil dari kolom Platform, fallback ke nama sheet. */
  platform: string;
  /** Tanggal transaksi (UTC, dinormalkan ke awal hari). null = tidak terbaca. */
  date: Date | null;
  qty: number;
  revenueNet: number;
  totalCogs: number;
  /** Kolom `Status Margin (vs COGS)` dari file, kalau ada. Untuk cross-check. */
  statusMarginFile: string | null;
}

export interface StockCheckRow {
  sku: string;
  namaProduk: string;
  stockAwal: number | null;
  totalTerjual: number | null;
  sisaStock: number;
  statusStock: string | null;
}

export interface PriceStatus {
  /** Label platform, mis. "TikTok" (diambil dari nama kolom). */
  label: string;
  status: string;
}

export interface PriceListRow {
  sku: string;
  hargaInternal: number | null;
  statuses: PriceStatus[];
  keterangan: string | null;
}

/** Ringkasan per sheet: apa yang terbaca, apa yang dilewati. */
export interface SheetSummary {
  name: string;
  role: SheetRole;
  totalRows: number;
  parsedRows: number;
  skippedBlank: number;
  /** Baris ringkasan/footer (mis. baris "TOTAL") yang sengaja dibuang. */
  skippedSummary: number;
  /** Header yang tidak dikenali — dibiarkan, hanya dilaporkan. */
  unmappedHeaders: string[];
}

export interface ParsedWorkbook {
  inventory: InventoryRow[];
  sales: SalesRow[];
  stockCheck: StockCheckRow[];
  priceList: PriceListRow[];
  sheets: SheetSummary[];
  issues: ImportIssue[];
  /** Nama platform yang ditemukan di seluruh sheet sales. */
  platforms: string[];
  /** Rentang tanggal transaksi yang ada di file. null kalau tidak ada tanggal valid. */
  dateRange: { min: Date; max: Date } | null;
}

/* --- Hasil rekonsiliasi & temuan ---------------------------------------- */

export interface ReconciliationRow {
  sku: string;
  namaProduk: string;
  /** Sisa stock menurut sheet Stock Check. */
  sisaMenurutSheet: number;
  /** Stock Awal − total qty terjual dari seluruh baris transaksi. */
  sisaHasilHitung: number;
  selisih: number;
}

export interface Reconciliation {
  /** Bisa dijalankan hanya kalau ada sheet Stock Check DAN sheet sales. */
  available: boolean;
  rows: ReconciliationRow[];
  cocok: number;
  selisih: number;
}

export interface BelowCogsFinding {
  sku: string;
  namaProduk: string;
  /** Jumlah baris order yang revenue net-nya di bawah COGS. */
  orderCount: number;
  /** Total kerugian absolut dari order-order tersebut (Rp). */
  totalLoss: number;
  /** Rincian jumlah order per platform. */
  perPlatform: { platform: string; orderCount: number; loss: number }[];
}

export interface ReorderFinding {
  sku: string;
  namaProduk: string;
  sisaStock: number;
  reorderPoint: number;
  gudang: string;
}

export interface PriceGapFinding {
  sku: string;
  namaProduk: string;
  hargaInternal: number | null;
  /** Hanya status yang mengindikasikan jual di bawah COGS. */
  flagged: PriceStatus[];
  keterangan: string | null;
}

export interface Findings {
  belowCogs: BelowCogsFinding[];
  reorder: ReorderFinding[];
  priceGap: PriceGapFinding[];
  /** Total order below COGS di seluruh file, lintas SKU. */
  totalBelowCogsOrders: number;
  /** Jumlah baris yang kolom status-nya di file tidak sinkron dengan hitungan angka. */
  statusColumnDisagreements: number;
}

/* --- Konfigurasi window analisa ----------------------------------------- */

export interface AnalysisWindow {
  /** Awal window (inklusif, UTC awal hari). */
  start: Date;
  /** Akhir window (inklusif, UTC awal hari). */
  end: Date;
  /**
   * Jam berjalan yang dipakai sebagai pembagi runrate.
   * Default = jumlah hari window × 24, tapi bisa di-override user untuk
   * memodelkan intensitas campaign (mis. flash sale 4 jam).
   */
  elapsedHours: number;
}

/**
 * Konteks tambahan per SKU yang dipakai UI tapi BUKAN bagian dari kontrak
 * logic engine. Dipisah supaya `SkuMetrics` tetap persis seperti TECH_SPEC.
 */
export interface SkuExtra {
  /** Qty terjual di dalam window, dipecah per platform. */
  perPlatform: { platform: string; qty: number }[];
  reorderPoint: number | null;
  /** Nama gudang, digabung kalau lebih dari satu. */
  lokasi: string;
  /** Jumlah order below COGS di dalam window. */
  belowCogsOrders: number;
  /** Total kerugian absolut dari order-order tersebut, di dalam window. */
  belowCogsLoss: number;
}

export interface Dataset {
  parsed: ParsedWorkbook;
  reconciliation: Reconciliation;
  findings: Findings;
  /** Jumlah SKU yang punya transaksi di dalam window. */
  skuAktifDalamWindow: number;
  /** Peta SKU → daftar lokasi gudang beserta stock awalnya (untuk tampilan detail). */
  lokasiPerSku: Map<string, { lokasi: string; stockAwal: number }[]>;
  extras: Map<string, SkuExtra>;
}
