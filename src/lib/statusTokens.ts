/**
 * Pemetaan status → class Tailwind.
 *
 * Satu-satunya tempat warna urgency dipilih. Komponen TIDAK boleh menulis
 * `text-critical` / `bg-warning-subtle` dan sejenisnya secara langsung — ambil dari
 * sini, supaya warna status tidak pernah drift (design.md Section 1.2 & Section 8).
 */

import type { UrgencyStatus } from "../types";

export interface StatusToken {
  /** Teks badge (design.md 5.1: warna teks = fill color di atas subtle bg). */
  badge: string;
  /** Border kiri 3px pada card SKU (design.md 5.2). */
  borderLeft: string;
  /** Warna teks untuk angka/ikon yang mewakili status. */
  text: string;
  /** Fill solid — dipakai untuk progress bar / dot indicator. */
  fill: string;
  /** Label yang ditampilkan ke user. */
  label: string;
}

export const STATUS_TOKENS: Record<UrgencyStatus, StatusToken> = {
  KRITIS: {
    badge: "bg-critical-subtle text-critical",
    borderLeft: "border-l-critical",
    text: "text-critical",
    fill: "bg-critical",
    label: "KRITIS",
  },
  WASPADA: {
    badge: "bg-warning-subtle text-warning",
    borderLeft: "border-l-warning",
    text: "text-warning",
    fill: "bg-warning",
    label: "WASPADA",
  },
  AMAN: {
    badge: "bg-safe-subtle text-safe",
    borderLeft: "border-l-safe",
    text: "text-safe",
    fill: "bg-safe",
    label: "AMAN",
  },
};
