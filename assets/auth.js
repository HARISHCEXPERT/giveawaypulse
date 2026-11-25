/* Giveaway Pulse — creator auth
 * Uses Supabase Auth + the public.creators table (see supabase/schema.sql)
 * when GP_CONFIG.supabaseUrl/supabaseAnonKey are set. Until then it runs in a
 * browser-only preview mode so the site never breaks.
 * Pages only call GPAuth.* — every method returns a Promise.
 */
(function () {
  const cfg = window.GP_CONFIG || {};
  const DEMO = { email: "demo@pulse.test", password: "PulseDemo2026!", name: "Demo Creator", channel: "https://youtube.com/@giveawaypulse" };
  const DEMO_KEY = "gp_demo_session_v1";
  const USERS_KEY = "gp_users_v1", LOCAL_KEY = "gp_session_v1"; // preview mode only

  const norm = e => String(e || "").trim().toLowerCase();
  const validEmail = e => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
  const validChannel = u => /^https?:\/\/(www\.|m\.)?youtube\.com\/(@[\w.\-]+|channel\/[\w\-]+|c\/[\w.\-]+|user\/[\w.\-]+)\/?$/i.test(String(u || "").trim());
  const cleanChannel = u => String(u || "").trim().replace(/^http:/i, "https:").replace(/\/+$/, "");

  function read(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } }
  function write(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  function del(k) { try { localStorage.removeItem(k); } catch (e) {} }

  function validateSignup(d) {
    const name = String(d.name || "").trim(), email = norm(d.email), channel = cleanChannel(d.channel);
    if (name.length < 2) throw new Error("Enter your creator / channel name.");
    if (!validEmail(email)) throw new Error("Enter a valid email address.");
    if (email === DEMO.email) throw new Error("This is the demo account — use Log in instead.");
    if (!validChannel(channel)) throw new Error("Enter your YouTube channel link, e.g. https://youtube.com/@yourchannel");
    if (String(d.password || "").length < 8) throw new Error("Password must be at least 8 characters.");
    return { name, email, channel, password: d.password };
  }

  function demoLogin(password) {
    if (password !== DEMO.password) throw new Error("Wrong password for the demo account.");
    const s = { email: DEMO.email, name: DEMO.name, channel: DEMO.channel, demo: true, at: Date.now() };
    write(DEMO_KEY, s);
    return s;
  }
  function demoSession() {
    const s = read(DEMO_KEY, null);
    if (s && Date.now() - s.at < 7 * 864e5) return s;
    del(DEMO_KEY); return null;
  }

  // ---------- Supabase mode ----------
  let clientPromise = null;
  function client() {
    if (!clientPromise) clientPromise = new Promise((resolve, reject) => {
      const make = () => resolve(window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      }));
      if (window.supabase && window.supabase.createClient) return make();
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
      s.onload = make;
      s.onerror = () => reject(new Error("Could not reach the login server. Check your internet and try again."));
      document.head.appendChild(s);
    });
    return clientPromise;
  }

  function friendly(err) {
    const m = String((err && err.message) || err || "");
    if (/invalid login credentials/i.test(m)) return "Wrong email or password.";
    if (/email not confirmed/i.test(m)) return "Please confirm your email first — check your inbox (and spam) for the link we sent.";
    if (/already registered|already exists/i.test(m)) return "An account with this email already exists. Log in instead.";
    if (/database error saving new user/i.test(m)) return "This YouTube channel is already registered with another account.";
    if (/rate limit|too many/i.test(m)) return "Too many attempts. Please wait a few minutes and try again.";
    if (/password should be/i.test(m)) return "Password is too weak. Use at least 8 characters with letters and numbers.";
    if (/failed to fetch|network/i.test(m)) return "Could not reach the login server. Check your internet and try again.";
    return m || "Something went wrong. Try again.";
  }

  async function profileFor(sb, user) {
    const { data } = await sb.from("creators").select("name, channel_url").eq("id", user.id).maybeSingle();
    const meta = user.user_metadata || {};
    return { email: user.email, name: (data && data.name) || meta.name || user.email.split("@")[0], channel: (data && data.channel_url) || meta.channel || "", demo: false };
  }

  const supa = {
    async current() {
      const sb = await client();
      const { data } = await sb.auth.getSession();
      return data.session ? profileFor(sb, data.session.user) : null;
    },
    async signup(d) {
      const v = validateSignup(d);
      const sb = await client();
      const taken = await sb.rpc("channel_taken", { p_channel: v.channel });
      if (taken.error) throw new Error("Login server is not set up yet (database). Please try again later.");
      if (taken.data) throw new Error("This YouTube channel is already registered with another account.");
      const back = location.href.split(/[?#]/)[0] + "?next=" + encodeURIComponent(GPAuth.safeNext(new URLSearchParams(location.search).get("next"), "studio.html"));
      const { data, error } = await sb.auth.signUp({ email: v.email, password: v.password, options: { data: { name: v.name, channel: v.channel }, emailRedirectTo: back } });
      if (error) throw new Error(friendly(error));
      // with email confirmation on, an existing email comes back with no identities
      if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) throw new Error("An account with this email already exists. Log in instead.");
      if (!data.session) return { needsConfirm: true, email: v.email };
      return profileFor(sb, data.user);
    },
    async login({ email, password }) {
      email = norm(email);
      if (!validEmail(email)) throw new Error("Enter a valid email address.");
      if (!password) throw new Error("Enter your password.");
      const sb = await client();
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw new Error(friendly(error));
      return profileFor(sb, data.user);
    },
    async resetPassword(email) {
      email = norm(email);
      if (!validEmail(email)) throw new Error("Enter your account email above first.");
      const sb = await client();
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.href.split(/[?#]/)[0] + "?mode=reset" });
      if (error) throw new Error(friendly(error));
    },
    async setNewPassword(password) {
      if (String(password || "").length < 8) throw new Error("Password must be at least 8 characters.");
      const sb = await client();
      const { error } = await sb.auth.updateUser({ password });
      if (error) throw new Error(friendly(error));
    },
    async onRecovery(cb) {
      const sb = await client();
      sb.auth.onAuthStateChange(ev => { if (ev === "PASSWORD_RECOVERY") cb(); });
    },
    async logout() { const sb = await client(); await sb.auth.signOut(); }
  };

  // ---------- Preview mode (no Supabase configured yet) ----------
  async function hash(t) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
  }
  const local = {
    async current() {
      const s = read(LOCAL_KEY, null);
      if (!s || Date.now() - (s.at || 0) > 30 * 864e5) { del(LOCAL_KEY); return null; }
      return s;
    },
    async signup(d) {
      const v = validateSignup(d);
      const users = read(USERS_KEY, {});
      if (users[v.email]) throw new Error("An account with this email already exists here. Log in instead.");
      if (Object.values(users).some(u => (u.channel || "").toLowerCase() === v.channel.toLowerCase())) throw new Error("This YouTube channel is already registered with another account.");
      const a = new Uint8Array(12); crypto.getRandomValues(a);
      const salt = Array.from(a).map(b => b.toString(16).padStart(2, "0")).join("");
      users[v.email] = { name: v.name, email: v.email, channel: v.channel, salt, hash: await hash(salt + v.password) };
      if (!write(USERS_KEY, users)) throw new Error("Your browser blocked storage. Turn off private mode and try again.");
      const s = { email: v.email, name: v.name, channel: v.channel, demo: false, at: Date.now() };
      write(LOCAL_KEY, s); return s;
    },
    async login({ email, password }) {
      email = norm(email);
      if (!validEmail(email)) throw new Error("Enter a valid email address.");
      if (!password) throw new Error("Enter your password.");
      const u = read(USERS_KEY, {})[email];
      if (!u || (await hash(u.salt + password)) !== u.hash) throw new Error("Wrong email or password.");
      const s = { email: u.email, name: u.name, channel: u.channel, demo: false, at: Date.now() };
      write(LOCAL_KEY, s); return s;
    },
    async resetPassword() { throw new Error("Password reset will work once the login server is connected."); },
    async setNewPassword() { throw new Error("Password reset will work once the login server is connected."); },
    async onRecovery() {},
    async logout() { del(LOCAL_KEY); }
  };

  const backend = cfg.supabaseUrl && cfg.supabaseAnonKey ? supa : local;

  const GPAuth = {
    mode: backend === supa ? "supabase" : "preview",
    demo: { email: DEMO.email, password: DEMO.password },
    validChannel,
    async current() {
      const d = demoSession(); if (d) return d;
      try { return await backend.current(); } catch (e) { return null; }
    },
    signup: d => backend.signup(d),
    async login(d) {
      if (norm(d.email) === DEMO.email) return demoLogin(d.password);
      return backend.login(d);
    },
    resetPassword: e => backend.resetPassword(e),
    setNewPassword: p => backend.setNewPassword(p),
    onRecovery: cb => backend.onRecovery(cb),
    async logout() { del(DEMO_KEY); try { await backend.logout(); } catch (e) {} },
    safeNext(next, fallback) {
      next = String(next || "");
      return /^[\w\-]+\.html([?#].*)?$/.test(next) ? next : fallback;
    }
  };
  window.GPAuth = GPAuth;
})();
