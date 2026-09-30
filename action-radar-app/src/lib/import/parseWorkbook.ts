/**
 * Workbook mentah → baris terstruktur per peran sheet.
 *
 * Prinsip:
 *  - Peran sheet ditentukan dari TANDA TANGAN HEADER, bukan dari nama sheet.
 *    File user bisa saja menamai sheet-nya "Penjualan TT" atau "Sheet1".
 *  - Baris yang tidak bisa dipakai dibuang secara eksplisit dan DILAPORKAN
 *    (baris kosong, baris footer "TOTAL"), tidak pernah dibuang diam-diam.
 *  - Angka yang tidak valid tidak pernah jadi 0 diam-diam; baris yang kehilangan
 *    field wajib dilewati dan dihitung sebagai isu.
 */

import type { CellValue, Sheet, Workbook } from "../xlsx/reader";
import { buildHeaderMap, normalizeHeader, type CanonicalField, type HeaderMap } from "./columnMap";
import type {
  ImportIssue,
  InventoryRow,
  ParsedWorkbook,
  PriceListRow,
  PriceStatus,
  SalesRow,
  SheetRole,
  SheetSummary,
  StockCheckRow,
} from "./types";

/* -------------------------------------------------------------------------- */
/* Pembaca nilai sel yang defensif                                            */
/* -------------------------------------------------------------------------- */

function cellAt(row: readonly CellValue[], index: number | undefined): CellValue {
  if (index === undefined) return null;
  return row[index] ?? null;
}

function asText(value: CellValue): string {
  if (value === null) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim();
}

/**
 * Sel → angka. Mengembalikan null (bukan 0) kalau tidak bisa ditafsirkan,
 * supaya pemanggil memutuskan sendiri apa artinya data yang hilang.
 * Menangani format lokal Indonesia: "Rp1.234.567,89", "1.234", "(1.500)" = negatif.
 */
export function asNumber(value: CellValue): number | null {
  if (value === null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value instanceof Date) return null;

  let text = String(value).trim();
  if (text === "" || text === "-") return null;

  const negativeByParens = /^\(.*\)$/.test(text);
  if (negativeByParens) text = text.slice(1, -1);

  text = text.replace(/rp/gi, "").replace(/\s/g, "").replace(/%/g, "");

  // Tentukan pemisah desimal: yang terakhir muncul di antara "." dan ",".
  const lastDot = text.lastIndexOf(".");
  const lastComma = text.lastIndexOf(",");
  if (lastDot !== -1 && lastComma !== -1) {
    if (lastComma > lastDot) text = text.replace(/\./g, "").replace(",", ".");
    else text = text.replace(/,/g, "");
  } else if (lastComma !== -1) {
    // Hanya koma: desimal kalau 1-2 digit di belakang, kalau tidak pemisah ribuan.
    const decimals = text.length - lastComma - 1;
    text = decimals > 0 && decimals <= 2 ? text.replace(",", ".") : text.replace(/,/g, "");
  } else if (lastDot !== -1) {
    const decimals = text.length - lastDot - 1;
    if (decimals === 3 && !text.slice(0, lastDot).includes(".")) {
      // "1.234" → ambigu; di konteks Indonesia jauh lebih mungkin ribuan.
      text = text.replace(/\./g, "");
    }
  }

  const num = Number(text);
  if (!Number.isFinite(num)) return null;
  return negativeByParens ? -num : num;
}

/** Sel → tanggal (dinormalkan ke awal hari UTC). */
export function asDate(value: CellValue): Date | null {
  if (value instanceof Date) {
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }
  if (typeof value === "number") {
    // Serial Excel yang lolos tanpa format tanggal.
    const ms = Date.UTC(1899, 11, 30) + Math.round(value * 86_400_000);
    const d = new Date(ms);
    return Number.isNaN(d.getTime())
      ? null
      : new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }
  if (typeof value === "string") {
    const text = value.trim();
    if (text === "") return null;
    // dd/mm/yyyy dan dd-mm-yyyy: urutan hari-bulan ala Indonesia.
    const dmy = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/.exec(text);
    if (dmy) {
      const day = Number(dmy[1]);
      const month = Number(dmy[2]);
      const year = Number(dmy[3]);
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        return new Date(Date.UTC(year, month - 1, day));
      }
    }
    const parsed = new Date(text);
    if (Number.isNaN(parsed.getTime())) return null;
    return new Date(
      Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()),
    );
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* Klasifikasi peran sheet                                                    */
/* -------------------------------------------------------------------------- */

function has(map: HeaderMap, ...fields: CanonicalField[]): boolean {
  return fields.every((field) => map.index[field] !== undefined);
}

/**
 * Urutan pengecekan penting. Sheet "Stock Check" punya Stock Awal DAN Sisa Stock,
 * jadi harus diuji sebelum "inventory" yang juga punya Stock Awal.
 */
export function classifySheet(map: HeaderMap): SheetRole {
  if (!has(map, "sku")) return "unknown";
  if (has(map, "qty") && (has(map, "tanggal") || has(map, "orderId"))) return "sales";
  if (has(map, "sisaStock")) return "stock-check";
  if (has(map, "stockAwal")) return "inventory";
  if (map.priceStatusColumns.length > 0 || has(map, "hargaInternal")) return "price-list";
  return "unknown";
}

/**
 * Cari baris header. Umumnya baris 0, tapi file nyata sering punya judul/logo
 * di baris atas, jadi baris pertama yang menghasilkan kolom SKU yang dipakai.
 */
function findHeaderRow(sheet: Sheet): { rowIndex: number; map: HeaderMap } | null {
  const limit = Math.min(sheet.rows.length, 15);
  let best: { rowIndex: number; map: HeaderMap; score: number } | null = null;

  for (let i = 0; i < limit; i += 1) {
    const row = sheet.rows[i];
    if (!row || row.length === 0) continue;
    const map = buildHeaderMap(row);
    if (map.index.sku === undefined) continue;
    const score = Object.keys(map.index).length + map.priceStatusColumns.length;
    if (!best || score > best.score) best = { rowIndex: i, map, score };
  }
  return best ? { rowIndex: best.rowIndex, map: best.map } : null;
}

/* -------------------------------------------------------------------------- */
/* Deteksi baris yang harus dibuang                                           */
/* -------------------------------------------------------------------------- */

const SUMMARY_TOKENS = new Set([
  "total",
  "totals",
  "grandtotal",
  "subtotal",
  "jumlah",
  "totalkeseluruhan",
  "rata2",
  "ratarata",
  "average",
]);

function isBlankRow(row: readonly CellValue[]): boolean {
  return row.every((cell) => cell === null || (typeof cell === "string" && cell.trim() === ""));
}

/**
 * Baris footer ringkasan: SKU kosong tapi ada sel bertuliskan TOTAL/JUMLAH/dsb,
 * atau ada angka agregat. File dummy punya baris "TOTAL" di bawah tiap sheet sales;
 * kalau ikut terhitung, seluruh agregasi jadi dobel.
 */
function isSummaryRow(row: readonly CellValue[]): boolean {
  return row.some((cell) => typeof cell === "string" && SUMMARY_TOKENS.has(normalizeHeader(cell)));
}

/* -------------------------------------------------------------------------- */
/* Parser per peran                                                           */
/* -------------------------------------------------------------------------- */

interface RowScan {
  summary: SheetSummary;
  issues: ImportIssue[];
  /** Baris data valid beserta indeks aslinya. */
  dataRows: readonly CellValue[][];
}

function scanRows(sheet: Sheet, role: SheetRole, headerRowIndex: number, map: HeaderMap): RowScan {
  const issues: ImportIssue[] = [];
  const dataRows: CellValue[][] = [];
  let skippedBlank = 0;
  let skippedSummary = 0;
  let missingSku = 0;

  for (let i = headerRowIndex + 1; i < sheet.rows.length; i += 1) {
    const row = sheet.rows[i];
    if (!row || isBlankRow(row)) {
      skippedBlank += 1;
      continue;
    }
    const sku = asText(cellAt(row, map.index.sku));
    if (sku === "") {
      if (isSummaryRow(row)) skippedSummary += 1;
      else {
        skippedBlank += 1;
        missingSku += 1;
      }
      continue;
    }
    dataRows.push([...row]);
  }

  if (skippedSummary > 0) {
    issues.push({
      level: "info",
      sheet: sheet.name,
      message: `${skippedSummary} baris ringkasan (mis. "TOTAL") dilewati supaya tidak dihitung dua kali.`,
      count: skippedSummary,
    });
  }
  if (missingSku > 0) {
    issues.push({
      level: "warning",
      sheet: sheet.name,
      message: `${missingSku} baris punya isi tapi kolom SKU-nya kosong, jadi tidak bisa dipakai.`,
      count: missingSku,
    });
  }

  return {
    summary: {
      name: sheet.name,
      role,
      totalRows: Math.max(0, sheet.rows.length - headerRowIndex - 1),
      parsedRows: dataRows.length,
      skippedBlank,
      skippedSummary,
      unmappedHeaders: map.unmapped,
    },
    issues,
    dataRows,
  };
}

function parseInventory(scan: RowScan, map: HeaderMap, sheetName: string) {
  const rows: InventoryRow[] = [];
  const issues: ImportIssue[] = [];
  let missingCogs = 0;
  let missingStock = 0;

  for (const row of scan.dataRows) {
    const cogs = asNumber(cellAt(row, map.index.cogsPerUnit));
    const stockAwal = asNumber(cellAt(row, map.index.stockAwal));
    if (cogs === null) missingCogs += 1;
    if (stockAwal === null) missingStock += 1;

    rows.push({
      sku: asText(cellAt(row, map.index.sku)),
      namaProduk: asText(cellAt(row, map.index.namaProduk)),
      brand: asText(cellAt(row, map.index.brand)),
      subKategori: asText(cellAt(row, map.index.subKategori)),
      cogsPerUnit: cogs ?? 0,
      stockAwal: stockAwal ?? 0,
      reorderPoint: asNumber(cellAt(row, map.index.reorderPoint)),
      gudang: asText(cellAt(row, map.index.gudang)) || "Gudang (tidak disebut)",
    });
  }

  if (missingCogs > 0) {
    issues.push({
      level: "warning",
      sheet: sheetName,
      message: `${missingCogs} SKU tidak punya COGS per unit yang terbaca. Status margin SKU tersebut dianggap aman karena tidak ada pembanding.`,
      count: missingCogs,
    });
  }
  if (missingStock > 0) {
    issues.push({
      level: "warning",
      sheet: sheetName,
      message: `${missingStock} SKU tidak punya Stock Awal yang terbaca, dihitung sebagai 0.`,
      count: missingStock,
    });
  }
  return { rows, issues };
}

function parseSales(scan: RowScan, map: HeaderMap, sheetName: string) {
  const rows: SalesRow[] = [];
  const issues: ImportIssue[] = [];
  let missingDate = 0;
  let missingQty = 0;
  let cellErrors = 0;

  // Fallback nama platform dari nama sheet, mis. "Sales - TikTok" → "TikTok".
  const platformFromSheet = sheetName.replace(/^.*?[-–:]\s*/, "").trim() || sheetName;

  for (const row of scan.dataRows) {
    const qty = asNumber(cellAt(row, map.index.qty));
    const date = asDate(cellAt(row, map.index.tanggal));
    if (qty === null) missingQty += 1;
    if (date === null) missingDate += 1;

    const revenueRaw = cellAt(row, map.index.revenueNet);
    const cogsRaw = cellAt(row, map.index.totalCogs);
    if (typeof revenueRaw === "string" && revenueRaw.startsWith("#")) cellErrors += 1;
    if (typeof cogsRaw === "string" && cogsRaw.startsWith("#")) cellErrors += 1;

    const platformCell = asText(cellAt(row, map.index.platform));

    rows.push({
      sku: asText(cellAt(row, map.index.sku)),
      namaProduk: asText(cellAt(row, map.index.namaProduk)),
      platform: platformCell || platformFromSheet,
      date,
      qty: qty ?? 0,
      revenueNet: asNumber(revenueRaw) ?? 0,
      totalCogs: asNumber(cogsRaw) ?? 0,
      statusMarginFile: asText(cellAt(row, map.index.statusMargin)) || null,
    });
  }

  if (missingDate > 0) {
    issues.push({
      level: "warning",
      sheet: sheetName,
      message: `${missingDate} transaksi tidak punya tanggal yang terbaca. Transaksi ini tidak akan masuk ke window analisa mana pun.`,
      count: missingDate,
    });
  }
  if (missingQty > 0) {
    issues.push({
      level: "warning",
      sheet: sheetName,
      message: `${missingQty} transaksi tidak punya Qty Terjual yang terbaca, dihitung sebagai 0.`,
      count: missingQty,
    });
  }
  if (cellErrors > 0) {
    issues.push({
      level: "error",
      sheet: sheetName,
      message: `${cellErrors} sel berisi error Excel (mis. #N/A atau #DIV/0!) pada kolom revenue/COGS. Nilainya dianggap 0 — perbaiki di file sumber supaya angkanya akurat.`,
      count: cellErrors,
    });
  }
  return { rows, issues };
}

function parseStockCheck(scan: RowScan, map: HeaderMap, sheetName: string) {
  const rows: StockCheckRow[] = [];
  const issues: ImportIssue[] = [];
  let missingSisa = 0;

  for (const row of scan.dataRows) {
    const sisa = asNumber(cellAt(row, map.index.sisaStock));
    if (sisa === null) {
      missingSisa += 1;
      continue;
    }
    rows.push({
      sku: asText(cellAt(row, map.index.sku)),
      namaProduk: asText(cellAt(row, map.index.namaProduk)),
      stockAwal: asNumber(cellAt(row, map.index.stockAwal)),
      totalTerjual: asNumber(cellAt(row, map.index.totalTerjual)),
      sisaStock: sisa,
      statusStock: asText(cellAt(row, map.index.statusStock)) || null,
    });
  }

  if (missingSisa > 0) {
    issues.push({
      level: "warning",
      sheet: sheetName,
      message: `${missingSisa} baris dilewati karena Sisa Stock tidak terbaca.`,
      count: missingSisa,
    });
  }
  return { rows, issues };
}

function parsePriceList(scan: RowScan, map: HeaderMap) {
  const rows: PriceListRow[] = [];
  for (const row of scan.dataRows) {
    const statuses: PriceStatus[] = [];
    for (const col of map.priceStatusColumns) {
      const status = asText(row[col.index] ?? null);
      if (status !== "") statuses.push({ label: col.label, status });
    }
    rows.push({
      sku: asText(cellAt(row, map.index.sku)),
      hargaInternal: asNumber(cellAt(row, map.index.hargaInternal)),
      statuses,
      keterangan: asText(cellAt(row, map.index.keterangan)) || null,
    });
  }
  return { rows };
}

/* -------------------------------------------------------------------------- */
/* Entry point                                                                */
/* -------------------------------------------------------------------------- */

export function parseWorkbook(workbook: Workbook): ParsedWorkbook {
  const inventory: InventoryRow[] = [];
  const sales: SalesRow[] = [];
  const stockCheck: StockCheckRow[] = [];
  const priceList: PriceListRow[] = [];
  const sheets: SheetSummary[] = [];
  const issues: ImportIssue[] = [];

  for (const sheet of workbook.sheets) {
    const header = findHeaderRow(sheet);
    if (!header) {
      sheets.push({
        name: sheet.name,
        role: "unknown",
        totalRows: sheet.rows.length,
        parsedRows: 0,
        skippedBlank: 0,
        skippedSummary: 0,
        unmappedHeaders: [],
      });
      issues.push({
        level: "info",
        sheet: sheet.name,
        message: "Sheet dilewati: tidak ada kolom SKU yang bisa dikenali.",
      });
      continue;
    }

    const role = classifySheet(header.map);
    const scan = scanRows(sheet, role, header.rowIndex, header.map);
    sheets.push(scan.summary);
    issues.push(...scan.issues);

    switch (role) {
      case "inventory": {
        const result = parseInventory(scan, header.map, sheet.name);
        inventory.push(...result.rows);
        issues.push(...result.issues);
        break;
      }
      case "sales": {
        const result = parseSales(scan, header.map, sheet.name);
        sales.push(...result.rows);
        issues.push(...result.issues);
        break;
      }
      case "stock-check": {
        const result = parseStockCheck(scan, header.map, sheet.name);
        stockCheck.push(...result.rows);
        issues.push(...result.issues);
        break;
      }
      case "price-list": {
        priceList.push(...parsePriceList(scan, header.map).rows);
        break;
      }
      case "unknown": {
        issues.push({
          level: "info",
          sheet: sheet.name,
          message:
            "Sheet punya kolom SKU tapi tidak cocok pola penjualan/inventory/stock check, jadi tidak dipakai.",
        });
        break;
      }
    }
  }

  const platforms = [...new Set(sales.map((row) => row.platform))].sort();

  const dates = sales
    .map((row) => row.date)
    .filter((date): date is Date => date !== null)
    .map((date) => date.getTime());
  const dateRange =
    dates.length > 0
      ? { min: new Date(Math.min(...dates)), max: new Date(Math.max(...dates)) }
      : null;

  if (sales.length === 0) {
    issues.push({
      level: "error",
      sheet: "—",
      message:
        "Tidak ada sheet penjualan yang terbaca. Dibutuhkan minimal satu sheet dengan kolom SKU, Qty Terjual, dan Tanggal Transaksi.",
    });
  }
  if (inventory.length === 0 && stockCheck.length === 0) {
    issues.push({
      level: "error",
      sheet: "—",
      message:
        "Tidak ada data stock yang terbaca. Dibutuhkan sheet dengan kolom Stock Awal atau Sisa Stock.",
    });
  }

  return { inventory, sales, stockCheck, priceList, sheets, issues, platforms, dateRange };
}
