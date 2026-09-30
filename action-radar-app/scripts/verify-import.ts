import { readFileSync } from "node:fs";
import { readWorkbook } from "../src/lib/xlsx/reader";
import { parseWorkbook } from "../src/lib/import/parseWorkbook";
import { buildDataset, daysBetweenInclusive, defaultWindow, startOfUtcDay } from "../src/lib/import/buildDataset";
import type { AnalysisWindow } from "../src/lib/import/types";
import { buildViewModel } from "../src/lib/logic";
import { formatJamSampaiHabis, formatRupiah } from "../src/lib/format";

const bytes = new Uint8Array(readFileSync("public/contoh-data-penjualan.xlsx"));
const parsed = parseWorkbook(readWorkbook(bytes));
const iso = (d: Date) => d.toISOString().slice(0, 10);
const problems: string[] = [];

console.log("=== SHEET CLASSIFICATION ===");
for (const s of parsed.sheets) {
  console.log(
    `  ${s.name.padEnd(36)} role=${s.role.padEnd(12)} parsed=${String(s.parsedRows).padStart(3)} skipBlank=${s.skippedBlank} skipSummary=${s.skippedSummary}`,
  );
  if (s.unmappedHeaders.length) console.log(`      header tak dipetakan: ${s.unmappedHeaders.join(" | ")}`);
}
console.log(`\nplatform: ${parsed.platforms.join(", ")}`);
console.log(`tanggal : ${parsed.dateRange ? iso(parsed.dateRange.min) + " .. " + iso(parsed.dateRange.max) : "—"}`);
console.log(`baris   : inventory=${parsed.inventory.length} sales=${parsed.sales.length} stockCheck=${parsed.stockCheck.length} priceList=${parsed.priceList.length}`);
console.log("\nISSUES:");
for (const i of parsed.issues) console.log(`  [${i.level}] ${i.sheet}: ${i.message}`);

// --- Ekspektasi dari analisa Python independen ---
const expectRole: Record<string, string> = {
  "Master Inventory": "inventory",
  "Sales - TikTok": "sales",
  "Sales - Shopee": "sales",
  "Stock Check": "stock-check",
  "Price List (Internal vs Ecommerce)": "price-list",
};
for (const s of parsed.sheets) {
  if (expectRole[s.name] && s.role !== expectRole[s.name]) problems.push(`${s.name}: role ${s.role}, harusnya ${expectRole[s.name]}`);
}
if (parsed.sales.length !== 200) problems.push(`sales rows ${parsed.sales.length}, harusnya 200 (baris TOTAL harus dibuang)`);
if (parsed.inventory.length !== 25) problems.push(`inventory rows ${parsed.inventory.length}, harusnya 25`);
if (parsed.stockCheck.length !== 25) problems.push(`stockCheck rows ${parsed.stockCheck.length}, harusnya 25`);
if (parsed.priceList.length !== 25) problems.push(`priceList rows ${parsed.priceList.length}, harusnya 25`);
if (parsed.platforms.join(",") !== "Shopee,TikTok") problems.push(`platform ${parsed.platforms.join(",")}`);
if (!parsed.dateRange || iso(parsed.dateRange.min) !== "2026-09-01" || iso(parsed.dateRange.max) !== "2026-09-30")
  problems.push("rentang tanggal tidak sesuai");

// --- Window penuh: rekonsiliasi & temuan ---
const full: AnalysisWindow = {
  start: startOfUtcDay(parsed.dateRange!.min),
  end: startOfUtcDay(parsed.dateRange!.max),
  elapsedHours: daysBetweenInclusive(parsed.dateRange!.min, parsed.dateRange!.max) * 24,
};
const { skus: skusFull, dataset } = buildDataset(parsed, full);

console.log("\n=== REKONSILIASI (sheet gudang vs hitung ulang dari transaksi) ===");
console.log(`  cocok=${dataset.reconciliation.cocok}  selisih=${dataset.reconciliation.selisih}`);
for (const r of dataset.reconciliation.rows.slice(0, 3))
  console.log(`  ${r.sku}: sheet=${r.sisaMenurutSheet} hitung=${r.sisaHasilHitung} Δ=${r.selisih}`);
if (dataset.reconciliation.cocok !== 25 || dataset.reconciliation.selisih !== 0)
  problems.push(`rekonsiliasi: cocok=${dataset.reconciliation.cocok} selisih=${dataset.reconciliation.selisih}, harusnya 25/0`);

console.log("\n=== TEMUAN ===");
console.log(`  order below COGS: ${dataset.findings.totalBelowCogsOrders} (ekspektasi 42)`);
console.log(`  kolom status tidak sinkron dengan angka: ${dataset.findings.statusColumnDisagreements}`);
console.log(`  SKU kena reorder point: ${dataset.findings.reorder.length} -> ${dataset.findings.reorder.map((r) => `${r.sku}(${r.sisaStock}/${r.reorderPoint})`).join(", ")}`);
console.log(`  SKU price gap below COGS: ${dataset.findings.priceGap.length}`);
console.log("  top 5 SKU rugi (seluruh file):");
for (const b of dataset.findings.belowCogs.slice(0, 5))
  console.log(`    ${b.sku} ${formatRupiah(b.totalLoss)} dari ${b.orderCount} order — ${b.perPlatform.map((p) => `${p.platform}:${p.orderCount}`).join(" ")}`);
if (dataset.findings.totalBelowCogsOrders !== 42)
  problems.push(`order below COGS ${dataset.findings.totalBelowCogsOrders}, harusnya 42`);

const fr002 = skusFull.find((s) => s.sku === "FR-002");
console.log(`\nFR-002 sisa stock akhir data: ${fr002?.stockGudang[0]?.sisaStock} (ekspektasi -3)`);
if (fr002?.stockGudang[0]?.sisaStock !== -3) problems.push("FR-002 sisa stock bukan -3");

// --- Bandingkan beberapa window ---
console.log("\n=== PERBANDINGAN WINDOW ===");
const dmax = startOfUtcDay(parsed.dateRange!.max);
for (const days of [1, 3, 5, 7, 14, 30]) {
  const start = new Date(dmax.getTime() - (days - 1) * 86_400_000);
  const win: AnalysisWindow = { start, end: dmax, elapsedHours: days * 24 };
  const { skus, dataset: ds } = buildDataset(parsed, win);
  const vm = buildViewModel(
    { id: "w", name: "win", startDate: iso(start), endDate: iso(dmax), budgetCampaign: 15_000_000, campaignElapsedHours: win.elapsedHours },
    skus,
    15_000_000,
  );
  const kritis = vm.skuList.filter((s) => s.overallStatus === "KRITIS").length;
  const waspada = vm.skuList.filter((s) => s.overallStatus === "WASPADA").length;
  const rugi = vm.skuList.filter((s) => s.isBelowCogs).length;
  console.log(
    `  ${String(days).padStart(2)} hari (${String(win.elapsedHours).padStart(3)}h): aktif=${String(ds.skuAktifDalamWindow).padStart(2)} KRITIS=${kritis} WASPADA=${waspada} rugi=${rugi} budgetSafe=${formatRupiah(vm.budgetSafe.budgetSafe)} (${vm.budgetSafe.budgetStatus})`,
  );
}

// --- Window default + detail top list ---
const win = defaultWindow(parsed.dateRange);
console.log(`\n=== WINDOW DEFAULT: ${iso(win.start)} .. ${iso(win.end)} (${win.elapsedHours} jam) ===`);
const { skus } = buildDataset(parsed, win);
const vm = buildViewModel(
  { id: "d", name: "Default", startDate: iso(win.start), endDate: iso(win.end), budgetCampaign: 15_000_000, campaignElapsedHours: win.elapsedHours },
  skus,
  15_000_000,
);
console.log(`hasData=${vm.hasData} | budgetSafe=${formatRupiah(vm.budgetSafe.budgetSafe)} ${vm.budgetSafe.budgetStatus}`);
for (const s of vm.skuList.slice(0, 8))
  console.log(
    `  ${s.overallStatus.padEnd(8)} ${s.sku.padEnd(8)} habis=${formatJamSampaiHabis(s.jamSampaiHabis).padEnd(16)} underCOGS=${formatRupiah(s.underCogs).padEnd(13)} stok=${s.totalSisaStock}`,
  );

// --- Invariant: tidak ada NaN/Infinity bocor ---
const serialized = JSON.stringify(vm);
if (/Infinity|NaN/.test(serialized)) problems.push("view model mengandung Infinity/NaN");
for (const s of vm.skuList) {
  if (!Number.isFinite(s.runratePerJam)) problems.push(`${s.sku}: runrate tidak finite`);
  if (s.jamSampaiHabis !== null && !Number.isFinite(s.jamSampaiHabis)) problems.push(`${s.sku}: runway tidak finite`);
  if (/NaN|Infinity|undefined|null/.test(s.recommendation)) problems.push(`${s.sku}: rekomendasi bocor nilai mentah`);
}
if (skus.length !== 25) problems.push(`jumlah SkuRaw ${skus.length}, harusnya 25`);

console.log("\n=== HASIL CEK ===");
if (problems.length === 0) console.log("PASS — pipeline Excel → engine konsisten dengan analisa independen.");
else {
  console.log("FAIL:");
  for (const p of problems) console.log("  -", p);
  process.exitCode = 1;
}
