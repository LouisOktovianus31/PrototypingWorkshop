/**
 * Zona upload file Excel.
 *
 * Seluruh pemrosesan terjadi di browser. File tidak pernah dikirim ke server —
 * tidak ada backend di aplikasi ini. Itu juga alasan kenapa tidak ada auth:
 * tidak ada data yang keluar dari perangkat user.
 */

import { useRef, useState } from "react";
import { FileSpreadsheet, FolderOpen, Sparkles, Upload } from "lucide-react";

const ACCEPTED = ".xlsx";
/** Batas ukuran wajar untuk parsing di main thread tanpa bikin tab membeku. */
const MAX_BYTES = 25 * 1024 * 1024;

interface UploadZoneProps {
  onFile: (file: File) => void;
  onUseSample: () => void;
  /** Pesan error dari percobaan sebelumnya. */
  error: string | null;
  disabled: boolean;
}

export function UploadZone({ onFile, onUseSample, error, disabled }: UploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleCandidate = (file: File | undefined) => {
    setLocalError(null);
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      setLocalError(
        `"${file.name}" bukan file .xlsx. Kalau ini .xls atau .csv, buka di Excel lalu Save As → Excel Workbook (.xlsx).`,
      );
      return;
    }
    if (file.size > MAX_BYTES) {
      setLocalError(
        `File ${(file.size / 1024 / 1024).toFixed(1)} MB terlalu besar (batas 25 MB). Coba pecah per periode.`,
      );
      return;
    }
    onFile(file);
  };

  const shownError = localError ?? error;

  return (
    <div className="py-8">
      <div className="flex flex-col items-center text-center">
        <FileSpreadsheet size={64} strokeWidth={2} className="text-disabled" aria-hidden="true" />
        <h2 className="mt-4 text-heading text-primary">Mulai dari file Excel kamu</h2>
        <p className="mt-2 max-w-md text-body text-secondary">
          Upload satu file berisi sheet penjualan per platform dan sheet stock gudang.
          Action Radar menggabungkannya dan mengurutkan SKU dari paling mendesak.
        </p>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          if (disabled) return;
          handleCandidate(event.dataTransfer.files[0]);
        }}
        className={`mt-6 rounded-md border border-dashed p-6 text-center transition-colors duration-200 ease-out ${
          isDragging ? "border-accent bg-surface-raised" : "border-subtle bg-surface"
        }`}
      >
        <Upload size={24} strokeWidth={2} className="mx-auto text-secondary" aria-hidden="true" />
        <p className="mt-2 text-body text-secondary">
          Tarik file ke sini, atau pilih manual
        </p>

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED}
          className="sr-only"
          onChange={(event) => {
            handleCandidate(event.target.files?.[0]);
            // Reset supaya memilih file yang sama dua kali tetap memicu onChange.
            event.target.value = "";
          }}
        />

        <div className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
            className="tap-target flex items-center justify-center gap-2 rounded-md bg-accent px-5 py-3 text-body-strong text-white transition-colors duration-[120ms] ease-out hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-surface-raised disabled:text-disabled"
          >
            <FolderOpen size={20} strokeWidth={2} aria-hidden="true" />
            Pilih file Excel
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={onUseSample}
            className="tap-target flex items-center justify-center gap-2 rounded-md border border-subtle px-5 py-3 text-body-strong text-primary transition-colors duration-[120ms] ease-out hover:bg-surface-raised disabled:cursor-not-allowed disabled:text-disabled"
          >
            <Sparkles size={20} strokeWidth={2} aria-hidden="true" />
            Pakai file contoh
          </button>
        </div>

        <p className="mt-3 text-caption text-disabled">
          Format .xlsx · diproses di browser, tidak diunggah ke mana pun
        </p>
      </div>

      {shownError && (
        <p
          role="alert"
          className="mt-4 rounded-md border-l-[3px] border-l-critical bg-critical-subtle p-3 text-body text-primary"
        >
          {shownError}
        </p>
      )}

      {/* Ekspektasi struktur file — biar user tahu apa yang dicari, bukan trial and error. */}
      <div className="mt-6 rounded-md border border-subtle bg-surface p-3">
        <h3 className="text-body-strong text-primary">Kolom yang dicari</h3>
        <p className="mt-1 text-caption text-secondary">
          Nama sheet tidak harus sama — yang dibaca adalah nama kolomnya. Kolom lain
          dibiarkan saja.
        </p>
        <ul className="mt-3 flex flex-col gap-2 text-body text-secondary">
          <li>
            <span className="text-body-strong text-primary">Sheet penjualan</span> (boleh
            beberapa, satu per platform): SKU, Tanggal Transaksi, Qty Terjual, Total Revenue
            Net, Total COGS.
          </li>
          <li>
            <span className="text-body-strong text-primary">Sheet inventory</span>: SKU, COGS
            per Unit, Stock Awal, Gudang. Opsional: Reorder Point.
          </li>
          <li>
            <span className="text-body-strong text-primary">Sheet stock check</span> (opsional):
            SKU, Sisa Stock. Dipakai untuk mencocokkan angka gudang dengan hasil hitung.
          </li>
        </ul>
      </div>
    </div>
  );
}
