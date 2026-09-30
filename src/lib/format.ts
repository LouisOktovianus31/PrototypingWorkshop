/**
 * Formatter untuk layer presentasi.
 *
 * Aturan keras (learnings.md #1): nilai `Infinity` atau `NaN` TIDAK BOLEH pernah
 * dirender langsung sebagai teks. Semua formatter di sini menjaga itu di ujung.
 */

const isRenderableNumber = (value: number): boolean => Number.isFinite(value);

/** Rp1.234.567 — tanpa desimal, sesuai kebiasaan nominal Rupiah di dashboard. */
export function formatRupiah(value: number): string {
  if (!isRenderableNumber(value)) return "—";
  const sign = value < 0 ? "-" : "";
  return `${sign}Rp${Math.abs(Math.round(value)).toLocaleString("id-ID")}`;
}

/** Versi ringkas untuk angka besar di header: Rp15,0 jt / Rp1,2 M. */
export function formatRupiahCompact(value: number): string {
  if (!isRenderableNumber(value)) return "—";
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000_000) {
    return `${sign}Rp${(abs / 1_000_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} M`;
  }
  if (abs >= 1_000_000) {
    return `${sign}Rp${(abs / 1_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} jt`;
  }
  if (abs >= 1_000) {
    return `${sign}Rp${(abs / 1_000).toLocaleString("id-ID", { maximumFractionDigits: 0 })} rb`;
  }
  return formatRupiah(value);
}

/**
 * Runway stock. `null` = runrate 0 → tampilkan teks, BUKAN angka "Infinity jam".
 * `0` dengan oversold = kondisi khusus, ditangani pemanggil (lihat SkuCard).
 */
export function formatJamSampaiHabis(jam: number | null): string {
  if (jam === null) return "Stock aman";
  if (!isRenderableNumber(jam)) return "—";
  if (jam === 0) return "Habis / oversell";
  if (jam < 1) return `${Math.round(jam * 60)} menit`;
  return `${jam.toFixed(1)} jam`;
}

/** Runrate per jam, mempertahankan desimal kecil (mis. 0,5 unit/jam). */
export function formatRunrate(runrate: number): string {
  if (!isRenderableNumber(runrate)) return "—";
  if (runrate === 0) return "0 unit/jam";
  const digits = runrate < 10 ? 1 : 0;
  return `${runrate.toLocaleString("id-ID", { maximumFractionDigits: digits })} unit/jam`;
}

/**
 * 0.1 → "10%".
 * Tidak pernah membulatkan ke atas menjadi "100%" selama masih ada kerugian —
 * "100% tersisa" saat budget sudah termakan akan menyesatkan di layar monitoring.
 */
export function formatPercent(decimal: number): string {
  if (!isRenderableNumber(decimal)) return "—";
  const percent = decimal * 100;
  if (percent > 99 && percent < 100) return "99%";
  if (percent > 0 && percent < 1) return "<1%";
  return `${Math.round(percent)}%`;
}

/** Bar width aman untuk progress budget: selalu di rentang 0–100. */
export function clampPercentWidth(decimal: number): number {
  if (!isRenderableNumber(decimal)) return 0;
  return Math.min(100, Math.max(0, decimal * 100));
}
