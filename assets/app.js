// Giveaway Pulse - homepage app (English + Hindi)
// <html lang="en|hi" data-base="" | "../">  — base = data files tak ka raasta
(() => {
const LANG = document.documentElement.lang === "hi" ? "hi" : "en";
const BASE = document.documentElement.dataset.base || "";
const MAX_BLIPS = 28;
const AD_EVERY = 6;

const T = {
  en: {
    scanning: "Scanning…", live: n => `${n} live`, saasSoon: "Coming soon",
    stats: (g, c, u) => `<b>${g}</b> live giveaways · <b>${c}</b> channels tracked · updated ${u}`,
    ago: { m: n => `${n} min ago`, h: n => `${n} h ago`, d: n => `${n} days ago` },
    left: d => d < 1 ? "Last day today" : `${d} days left`, until: "till",
    live_: "Live", ended: "Ended", maybe: "Maybe ended", featured: "★ Featured", winners: "🏆 Winners", short: "Short",
    members: "Members only", subs: "subs", unverified: "⚠ Unverified — small channel. Check the video yourself.",
    how: "How to enter", open: "Watch video & enter ▶", openPage: "Full details & how to enter ▶", seeWinners: "See winners 🏆",
    prize: "Prize", lastDate: "Last date",
    empty: "No giveaways found right now 🙁<br>Try other filters or come back later — the list updates every hour.",
    emptyWin: "No winner lists yet.", suggest: "Missing a channel? Suggest it", loadErr: "Couldn't load data. Please try again later.",
  },
  hi: {
    scanning: "स्कैन हो रहा है…", live: n => `${n} चालू`, saasSoon: "जल्द आ रहा है",
    stats: (g, c, u) => `<b>${g}</b> चालू giveaways · <b>${c}</b> चैनल ट्रैक हो रहे हैं · अपडेट ${u}`,
    ago: { m: n => `${n} मिनट पहले`, h: n => `${n} घंटे पहले`, d: n => `${n} दिन पहले` },
    left: d => d < 1 ? "आज आख़िरी दिन" : `${d} दिन बाकी`, until: "तक",
    live_: "चालू", ended: "ख़त्म", maybe: "शायद ख़त्म", featured: "★ फ़ीचर्ड", winners: "🏆 विजेता", short: "Short",
    members: "सिर्फ़ मेंबर्स के लिए", subs: "सब्सक्राइबर", unverified: "⚠ अनवेरिफ़ाइड — छोटा चैनल। वीडियो में ख़ुद जाँच लें।",
    how: "कैसे हिस्सा लें", open: "वीडियो देखें और हिस्सा लें ▶", openPage: "पूरी जानकारी और कैसे हिस्सा लें ▶", seeWinners: "विजेता देखें 🏆",
    prize: "इनाम", lastDate: "आख़िरी तारीख़",
    empty: "अभी कोई giveaway नहीं मिला 🙁<br>दूसरे फ़िल्टर आज़माएँ या थोड़ी देर बाद आएँ — लिस्ट हर घंटे अपडेट होती है।",
    emptyWin: "अभी कोई विजेता सूची नहीं है।", suggest: "कोई चैनल छूट रहा है? सुझाएँ", loadErr: "डेटा लोड नहीं हुआ। थोड़ी देर बाद कोशिश करें।",
  },
}[LANG];

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const locale = LANG === "hi" ? "hi-IN" : "en-IN";
const fmt = iso => new Date(iso).toLocaleDateString(locale, { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
function ago(iso) {
  const m = Math.max(1, Math.round((Date.now() - new Date(iso)) / 6e4));
  if (m < 60) return T.ago.m(m);
  const h = Math.round(m / 60); return h < 24 ? T.ago.h(h) : T.ago.d(Math.round(h / 24));
}
const daysLeft = iso => Math.floor((new Date(iso) - Date.now()) / 864e5);
const subsTxt = n => !n ? "" : n >= 1e6 ? (n / 1e6).toFixed(1).replace(".0", "") + "M" : Math.round(n / 1e3) + "K";
const hash = s => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return (h >>> 0) / 4294967295; };

const S = { mode: "yt", cat: "all", q: "", ended: false, review: false, items: [], posts: [], cfg: {}, meta: {} };

// ---------- normalise: radar item + apna page, ek hi shape ----------
function fromPost(p) {
  return {
    key: "p:" + p.slug, kind: "post", title: (LANG === "hi" && p.titleHi) || p.title, channel: p.channel,
    thumb: p.thumb, inaam: (LANG === "hi" && p.inaamHi) || p.inaam, endDate: p.endDate, membersOnly: p.membersOnly,
    status: p.status === "winners" ? "winners" : p.status, category: p.category, videoId: p.videoId,
    href: BASE + (LANG === "hi" ? p.pageHi || p.page : p.page), date: p.createdAt, verified: true, featured: true,
  };
}
function fromItem(it) {
  return {
    key: "v:" + it.videoId, kind: "video", title: it.title, channel: it.channel, channelId: it.channelId, thumb: it.thumb, endDate: it.endDate,
    status: it.status, category: it.category, videoId: it.videoId, href: it.url, external: true, date: it.publishedAt,
    subs: it.subs, verified: it.confidence !== "review", isShort: it.isShort, howTo: it.howTo || [],
  };
}
function all() {
  const postVids = new Set(S.posts.map(p => p.videoId).filter(Boolean));
  const posts = S.posts.map(fromPost);
  const videos = S.items.filter(i => !postVids.has(i.videoId)).map(fromItem);

  // Remove duplicate video records by creator identity and normalized title.
  // Keep the newest copy; creator IDs are more reliable than display names.
  const norm = value => String(value || "").toLowerCase()
    .normalize("NFKC")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
  const seen = new Set();
  const uniqueVideos = videos
    .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
    .filter(video => {
      const creator = video.channelId || norm(video.channel);
      const title = norm(video.title);
      const key = creator + "::" + title;
      if (!creator || !title || seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  return [...posts, ...uniqueVideos];
}

// ---------- radar ----------
function radarEntries() {
  return all().filter(e => e.status === "active" && e.verified)
    .sort((a, b) => (b.featured | 0) - (a.featured | 0) || new Date(b.date) - new Date(a.date))
    .slice(0, MAX_BLIPS);
}
function placeBlips(entries) {
  const placed = [];
  return entries.map((e, i) => {
    const age = Math.max(0, (Date.now() - new Date(e.date)) / 864e5);
    const r = 0.16 + Math.min(age / 30, 1) * 0.68;            // naya = beech ke paas
    let a = (i * 137.508 + hash(e.key) * 40) % 360, p;   // golden angle = poore radar par phaile
    for (let i = 0; i < 14; i++) {                              // overlap se bachao
      p = { x: r * Math.sin(a * Math.PI / 180), y: -r * Math.cos(a * Math.PI / 180) };
      if (!placed.some(q => Math.hypot(q.x - p.x, q.y - p.y) < 0.12)) break;
      a = (a + 27) % 360;
    }
    placed.push(p);
    return { e, a, left: 50 + p.x * 50, top: 50 + p.y * 50 };
  });
}
let scanTimers = [];
function scan() {
  scanTimers.forEach(clearTimeout); scanTimers = [];
  const radar = $("#radar"), box = $("#blips"), status = $("#rstatus");
  radar.classList.toggle("saas", S.mode === "saas");
  radar.classList.add("scanning");
  box.innerHTML = ""; status.textContent = T.scanning;
  $("#soon").classList.toggle("on", S.mode === "saas");
  $("#listArea").hidden = S.mode === "saas";
  $(".legend").hidden = $("#stats").hidden = S.mode === "saas";
  const ROT = 1400;   // ek chakkar (scanning ke dauran)
  if (S.mode === "saas") {
    scanTimers.push(setTimeout(() => { radar.classList.remove("scanning"); status.textContent = T.saasSoon; }, ROT * 1.6));
    return;
  }
  const list = placeBlips(radarEntries());
  for (const b of list) {
    const el = document.createElement("button");
    el.className = "blip" + (b.e.featured ? " feat" : "");
    el.style.left = b.left + "%"; el.style.top = b.top + "%";
    el.style.setProperty("--d", (hash(b.e.key + "d") * 2).toFixed(2) + "s");
    el.setAttribute("aria-label", b.e.title);
    el.onclick = () => openSheet(b.e, el);
    box.appendChild(el);
    scanTimers.push(setTimeout(() => el.classList.add("show"), 250 + (b.a / 360) * ROT)); // sweep ke saath dikhe
  }
  scanTimers.push(setTimeout(() => { radar.classList.remove("scanning"); status.textContent = T.live(list.length); }, 250 + ROT * 1.3));
}

// ---------- bottom sheet ----------
function openSheet(e, el) {
  $$(".blip.sel").forEach(b => b.classList.remove("sel")); el?.classList.add("sel");
  $("#sheetBody").innerHTML = cardInner(e, true);
  $("#sheetThumb").style.backgroundImage = e.thumb ? `url('${e.thumb}')` : "";
  $("#sheet").classList.add("on"); $("#sheetBg").classList.add("on");
  $("#sheet").setAttribute("aria-hidden", "false");
}
function closeSheet() {
  $("#sheet").classList.remove("on"); $("#sheetBg").classList.remove("on");
  $("#sheet").setAttribute("aria-hidden", "true"); $$(".blip.sel").forEach(b => b.classList.remove("sel"));
}

// ---------- cards ----------
function tagHTML(e) {
  if (e.status === "winners") return `<span class="tag">${T.winners}</span>`;
  if (e.status === "ended") return `<span class="tag end">${T.ended}</span>`;
  if (e.status === "maybe-ended") return `<span class="tag maybe">${T.maybe}</span>`;
  return `<span class="tag">${T.live_}</span>`;
}
function cardInner(e, inSheet) {
  const ch = esc(e.channel) + (e.verified ? " ✔" : "") + (subsTxt(e.subs) ? ` · ${subsTxt(e.subs)} ${T.subs}` : "") + (e.membersOnly ? ` · ⭐ ${T.members}` : "");
  const end = e.endDate && e.status === "active" ? `<span>⏳ <b>${fmt(e.endDate)}</b> ${T.until} · ${T.left(daysLeft(e.endDate))}</span>` : "";
  const prize = e.inaam ? `<span>🎁 <b>${esc(e.inaam)}</b></span>` : "";
  const how = inSheet && e.howTo?.length ? `<div class="ch">${T.how}:</div><ul>${e.howTo.map(l => `<li>${esc(l)}</li>`).join("")}</ul>` : "";
  const label = e.kind === "post" ? (e.status === "winners" ? T.seeWinners : T.openPage) : T.open;
  return `<div class="ch">${ch}</div><div class="t">${esc(e.title)}</div>
    <div class="meta">${prize}${end}<span>🕒 ${ago(e.date)}</span></div>
    ${e.verified ? "" : `<div class="warn">${T.unverified}</div>`}${how}
    <a class="go" href="${esc(e.href)}"${e.external ? ' target="_blank" rel="noopener"' : ""}>${label}</a>`;
}
function card(e) {
  return `<article class="card${e.featured ? " feat" : ""}">
    <div class="thumb" style="background-image:url('${esc(e.thumb)}')">${tagHTML(e)}${e.featured ? `<span class="tag r">${T.featured}</span>` : e.isShort ? `<span class="tag r">${T.short}</span>` : ""}</div>
    <div class="body">${cardInner(e, false)}</div></article>`;
}
function renderList() {
  const q = S.q.toLowerCase();
  const list = all().filter(e => {
    if (q && !(e.title + " " + e.channel + " " + (e.inaam || "")).toLowerCase().includes(q)) return false;
    if (S.cat === "winners") return e.status === "winners";
    if (S.cat !== "all" && e.category !== S.cat) return false;
    if (!S.ended && e.status !== "active") return false;
    if (!S.review && !e.verified) return false;
    return true;
  });
  const ad = S.cfg.adHtml;
  const html = list.map((e, i) => card(e) + (ad && (i + 1) % AD_EVERY === 0 ? `<div class="ad">${ad}</div>` : "")).join("");
  $("#list").innerHTML = list.length ? html : `<div class="empty">${S.cat === "winners" ? T.emptyWin : T.empty}${S.cfg.suggestForm ? `<br><br><a href="${esc(S.cfg.suggestForm)}" target="_blank" rel="noopener">${T.suggest}</a>` : ""}</div>`;
}

// ---------- events ----------
$$(".mode").forEach(b => b.onclick = () => {
  $$(".mode").forEach(x => x.classList.toggle("on", x === b));
  S.mode = b.dataset.mode; closeSheet(); scan();
});
$$(".chip").forEach(b => b.onclick = () => { $$(".chip").forEach(x => x.classList.toggle("on", x === b)); S.cat = b.dataset.c; renderList(); });
$("#q").oninput = e => { S.q = e.target.value; renderList(); };
$("#showEnded").onchange = e => { S.ended = e.target.checked; renderList(); };
$("#showReview").onchange = e => { S.review = e.target.checked; renderList(); };
$("#sheetBg").onclick = closeSheet; $("#sheetX").onclick = closeSheet;
document.addEventListener("keydown", e => { if (e.key === "Escape") closeSheet(); });
try { localStorage.setItem("gp-lang", LANG); } catch {}

// ---------- data ----------
const get = f => fetch(BASE + f + "?t=" + Date.now()).then(r => r.ok ? r.json() : null).catch(() => null);
Promise.all([get("site-config.json"), get("data/giveaways.json"), get("data/posts.json")]).then(([cfg, d, p]) => {
  S.cfg = cfg || {};
  if (S.cfg.telegram) { $("#tgLink").href = S.cfg.telegram; $("#tgLink").hidden = false; }
  if (S.cfg.suggestForm) { $("#sugLink").href = S.cfg.suggestForm; $("#sugLink").hidden = false; }
  const saasForm = S.cfg.saasForm || S.cfg.suggestForm;
  if (saasForm) { $("#saasLink").href = saasForm; } else { $("#saasLink").hidden = true; }
  if (!d && !p) { $("#list").innerHTML = `<div class="empty">${T.loadErr}</div>`; }
  S.items = d?.items || []; S.posts = p?.posts || [];
  const liveCount = all().filter(e => e.status === "active" && e.verified).length;
  if (d?.updatedAt) $("#stats").innerHTML = T.stats(liveCount, d.channelsTracked || 0, ago(d.updatedAt));
  renderList(); scan();
});
})();
