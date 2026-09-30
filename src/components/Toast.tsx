/**
 * Toast real-time alert — PRODUCT_SPEC.md Section 4.4 + design.md Section 5.4.
 * Fixed di bawah (thumb zone), non-blocking, auto-dismiss 6 detik,
 * plus tombol langsung lompat ke baris SKU terkait.
 */

import { useEffect } from "react";
import { ArrowRight, X } from "lucide-react";

const AUTO_DISMISS_MS = 6000;

export interface ToastPayload {
  /** Kode SKU, dipakai juga sebagai target anchor `#sku-<kode>`. */
  sku: string;
  namaProduk: string;
  reason: string;
}

interface ToastProps {
  payload: ToastPayload;
  onJump: (sku: string) => void;
  onDismiss: () => void;
}

export function Toast({ payload, onJump, onDismiss }: ToastProps) {
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center p-4">
      <div
        role="status"
        aria-live="polite"
        className="animate-toast-in pointer-events-auto w-full max-w-[92vw] rounded-lg border-l-[3px] border-l-critical bg-surface-raised p-4 shadow-toast sm:max-w-md"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-badge uppercase text-critical">Baru jadi kritis</p>
            <p className="mt-1 truncate text-body-strong text-primary">
              {payload.namaProduk}
            </p>
            <p className="mt-1 text-caption text-secondary">{payload.reason}</p>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Tutup notifikasi"
            className="tap-target -mr-2 -mt-2 flex shrink-0 items-center justify-center rounded-md p-2 text-secondary transition-colors duration-[120ms] ease-out hover:text-primary"
          >
            <X size={20} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>

        <button
          type="button"
          onClick={() => onJump(payload.sku)}
          className="tap-target mt-3 flex w-full items-center justify-center gap-2 rounded-md border border-subtle px-5 py-3 text-body-strong text-primary transition-colors duration-[120ms] ease-out hover:bg-surface"
        >
          Lihat {payload.sku}
          <ArrowRight size={20} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
