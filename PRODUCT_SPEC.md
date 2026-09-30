# PRODUCT_SPEC.md — Action Radar

## 1. User Intent

**Persona:** Fiona, Brand AM Lead di SIRCLO Commerce. Mengelola 4 brand beauty & fashion lintas Shopee, Tokopedia, dan TikTok Shop.

**Konteks:** Midnight Double-Day Mega Campaign (10.10), volume order melonjak tajam.

**Raw problem statement:**
> "Midnight hits and hero SKUs show out-of-stock while the warehouse has 500 units left! Voucher stack errors sell lipsticks below COGS. I spend 45 mins manually cross-checking CSVs from 3 seller centers against warehouse sheets to decide what to delist or replenish."

**Bottleneck tunggal yang diselesaikan:**
Fiona punya semua data yang dia butuhkan (CSV 3 seller center + warehouse sheet), tapi butuh **45 menit cross-check manual** untuk tahu SKU mana yang butuh keputusan. Setiap menit yang lewat, uang keluar lewat SKU yang terjual di bawah COGS atau sales hilang karena stock salah baca. Masalahnya bukan data yang tidak ada — masalahnya adalah **waktu analisa yang bikin keputusan terlambat**.

**Yang TIDAK dibangun (scope creep yang ditolak):**
Fiona sempat minta "end-to-end ERP dengan live multi-channel API, auto-stock rebalancing bots, mobile app dengan biometric login". Ini di luar scope. Solusi ini tidak mengeksekusi apa pun secara otomatis ke seller center — Fiona tetap eksekusi manual di platform masing-masing. Yang dibangun hanya mempercepat proses **tahu apa yang harus dikerjakan**.

**Solusi:** Action Radar — satu dashboard, satu list, terurut dari SKU paling mendesak ke paling aman. Menggantikan proses cross-check manual dengan kalkulasi otomatis atas 3 data point, dan menyajikan rekomendasi tindakan tertulis per SKU.

**Platform: Mobile-first web.** Fiona menghadapi krisis ini tengah malam, kemungkinan besar dari HP-nya (sambil balas WhatsApp merchant), bukan duduk depan laptop. Layar dirancang dan diuji utama untuk viewport mobile; desktop adalah breakpoint tambahan, bukan target utama. Ini web responsive, bukan native app — biometric login dan fitur native lain tetap di luar scope (lihat Section 6).

---

## 2. Data Point Definitions

Berdasarkan `Beauty_Sales_Inventory_Dummy_Sep2026.xlsx` (sheet: Master Inventory, Sales - TikTok, Sales - Shopee, Stock Check, Price List).

### 2.1 Runrate per SKU
```
Runrate/jam = (Qty Terjual TikTok + Qty Terjual Shopee + Qty Terjual Tokopedia, rata-rata harian) / 24
Jam Sampai Habis = Sisa Stock (gabungan semua gudang) / Runrate per jam
```
- Sisa Stock diambil dari total gudang, bukan per seller center — ini yang menutup gap "out-of-stock palsu" (stock kelihatan 0 di satu seller center padahal gudang masih ada 500 unit).
- Threshold kritis: **Jam Sampai Habis < 6 jam** → flag merah.
- Threshold waspada: **6–24 jam** → flag kuning.

### 2.2 Under COGS
```
Under COGS (per SKU, per platform) = Total Revenue Net (Rp) − Total COGS (Rp)
```
- Menggunakan Revenue Net **sebelum** potongan fee platform, karena ini murni hasil dari harga jual x qty — bagian yang langsung kena dampak voucher error.
- Nilai negatif = kerugian aktual (match ke kolom `Status Margin (vs COGS)` = "BELOW COGS" di data existing).
- Diagregasi lintas platform per SKU untuk melihat total kerugian per SKU.

### 2.3 Budget Safe
```
Budget Safe = Budget Campaign (input manual) − Akumulasi Under COGS (total kerugian sejauh campaign berjalan)
```
- **Budget Campaign** adalah input manual yang Fiona isi sekali di awal campaign (per campaign, nominal Rp). Tidak ada di data dummy — ini field baru di UI.
- Budget Safe mendekati 0 atau negatif = campaign sedang "memakan" budget lewat kerugian margin, bukan lewat marketing spend yang direncanakan.
- Threshold kritis: **Budget Safe < 10% dari Budget Campaign** → flag merah di level campaign (bukan per SKU).

### 2.4 Prioritized Action Score
SKU diurutkan berdasarkan kombinasi: SKU dengan Jam Sampai Habis kritis DAN/ATAU Under COGS negatif naik ke atas list. SKU yang keduanya kritis (stock mau habis + lagi rugi) berada di posisi teratas.

---

## 3. Flow Journey (Input → Trigger → Action)

**Input**
Fiona buka Action Radar dari HP-nya tengah malam saat campaign berjalan — satu tangan pegang HP, tangan lain mungkin lagi balas WhatsApp merchant. Data sales 3 platform + warehouse stock sudah tergabung otomatis di belakang layar (tidak ada upload atau cocok-cocok manual). Jika ini kunjungan pertama untuk campaign ini, Fiona mengisi Budget Campaign sekali di awal lewat form mobile yang singkat.

**Trigger**
Sistem menghitung Runrate, Under COGS, dan Budget Safe per SKU secara kontinu. Begitu ada SKU yang melewati threshold kritis (stock < 6 jam atau margin negatif), SKU tersebut naik ke posisi teratas list dan ditandai dengan badge status.

**Action**
Fiona melihat list yang sudah terurut, membaca rekomendasi tindakan tertulis per SKU kritis (mis. "Delist sementara — margin -Rp12.400/unit di TikTok", atau "Replenish dari Gudang Bandung — stock pusat cukup, alokasi ke Shopee habis dalam 3 jam"), lalu mengeksekusi keputusan itu secara manual di platform terkait.

---

## 4. UX States

**Catatan constraint mobile-first:** Semua state di bawah didesain utama untuk viewport mobile (~375–430px lebar). Badge status harus terbaca sekilas tanpa zoom, rekomendasi tindakan harus terbaca tanpa horizontal scroll, dan tombol aksi (mis. dismiss toast, jump to SKU) harus terjangkau thumb (area tap minimal 44x44px, ditempatkan di zona bawah/tengah layar). Layout desktop mengikuti struktur yang sama dengan tambahan ruang, bukan redesain terpisah.

### 4.1 Empty State
- Kondisi: Belum ada Budget Campaign yang diisi, atau belum ada data transaksi masuk untuk periode campaign ini.
- Tampilan: Pesan singkat + CTA "Set Budget Campaign untuk mulai monitoring", form input nominal Rp.
- Tidak menampilkan list SKU kosong yang membingungkan — jelas menyatakan aksi apa yang dibutuhkan dari user.

### 4.2 Loading State
- Kondisi: Data sedang ditarik dan dihitung (Runrate, Under COGS, Budget Safe) dari 3 platform + warehouse.
- Tampilan: Skeleton list (placeholder baris SKU), indikator "Menghitung data dari 3 platform..." agar Fiona tahu sistem sedang bekerja, bukan diam/stuck.
- Target durasi: di bawah 3 detik untuk data dummy skala saat ini (25 SKU x 2 platform x ~30 hari).

### 4.3 Badges (Status Indicator)
Tiap baris SKU menampilkan badge warna sesuai kondisi:
- 🔴 **KRITIS** — Jam Sampai Habis < 6 jam DAN/ATAU Under COGS negatif signifikan. Ditampilkan di paling atas.
- 🟡 **WASPADA** — Jam Sampai Habis 6–24 jam, atau margin menipis mendekati COGS.
- 🟢 **AMAN** — stock cukup dan margin sehat.
- Badge level campaign terpisah untuk Budget Safe: 🔴 jika < 10% budget tersisa, 🟡 jika < 30%, 🟢 di atas itu.

### 4.4 Toast (Real-time Alert)
- Kondisi: SKU yang sebelumnya AMAN/WASPADA baru saja berpindah ke status KRITIS (mis. margin baru jatuh di bawah COGS akibat voucher baru, atau stock baru menembus threshold 6 jam).
- Tampilan: Toast notification muncul di pojok layar, berisi nama SKU + alasan singkat, dengan tombol langsung lompat ke baris SKU tersebut di list.
- Tidak mengganggu (non-blocking), auto-dismiss setelah beberapa detik, tapi tetap tercatat di list utama.

---

## 5. Acceptance Criteria (Unguided, < 30 detik)

Tanpa penjelasan atau training dari tim produk, Fiona (atau user dengan peran sejenis) harus bisa, dalam waktu kurang dari 30 detik sejak layar terbuka:

1. Mengidentifikasi SKU mana yang paling mendesak untuk ditindak (posisi teratas list, badge merah jelas terlihat).
2. Memahami **alasan** SKU itu kritis tanpa harus membuka data mentah (rekomendasi tertulis, bukan cuma angka).
3. Mengetahui kondisi Budget Safe campaign secara keseluruhan (apakah campaign masih dalam batas aman) dari satu indikator di bagian atas layar, tanpa harus menghitung manual.
4. Menentukan langkah selanjutnya (delist / replenish / turunkan voucher) berdasarkan rekomendasi yang tertulis di layar, tanpa perlu membuka CSV atau platform lain terlebih dahulu.

**Definisi sukses:** Waktu dari "SKU mulai rugi/stock kritis" sampai "Fiona tahu dan tahu apa yang harus dilakukan" turun dari 45 menit menjadi di bawah 30 detik.

---

## 6. Out of Scope (untuk prototype ini)

- Integrasi API live ke Shopee/TikTok/Tokopedia — data untuk prototype ini menggunakan dummy dataset yang sudah tersedia.
- Eksekusi otomatis (auto-delist, auto-adjust harga, auto-restock) — sistem hanya merekomendasikan, Fiona yang mengeksekusi manual.
- Native mobile app / biometric login (platform ini web responsive mobile-first, bukan native app).
- Rebalancing stock otomatis antar gudang.
- Multi-brand switcher (spec ini fokus 1 brand/campaign berjalan; multi-brand adalah iterasi lanjutan).

---

## 7. Open Questions (untuk didiskusikan sebelum masuk desain detail)

1. Apakah Budget Campaign diisi per campaign secara total, atau perlu dipecah per SKU/kategori? (Spec ini asumsi: total per campaign.)
2. Apakah rekomendasi tindakan ("Delist sementara", "Replenish dari Gudang X") cukup berupa teks statis berbasis aturan (rule-based), atau perlu mempertimbangkan data historis lain (mis. performa SKU di campaign sebelumnya)?
3. Threshold kritis (6 jam untuk stock, 10% untuk budget) — ini asumsi awal berdasarkan diskusi, perlu divalidasi dengan Fiona/user riil apakah angka ini sesuai kebiasaan kerja mereka.
