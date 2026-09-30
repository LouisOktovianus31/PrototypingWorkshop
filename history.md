# History Perjalanan Proyek — Action Radar

Dokumen ini mencatat ringkasan perjalanan proyek Action Radar sampai sesi dokumentasi saat ini.

## 1. Titik Awal: Masalah Operasional
Proyek dimulai dari kebutuhan Brand Account Manager yang menangani campaign e-commerce lintas Shopee, Tokopedia, dan TikTok Shop.

Masalah utamanya bukan ketiadaan data, melainkan lamanya proses cross-check manual antara data penjualan seller center dan stok gudang. Proses tersebut dapat memakan sekitar 45 menit, sementara pada periode Double-Day Campaign keputusan harus dibuat cepat.

Risiko yang ingin diatasi:
- SKU terlihat out-of-stock di seller center padahal stok gudang masih tersedia.
- Voucher atau diskon bertumpuk membuat produk terjual di bawah COGS.
- SKU kritis terlambat ditemukan sehingga sales hilang atau kerugian terus berjalan.

## 2. Solusi yang Dirumuskan: Action Radar
Action Radar dibangun sebagai dashboard web mobile-first untuk mempercepat keputusan operasional.

Aplikasi tidak menggantikan tindakan user di marketplace atau gudang. Perannya adalah menganalisis data dan memberi urutan prioritas serta rekomendasi tindakan. User tetap melakukan delist, penyesuaian voucher, atau replenishment secara manual.

Target pengalaman pengguna: dalam kurang dari 30 detik, user dapat mengetahui SKU paling mendesak, alasan kondisinya, status Budget Safe campaign, dan tindakan berikutnya.

## 3. Dasar Analisis yang Digunakan
Aplikasi menggunakan data campaign dan SKU untuk menghitung:

- **Runrate per jam:** jumlah penjualan selama campaign dibagi durasi campaign yang telah berjalan.
- **Jam sampai habis:** total stok dari seluruh gudang dibagi runrate per jam.
- **Under COGS:** revenue net dikurangi total COGS. Nilai negatif berarti produk dijual rugi.
- **Budget Safe:** budget campaign dikurangi akumulasi kerugian dari SKU yang Under COGS.

Hasil analisis menentukan tiga status:
- **KRITIS:** oversell, stok habis kurang dari 6 jam, atau margin negatif.
- **WASPADA:** stok tersisa 6–24 jam atau margin kurang dari 10% dari COGS.
- **AMAN:** stok dan margin sehat.

Daftar SKU diurutkan dari kondisi paling kritis. SKU yang kritis pada stok dan margin sekaligus diprioritaskan lebih dahulu.

## 4. Prinsip dan Batasan Produk
Batasan ini dijaga agar prototype tetap fokus:

- Tidak ada login, database, API live, atau integrasi langsung ke marketplace.
- Tidak ada write-back atau tindakan otomatis ke seller center/gudang.
- Input manual utama adalah Budget Campaign dan nilainya hanya tersimpan selama sesi.
- Data dianalisis dengan pure function: tanpa network call, mutasi input, atau side effect eksternal.
- Fokus utama tampilan adalah mobile, khususnya viewport sekitar 375–430 px.

## 5. Pembelajaran Teknis yang Dicatat
Selama perumusan logic, beberapa risiko penting telah didokumentasikan di `learnings.md`:

1. **Pembagian nol pada runrate/runway** harus menghasilkan nilai yang bermakna bisnis. Runrate nol menghasilkan runway `null`, bukan `Infinity` atau `NaN`.
2. **Oversell** bukan sekadar stok rendah. Stock negatif harus berstatus kritis dan memberi rekomendasi pengecekan sinkronisasi data, bukan langsung replenishment.
3. **Budget Safe** hanya menghitung kerugian dari SKU Under COGS; profit SKU lain tidak boleh menutup kerugian tersebut.
4. **Budget Campaign nol** harus memicu Empty State dan tidak boleh menghasilkan persentase tidak valid.
5. **Margin dengan COGS nol** harus memiliki guard sebelum pembagian dilakukan.
6. Field `note` pada sample data adalah catatan konteks, bukan sumber kebenaran hasil kalkulasi.

## 6. Artefak yang Sudah Tersedia
Berikut dokumen dan alat yang menjadi dasar proyek:

| Artefak | Fungsi |
|---|---|
| `PRODUCT_SPEC.md` | Menjelaskan masalah pengguna, alur produk, UX state, dan ruang lingkup. |
| `TECH_SPEC.md` | Menjadi sumber kebenaran untuk struktur data, rumus, threshold, edge case, dan data flow. |
| `checkpoint.test-cases.json` | Berisi 68 test case untuk logic utama, boundary, edge case, integrasi, dan invariant. |
| `run-checkpoint.ts` | Runner untuk menjalankan checkpoint test terhadap logic aplikasi. |
| `learnings.md` | Catatan kesalahan/regresi dan aturan pencegahan. |
| `action-radar-app/scripts/verify-import.ts` | Verifikasi pipeline impor workbook Excel contoh. |

## 7. Dokumentasi yang Ditambahkan pada Sesi Ini

### `FUNCTIONAL_APPS.md`
Dokumen ringkas yang menjelaskan fungsi aplikasi dari sudut pandang pengguna: alur penggunaan, input, perhitungan, status SKU, output, rekomendasi, UI state, dan batasan aplikasi.

### `QA_CHAOS_CHECKLIST.md`
Checklist QA untuk menguji kondisi ekstrem dan kegagalan sistem, meliputi:
- Pencegahan `NaN`, `Infinity`, dan pembagian nol.
- Oversell, runrate nol, budget nol, data kosong, serta nilai threshold.
- Prioritas SKU, rekomendasi, toast, dan tampilan mobile.
- Chaos test impor Excel seperti file rusak, sheet/header hilang, data invalid, dan SKU konflik.
- Batasan arsitektur: tanpa network, database, auth, write-back, dan mutasi input.

## 8. Kondisi Saat Ini dan Arah Berikutnya
Saat ini proyek sudah memiliki definisi produk dan logic, test checkpoint, catatan pembelajaran, verifikasi impor Excel, serta dua dokumen operasional baru untuk memahami fungsi aplikasi dan melakukan QA chaos.

Langkah berikutnya yang disarankan:
1. Menjalankan checkpoint logic dengan `node run-checkpoint.ts`.
2. Menjalankan verifikasi impor Excel dengan `npm run verify` dari folder `action-radar-app` ketika pipeline impor berubah.
3. Menambahkan fixture negatif untuk file XLSX korup, sheet/header hilang, data tanggal/angka invalid, dan konflik SKU karena skenario tersebut belum dicakup oleh workbook contoh valid.
4. Memperbarui `learnings.md`, checkpoint, dan checklist setiap kali ditemukan regresi baru.
