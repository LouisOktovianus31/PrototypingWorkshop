/**
 * Badge status — design.md Section 5.1.
 * padding 8px horizontal / 4px vertical, radius-sm, text-badge, subtle bg + fill text.
 */

import { CircleAlert, ShieldCheck, TriangleAlert } from "lucide-react";
import type { UrgencyStatus } from "../types";
import { STATUS_TOKENS } from "../lib/statusTokens";

const STATUS_ICON: Record<UrgencyStatus, typeof ShieldCheck> = {
  KRITIS: CircleAlert,
  WASPADA: TriangleAlert,
  AMAN: ShieldCheck,
};

interface StatusBadgeProps {
  status: UrgencyStatus;
  /** Prefix opsional, mis. "STOCK" → "STOCK KRITIS". */
  prefix?: string;
}

export function StatusBadge({ status, prefix }: StatusBadgeProps) {
  const token = STATUS_TOKENS[status];
  const Icon = STATUS_ICON[status];

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-sm px-2 py-1 text-badge uppercase ${token.badge}`}
    >
      <Icon size={12} strokeWidth={2} aria-hidden="true" />
      {prefix ? `${prefix} ${token.label}` : token.label}
    </span>
  );
}
