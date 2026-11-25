// Giveaway Pulse - giveaway page generator (English + Hindi)
// posts/*.txt se har giveaway ke 2 page banata hai:
//   g/<naam>.html      (English)
//   hi/g/<naam>.html   (Hindi)
// Saath mein data/posts.json (homepage ke liye), sitemap.xml aur robots.txt.
// Chalane ka tareeka:  node build-posts.js
// Telegram (optional): TG_BOT_TOKEN, TG_CHAT_ID — naye page aur winners announce par post.

const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const POSTS = path.join(ROOT, "posts");
const OUT = { en: path.join(ROOT, "g"), hi: path.join(ROOT, "hi", "g") };
const DATA = path.join(ROOT, "data");
const cfg = readJSON(path.join(ROOT, "site-config.json"), {});
const SITE = (process.env.SITE_URL || cfg.siteUrl || "").replace(/\/$/, "");
const NAME = cfg.siteName || "Giveaway Pulse";

function readJSON(f, d) { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return d; } }
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const LIST_KEYS = new Set(["kaise_participate", "kaise_participate_hi", "winners"]);

const L = {
  en: {
    back: "All giveaways", live: "Live", ended: "Ended", winners: "🎉 Winners announced",
    by: "Creator", channel: "Visit channel", prize: "🎁 Prize", last: "⏳ Last date", who: "⭐ Who can enter", members: "Channel members only",
    winH: "🏆 Winners", winVid: "Watch the winner announcement ▶", winNote: "Winners were announced by the creator.",
    how: "📝 How to enter", watch: "Watch official video & enter ▶", join: c => `⭐ Become a ${c} member`, tg: "✈️ Get new giveaway alerts on Telegram",
    disc: c => `⚠️ This is not ${c}'s official page. All details come from their official video — please enter through their video only. A real giveaway never asks for money, OTP or contact on Telegram/WhatsApp.`,
    left: (d, h, m) => (d ? `${d} days ` : "") + `${h} h ${m} min left`, over: "Ended",
    title: p => `${p} – how to enter`, desc: (c, p, d) => `${c} giveaway: ${p}. ${d ? "Last date " + d + ". " : ""}How to enter, rules and winner list.`,
    locale: "en-IN",
  },
  hi: {
    back: "सभी giveaways", live: "चालू", ended: "ख़त्म", winners: "🎉 विजेता घोषित",
    by: "Creator", channel: "चैनल देखें", prize: "🎁 इनाम", last: "⏳ आख़िरी तारीख़", who: "⭐ कौन हिस्सा ले सकता है", members: "सिर्फ़ चैनल मेंबर्स",
    winH: "🏆 विजेता", winVid: "विजेता घोषणा वाली वीडियो देखें ▶", winNote: "विजेताओं के नाम creator ने ख़ुद घोषित किए हैं।",
    how: "📝 कैसे हिस्सा लें", watch: "ऑफ़िशियल वीडियो देखें और हिस्सा लें ▶", join: c => `⭐ ${c} के मेंबर बनें`, tg: "✈️ नए giveaways के अलर्ट Telegram पर पाएँ",
    disc: c => `⚠️ यह ${c} का ऑफ़िशियल पेज नहीं है। सारी जानकारी उनकी ऑफ़िशियल वीडियो से ली गई है — हिस्सा लेने के लिए उनकी वीडियो ही देखें। असली giveaway कभी पैसे, OTP या Telegram/WhatsApp पर संपर्क नहीं माँगता।`,
    left: (d, h, m) => (d ? `${d} दिन ` : "") + `${h} घंटे ${m} मिनट बाकी`, over: "ख़त्म हो गया",
    title: p => `${p} – कैसे हिस्सा लें`, desc: (c, p, d) => `${c} का giveaway: ${p}। ${d ? "आख़िरी तारीख़ " + d + "। " : ""}कैसे हिस्सा लें, नियम और विजेताओं की सूची।`,
    locale: "hi-IN",
  },
};

// ---------- simple "key: value" parser ----------
function parsePost(text) {
  const post = {};
  let listKey = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    if (line.startsWith("- ") && listKey) { post[listKey].push(line.slice(2).trim()); continue; }
    const m = line.match(/^([a-z_]+)\s*:\s*(.*)$/i);
    if (!m) continue;
    const key = m[1].toLowerCase(), val = m[2].trim();
    if (LIST_KEYS.has(key)) { post[key] = val ? val.split(",").map(s => s.trim()).filter(Boolean) : []; listKey = key; }
    else { post[key] = val; listKey = null; }
  }
  return post;
}

function videoId(url = "") {
  const m = url.match(/(?:v=|youtu\.be\/|shorts\/|live\/|embed\/)([\w-]{11})/);
  return m ? m[1] : null;
}
// "30-12-2026", "30/12/2026", "2026-12-30" => raat 11:59 IST
function parseDate(s = "") {
  let m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1], 18, 29)).toISOString();
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 18, 29)).toISOString();
  return null;
}
const fmtDate = (iso, lang) => new Date(iso).toLocaleDateString(L[lang].locale, { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });
const yes = v => /^(haan|han|ha|yes|y|true|1|हाँ|हां)$/i.test(String(v || "").trim());
const safeUrl = u => (/^https:\/\//i.test(u || "") ? u : "");
const pick = (p, key, lang) => (lang === "hi" && (Array.isArray(p[key + "_hi"]) ? p[key + "_hi"].length : p[key + "_hi"])) ? p[key + "_hi"] : p[key];

function validate(slug, p) {
  const errs = [];
  if (!p.title) errs.push("title khaali hai");
  if (!p.channel) errs.push("channel khaali hai");
  if (!videoId(p.video)) errs.push("video ka YouTube link sahi nahi");
  if (p.last_date && !parseDate(p.last_date)) errs.push(`last_date samajh nahi aaya (${p.last_date}) — 30-12-2026 jaisa likho`);
  if ((p.winners || []).some(w => /\d{8,}/.test(w))) errs.push("winners mein phone number jaisa kuch hai — sirf naam/handle daalo");
  if (errs.length) console.warn(`! ${slug}: ${errs.join("; ")}`);
  return errs.length === 0;
}

// ---------- page HTML ----------
function pageHTML(slug, p, info, lang) {
  const t = L[lang];
  const up = lang === "hi" ? "../../" : "../";
  const vid = videoId(p.video);
  const thumb = `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`;
  const title = pick(p, "title", lang), inaam = pick(p, "inaam", lang), note = pick(p, "note", lang);
  const stepsArr = pick(p, "kaise_participate", lang) || [];
  const urlEn = SITE ? `${SITE}/g/${slug}.html` : "", urlHi = SITE ? `${SITE}/hi/g/${slug}.html` : "";
  const winners = p.winners || [];
  const statusText = info.status === "winners" ? t.winners : info.status === "ended" ? t.ended : t.live;
  const desc = t.desc(p.channel, inaam || title, info.endDate ? fmtDate(info.endDate, lang) : "");
  const joinLink = safeUrl(p.join_link) || (safeUrl(p.channel_link) ? safeUrl(p.channel_link).replace(/\/$/, "") + "/join" : "");

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="google-adsense-account" content="ca-pub-7375517399950697">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(t.title(title))} | ${esc(NAME)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="theme-color" content="#05080a">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${thumb}">
${SITE ? `<link rel="canonical" href="${lang === "hi" ? urlHi : urlEn}">
<link rel="alternate" hreflang="en" href="${urlEn}">
<link rel="alternate" hreflang="hi" href="${urlHi}">
<link rel="alternate" hreflang="x-default" href="${urlEn}">` : ""}
<link rel="stylesheet" href="${up}assets/page.css">
</head>
<body>
<header class="top">
  <a class="logo" href="${up}${lang === "hi" ? "hi/" : ""}"><i></i>Giveaway <b>Pulse</b></a>
  <nav class="lang"><a href="${up}g/${slug}.html" hreflang="en"${lang === "en" ? ' class="on"' : ""}>EN</a><a href="${up}hi/g/${slug}.html" hreflang="hi"${lang === "hi" ? ' class="on"' : ""}>हिंदी</a></nav>
</header>
<main>
  <a class="back" href="${up}${lang === "hi" ? "hi/" : ""}">← ${t.back}</a>
  <span class="status ${info.status}">${statusText}</span>
  <h1>${esc(title)}</h1>
  <p class="by">${t.by}: <b>${esc(p.channel)}</b>${safeUrl(p.channel_link) ? ` · <a href="${esc(safeUrl(p.channel_link))}" target="_blank" rel="noopener">${t.channel}</a>` : ""}</p>

  <div class="video"><iframe src="https://www.youtube-nocookie.com/embed/${vid}" title="${esc(title)}" loading="lazy" allowfullscreen></iframe></div>

  <div class="facts">
    ${inaam ? `<div><span>${t.prize}</span><b>${esc(inaam)}</b></div>` : ""}
    ${info.endDate ? `<div><span>${t.last}</span><b>${fmtDate(info.endDate, lang)}</b><em id="cd" data-end="${info.endDate}"></em></div>` : ""}
    ${yes(p.members_only) ? `<div><span>${t.who}</span><b>${t.members}</b></div>` : ""}
  </div>

  ${winners.length ? `<section class="winners"><h2>${t.winH}</h2><ol>${winners.map(w => `<li>${esc(w)}</li>`).join("")}</ol>
    ${safeUrl(p.winners_video) ? `<p><a href="${esc(safeUrl(p.winners_video))}" target="_blank" rel="noopener">${t.winVid}</a></p>` : ""}
    <p class="small">${t.winNote}</p></section>` : ""}

  ${stepsArr.length ? `<section><h2>${t.how}</h2><ol>${stepsArr.map(s => `<li>${esc(s)}</li>`).join("")}</ol></section>` : ""}
  ${note ? `<p class="note">ℹ️ ${esc(note)}</p>` : ""}

  <a class="btn" href="${esc(p.video)}" target="_blank" rel="noopener">${t.watch}</a>
  ${yes(p.members_only) && joinLink ? `<a class="btn alt" href="${esc(joinLink)}" target="_blank" rel="noopener">${esc(t.join(p.channel))}</a>` : ""}
  ${cfg.telegram ? `<a class="btn tg" href="${esc(cfg.telegram)}" target="_blank" rel="noopener">${t.tg}</a>` : ""}

  ${cfg.adHtml ? `<div class="ad">${cfg.adHtml}</div>` : ""}

  <p class="disclaimer">${esc(t.disc(p.channel))}</p>
</main>
<script>
const el = document.getElementById("cd");
if (el) {
  const tick = () => {
    const ms = new Date(el.dataset.end) - Date.now();
    if (ms <= 0) { el.textContent = ${JSON.stringify(t.over)}; return; }
    const d = Math.floor(ms / 864e5), h = Math.floor(ms / 36e5) % 24, m = Math.floor(ms / 6e4) % 60;
    el.textContent = (${t.left.toString()})(d, h, m);
  };
  tick(); setInterval(tick, 30000);
}
</script>
</body>
</html>
`;
}

// ---------- Telegram ----------
async function tg(text, photo) {
  const { TG_BOT_TOKEN: T, TG_CHAT_ID: C } = process.env;
  if (!T || !C) return false;
  const method = photo ? "sendPhoto" : "sendMessage";
  const body = photo ? { chat_id: C, photo, caption: text, parse_mode: "HTML" } : { chat_id: C, text, parse_mode: "HTML" };
  const r = await fetch(`https://api.telegram.org/bot${T}/${method}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!j.ok) console.warn(`! telegram: ${j.description || r.status}`);
  return !!j.ok;
}

// ---------- main ----------
async function main() {
  for (const d of Object.values(OUT)) fs.mkdirSync(d, { recursive: true });
  fs.mkdirSync(DATA, { recursive: true });
  const prev = Object.fromEntries((readJSON(path.join(DATA, "posts.json"), { posts: [] }).posts).map(p => [p.slug, p]));
  const files = fs.existsSync(POSTS) ? fs.readdirSync(POSTS).filter(f => f.endsWith(".txt") && !f.startsWith("_")) : [];
  const posts = [];
  const now = Date.now();

  for (const f of files) {
    const slug = f.replace(/\.txt$/, "").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "");
    const p = parsePost(fs.readFileSync(path.join(POSTS, f), "utf8"));
    if (!validate(slug, p)) continue;
    const endDate = parseDate(p.last_date);
    const winners = p.winners || [];
    const status = winners.length ? "winners" : endDate && new Date(endDate).getTime() < now ? "ended" : "active";
    for (const lang of ["en", "hi"]) fs.writeFileSync(path.join(OUT[lang], slug + ".html"), pageHTML(slug, p, { endDate, status }, lang));
    const vid = videoId(p.video);
    const old = prev[slug] || {};
    const entry = {
      slug, page: `g/${slug}.html`, pageHi: `hi/g/${slug}.html`,
      title: p.title, titleHi: p.title_hi || "", channel: p.channel, videoId: vid,
      thumb: `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`, inaam: p.inaam || "", inaamHi: p.inaam_hi || "",
      category: (p.category || "other").toLowerCase(), membersOnly: yes(p.members_only), endDate, status, winnersCount: winners.length,
      createdAt: old.createdAt || new Date().toISOString(),
      notifiedNew: old.notifiedNew || false, notifiedWinners: old.notifiedWinners || false,
    };
    // Telegram: naya page / winners announce
    const link = SITE ? `${SITE}/${entry.page}` : p.video;
    if (!entry.notifiedNew && status === "active") {
      entry.notifiedNew = await tg(`🎁 <b>${esc(p.title)}</b>\n📺 ${esc(p.channel)}${p.inaam ? `\n🏆 Prize: ${esc(p.inaam)}` : ""}${endDate ? `\n⏳ Last date: ${fmtDate(endDate, "en")}` : ""}${entry.membersOnly ? "\n⭐ Members only" : ""}\n\n👉 Full details: ${esc(link)}`, entry.thumb);
    }
    if (!entry.notifiedWinners && winners.length) {
      entry.notifiedWinners = await tg(`🎉 <b>Winners announced!</b>\n${esc(p.title)}\n\n${winners.slice(0, 10).map((w, i) => `${i + 1}. ${esc(w)}`).join("\n")}\n\n👉 ${esc(link)}`);
      entry.notifiedNew = true;
    }
    posts.push(entry);
    console.log(`+ page: g/${slug}.html + hi/g/${slug}.html (${status})`);
  }

  // jo .txt hata di gayi uske dono page bhi hata do
  for (const dir of Object.values(OUT))
    for (const f of fs.readdirSync(dir)) if (f.endsWith(".html") && !posts.some(p => p.slug + ".html" === f)) fs.unlinkSync(path.join(dir, f));

  const order = { active: 0, winners: 1, ended: 2 };
  posts.sort((a, b) => order[a.status] - order[b.status] || new Date(b.createdAt) - new Date(a.createdAt));
  fs.writeFileSync(path.join(DATA, "posts.json"), JSON.stringify({ updatedAt: new Date().toISOString(), posts }, null, 2) + "\n");

  if (SITE) {
    const pair = (en, hi) => ["en", "hi"].map(l => `  <url><loc>${esc(l === "en" ? en : hi)}</loc>
    <xhtml:link rel="alternate" hreflang="en" href="${esc(en)}"/>
    <xhtml:link rel="alternate" hreflang="hi" href="${esc(hi)}"/>
  </url>`).join("\n");
    const urls = [pair(`${SITE}/`, `${SITE}/hi/`), ...posts.map(p => pair(`${SITE}/${p.page}`, `${SITE}/${p.pageHi}`))];
    const single = u => `  <url><loc>${esc(u)}</loc></url>`;
    urls.push(...["creators/", "creators/studio.html", "about.html", "privacy.html"].map(p => single(`${SITE}/${p}`)));
    fs.writeFileSync(path.join(ROOT, "sitemap.xml"),
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.join("\n")}\n</urlset>\n`);
    fs.writeFileSync(path.join(ROOT, "robots.txt"), `User-agent: *\nAllow: /\nSitemap: ${SITE}/sitemap.xml\n`);
  }
  console.log(`Done. ${posts.length} giveaway (x2 languages) ke page bane.`);
}

main().catch(e => { console.error(e.message); process.exit(1); });
