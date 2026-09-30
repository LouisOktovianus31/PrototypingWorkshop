# Action Radar — Penjelasan Fungsional Aplikasi

## Tujuan
Action Radar adalah dashboard web mobile-first untuk membantu Brand Account Manager memantau SKU saat campaign e-commerce. Aplikasi mempercepat proses pengecekan data penjualan dan stok, sehingga pengguna dapat segera mengetahui SKU mana yang perlu ditindak.

## Alur Penggunaan
1. Pengguna membuka dashboard campaign dari HP atau desktop.
2. Pengguna mengisi **Budget Campaign** jika belum tersedia.
3. Sistem membaca data campaign dan data SKU yang sudah disediakan.
4. Sistem menghitung kondisi stok, kecepatan penjualan, margin, dan keamanan budget.
5. SKU ditampilkan dari kondisi paling mendesak hingga paling aman.
6. Pengguna membaca rekomendasi lalu melakukan tindakan secara manual di platform atau gudang terkait.

## Data yang Dianalisis
Untuk setiap SKU, aplikasi menggunakan:
- Nama dan kode SKU.
- Stok dari seluruh lokasi gudang.
- Jumlah unit yang terjual selama campaign.
- Revenue net dan total COGS selama campaign.
- Durasi campaign yang sudah berjalan.
- Budget Campaign yang diinput pengguna.

## Perhitungan Utama
- **Runrate per jam:** jumlah unit terjual dibagi jam campaign yang sudah berjalan.
- **Jam sampai habis:** total stok dibagi runrate per jam.
- **Under COGS:** revenue net dikurangi total COGS. Nilai negatif berarti SKU dijual rugi.
- **Budget Safe:** budget campaign dikurangi total kerugian dari SKU yang dijual di bawah COGS.

## Status SKU
Aplikasi memberi status untuk stok dan margin, lalu memakai kondisi yang paling buruk sebagai status keseluruhan.

- **KRITIS:** stok habis kurang dari 6 jam, terjadi oversell, atau SKU dijual di bawah COGS.
- **WASPADA:** stok diperkirakan habis dalam 6–24 jam atau margin kurang dari 10% dari COGS.
- **AMAN:** stok cukup dan margin sehat.

SKU berstatus kritis akan muncul paling atas. Jika tingkat status sama, SKU dengan stok dan margin sama-sama kritis diprioritaskan lebih dahulu.

## Output yang Ditampilkan
- Indikator **Budget Safe** campaign dengan status Aman, Waspada, atau Kritis.
- Daftar SKU yang sudah diprioritaskan.
- Informasi stok total, runrate, estimasi jam sampai habis, dan nilai Under COGS.
- Badge status pada setiap SKU.
- Rekomendasi tindakan berbasis kondisi SKU.

## Contoh Rekomendasi Tindakan
- **Oversell:** cek sinkronisasi alokasi stok gudang dan seller center.
- **Stok kritis:** lakukan replenishment dari gudang lain atau siapkan komunikasi ke merchant.
- **Margin negatif:** cek voucher/diskon aktif, pertimbangkan menurunkan voucher atau delist sementara.
- **Stok dan margin sehat:** tidak ada tindakan mendesak.

## Kondisi Tampilan
- **Empty state:** muncul bila Budget Campaign belum diisi atau data SKU belum tersedia.
- **Loading state:** menampilkan skeleton saat data sedang dihitung.
- **Toast alert:** muncul saat SKU yang sebelumnya aman/waspada berubah menjadi kritis, dengan akses cepat ke SKU terkait.

## Batasan Aplikasi
- Aplikasi hanya memberikan analisis dan rekomendasi.
- Tidak ada login, database, API live, atau sinkronisasi langsung ke Shopee, Tokopedia, dan TikTok Shop.
- Tidak ada aksi otomatis seperti delist, perubahan harga/voucher, atau restock.
- Budget hanya tersimpan selama sesi aplikasi berjalan.

## Hasil yang Diharapkan
Dalam kurang dari 30 detik, pengguna dapat mengetahui SKU paling mendesak, memahami penyebabnya, melihat kondisi budget campaign, dan menentukan tindakan manual berikutnya tanpa menghitung data dari CSV secara terpisah.
