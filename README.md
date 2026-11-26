# Kas Terbuka

Buku kas terbuka untuk rumah ibadah. Semua orang yang membuka website bisa melihat uang masuk, uang keluar, dan laporan bulanan. Hanya pengurus yang terdaftar yang bisa mencatat.

- **Tampilan:** satu halaman statis (`index.html`), di-host di Vercel.
- **Data, login, dan foto nota:** Supabase (paket gratis cukup).

## Isi folder

| File | Gunanya |
|---|---|
| `index.html` | Aplikasinya |
| `config.js` | Alamat dan kunci Supabase. **Wajib diisi.** |
| `supabase-adapter.js` | Penghubung aplikasi ke Supabase |
| `auth.js` | Tombol masuk/keluar pengurus |
| `supabase/schema.sql` | Tabel, aturan akses, dan penjaga catatan |
| `supabase/seed-contoh.sql` | Data contoh (boleh dilewati) |
| `vercel.json` | Pengaturan Vercel |

## Langkah 1: Siapkan Supabase

1. Buat akun di https://supabase.com, lalu buat **New project**. Pilih region **Southeast Asia (Singapore)** supaya cepat dari Indonesia.
2. Buka **SQL Editor > New query**. Tempel seluruh isi `supabase/schema.sql`, lalu tekan **Run**.
3. (Opsional) Jalankan juga `supabase/seed-contoh.sql` untuk mengisi data contoh. Data contoh bisa dihapus dari menu Pengaturan.
4. Buka **Project Settings > API**. Salin **Project URL** dan kunci **anon public** ke `config.js`.
   Jangan pernah memakai kunci `service_role` di website.

## Langkah 2: Deploy ke Vercel

Pilih salah satu cara:

- **Lewat GitHub (disarankan):** unggah folder ini ke repositori GitHub. Di https://vercel.com/new pilih **Import** repositori itu, biarkan pengaturan bawaan (tanpa build command), lalu tekan **Deploy**.
- **Lewat Vercel CLI:** pasang Node.js, lalu dari folder ini jalankan `npx vercel` (pertama kali akan diminta login), lalu `npx vercel --prod`.

## Langkah 3: Sambungkan login ke alamat Vercel

Di Supabase buka **Authentication > URL Configuration**:

- **Site URL:** alamat Vercel Anda, misalnya `https://kas-terbuka.vercel.app`
- **Redirect URLs:** tambahkan alamat yang sama

Tanpa langkah ini, tautan masuk dari email akan membuka alamat yang salah.

## Langkah 4: Daftarkan pengurus

1. Buka website, tekan **Masuk sebagai pengurus**, isi email, lalu buka tautan yang dikirim ke email itu.
2. Di Supabase **SQL Editor**, jalankan (ganti email dan nama):

```sql
insert into public.pengurus (user_id, nama)
select id, 'Nama Bendahara' from auth.users where email = 'bendahara@contoh.com';
```

3. Muat ulang website. Tab **Donasi Masuk** dan **Pengaturan** akan muncul, dan tombol mencatat aktif.

Untuk mencabut akses pengurus:

```sql
delete from public.pengurus where user_id = (select id from auth.users where email = 'bendahara@contoh.com');
```

## Jaminan transparansi (dijaga oleh database, bukan hanya tampilan)

- Siapa pun bisa membaca catatan uang, rencana belanja, dan nama pengurus.
- Nama pencatat dan waktu catat diisi otomatis oleh server, tidak bisa dipalsukan.
- Catatan yang sudah disimpan **tidak bisa diubah atau dihapus**. Koreksi hanya bisa dilakukan dengan membatalkan catatan disertai alasan. Catatan yang dibatalkan tetap terlihat.
- Daftar **Donasi Masuk** memuat nama donatur, jadi hanya bisa dilihat pengurus.
- Menu Donasi Masuk masih simulasi: datanya diketik manual, belum tersambung ke QRIS atau bank.
