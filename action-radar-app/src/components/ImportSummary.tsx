/**
 * Ringkasan hasil import: apa yang terbaca, apa yang dilewati, apa yang meragukan.
 *
 * Ini bukan dekorasi. Kalau app ini menggantikan cross-check manual, user harus
 * bisa memverifikasi bahwa filenya benar-benar terbaca utuh — kalau tidak, dia
 * cuma menukar kerja manual dengan kepercayaan buta.
 */

import { CircleAlert, Info, TriangleAlert } from "lucide-react";
import type { ImportIssue, ParsedWorkbook, SheetRole } from "../lib/import/types";

const ROLE_LABEL: Record<SheetRole, string> = {
  inventory: "Inventory",
  sales: "Penjualan",
  "stock-check": "Stock gudang",
  "price-list": "Daftar harga",
  unknown: "Tidak dipakai",
};

const ROLE_CLASS: Record<SheetRole, string> = {
  inventory: "bg-info-subtle text-info",
  sales: "bg-safe-subtle text-safe",
  "stock-check": "bg-info-subtle text-info",
  "price-list": "bg-info-subtle text-info",
  unknown: "bg-surface-raised text-disabled",
};

const ISSUE_ICON = {
  error: CircleAlert,
  warning: TriangleAlert,
  info: Info,
} as const;

const ISSUE_CLASS = {
  error: "text-critical",
  warning: "text-warning",
  info: "text-secondary",
} as const;

function formatDate(date: Date): string {
  return date.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

interface ImportSummaryProps {
  parsed: ParsedWorkbook;
  fileName: string;
}

export function ImportSummary({ parsed, fileName }: ImportSummaryProps) {
  const totalTransaksi = parsed.sales.length;
  const errors = parsed.issues.filter((issue) => issue.level === "error");
  const warnings = parsed.issues.filter((issue) => issue.level === "warning");
  const infos = parsed.issues.filter((issue) => issue.level === "info");
  const ordered: ImportIssue[] = [...errors, ...warnings, ...infos];

  return (
    <details className="rounded-md bg-surface shadow-card" open={errors.length > 0}>
      <summary className="tap-target flex cursor-pointer items-center justify-between gap-2 p-3">
        <span className="min-w-0">
          <span className="block truncate text-body-strong text-primary">{fileName}</span>
          <span className="mt-1 block text-caption text-secondary">
            {totalTransaksi.toLocaleString("id-ID")} transaksi · {parsed.platforms.length} platform
            {parsed.dateRange
              ? ` · ${formatDate(parsed.dateRange.min)} – ${formatDate(parsed.dateRange.max)}`
              : ""}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1">
          {errors.length > 0 && (
            <span className="rounded-sm bg-critical-subtle px-2 py-1 text-badge uppercase text-critical">
              {errors.length} error
            </span>
          )}
          {warnings.length > 0 && (
            <span className="rounded-sm bg-warning-subtle px-2 py-1 text-badge uppercase text-warning">
              {warnings.length} warning
            </span>
          )}
          {errors.length === 0 && warnings.length === 0 && (
            <span className="rounded-sm bg-safe-subtle px-2 py-1 text-badge uppercase text-safe">
              Terbaca utuh
            </span>
          )}
        </span>
      </summary>

      <div className="border-t border-subtle p-3">
        <h3 className="text-caption text-secondary">Sheet yang terbaca</h3>
        <ul className="mt-2 flex flex-col gap-2">
          {parsed.sheets.map((sheet) => (
            <li key={sheet.name} className="flex flex-wrap items-center gap-2">
              <span
                className={`shrink-0 rounded-sm px-2 py-1 text-badge uppercase ${ROLE_CLASS[sheet.role]}`}
              >
                {ROLE_LABEL[sheet.role]}
              </span>
              <span className="min-w-0 flex-1 truncate text-body text-primary">{sheet.name}</span>
              <span className="text-caption text-secondary">
                {sheet.parsedRows} baris
                {sheet.skippedSummary > 0 && ` · ${sheet.skippedSummary} ringkasan dibuang`}
                {sheet.skippedBlank > 0 && ` · ${sheet.skippedBlank} kosong`}
              </span>
            </li>
          ))}
        </ul>

        {parsed.platforms.length > 0 && (
          <p className="mt-3 text-caption text-secondary">
            Platform terdeteksi:{" "}
            <span className="text-body-strong text-primary">{parsed.platforms.join(", ")}</span>
          </p>
        )}

        {ordered.length > 0 && (
          <>
            <h3 className="mt-4 text-caption text-secondary">Catatan import</h3>
            <ul className="mt-2 flex flex-col gap-2">
              {ordered.map((issue, index) => {
                const Icon = ISSUE_ICON[issue.level];
                return (
                  <li key={`${issue.sheet}-${index}`} className="flex items-start gap-2">
                    <Icon
                      size={16}
                      strokeWidth={2}
                      className={`mt-0.5 shrink-0 ${ISSUE_CLASS[issue.level]}`}
                      aria-hidden="true"
                    />
                    <span className="text-body text-secondary">
                      <span className="text-caption text-disabled">{issue.sheet} — </span>
                      {issue.message}
                    </span>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </details>
  );
}
