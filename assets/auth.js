/* Giveaway Pulse — creator auth (browser-only preview)
 * Accounts and session live in this browser's localStorage.
 * NOT real security: swap these functions for Supabase Auth later,
 * the pages only call GPAuth.* so nothing else needs to change.
 */
(function () {
  const USERS_KEY = "gp_users_v1";
  const SESSION_KEY = "gp_session_v1";
  const DEMO = { email: "demo@pulse.test", password: "PulseDemo2026!", name: "Demo Creator", channel: "https://youtube.com/@giveawaypulse" };

  function read(key, fallback) {
    try { const v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; } catch (e) { return fallback; }
  }
  function write(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); return true; } catch (e) { return false; }
  }
  async function hash(text) {
    if (window.crypto && crypto.subtle) {
      const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
      return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
    }
    let h = 0; for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0; return "x" + h;
  }
  function randomSalt() {
    const a = new Uint8Array(12); crypto.getRandomValues(a);
    return Array.from(a).map(b => b.toString(16).padStart(2, "0")).join("");
  }
  const norm = e => String(e || "").trim().toLowerCase();
  const validEmail = e => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
  const validChannel = u => /^https?:\/\/(www\.|m\.)?youtube\.com\/(@[\w.\-]+|channel\/[\w\-]+|c\/[\w.\-]+|user\/[\w.\-]+)\/?$/i.test(String(u || "").trim());

  function startSession(user) {
    const s = { email: user.email, name: user.name, channel: user.channel || "", demo: !!user.demo, at: Date.now() };
    write(SESSION_KEY, s);
    return s;
  }

  const GPAuth = {
    demo: { email: DEMO.email, password: DEMO.password },
    validChannel,

    current() {
      const s = read(SESSION_KEY, null);
      if (!s || !s.email) return null;
      // session valid for 30 days
      if (Date.now() - (s.at || 0) > 30 * 864e5) { GPAuth.logout(); return null; }
      return s;
    },

    async signup({ name, email, channel, password }) {
      name = String(name || "").trim(); email = norm(email); channel = String(channel || "").trim();
      if (name.length < 2) throw new Error("Enter your creator / channel name.");
      if (!validEmail(email)) throw new Error("Enter a valid email address.");
      if (email === DEMO.email) throw new Error("This is the demo account — use Log in instead.");
      if (!validChannel(channel)) throw new Error("Enter your YouTube channel link, e.g. https://youtube.com/@yourchannel");
      if (String(password || "").length < 8) throw new Error("Password must be at least 8 characters.");
      const users = read(USERS_KEY, {});
      if (users[email]) throw new Error("An account with this email already exists here. Log in instead.");
      const salt = randomSalt();
      users[email] = { name, email, channel, salt, hash: await hash(salt + password), createdAt: new Date().toISOString() };
      if (!write(USERS_KEY, users)) throw new Error("Your browser blocked storage. Turn off private mode and try again.");
      return startSession(users[email]);
    },

    async login({ email, password }) {
      email = norm(email);
      if (!validEmail(email)) throw new Error("Enter a valid email address.");
      if (!password) throw new Error("Enter your password.");
      if (email === DEMO.email) {
        if (password !== DEMO.password) throw new Error("Wrong password for the demo account.");
        return startSession({ ...DEMO, demo: true });
      }
      const u = read(USERS_KEY, {})[email];
      if (!u) throw new Error("No account found with this email on this browser. Create one first.");
      if ((await hash(u.salt + password)) !== u.hash) throw new Error("Wrong password. Try again.");
      return startSession(u);
    },

    logout() { try { localStorage.removeItem(SESSION_KEY); } catch (e) {} },

    // only allow redirects to our own pages
    safeNext(next, fallback) {
      next = String(next || "");
      return /^[\w\-]+\.html([?#].*)?$/.test(next) ? next : fallback;
    }
  };

  window.GPAuth = GPAuth;
})();
