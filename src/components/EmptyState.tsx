/**
 * Empty state — PRODUCT_SPEC.md Section 4.1 + design.md Section 5.5.
 * Tidak menampilkan list SKU kosong; langsung menyatakan aksi yang dibutuhkan user.
 */

import { Radar } from "lucide-react";

interface EmptyStateProps {
  /** Form input zone dirender sebagai CTA di dalam empty state. */
  children: React.ReactNode;
}

export function EmptyState({ children }: EmptyStateProps) {
  return (
    <div className="py-8">
      <div className="flex flex-col items-center text-center">
        <Radar size={64} strokeWidth={2} className="text-disabled" aria-hidden="true" />
        <h2 className="mt-4 text-heading text-primary">
          Belum ada campaign aktif
        </h2>
        <p className="mt-2 max-w-sm text-body text-secondary">
          Set Budget Campaign untuk mulai monitoring. Action Radar akan mengurutkan
          SKU dari paling mendesak ke paling aman.
        </p>
      </div>
      <div className="mt-6">{children}</div>
    </div>
  );
}
