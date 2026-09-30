# QA Chaos Checklist — Action Radar

Checklist ini dipakai untuk menguji ketahanan Action Radar saat menerima data ekstrem, tidak lengkap, atau tidak konsisten. Fokusnya adalah memastikan aplikasi tidak crash, tidak menampilkan angka menyesatkan, dan tetap memberi respons yang jelas kepada pengguna.

**Aturan lulus umum:** tidak boleh ada `NaN`, `Infinity`, `undefined`, atau `null` yang dirender sebagai teks; hasil harus deterministik; dan input tidak boleh dimutasi.

## Cara Pakai
- Jalankan seluruh item **P0** sebelum demo atau release.
- Tandai `PASS`, `FAIL`, atau `N/A` pada tiap baris.
- Catat bukti singkat (screenshot, log, atau ID test) pada kolom catatan.
- Untuk kegagalan baru, tambahkan regression test ke `checkpoint.test-cases.json` dan catat pembelajarannya di `learnings.md`.

| Status | Prioritas | Skenario | Expected Result | Catatan/Bukti |
|---|---|---|---|---|
| [ ] | P0 | Seluruh output ViewModel diperiksa | Tidak ada angka `NaN` atau `Infinity`; runway hanya berupa angka finite atau `null`. | |
| [ ] | P0 | `campaignElapsedHours = 0` | Runrate menjadi `0`; aplikasi tidak membagi dengan nol. | |
| [ ] | P0 | `campaignElapsedHours` negatif | Runrate menjadi `0`; dashboard tidak crash. | |
| [ ] | P0 | Qty terjual `0`, elapsed hour positif | Runrate `0`, runway `null`, status stok `AMAN`. | |
| [ ] | P0 | Qty terjual `0` dan elapsed hour `0` | Tidak ada `0/0`, `NaN`, maupun error. | |
| [ ] | P0 | Stock positif dengan runrate `0`/negatif | Runway `null`, bukan `Infinity`; UI menampilkan kondisi stok aman tanpa angka jam palsu. | |
| [ ] | P0 | Stock tepat `0` | Runway `0` dan status stok kritis. | |
| [ ] | P0 | Total stock negatif / oversell | `isOversold = true`, runway `0`, status `KRITIS`, rekomendasi memeriksa sinkronisasi stok. | |
| [ ] | P0 | Oversell bersamaan dengan runrate `0` | Oversell tetap menang: status `KRITIS`, bukan runway `null`/aman. | |
| [ ] | P0 | Stock per lokasi berbeda: satu lokasi `0`, lokasi lain positif | Total stock dihitung dari seluruh lokasi; tidak ada false out-of-stock. | |
| [ ] | P0 | Budget Campaign `0` atau negatif | Tampil Empty State; daftar analisis tidak ditampilkan sebagai dashboard normal. | |
| [ ] | P0 | Budget Safe dihitung langsung dengan budget `0` | Persentase menjadi `0` secara aman, bukan `NaN`/`Infinity`; status kritis. | |
| [ ] | P0 | SKU list kosong | `hasData = false` dan UI menunjukkan Empty State yang jelas. | |
| [ ] | P0 | `qty = 0` atau `cogsPerUnit = 0` | Margin tidak melakukan pembagian nol; bila tidak rugi, status margin `AMAN`. | |
| [ ] | P0 | Under COGS negatif dengan total COGS `0` | Tetap `KRITIS`; kerugian aktual harus menang sebelum guard pembagi. | |

## Threshold dan Perhitungan

| Status | Prioritas | Skenario | Expected Result | Catatan/Bukti |
|---|---|---|---|---|
| [ ] | P0 | Runway tepat `6` jam | Status stok `WASPADA` (`KRITIS` hanya jika kurang dari 6 jam). | |
| [ ] | P0 | Runway `5,99` jam | Status stok `KRITIS`. | |
| [ ] | P0 | Runway tepat `24` jam | Status stok `AMAN`. | |
| [ ] | P0 | Runway `23,99` jam | Status stok `WASPADA`. | |
| [ ] | P0 | Margin negatif | Status margin selalu `KRITIS`. | |
| [ ] | P0 | Margin tepat `0%` | Status margin `WASPADA`. | |
| [ ] | P0 | Margin tepat `10%` dari COGS | Status margin `AMAN`. | |
| [ ] | P0 | Margin tepat di bawah `10%` dari COGS | Status margin `WASPADA`. | |
| [ ] | P0 | Budget Safe tepat `30%` | Status budget `AMAN`. | |
| [ ] | P0 | Budget Safe tepat di bawah `30%` | Status budget `WASPADA`. | |
| [ ] | P0 | Budget Safe tepat `10%` | Status budget `WASPADA`. | |
| [ ] | P0 | Budget Safe tepat di bawah `10%` | Status budget `KRITIS`. | |
| [ ] | P0 | Total kerugian melebihi budget | Budget Safe boleh negatif dan harus berstatus `KRITIS`; jangan di-clamp menjadi nol. | |
| [ ] | P0 | Campuran SKU untung dan rugi | Budget Safe hanya menjumlahkan nilai absolut SKU yang Under COGS; keuntungan tidak boleh menutup kerugian. | |

## Prioritas, Rekomendasi, dan Tampilan

| Status | Prioritas | Skenario | Expected Result | Catatan/Bukti |
|---|---|---|---|---|
| [ ] | P0 | Stock aman tetapi margin kritis | Status keseluruhan `KRITIS`. | |
| [ ] | P0 | Stock kritis tetapi margin aman | Status keseluruhan `KRITIS`. | |
| [ ] | P0 | Semua SKU aman | List tetap tampil dan diurutkan oleh runway; tidak ada badge kritis palsu. | |
| [ ] | P0 | SKU dengan severity berbeda | Urutan selalu `KRITIS` → `WASPADA` → `AMAN`. | |
| [ ] | P0 | Dua SKU sama-sama kritis, salah satunya kritis di stok dan margin | SKU kritis ganda tampil lebih dahulu. | |
| [ ] | P1 | Severity dan kondisi sama | Runway lebih pendek tampil lebih dahulu. | |
| [ ] | P1 | Runway `null` saat sorting | Diperlakukan sebagai paling akhir dalam kelompok severity yang sama; `Infinity` tidak bocor ke UI. | |
| [ ] | P1 | Sort dipanggil pada array input | Array input tidak berubah; fungsi mengembalikan array baru. | |
| [ ] | P0 | Rekomendasi oversell | Menyebut oversell/sinkronisasi data; tidak menyarankan replenish sebagai aksi utama. | |
| [ ] | P0 | Kritis stok dan margin bersamaan | Rekomendasi memprioritaskan delist sementara untuk menghentikan kerugian dan menyebut runway yang valid. | |
| [ ] | P0 | Margin kritis saja | Rekomendasi menyebut COGS dan voucher/diskon; tidak fokus pada replenishment. | |
| [ ] | P1 | Runway `null` pada rekomendasi | Teks rekomendasi tidak mengandung `null`, `undefined`, `NaN`, atau `Infinity`. | |
| [ ] | P1 | Perubahan AMAN/WASPADA menjadi KRITIS | Toast non-blocking tampil, menjelaskan penyebab, dan aksi lompat ke SKU berfungsi. | |
| [ ] | P1 | Mobile viewport 375–430 px | Informasi status, rekomendasi, dan tombol dapat dibaca/tap tanpa horizontal scroll. | |

## Chaos Import Excel — Skenario Tambahan

> Bagian ini perlu diprioritaskan bila alur impor XLSX digunakan. Verifier saat ini memvalidasi workbook contoh yang valid, sehingga kasus-kasus berikut harus ditambah sebagai fixture/test negatif baru.

| Status | Prioritas | Skenario | Expected Result | Catatan/Bukti |
|---|---|---|---|---|
| [ ] | P0 | File bukan XLSX, korup, atau tidak dapat dibuka | Upload gagal secara terarah; tidak crash dan tidak menampilkan dashboard parsial. | |
| [ ] | P0 | Workbook tanpa sheet wajib | Tampilkan pesan sheet yang hilang dan hentikan analisis. | |
| [ ] | P0 | Header wajib hilang atau ambigu | Tampilkan error/issue yang menjelaskan header bermasalah; jangan memetakan kolom secara diam-diam. | |
| [ ] | P0 | Nilai angka invalid, kosong, atau berformat teks | Baris invalid dilaporkan dengan konteks sheet/baris; hasil tidak boleh memunculkan metrik non-finite. | |
| [ ] | P0 | Tanggal invalid atau di luar rentang analisis | Tampilkan issue yang jelas; jangan membuat window tanggal salah atau crash. | |
| [ ] | P0 | SKU duplikat atau SKU orphan antar-sheet | Laporkan konflik rekonsiliasi; jangan menggandakan nilai atau menghilangkan SKU tanpa pemberitahuan. | |
| [ ] | P1 | Baris kosong, summary, dan `TOTAL` di sheet sales | Baris tersebut dilewati secara konsisten; total transaksi valid tetap akurat. | |
| [ ] | P1 | Nama sheet/kolom memiliki spasi, kapitalisasi, atau urutan berbeda | Klasifikasi dan mapping tetap sesuai aturan yang didukung; jika tidak didukung, tampilkan issue terarah. | |
| [ ] | P1 | File besar atau banyak SKU | Aplikasi menampilkan loading state dan tetap responsif; tidak freeze tanpa indikator. | |
| [ ] | P1 | Upload dibatalkan atau file diganti saat parsing | Proses lama dibatalkan/diabaikan dengan aman; hasil file lama tidak menimpa file baru. | |

## Integrasi dan Batasan Arsitektur

| Status | Prioritas | Skenario | Expected Result | Catatan/Bukti |
|---|---|---|---|---|
| [ ] | P0 | Pipeline dijalankan dengan `fetch`/network diblokir | Analisis tetap berjalan tanpa percobaan network. | |
| [ ] | P0 | Input data dibekukan sebelum proses | Tidak ada mutasi pada data input. | |
| [ ] | P0 | Pipeline dipanggil dua kali dengan input sama | Output identik dan urutan SKU konsisten. | |
| [ ] | P0 | Cek source dan runtime | Tidak ada akses database, autentikasi, session, atau write-back SKU. | |
| [ ] | P1 | Refresh halaman | Budget kembali ke state awal sesuai desain (tidak dipersist), tanpa data korup atau error. | |

## Regression Gate Sebelum Selesai

- [ ] Jalankan checkpoint utama: `node run-checkpoint.ts`.
- [ ] Jalankan subset prioritas kritis: `node run-checkpoint.ts --priority=critical`.
- [ ] Jalankan verifier Excel bila alur impor berubah: `npm run verify` dari folder `action-radar-app`.
- [ ] Pastikan fixture `FR-002` tetap menguji oversell dan `BC-999` tetap menguji runrate 0/runway `null`.
- [ ] Jangan memakai field `note` pada sample data sebagai expected result; gunakan `TECH_SPEC.md` dan hasil kalkulasi sebagai sumber kebenaran.
- [ ] Semua temuan P0 harus `PASS`; tidak ada P0 yang ditandai `N/A` tanpa alasan tertulis.
