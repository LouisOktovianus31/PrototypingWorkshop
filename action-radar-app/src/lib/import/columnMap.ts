/**
 * Pemetaan header kolom → field kanonik.
 *
 * Header dicocokkan secara longgar (case-insensitive, tanda baca dan spasi
 * diabaikan) supaya file dari sumber berbeda tetap terbaca tanpa user harus
 * merapikan kolom dulu. Contoh yang semuanya cocok ke `qty`:
 *   "Qty Terjual", "QTY TERJUAL (unit)", "qty_terjual", "Quantity Terjual"
 */

import type { CellValue } from "../xlsx/reader";

/** Normalisasi header: huruf kecil, hanya alfanumerik. */
export function normalizeHeader(value: CellValue): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Definisi satu field kanonik: daftar pola yang dianggap cocok.
 * `exact` diuji lebih dulu supaya kolom spesifik tidak kalah oleh pola umum
 * (mis. "cogsperunit" tidak boleh tertangkap oleh pola "totalcogs").
 */
interface FieldMatcher {
  exact?: readonly string[];
  includes?: readonly string[];
  /** Pola yang, kalau ada, membatalkan kecocokan. */
  excludes?: readonly string[];
}

const MATCHERS = {
  sku: { exact: ["sku", "kodesku", "kodeproduk", "productcode"] },
  namaProduk: { includes: ["namaproduk", "productname", "namabarang"] },
  brand: { exact: ["brand", "merek", "merk"] },
  subKategori: { includes: ["subkategori", "subcategory", "kategori", "category"] },
  cogsPerUnit: {
    includes: ["cogsperunit", "hppperunit", "modalperunit"],
    excludes: ["total"],
  },
  stockAwal: { includes: ["stockawal", "stokawal", "openingstock"] },
  reorderPoint: { includes: ["reorderpoint", "reorder", "minstock", "minimumstock"] },
  gudang: { includes: ["gudang", "lokasi", "warehouse"] },

  tanggal: { includes: ["tanggal", "date", "tgl"] },
  platform: { exact: ["platform", "channel", "marketplace", "sellercenter"] },
  orderId: { includes: ["orderid", "nomororder", "noorder", "ordernumber"] },
  qty: {
    includes: ["qtyterjual", "qty", "quantity", "jumlahterjual"],
    excludes: ["total", "sisa"],
  },
  revenueNet: { includes: ["totalrevenuenet", "revenuenet", "totalpenjualannet"] },
  totalCogs: { includes: ["totalcogs", "totalhpp", "totalmodal"] },
  statusMargin: { includes: ["statusmargin"] },

  totalTerjual: { includes: ["totalterjual", "totalsold"] },
  sisaStock: { includes: ["sisastock", "sisastok", "remainingstock", "stockakhir", "stokakhir"] },
  statusStock: { includes: ["statusstock", "statusstok"] },

  hargaInternal: { includes: ["hargainternal"] },
  keterangan: { includes: ["keterangan", "catatan", "note", "remarks"] },
} as const satisfies Record<string, FieldMatcher>;

export type CanonicalField = keyof typeof MATCHERS;

function matches(normalized: string, matcher: FieldMatcher): boolean {
  if (normalized === "") return false;
  if (matcher.excludes?.some((pattern) => normalized.includes(pattern))) return false;
  if (matcher.exact?.includes(normalized)) return true;
  return matcher.includes?.some((pattern) => normalized.includes(pattern)) ?? false;
}

export interface HeaderMap {
  /** field kanonik → indeks kolom */
  index: Partial<Record<CanonicalField, number>>;
  /** Header asli per indeks kolom (untuk pelaporan). */
  originals: string[];
  normalized: string[];
  /** Header yang tidak cocok ke field kanonik mana pun. */
  unmapped: string[];
  /** Kolom "Status Harga <platform>" pada sheet price list. */
  priceStatusColumns: { index: number; label: string }[];
}

/**
 * Bangun peta header. Kalau dua kolom cocok ke field yang sama, yang pertama menang —
 * ini penting untuk file yang punya kolom turunan (mis. "COGS per Unit" lalu
 * "COGS per Unit Setelah Fee").
 */
export function buildHeaderMap(headerRow: readonly CellValue[]): HeaderMap {
  const originals = headerRow.map((cell) =>
    cell === null || cell === undefined ? "" : String(cell).trim(),
  );
  const normalized = headerRow.map(normalizeHeader);

  const index: Partial<Record<CanonicalField, number>> = {};
  const priceStatusColumns: { index: number; label: string }[] = [];
  const matchedColumns = new Set<number>();

  // Kolom status harga per platform: "Status Harga TikTok" → label "TikTok".
  normalized.forEach((norm, i) => {
    if (norm.startsWith("statusharga")) {
      const original = originals[i] ?? "";
      const label = original.replace(/status\s*harga\s*/i, "").trim() || `Kolom ${i + 1}`;
      priceStatusColumns.push({ index: i, label });
      matchedColumns.add(i);
    }
  });

  for (const field of Object.keys(MATCHERS) as CanonicalField[]) {
    const matcher: FieldMatcher = MATCHERS[field];
    for (let i = 0; i < normalized.length; i += 1) {
      if (matchedColumns.has(i)) continue;
      const norm = normalized[i];
      if (norm === undefined) continue;
      if (matches(norm, matcher)) {
        index[field] = i;
        matchedColumns.add(i);
        break;
      }
    }
  }

  const unmapped = originals.filter(
    (original, i) => original !== "" && !matchedColumns.has(i),
  );

  return { index, originals, normalized, unmapped, priceStatusColumns };
}
