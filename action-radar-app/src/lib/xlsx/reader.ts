/**
 * Reader .xlsx — dari byte mentah jadi matriks sel per sheet.
 *
 * Semuanya berjalan di browser (client-side). Tidak ada upload ke server,
 * tidak ada network call. File yang dipilih user tidak pernah meninggalkan
 * perangkatnya — konsisten dengan batasan "no backend" di TECH_SPEC.md.
 *
 * Pilihan dependency: hanya `fflate` untuk inflate/unzip. Parsing SpreadsheetML
 * ditulis sendiri di ./xml.ts.
 */

import { unzipSync } from "fflate";
import { collectTextNodes, decodeXmlText, iterElements } from "./xml";

export type CellValue = string | number | boolean | Date | null;

export interface Sheet {
  name: string;
  /** Matriks dense: rows[r][c]. Baris/kolom yang dilewati Excel diisi null. */
  rows: CellValue[][];
}

export interface Workbook {
  sheets: Sheet[];
}

export class XlsxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "XlsxError";
  }
}

/* -------------------------------------------------------------------------- */
/* Helper                                                                     */
/* -------------------------------------------------------------------------- */

const decoder = new TextDecoder("utf-8");

function decodeEntry(files: Record<string, Uint8Array>, path: string): string | null {
  const data = files[path];
  if (!data) return null;
  return decoder.decode(data);
}

/** "BC12" → 728 (0-based). */
export function columnRefToIndex(ref: string): number {
  let index = 0;
  for (let i = 0; i < ref.length; i += 1) {
    const code = ref.charCodeAt(i);
    if (code >= 65 && code <= 90) index = index * 26 + (code - 64);
    else if (code >= 97 && code <= 122) index = index * 26 + (code - 96);
    else break;
  }
  return index - 1;
}

/**
 * numFmtId bawaan Excel yang merepresentasikan tanggal/waktu.
 * Di luar daftar ini, format dianggap tanggal kalau string format-nya
 * mengandung token tanggal (y/m/d/h/s) di luar tanda kutip.
 */
const BUILTIN_DATE_FORMATS = new Set([
  14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50,
  51, 52, 53, 54, 55, 56, 57, 58,
]);

function looksLikeDateFormat(code: string): boolean {
  // Buang bagian literal di dalam kutip dan escape, supaya teks seperti "Month" tidak salah kira.
  const stripped = code.replace(/"[^"]*"/g, "").replace(/\\./g, "");
  return /[ymdhs]/i.test(stripped) && !/^[^[]*\[[^\]]*\]$/.test(stripped);
}

const MS_PER_DAY = 86_400_000;
/** Epoch serial Excel: 1899-12-30 UTC (sistem 1900). */
const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30);

/**
 * Serial Excel → Date (UTC).
 *
 * Catatan akurasi: Excel menganggap 1900 tahun kabisat (bug historis), sehingga
 * serial 60 memetakan ke "1900-02-29" yang tidak pernah ada. Serial <= 60 karena
 * itu tidak bisa dipetakan tepat; rentang ini praktis tidak muncul pada data
 * transaksi nyata, jadi dibiarkan apa adanya alih-alih menambah cabang khusus.
 */
export function excelSerialToDate(serial: number, date1904: boolean): Date {
  const base = date1904 ? EXCEL_EPOCH_UTC + 1462 * MS_PER_DAY : EXCEL_EPOCH_UTC;
  return new Date(base + Math.round(serial * MS_PER_DAY));
}

/* -------------------------------------------------------------------------- */
/* Styles: peta indeks style → apakah bertipe tanggal                         */
/* -------------------------------------------------------------------------- */

function buildDateStyleMap(stylesXml: string | null): boolean[] {
  if (!stylesXml) return [];

  const customFormats = new Map<number, string>();
  for (const fmt of iterElements(stylesXml, "numFmt")) {
    const id = Number.parseInt(fmt.attrs["numFmtId"] ?? "", 10);
    const code = fmt.attrs["formatCode"];
    if (Number.isFinite(id) && code !== undefined) customFormats.set(id, decodeXmlText(code));
  }

  // Hanya cellXfs yang relevan (indeks `s` pada <c> menunjuk ke sini), bukan cellStyleXfs.
  const cellXfsBlocks = [...iterElements(stylesXml, "cellXfs")];
  const cellXfs = cellXfsBlocks.at(-1);
  if (!cellXfs?.inner) return [];

  const isDate: boolean[] = [];
  for (const xf of iterElements(cellXfs.inner, "xf")) {
    const id = Number.parseInt(xf.attrs["numFmtId"] ?? "0", 10);
    if (!Number.isFinite(id)) {
      isDate.push(false);
      continue;
    }
    const custom = customFormats.get(id);
    isDate.push(custom !== undefined ? looksLikeDateFormat(custom) : BUILTIN_DATE_FORMATS.has(id));
  }
  return isDate;
}

/* -------------------------------------------------------------------------- */
/* Shared strings                                                             */
/* -------------------------------------------------------------------------- */

function buildSharedStrings(sstXml: string | null): string[] {
  if (!sstXml) return [];
  const strings: string[] = [];
  for (const si of iterElements(sstXml, "si")) {
    strings.push(si.inner === null ? "" : collectTextNodes(si.inner));
  }
  return strings;
}

/* -------------------------------------------------------------------------- */
/* Sheet                                                                      */
/* -------------------------------------------------------------------------- */

interface ParseContext {
  shared: string[];
  dateStyles: boolean[];
  date1904: boolean;
}

function parseSheet(xml: string, ctx: ParseContext): CellValue[][] {
  const byRow = new Map<number, CellValue[]>();
  let maxRow = 0;

  for (const row of iterElements(xml, "row")) {
    if (row.inner === null) continue;
    const declared = Number.parseInt(row.attrs["r"] ?? "", 10);
    const rowIndex = Number.isFinite(declared) ? declared - 1 : byRow.size;
    const cells: CellValue[] = [];

    for (const cell of iterElements(row.inner, "c")) {
      const ref = cell.attrs["r"];
      const colIndex = ref ? columnRefToIndex(ref) : cells.length;
      if (colIndex < 0) continue;

      cells[colIndex] = readCell(cell.attrs, cell.inner, ctx);
    }

    // Normalisasi lubang jadi null, bukan undefined.
    for (let i = 0; i < cells.length; i += 1) {
      if (cells[i] === undefined) cells[i] = null;
    }

    byRow.set(rowIndex, cells);
    if (rowIndex + 1 > maxRow) maxRow = rowIndex + 1;
  }

  const rows: CellValue[][] = [];
  for (let r = 0; r < maxRow; r += 1) rows.push(byRow.get(r) ?? []);
  return rows;
}

function readCell(
  attrs: Record<string, string>,
  inner: string | null,
  ctx: ParseContext,
): CellValue {
  const type = attrs["t"] ?? "n";

  if (type === "inlineStr") {
    return inner === null ? null : collectTextNodes(inner);
  }

  const vEl = inner === null ? null : firstInner(inner, "v");
  if (vEl === null) {
    // Bisa jadi sel formula tanpa cached value, atau sel kosong bergaya.
    return null;
  }
  const raw = decodeXmlText(vEl);

  switch (type) {
    case "s": {
      const index = Number.parseInt(raw, 10);
      return ctx.shared[index] ?? "";
    }
    case "b":
      return raw === "1";
    case "e":
      // Error Excel (#N/A, #DIV/0!, ...) — dipertahankan sebagai teks supaya
      // layer import bisa melaporkannya, bukan diam-diam jadi 0.
      return raw;
    case "str":
      return raw;
    case "d": {
      const parsed = new Date(raw);
      return Number.isNaN(parsed.getTime()) ? raw : parsed;
    }
    default: {
      const num = Number(raw);
      if (!Number.isFinite(num)) return raw === "" ? null : raw;
      const styleIndex = Number.parseInt(attrs["s"] ?? "", 10);
      if (Number.isFinite(styleIndex) && ctx.dateStyles[styleIndex]) {
        return excelSerialToDate(num, ctx.date1904);
      }
      return num;
    }
  }
}

/** Ambil isi elemen anak langsung pertama dengan nama tertentu. */
function firstInner(fragment: string, name: string): string | null {
  for (const el of iterElements(fragment, name)) return el.inner ?? "";
  return null;
}

/* -------------------------------------------------------------------------- */
/* Entry point                                                                */
/* -------------------------------------------------------------------------- */

export function readWorkbook(bytes: Uint8Array): Workbook {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new XlsxError(
      "File tidak bisa dibuka sebagai .xlsx. Kalau ini file .xls lama atau .csv, buka di Excel lalu Save As .xlsx.",
    );
  }

  const workbookXml = decodeEntry(files, "xl/workbook.xml");
  if (!workbookXml) {
    throw new XlsxError("Struktur .xlsx tidak lengkap: xl/workbook.xml tidak ditemukan.");
  }

  const date1904 = /date1904\s*=\s*"(1|true)"/i.test(workbookXml);
  const ctx: ParseContext = {
    shared: buildSharedStrings(decodeEntry(files, "xl/sharedStrings.xml")),
    dateStyles: buildDateStyleMap(decodeEntry(files, "xl/styles.xml")),
    date1904,
  };

  // rId → path sheet
  const relsXml = decodeEntry(files, "xl/_rels/workbook.xml.rels") ?? "";
  const relTargets = new Map<string, string>();
  for (const rel of iterElements(relsXml, "Relationship")) {
    const id = rel.attrs["Id"];
    const target = rel.attrs["Target"];
    if (!id || !target) continue;
    let path = target.replace(/^\/+/, "");
    if (!path.startsWith("xl/")) path = `xl/${path.replace(/^\.\//, "")}`;
    relTargets.set(id, path);
  }

  const sheets: Sheet[] = [];
  let fallbackIndex = 0;
  for (const sheet of iterElements(workbookXml, "sheet")) {
    fallbackIndex += 1;
    const name = sheet.attrs["name"] ?? `Sheet${fallbackIndex}`;
    const relId = sheet.attrs["r:id"] ?? sheet.attrs["id"];
    const path =
      (relId ? relTargets.get(relId) : undefined) ?? `xl/worksheets/sheet${fallbackIndex}.xml`;
    const sheetXml = decodeEntry(files, path);
    if (!sheetXml) continue; // sheet tidak terbaca: dilewati, bukan bikin gagal total
    sheets.push({ name, rows: parseSheet(sheetXml, ctx) });
  }

  if (sheets.length === 0) {
    throw new XlsxError("Tidak ada sheet yang bisa dibaca dari file ini.");
  }

  return { sheets };
}
