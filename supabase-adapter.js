/*
 * Kas Terbuka — penghubung ke Supabase.
 * Menyediakan window.claude.use("db" | "user" | "assets" | "downloads") dengan
 * bentuk yang sama seperti versi claude.ai, sehingga kode aplikasi tidak berubah.
 * Setiap koleksi disimpan sebagai tabel Supabase dengan kolom (id text, data jsonb).
 */
(function () {
  "use strict";
  const CFG = window.KAS_CONFIG || {};
  const configured = !!(CFG.supabaseUrl && CFG.supabaseAnonKey && !/GANTI/i.test(CFG.supabaseUrl + CFG.supabaseAnonKey));
  const TABLES = ["config", "transaksi", "anggaran", "pembayaran"];
  const BUCKET = "bukti";

  let sb = null;
  if (configured && window.supabase && window.supabase.createClient) {
    sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  }
  window.kasSupabase = sb;

  const state = { session: null, pengurus: null };
  const ready = (async () => {
    if (!sb) return;
    try {
      const { data } = await sb.auth.getSession();
      state.session = data.session || null;
      if (state.session) {
        const { data: row } = await sb.from("pengurus").select("user_id,nama").eq("user_id", state.session.user.id).maybeSingle();
        state.pengurus = row || null;
      }
    } catch (e) { console.warn("Supabase belum siap:", e); }
    let lastUid = state.session ? state.session.user.id : null;
    sb.auth.onAuthStateChange((_ev, s) => {
      const uid = s ? s.user.id : null;
      if (uid !== lastUid) { lastUid = uid; location.reload(); }
    });
  })();
  window.kasAuth = { ready, state, configured };

  const err = (code, message) => Object.assign(new Error(message || code), { code, message: message || code });
  const toDbError = (e) => {
    if (!e) return err("unavailable");
    if (e.code === "42501" || /row-level security|permission/i.test(e.message || "")) return err("invalid_argument", e.message);
    if (e.code === "P0001") return err("invalid_argument", e.message);
    return err("unavailable", e.message);
  };
  const meta = { fromCache: false, hasPendingWrites: false };
  const docSnap = (id, data) => ({ id, exists: data !== undefined && data !== null, data: () => (data == null ? undefined : data), metadata: meta });
  const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

  function parsePath(path) {
    const seg = String(path).split("/").filter(Boolean);
    const table = seg[0];
    if (!TABLES.includes(table)) throw new TypeError("Koleksi tidak dikenal: " + table);
    return { table, id: seg[1] };
  }

  // Satu saluran realtime per tabel, dipakai bersama oleh semua pendengar.
  const listeners = {};
  function watchTable(table, fn) {
    if (!listeners[table]) {
      listeners[table] = new Set();
      let t;
      sb.channel("kas-" + table)
        .on("postgres_changes", { event: "*", schema: "public", table }, () => {
          clearTimeout(t); t = setTimeout(() => listeners[table].forEach((f) => f()), 150);
        })
        .subscribe();
    }
    listeners[table].add(fn);
    return () => listeners[table].delete(fn);
  }

  function docRef(table, id) {
    return {
      id, path: table + "/" + id,
      async get() {
        const { data, error } = await sb.from(table).select("data").eq("id", id).maybeSingle();
        if (error) throw toDbError(error);
        return docSnap(id, data ? data.data : null);
      },
      async set(body) {
        const { error } = await sb.from(table).upsert({ id, data: body }, { onConflict: "id" });
        if (error) throw toDbError(error);
      },
      async update(patch) {
        const { data: cur, error: e1 } = await sb.from(table).select("data").eq("id", id).maybeSingle();
        if (e1) throw toDbError(e1);
        if (!cur) throw err("invalid_argument", "Dokumen tidak ditemukan");
        const merged = Object.assign({}, cur.data, patch);
        const { data: rows, error } = await sb.from(table).update({ data: merged }).eq("id", id).select("id");
        if (error) throw toDbError(error);
        if (!rows || !rows.length) throw err("invalid_argument", "Tidak punya izin mengubah");
      },
      async delete() {
        const { error } = await sb.from(table).delete().eq("id", id);
        if (error) throw toDbError(error);
      },
      onSnapshot(next, onError) {
        let alive = true;
        const load = async () => {
          try { const s = await this.get(); if (alive) next(s); }
          catch (e) { if (alive && onError) onError(e); }
        };
        load();
        const off = watchTable(table, load);
        return () => { alive = false; off(); };
      },
    };
  }

  function collRef(table) {
    return {
      path: table,
      doc(id) { return docRef(table, id || newId()); },
      async add(body) { const r = docRef(table, newId()); await r.set(body); return r; },
      async get() {
        const all = [];
        for (let from = 0; ; from += 1000) {
          const { data, error } = await sb.from(table).select("id,data").order("id").range(from, from + 999);
          if (error) throw toDbError(error);
          all.push(...data);
          if (data.length < 1000) break;
        }
        const docs = all.map((r) => docSnap(r.id, r.data));
        return { docs, size: docs.length, empty: !docs.length, metadata: meta, docChanges: () => [] };
      },
      onSnapshot(next, onError) {
        let alive = true;
        const load = async () => {
          try { const s = await this.get(); if (alive) next(s); }
          catch (e) { if (alive && onError) onError(e); }
        };
        load();
        const off = watchTable(table, load);
        return () => { alive = false; off(); };
      },
    };
  }

  const db = {
    doc(path) { const p = parsePath(path); if (!p.id) throw new TypeError("Path dokumen butuh id"); return docRef(p.table, p.id); },
    collection(path) { const p = parsePath(path); return collRef(p.table); },
  };

  const namaCache = {};
  const user = {
    async isOwner() { return false; },
    async canEdit() { await ready; return !!state.pengurus; },
    async can() { return null; },
    async id() { await ready; return state.session ? state.session.user.id : null; },
    async me() {
      await ready;
      return { id: state.session ? state.session.user.id : null, name: state.pengurus ? state.pengurus.nama : "", email: state.session ? state.session.user.email : null, isOwner: false, canEdit: !!state.pengurus };
    },
    async profiles(ids) {
      const list = Array.from(new Set([].concat(ids || []))).filter(Boolean);
      const need = list.filter((i) => !(i in namaCache) && /^[0-9a-f-]{36}$/i.test(i));
      if (need.length && sb) {
        const { data } = await sb.from("pengurus").select("user_id,nama").in("user_id", need);
        need.forEach((i) => (namaCache[i] = ""));
        (data || []).forEach((r) => (namaCache[r.user_id] = r.nama));
      }
      const out = {};
      list.forEach((i) => (out[i] = { id: i, name: namaCache[i] || "", isMe: !!(state.session && state.session.user.id === i), guest: false }));
      return out;
    },
  };

  const assets = {
    async upload(file) {
      const ext = (String(file.name || "").match(/\.[a-z0-9]{1,5}$/i) || [""])[0].toLowerCase();
      const path = newId() + ext;
      const { error } = await sb.storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined, upsert: false });
      if (error) throw err("invalid_argument", error.message);
      return { id: path, url: sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl, sizeBytes: file.size, contentType: file.type };
    },
  };
  window.kasBuktiUrl = (id) => (sb ? sb.storage.from(BUCKET).getPublicUrl(id).data.publicUrl : "#");

  const downloads = {
    async save({ filename, data }) {
      const blob = data instanceof Blob ? data : new Blob([data]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename || "unduhan";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      return { saved: true };
    },
  };

  window.claude = {
    async use(name) {
      if (name === "downloads") return downloads;
      if (!sb) return null;
      await ready;
      if (name === "db") return db;
      if (name === "user") return user;
      if (name === "assets") return state.pengurus ? assets : null;
      return null;
    },
  };
})();
