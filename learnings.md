# learnings.md — Persistent Memory

Dokumen ini mencatat kesalahan yang sudah (atau berpotensi) terjadi saat implementasi, akar masalahnya, dan aturan pencegahan yang harus diikuti ke depannya. Tujuannya: agar kesalahan yang sama tidak terulang di iterasi/run berikutnya.

**Cara pakai:** sebelum menulis atau mengubah logic kalkulasi di Action Radar, baca Section 1 dulu. Setiap kali menemukan bug baru selama development, tambahkan entry baru di Section 1 dengan format yang sama.

---

## 1. Log Kesalahan & Aturan Pencegahan

### #1 — Zero-division saat runrate = 0

**Konteks:** `calculateJamSampaiHabis` awalnya ditulis sebagai `totalSisaStock / runratePerJam` tanpa guard. SKU yang belum pernah terjual dalam periode (qty = 0, lihat `BC-999` di `sample_data.json`) menghasilkan `runratePerJam = 0`, dan `sisaStock / 0` menghasilkan `Infinity` di JavaScript (bukan error runtime), yang kemudian merusak sorting (`Infinity` tidak bisa dibandingkan dengan angka biasa secara konsisten di semua kondisi) dan menghasilkan tampilan "Infinity jam" di UI — membingungkan, bukan informatif.

**Root cause:** Tidak ada guard eksplisit untuk kondisi pembagi = 0 sebelum operasi pembagian dijalankan.

**Fix / Aturan:**
- `runratePerJam <= 0` HARUS dicek eksplisit SEBELUM pembagian, return `null` (bukan `Infinity` literal).
- `null` diinterpretasikan di layer UI sebagai "tidak ada urgency dari sisi stock" → status AMAN, tampilkan teks "Stock aman" bukan angka jam.
- Jangan biarkan `Infinity` merambat ke logic sorting atau ke tampilan angka. Rule: nilai `Infinity` atau `NaN` TIDAK BOLEH pernah dirender langsung sebagai teks ke UI.
- Referensi implementasi yang benar: `TECH_SPEC.md` Section 3.2.

---

### #2 — Stock negatif (oversell) diperlakukan sama seperti stock rendah biasa

**Konteks:** Data asli (`Stock Check` sheet) menunjukkan `FR-002` punya sisa stock **-3** (total terjual melebihi stock awal — kasus oversell). Kalkulasi awal yang naif akan menghasilkan `jamSampaiHabis = -3 / runratePerJam` = angka negatif, yang jika tidak ditangani akan lolos ke perbandingan `jamSampaiHabis < 6` sebagai "true" secara kebetulan (angka negatif memang lebih kecil dari 6), tapi maknanya salah total — ini bukan "akan habis dalam -X jam", ini "sudah oversold, data mismatch".

**Root cause:** Tidak ada pembedaan eksplisit antara "stock rendah tapi masih positif" dan "stock sudah negatif/oversold". Keduanya numerically lolos ke rumus yang sama tapi punya makna bisnis yang beda total — oversell adalah indikasi masalah sinkronisasi data (persis skenario "hero SKU show out-of-stock while warehouse has 500 units left" dari raw problem statement Fiona), bukan sekadar stock menipis.

**Fix / Aturan:**
- Cek `totalSisaStock <= 0` SEBELUM masuk ke kalkulasi runrate biasa. Jika true: langsung set `isOversold = true`, `jamSampaiHabis = 0`, status KRITIS mutlak, dan rekomendasi HARUS berbeda ("cek sinkronisasi data gudang vs seller center", bukan "replenish stock" — karena replenish mengasumsikan stock fisik benar-benar habis, padahal belum tentu).
- Jangan pernah mengasumsikan `sisaStock >= 0` sebagai invariant data. Sample data sengaja menyertakan kasus ini (`FR-002`) supaya tidak lolos tanpa test.
- Referensi implementasi yang benar: `TECH_SPEC.md` Section 3.2 dan Section 3.7.

---

### #3 — Akumulasi Under COGS salah arah (saling menutup dengan SKU yang untung)

**Konteks:** Percobaan awal menghitung `akumulasiUnderCogs` dengan menjumlahkan SEMUA `underCogs` (termasuk yang positif/untung) lalu berharap angka negatif "tertutup" oleh yang untung. Ini salah secara bisnis: Budget Safe harus merepresentasikan **berapa besar kerugian riil yang memakan budget**, bukan net profit/loss campaign secara keseluruhan. SKU yang untung besar TIDAK seharusnya membuat SKU lain yang rugi "terlihat aman" di Budget Safe — itu dua metrik yang berbeda tujuannya.

**Root cause:** Ambiguitas antara "margin keseluruhan campaign" (metrik profitabilitas) vs "Budget Safe" (metrik risiko: berapa alokasi budget yang sudah termakan kerugian spesifik dari SKU yang below COGS).

**Fix / Aturan:**
- `akumulasiUnderCogs` HANYA menjumlahkan SKU yang `isBelowCogs === true`, memakai `Math.abs(underCogs)`. SKU yang untung tidak masuk hitungan ini sama sekali (bukan 0, bukan dikurangkan — memang di-exclude dari filter).
- Jika ke depan dibutuhkan metrik "net profitability campaign", itu HARUS jadi field terpisah, jangan dicampur ke `budgetSafe`.
- Referensi implementasi yang benar: `TECH_SPEC.md` Section 3.6.

---

### #4 — `budgetCampaign` belum diisi menyebabkan division by zero di persentase

**Konteks:** `budgetSafePercentage = budgetSafe / budgetCampaign` akan menghasilkan `Infinity` atau `NaN` jika `budgetCampaign` masih 0 (kondisi awal sebelum Fiona mengisi form, sesuai PRODUCT_SPEC.md Empty State).

**Root cause:** Kalkulasi Budget Safe dipanggil tanpa mengecek dulu apakah campaign sudah punya budget yang valid.

**Fix / Aturan:**
- Guard di level `ActionRadarViewModel`: jika `budgetCampaign <= 0`, set `hasData: false` dan JANGAN panggil `calculateBudgetSafe` sama sekali — UI harus render Empty State, bukan mencoba menghitung dengan pembagi 0.
- Guard tambahan di dalam `calculateBudgetSafe` itu sendiri (defense in depth): jika `budgetCampaign <= 0`, `budgetSafePercentage` di-set 0 secara eksplisit, tidak dibiarkan menghasilkan `NaN`/`Infinity`.
- Referensi implementasi yang benar: `TECH_SPEC.md` Section 3.6, dan interface `ActionRadarViewModel.hasData` di Section 2.2.

---

### #5 — Margin percentage dihitung dengan pembagi yang bisa 0

**Konteks:** `getMarginStatus` awalnya menghitung `underCogs / totalCogs` tanpa memastikan `totalCogs > 0`. SKU yang belum pernah terjual (`qty = 0`, contoh `BC-999`) punya `totalCogs = 0`, sehingga pembagian ini menghasilkan `NaN` atau `Infinity` tergantung nilai `underCogs`.

**Root cause:** Sama seperti #1 dan #4 — pola berulang: setiap kali ada pembagian, harus ada guard eksplisit untuk pembagi 0 SEBELUM operasi dijalankan, tidak boleh mengandalkan behavior default JavaScript (`x/0 = Infinity`, `0/0 = NaN`) sebagai "penanganan".

**Fix / Aturan:**
- **Aturan umum (berlaku untuk SEMUA pembagian di codebase ini):** sebelum menulis `a / b`, selalu tulis guard `if (b <= 0) return <nilai default yang bermakna bisnis>` terlebih dahulu. Tidak ada pengecualian.
- Untuk kasus ini spesifik: `totalCogs <= 0` → return `AMAN` (tidak ada transaksi = tidak ada risiko margin).
- Referensi implementasi yang benar: `TECH_SPEC.md` Section 3.4.

---

## 2. Aturan Zero-Division — Ringkasan (checklist wajib sebelum PR/commit)

Setiap fungsi baru yang melakukan pembagian (`/`) WAJIB melewati checklist ini:

- [ ] Apakah pembagi (denominator) bisa bernilai 0 dalam data nyata atau `sample_data.json`? (Cek dulu — jangan asumsikan tidak mungkin.)
- [ ] Sudah ada guard `if (denominator <= 0)` SEBELUM baris pembagian?
- [ ] Nilai default saat guard terpicu punya makna bisnis yang jelas (bukan `0` asal-asalan, bukan `Infinity`, bukan `NaN`)?
- [ ] Nilai `null`/default tersebut sudah ditangani secara eksplisit di layer UI (tidak dirender mentah sebagai angka)?
- [ ] Ada test case atau entry di `sample_data.json` yang memicu kondisi pembagi 0 ini? (Lihat `BC-999` sebagai pola rujukan.)

---

## 3. Bagaimana Dokumen Ini Dipakai di Run Berikutnya

Setiap kali memulai sesi implementasi baru untuk Action Radar:
1. Baca Section 1 dokumen ini terlebih dahulu.
2. Saat menulis fungsi kalkulasi apa pun yang menyerupai pola di atas (pembagian, agregasi, threshold comparison), terapkan aturan yang sudah tercatat — jangan menulis ulang dari nol tanpa mengacu ke sini.
3. Jika ditemukan kesalahan baru yang belum tercatat, tambahkan entry baru dengan format: Konteks → Root Cause → Fix/Aturan → Referensi implementasi.
4. Dokumen ini tidak pernah dihapus entry-nya, hanya ditambah — supaya jadi riwayat pembelajaran yang lengkap.

---

### #6 — Catatan `note` di sample_data.json tidak selalu cocok dengan hasil kalkulasi spec

**Konteks:** Saat scaffold UI dan menjalankan logic engine terhadap `sample_data.json`, dua ekspektasi yang tertulis di field `note` tidak terbukti oleh angkanya sendiri:

| SKU | Ekspektasi di `note` | Hasil kalkulasi aktual (elapsedHours = 4) |
|---|---|---|
| `HC-005` | "kandidat KRITIS ganda (stock + margin), harus muncul di posisi teratas list" | runrate 1,25/jam, stock 15 → runway **12 jam** → stockStatus **WASPADA**, bukan KRITIS. Overall KRITIS hanya dari sisi margin. Posisi akhir: **#2** |
| `SK-007` | "kandidat KRITIS dari sisi stock" | runrate 2,25/jam, stock 14 → runway **6,22 jam** → **WASPADA**, karena threshold kritis adalah `< 6` jam. Beda 0,22 jam dari batas |

Yang naik ke posisi #1 justru `FR-002` (oversold), karena `jamSampaiHabis = 0` menang di tie-breaker Section 3.5 di antara semua SKU berstatus KRITIS.

**Root cause:** Field `note` ditulis sebagai *niat* skenario saat menyusun sample data, bukan hasil kalkulasi yang sudah dijalankan. `note` tidak pernah dieksekusi, jadi tidak ada mekanisme yang memaksanya tetap sinkron saat angka qty/stock/elapsedHours diubah. `SK-007` khususnya duduk sangat dekat batas threshold — pergeseran kecil `campaignElapsedHours` akan membalik statusnya.

**Fix / Aturan:**
- `note` di `sample_data.json` adalah **dokumentasi niat, bukan expected output**. Jangan pakai `note` sebagai sumber kebenaran untuk assertion atau untuk menilai logic engine salah. Sumber kebenaran status tetap `TECH_SPEC.md` Section 3.
- Logic engine TIDAK diubah untuk "mencocokkan" `note`. Perilaku saat ini sudah benar: oversell (runway 0) memang paling mendesak, dan 6,22 jam memang di atas threshold 6 jam.
- Kalau memang diinginkan `HC-005` KRITIS ganda dan `SK-007` KRITIS stock, yang diubah adalah **datanya** (mis. turunkan `stockGudang` atau naikkan `qtyTerjualCampaignBerjalan`), bukan threshold atau urutan sorting.
- Untuk SKU yang duduk dekat batas threshold, sebut angka runway-nya di `note`, jangan hanya label statusnya — supaya mismatch seperti ini kelihatan sejak awal.

