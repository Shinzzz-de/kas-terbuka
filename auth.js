/* Kas Terbuka — tombol masuk/keluar pengurus (login lewat tautan email). */
(function () {
  "use strict";
  const sb = window.kasSupabase, A = window.kasAuth;
  const $ = (s) => document.querySelector(s);
  const btn = $("#auth-btn"), note = $("#auth-note");

  if (!A || !A.configured || !sb) {
    note.innerHTML = '<div class="banner"><div><b>Aplikasi belum tersambung ke database.</b> Isi alamat dan kunci Supabase di file <code>config.js</code>, lalu deploy ulang.</div></div>';
    return;
  }

  A.ready.then(() => {
    const s = A.state;
    btn.hidden = false;
    if (s.session) {
      btn.textContent = "Keluar";
      btn.onclick = async () => { btn.disabled = true; await sb.auth.signOut(); };
      if (!s.pengurus) {
        const p = document.createElement("div");
        p.className = "banner";
        const d = document.createElement("div");
        d.innerHTML = "<b>Akun Anda belum terdaftar sebagai pengurus.</b> ";
        d.appendChild(document.createTextNode("Anda masuk sebagai " + (s.session.user.email || "pengguna") + ". Minta pemilik aplikasi menambahkan email ini sebagai pengurus. Untuk sementara Anda hanya bisa melihat."));
        p.appendChild(d); note.appendChild(p);
      }
    } else {
      btn.textContent = "Masuk pengurus";
      btn.onclick = () => { $("#login-err").hidden = true; $("#login-ok").hidden = true; $("#m-login").hidden = false; setTimeout(() => $("#login-email").focus(), 30); };
    }
  });

  $("#login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = $("#login-email").value.trim();
    const errEl = $("#login-err"), ok = $("#login-ok"), sub = $("#login-submit");
    errEl.hidden = true; ok.hidden = true;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { errEl.textContent = "Tulis alamat email yang benar."; errEl.hidden = false; return; }
    sub.disabled = true; sub.textContent = "Mengirim…";
    const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname, shouldCreateUser: true } });
    sub.disabled = false; sub.textContent = "Kirim tautan masuk";
    if (error) { errEl.textContent = "Tautan gagal dikirim: " + error.message; errEl.hidden = false; return; }
    ok.textContent = "Tautan masuk sudah dikirim ke " + email + ". Buka email Anda, lalu tekan tautannya dari HP atau komputer ini.";
    ok.hidden = false;
  });
})();
