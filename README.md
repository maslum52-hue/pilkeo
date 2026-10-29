# PILKETOS Digital

Demo lokal untuk alur pemilihan Ketua OSIS. Halaman siswa berada di `/` dan panel administrator di `/admin`; keduanya membaca dan mengubah database yang sama.

## Menjalankan

Pastikan Node.js terpasang, lalu jalankan dari folder ini:

```sh
npm start
```

Buka <http://127.0.0.1:3000>.

- Halaman pemilihan siswa: <http://127.0.0.1:3000/>
- Panel administrator: <http://127.0.0.1:3000/admin>

## Akun demo

- NISN `0012345678`, `0012345679`, atau `0012345680`
- Kode akses `osis2026`
- Admin `admin` / `adminosis2026`

Panel admin dapat menambah, mengubah, dan menghapus pemilih maupun kandidat dari halaman ringkasan utama atau daftar lengkap, mengunggah foto kandidat (JPG, PNG, WebP hingga 5 MB), mengimpor hingga 1.000 siswa dari CSV melalui menu **Import Data**, membuka atau menutup pemilihan, serta melihat hasil. Template impor memakai header `NISN,Nama,KodeAkses`. Pemilih yang sudah memberikan suara dan kandidat yang sudah menerima suara tidak dapat dihapus. Semua data tersimpan di `data/election.json`; foto tersimpan di `uploads/candidates/`. Untuk mengulang demo, hentikan server, lalu hapus file database; server akan membuat kembali data awal saat dijalankan.

## Batas penggunaan

Aplikasi ini berjalan di satu proses lokal dan menggunakan akun serta kandidat contoh yang ditulis di `server.js`. Jangan gunakan untuk pemilihan nyata atau masukkan data pribadi siswa. Pemilihan sungguhan memerlukan autentikasi sekolah, pengelolaan data yang aman, pencadangan, kontrol akses panitia, dan tinjauan keamanan independen.
