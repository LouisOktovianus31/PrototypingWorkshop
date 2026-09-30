/**
 * Input zone — satu-satunya input manual di aplikasi ini (TECH_SPEC.md Section 1:
 * no auth, no DB, no write-back; hanya `budgetCampaign` yang diterima dari user).
 *
 * Dua jalan masuk:
 *   1. Isi Budget Campaign manual → "Mulai Monitoring"
 *   2. "Muat Sample Data" → pakai campaign + budget dari sample_data.json
 */

import { useEffect, useId, useRef, useState } from "react";
import { Sparkles, Wallet } from "lucide-react";
import { formatRupiah } from "../lib/format";

/** Ambil digit saja, supaya user bisa ketik "15.000.000" atau "15000000". */
function parseRupiahInput(raw: string): number {
  const digits = raw.replace(/\D/g, "");
  if (digits === "") return 0;
  return Number.parseInt(digits, 10);
}

interface InputZoneProps {
  /** Nilai budget saat ini (0 = belum diisi). */
  budget: number;
  /** Budget default dari sample data, ditampilkan sebagai hint di tombol. */
  sampleBudget: number;
  onSubmit: (budget: number) => void;
  onLoadSample: () => void;
  /** true saat sedang dipakai untuk mengubah budget campaign yang sudah jalan. */
  isEditing?: boolean;
  onCancel?: () => void;
}

export function InputZone({
  budget,
  sampleBudget,
  onSubmit,
  onLoadSample,
  isEditing = false,
  onCancel,
}: InputZoneProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(budget > 0 ? budget.toLocaleString("id-ID") : "");

  const parsed = parseRupiahInput(value);
  const isValid = parsed > 0;

  useEffect(() => {
    if (isEditing) inputRef.current?.focus();
  }, [isEditing]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!isValid) return;
    onSubmit(parsed);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-md bg-surface p-3 shadow-card sm:p-4"
    >
      <label
        htmlFor={inputId}
        className="flex items-center gap-2 text-body-strong text-primary"
      >
        <Wallet size={16} strokeWidth={2} aria-hidden="true" />
        Budget Campaign
      </label>
      <p className="mt-1 text-caption text-secondary">
        Diisi sekali per campaign. Dipakai sebagai basis Budget Safe.
      </p>

      {/* Input field — design.md Section 5.7 */}
      <div className="mt-3 flex items-center gap-2 rounded-md border border-subtle bg-surface px-3 focus-within:outline-2 focus-within:outline-accent">
        <span className="text-body-strong text-secondary">Rp</span>
        <input
          id={inputId}
          ref={inputRef}
          inputMode="numeric"
          autoComplete="off"
          placeholder="15.000.000"
          value={value}
          onChange={(event) => {
            const next = parseRupiahInput(event.target.value);
            setValue(next > 0 ? next.toLocaleString("id-ID") : "");
          }}
          className="min-h-[44px] w-full bg-transparent text-body-strong text-primary placeholder:text-disabled focus:outline-none"
          aria-describedby={`${inputId}-hint`}
        />
      </div>
      <p id={`${inputId}-hint`} className="mt-2 text-caption text-disabled">
        {isValid
          ? `Budget campaign: ${formatRupiah(parsed)}`
          : "Masukkan nominal lebih dari 0 untuk mulai monitoring."}
      </p>

      <div className="mt-4 flex flex-col gap-2">
        <button
          type="submit"
          disabled={!isValid}
          className="tap-target flex items-center justify-center rounded-md bg-accent px-5 py-3 text-body-strong text-white transition-colors duration-[120ms] ease-out hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-surface-raised disabled:text-disabled"
        >
          {isEditing ? "Simpan Budget" : "Mulai Monitoring"}
        </button>

        {/* Sample data button — jalan cepat untuk demo/prototype */}
        <button
          type="button"
          onClick={onLoadSample}
          className="tap-target flex items-center justify-center gap-2 rounded-md border border-subtle px-5 py-3 text-body-strong text-primary transition-colors duration-[120ms] ease-out hover:bg-surface-raised"
        >
          <Sparkles size={20} strokeWidth={2} aria-hidden="true" />
          Muat Sample Data ({formatRupiah(sampleBudget)})
        </button>

        {isEditing && onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="tap-target flex items-center justify-center rounded-md px-5 py-3 text-body text-secondary transition-colors duration-[120ms] ease-out hover:text-primary"
          >
            Batal
          </button>
        )}
      </div>
    </form>
  );
}
