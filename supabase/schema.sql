-- =====================================================================
-- Kas Terbuka — skema database Supabase
-- Jalankan SEKALI di Supabase: menu SQL Editor > New query > tempel > Run.
-- =====================================================================

-- ---------- Pengurus (orang yang boleh mencatat) ----------
create table if not exists public.pengurus (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  nama        text not null,
  dibuat_pada timestamptz not null default now()
);

-- Benar jika orang yang sedang masuk terdaftar sebagai pengurus.
create or replace function public.is_pengurus()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.pengurus where user_id = auth.uid());
$$;

-- ---------- Data aplikasi (satu kolom JSON per baris) ----------
create table if not exists public.config (
  id   text primary key,
  data jsonb not null default '{}'::jsonb
);
create table if not exists public.transaksi (
  id    text primary key,
  data  jsonb not null,
  dibuat timestamptz not null default now()
);
create table if not exists public.anggaran (
  id   text primary key,
  data jsonb not null
);
create table if not exists public.pembayaran (
  id    text primary key,
  data  jsonb not null,
  dibuat timestamptz not null default now()
);

-- ---------- Penjaga transparansi ----------
-- 1. Pencatat dan waktu catat diisi oleh server, tidak bisa dipalsukan.
-- 2. Isi catatan tidak bisa diubah setelah disimpan. Satu-satunya
--    perubahan yang diizinkan adalah membatalkan, disertai alasan.
-- 3. Catatan yang sudah dibatalkan tidak bisa dihidupkan lagi.
create or replace function public.transaksi_jaga()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  kolom_batal text[] := array['status', 'alasanBatal', 'dibatalkanOleh', 'dibatalkanPada'];
  sekarang text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      new.data := new.data || jsonb_build_object(
        'dicatatOleh', auth.uid()::text, 'dicatatPada', sekarang, 'status', 'aktif');
    end if;
    return new;
  end if;

  if (new.data - kolom_batal) is distinct from (old.data - kolom_batal) then
    raise exception 'Catatan uang tidak boleh diubah. Batalkan, lalu catat ulang dengan angka yang benar.';
  end if;
  if coalesce(old.data->>'status', '') = 'batal' then
    raise exception 'Catatan yang sudah dibatalkan tidak bisa diubah lagi.';
  end if;
  if new.data->>'status' = 'batal' then
    if coalesce(length(trim(new.data->>'alasanBatal')), 0) < 5 then
      raise exception 'Pembatalan wajib disertai alasan.';
    end if;
    if auth.uid() is not null then
      new.data := new.data || jsonb_build_object('dibatalkanOleh', auth.uid()::text, 'dibatalkanPada', sekarang);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists transaksi_jaga on public.transaksi;
create trigger transaksi_jaga
  before insert or update on public.transaksi
  for each row execute function public.transaksi_jaga();

-- ---------- Aturan akses (Row Level Security) ----------
alter table public.pengurus   enable row level security;
alter table public.config     enable row level security;
alter table public.transaksi  enable row level security;
alter table public.anggaran   enable row level security;
alter table public.pembayaran enable row level security;

-- Nama pengurus terbuka, supaya umat tahu siapa yang mencatat.
drop policy if exists "pengurus: semua membaca" on public.pengurus;
create policy "pengurus: semua membaca" on public.pengurus for select using (true);

-- Identitas dan pengaturan: semua membaca, pengurus menulis.
drop policy if exists "config: semua membaca" on public.config;
drop policy if exists "config: pengurus menambah" on public.config;
drop policy if exists "config: pengurus mengubah" on public.config;
create policy "config: semua membaca"     on public.config for select using (true);
create policy "config: pengurus menambah" on public.config for insert with check (public.is_pengurus());
create policy "config: pengurus mengubah" on public.config for update using (public.is_pengurus()) with check (public.is_pengurus());

-- Catatan uang: semua membaca, pengurus mencatat dan membatalkan.
-- Hanya catatan CONTOH yang boleh dihapus.
drop policy if exists "transaksi: semua membaca" on public.transaksi;
drop policy if exists "transaksi: pengurus mencatat" on public.transaksi;
drop policy if exists "transaksi: pengurus membatalkan" on public.transaksi;
drop policy if exists "transaksi: hapus contoh saja" on public.transaksi;
create policy "transaksi: semua membaca"        on public.transaksi for select using (true);
create policy "transaksi: pengurus mencatat"    on public.transaksi for insert with check (public.is_pengurus());
create policy "transaksi: pengurus membatalkan" on public.transaksi for update using (public.is_pengurus()) with check (public.is_pengurus());
create policy "transaksi: hapus contoh saja"    on public.transaksi for delete
  using (public.is_pengurus() and coalesce((data->>'contoh')::boolean, false));

-- Rencana belanja: semua membaca, pengurus menulis.
drop policy if exists "anggaran: semua membaca" on public.anggaran;
drop policy if exists "anggaran: pengurus menambah" on public.anggaran;
drop policy if exists "anggaran: pengurus mengubah" on public.anggaran;
drop policy if exists "anggaran: pengurus menghapus" on public.anggaran;
create policy "anggaran: semua membaca"      on public.anggaran for select using (true);
create policy "anggaran: pengurus menambah"  on public.anggaran for insert with check (public.is_pengurus());
create policy "anggaran: pengurus mengubah"  on public.anggaran for update using (public.is_pengurus()) with check (public.is_pengurus());
create policy "anggaran: pengurus menghapus" on public.anggaran for delete using (public.is_pengurus());

-- Donasi masuk: memuat nama donatur, jadi HANYA pengurus.
drop policy if exists "pembayaran: hanya pengurus" on public.pembayaran;
create policy "pembayaran: hanya pengurus" on public.pembayaran for all
  using (public.is_pengurus()) with check (public.is_pengurus());

grant usage on schema public to anon, authenticated;
grant execute on function public.is_pengurus() to anon, authenticated;
grant select on public.pengurus, public.config, public.transaksi, public.anggaran to anon, authenticated;
grant select, insert, update, delete on public.config, public.transaksi, public.anggaran, public.pembayaran to authenticated;

-- ---------- Foto nota ----------
insert into storage.buckets (id, name, public)
values ('bukti', 'bukti', true)
on conflict (id) do nothing;

drop policy if exists "bukti: pengurus mengunggah" on storage.objects;
create policy "bukti: pengurus mengunggah" on storage.objects for insert to authenticated
  with check (bucket_id = 'bukti' and public.is_pengurus());

-- ---------- Pembaruan langsung (realtime) ----------
do $$
begin
  begin alter publication supabase_realtime add table public.config;     exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.transaksi;  exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.anggaran;   exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.pembayaran; exception when duplicate_object then null; end;
end $$;
