/**
 * Kontrol analisa: window waktu, jam berjalan (pembagi runrate), dan budget campaign.
 *
 * Window wajib eksplisit dan terlihat. Data sebulan yang diagregasi utuh bisa
 * menyembunyikan kerugian — order rugi tertutup order untung di SKU yang sama.
 * Jadi user harus sadar sedang melihat periode yang mana.
 */

import { useId } from "react";
import { CalendarRange, Timer, Wallet } from "lucide-react";
import type { AnalysisWindow } from "../lib/import/types";
import { daysBetweenInclusive } from "../lib/import/buildDataset";
import { formatRupiah } from "../lib/format";

const MS_PER_DAY = 86_400_000;

function toInputValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function fromInputValue(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

function parseRupiahInput(raw: string): number {
  const digits = raw.replace(/\D/g, "");
  return digits === "" ? 0 : Number.parseInt(digits, 10);
}

interface AnalysisControlsProps {
  window: AnalysisWindow;
  onWindowChange: (next: AnalysisWindow) => void;
  range: { min: Date; max: Date };
  budget: number;
  onBudgetChange: (next: number) => void;
}

export function AnalysisControls({
  window: win,
  onWindowChange,
  range,
  budget,
  onBudgetChange,
}: AnalysisControlsProps) {
  const budgetId = useId();
  const startId = useId();
  const endId = useId();
  const hoursId = useId();

  const windowDays = daysBetweenInclusive(win.start, win.end);

  const applyPreset = (days: number | "all") => {
    if (days === "all") {
      const totalDays = daysBetweenInclusive(range.min, range.max);
      onWindowChange({ start: range.min, end: range.max, elapsedHours: totalDays * 24 });
      return;
    }
    const end = range.max;
    const candidate = new Date(end.getTime() - (days - 1) * MS_PER_DAY);
    const start = candidate < range.min ? range.min : candidate;
    onWindowChange({
      start,
      end,
      elapsedHours: daysBetweenInclusive(start, end) * 24,
    });
  };

  const presets: { label: string; days: number | "all" }[] = [
    { label: "1 hari", days: 1 },
    { label: "3 hari", days: 3 },
    { label: "7 hari", days: 7 },
    { label: "14 hari", days: 14 },
    { label: "Semua data", days: "all" },
  ];

  const activePreset = (() => {
    const totalDays = daysBetweenInclusive(range.min, range.max);
    if (win.end.getTime() !== range.max.getTime()) return null;
    if (windowDays === totalDays) return "all";
    return windowDays;
  })();

  return (
    <section className="rounded-md bg-surface p-3 shadow-card">
      {/* --- Window waktu --- */}
      <h2 className="flex items-center gap-2 text-body-strong text-primary">
        <CalendarRange size={16} strokeWidth={2} aria-hidden="true" />
        Periode analisa
      </h2>
      <p className="mt-1 text-caption text-secondary">
        Hanya transaksi di dalam periode ini yang dihitung. Sisa stock dihitung pada
        akhir periode.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        {presets.map((preset) => (
          <button
            key={preset.label}
            type="button"
            onClick={() => applyPreset(preset.days)}
            className={`tap-target flex items-center rounded-md border px-3 py-2 text-caption transition-colors duration-[120ms] ease-out ${
              activePreset === preset.days
                ? "border-accent bg-accent text-white"
                : "border-subtle text-secondary hover:bg-surface-raised"
            }`}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1" htmlFor={startId}>
          <span className="text-caption text-secondary">Dari</span>
          <input
            id={startId}
            type="date"
            value={toInputValue(win.start)}
            min={toInputValue(range.min)}
            max={toInputValue(win.end)}
            onChange={(event) => {
              const next = fromInputValue(event.target.value);
              if (!next) return;
              const start = next > win.end ? win.end : next;
              onWindowChange({
                start,
                end: win.end,
                elapsedHours: daysBetweenInclusive(start, win.end) * 24,
              });
            }}
            className="min-h-[44px] rounded-md border border-subtle bg-surface px-3 text-body-strong text-primary focus:outline-2 focus:outline-accent"
          />
        </label>
        <label className="flex flex-col gap-1" htmlFor={endId}>
          <span className="text-caption text-secondary">Sampai</span>
          <input
            id={endId}
            type="date"
            value={toInputValue(win.end)}
            min={toInputValue(win.start)}
            max={toInputValue(range.max)}
            onChange={(event) => {
              const next = fromInputValue(event.target.value);
              if (!next) return;
              const end = next < win.start ? win.start : next;
              onWindowChange({
                start: win.start,
                end,
                elapsedHours: daysBetweenInclusive(win.start, end) * 24,
              });
            }}
            className="min-h-[44px] rounded-md border border-subtle bg-surface px-3 text-body-strong text-primary focus:outline-2 focus:outline-accent"
          />
        </label>
      </div>

      {/* --- Jam berjalan --- */}
      <h2 className="mt-6 flex items-center gap-2 text-body-strong text-primary">
        <Timer size={16} strokeWidth={2} aria-hidden="true" />
        Jam berjalan
      </h2>
      <p className="mt-1 text-caption text-secondary">
        Pembagi runrate: qty terjual ÷ jam berjalan. Default sama dengan panjang periode
        ({windowDays} hari = {windowDays * 24} jam). Perkecil untuk mengetes skenario
        lonjakan, mis. "kalau order sebanyak ini masuk dalam 4 jam".
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          id={hoursId}
          type="number"
          min={1}
          max={100000}
          value={win.elapsedHours}
          aria-label="Jam berjalan"
          onChange={(event) => {
            const parsed = Number.parseInt(event.target.value, 10);
            if (!Number.isFinite(parsed) || parsed < 1) return;
            onWindowChange({ ...win, elapsedHours: parsed });
          }}
          className="min-h-[44px] w-24 rounded-md border border-subtle bg-surface px-3 text-body-strong text-primary focus:outline-2 focus:outline-accent"
        />
        <span className="text-caption text-secondary">jam</span>
        {[
          { label: `Sesuai periode`, hours: windowDays * 24 },
          { label: "24 jam", hours: 24 },
          { label: "4 jam", hours: 4 },
        ].map((option) => (
          <button
            key={option.label}
            type="button"
            onClick={() => onWindowChange({ ...win, elapsedHours: option.hours })}
            className={`tap-target flex items-center rounded-md border px-3 py-2 text-caption transition-colors duration-[120ms] ease-out ${
              win.elapsedHours === option.hours
                ? "border-accent bg-accent text-white"
                : "border-subtle text-secondary hover:bg-surface-raised"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {/* --- Budget campaign --- */}
      <h2 className="mt-6 flex items-center gap-2 text-body-strong text-primary">
        <Wallet size={16} strokeWidth={2} aria-hidden="true" />
        Budget campaign
      </h2>
      <p className="mt-1 text-caption text-secondary">
        Tidak ada di file Excel — ini satu-satunya angka yang diisi manual. Dipakai
        sebagai basis Budget Safe.
      </p>
      <div className="mt-3 flex items-center gap-2 rounded-md border border-subtle bg-surface px-3 focus-within:outline-2 focus-within:outline-accent">
        <span className="text-body-strong text-secondary">Rp</span>
        <input
          id={budgetId}
          inputMode="numeric"
          autoComplete="off"
          placeholder="15.000.000"
          aria-label="Budget campaign dalam Rupiah"
          value={budget > 0 ? budget.toLocaleString("id-ID") : ""}
          onChange={(event) => onBudgetChange(parseRupiahInput(event.target.value))}
          className="min-h-[44px] w-full bg-transparent text-body-strong text-primary placeholder:text-disabled focus:outline-none"
        />
      </div>
      <p className="mt-2 text-caption text-disabled">
        {budget > 0
          ? `Budget campaign: ${formatRupiah(budget)}`
          : "Isi lebih dari 0 untuk mengaktifkan indikator Budget Safe."}
      </p>
    </section>
  );
}
