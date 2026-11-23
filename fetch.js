// Giveaway Pulse - fetcher
// Chune hue channels ki nayi videos check karta hai, title + description se giveaway pehchanta hai,
// aur data/giveaways.json likhta hai. Node 18+ chahiye (built-in fetch). Koi npm package nahi.
//
// Chalane ka tareeka:  YT_API_KEY=xxxx node fetch.js
//
// Quota hisaab (free = 10,000 units/day):
//   channel resolve (sirf pehli baar)      : 1 unit / channel
//   nayi uploads check (playlistItems)      : 1 unit / channel / run
//   video details (videos.list, 50 ek saath): 1 unit / 50 videos
//   discovery search (har 2 ghante)         : 100 units  => ~1,200/day
//   => 150 aapke channels har ghante (~3,600) + 150 discovered har 2 ghante (~1,800) + search (~1,200)
//      = ~7,000 units/day, safe

const fs = require("fs");
const path = require("path");

const API = "https://www.googleapis.com/youtube/v3";
const KEY = process.env.YT_API_KEY;
const ROOT = __dirname;
const DATA = path.join(ROOT, "data");
const FILES = {
  channels: path.join(ROOT, "channels.json"),
  overrides: path.join(ROOT, "overrides.json"),
  cache: path.join(DATA, "channel-cache.json"),
  out: path.join(DATA, "giveaways.json"),
  discovered: path.join(DATA, "discovered-channels.json"),
};

const LOOKBACK_DAYS = 30;   // isse purani video nayi scan mein nahi lenge
const KEEP_DAYS = 60;       // list mein kitne din tak rakhna hai
const ACTIVE_DAYS = 21;     // end date na mile to itne din baad "khatam shayad" maan lo
const UPLOADS_PER_CHANNEL = 10;

// ---------- Giveaway pehchan ----------
// strong: inke bina giveaway nahi maanenge
const STRONG = [
  /\bgive\s?-?aways?\b/i, /गिवअवे|गिववे|गिव अवे/,
  /\blucky\s+winners?\b/i, /\bjeeto\b|\bjeetiye\b|\bjitiye\b|जीतो|जीतिए|जीतें/i,
  /\bwin\s+(a|an|this|free|the)\b/i, /\bcontest\b/i, /\bfree\s+(iphone|phone|mobile|laptop|ps5)\b/i,
];
// supporting: score badhate hain
const SUPPORT = [
  /\bwinners?\b/i, /\bparticipate\b/i, /\bhow to (enter|participate)\b/i,
  /\bcomment\b.*\b(below|karo|kare|kijiye)\b/i, /\bsubscribe\b.*\b(and|aur|&)\b.*\b(comment|like)\b/i,
  /\blast\s+date\b/i, /\bends?\s+on\b/i, /\bannounce/i, /\bprize\b/i, /इनाम|विजेता/,
];
// result video / khatam
const ENDED = [
  /\bgiveaway\s+(results?|winners?\s+announced)\b/i, /\bwinners?\s+(announced|list)\b/i,
  /\bresult\s+(of|for)\b.*\bgiveaway\b/i, /\bgiveaway\s+(closed|ended|is over)\b/i,
];
// sponsor / scam wale false matches
const NEGATIVE = [
  /\bnot\s+a\s+giveaway\b/i, /\bfake\s+giveaways?\b/i, /\bscam\b/i, /\bgiveaway\s+scam\b/i,
];

const stripTags = t => String(t || "").replace(/#[\p{L}\p{N}_]+/gu, " ");   // "#giveaway" hashtag ko giveaway nahi maanenge

// Sirf English/Hindi: dusri Indian scripts (Malayalam, Tamil, Telugu, Kannada, Bengali, Gujarati, Punjabi, Odia) wali video chhod do,
// aur YouTube ne language "en"/"hi" ke alawa bataayi ho to bhi.
const OTHER_SCRIPTS = /[\u0980-\u0D7F]/;
function languageOk(snippet = {}) {
  const lang = (snippet.defaultAudioLanguage || snippet.defaultLanguage || "").toLowerCase();
  if (lang && !/^(en|hi)/.test(lang)) return false;
  return !OTHER_SCRIPTS.test((snippet.title || "") + " " + (snippet.description || "").slice(0, 300));
}

function scoreText(rawTitle = "", rawDescription = "") {
  const title = stripTags(rawTitle), description = stripTags(rawDescription);
  let score = 0;
  const hits = [];
  for (const re of STRONG) {
    if (re.test(title)) { score += 4; hits.push("title:" + re.source); }
    else if (re.test(description)) { score += 2; hits.push("desc:" + re.source); }
  }
  for (const re of SUPPORT) {
    if (re.test(title) || re.test(description)) { score += 1; hits.push("sup:" + re.source); }
  }
  const strongHit = hits.some(h => h.startsWith("title:") || h.startsWith("desc:"));
  const negative = NEGATIVE.some(re => re.test(title));
  const ended = ENDED.some(re => re.test(title) || re.test(description.slice(0, 400)));
  // sirf description mein ek-aadh baar "giveaway" = kamzor; title mein ho to hi pakka
  if (!hits.some(h => h.startsWith("title:")) && score < 4) score = 0;
  if (!strongHit || negative) score = 0;
  return { score, ended, hits };
}

// description se kaam ki lines (kaise participate karein, last date)
function keyLines(description = "") {
  const lines = description.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const want = [...STRONG, ...SUPPORT];
  const picked = [];
  for (const l of lines) {
    if (l.length > 220) continue;
    if (/https?:\/\/\S+/.test(l) && !/giveaway|gleam|form/i.test(l)) continue;
    if (want.some(re => re.test(l))) picked.push(l);
    if (picked.length >= 5) break;
  }
  return picked;
}

const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
// "last date 30 Nov", "ends on 30/11/2026", "till 5th December" jaisi lines se end date
function findEndDate(text = "", publishedAt) {
  const pub = new Date(publishedAt);
  const ctx = /(last\s+date|ends?\s+(on)?|till|until|before|deadline|closes?|valid\s+till|tak)/i;
  for (const line of text.split(/\r?\n/)) {
    if (!ctx.test(line)) continue;
    let m = line.match(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\b/);
    if (m) {
      let y = +m[3]; if (y < 100) y += 2000;
      const d = new Date(Date.UTC(y, +m[2] - 1, +m[1], 18, 29)); // 23:59 IST
      if (!isNaN(d)) return d.toISOString();
    }
    m = line.match(/\b(\d{1,2})(st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?(\s+(\d{4}))?/i)
      || line.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(st|nd|rd|th)?(,?\s+(\d{4}))?/i);
    if (m) {
      let day, mon, year;
      if (/^\d/.test(m[1])) { day = +m[1]; mon = MONTHS[m[3].slice(0, 3).toLowerCase()]; year = m[5]; }
      else { mon = MONTHS[m[1].slice(0, 3).toLowerCase()]; day = +m[2]; year = m[5]; }
      let y = year ? +year : pub.getUTCFullYear();
      let d = new Date(Date.UTC(y, mon, day, 18, 29)); // 23:59 IST
      if (!year && d < pub) d = new Date(Date.UTC(y + 1, mon, day, 18, 29)); // 23:59 IST
      if (!isNaN(d)) return d.toISOString();
    }
  }
  return null;
}

// ---------- API helpers ----------
async function yt(endpoint, params) {
  const url = new URL(`${API}/${endpoint}`);
  for (const [k, v] of Object.entries({ ...params, key: KEY })) url.searchParams.set(k, v);
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const reason = body?.error?.errors?.[0]?.reason || res.status;
    const err = new Error(`${endpoint} failed: ${reason} - ${body?.error?.message || ""}`);
    err.reason = reason;
    throw err;
  }
  return body;
}

const readJSON = (f, fallback) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return fallback; } };
const writeJSON = (f, v) => fs.writeFileSync(f, JSON.stringify(v, null, 2) + "\n");

async function resolveChannels(list, cache) {
  for (const ch of list) {
    const key = ch.id || ch.handle;
    if (cache[key]) { cache[key].category = ch.category || cache[key].category; continue; }
    const params = { part: "snippet,contentDetails" };
    if (ch.id) params.id = ch.id; else params.forHandle = ch.handle;
    try {
      const r = await yt("channels", params);
      const item = r.items?.[0];
      if (!item) { console.warn(`! channel nahi mila: ${key} (handle check karo)`); continue; }
      cache[key] = {
        channelId: item.id,
        title: item.snippet.title,
        thumb: item.snippet.thumbnails?.default?.url || "",
        uploads: item.contentDetails.relatedPlaylists.uploads,
        category: ch.category || "other",
      };
      console.log(`+ resolved ${key} -> ${item.snippet.title}`);
    } catch (e) {
      console.warn(`! ${key}: ${e.message}`);
      if (e.reason === "quotaExceeded") throw e;
    }
  }
  return cache;
}

async function recentVideoIds(uploads) {
  const r = await yt("playlistItems", { part: "contentDetails", playlistId: uploads, maxResults: UPLOADS_PER_CHANNEL });
  const cutoff = Date.now() - LOOKBACK_DAYS * 864e5;
  return (r.items || [])
    .filter(i => new Date(i.contentDetails.videoPublishedAt || 0).getTime() >= cutoff)
    .map(i => i.contentDetails.videoId);
}

async function videoDetails(ids) {
  const out = [];
  for (let i = 0; i < ids.length; i += 50) {
    const r = await yt("videos", { part: "snippet,contentDetails", id: ids.slice(i, i + 50).join(",") });
    out.push(...(r.items || []));
  }
  return out;
}

function isShort(duration = "") {
  const m = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return false;
  const secs = (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0);
  return secs > 0 && secs <= 180;
}

// ---------- Telegram alert ----------
// Secrets: TG_BOT_TOKEN (BotFather se), TG_CHAT_ID (jaise @GiveawayRadarIN), SITE_URL (website link)
const TG_TOKEN = process.env.TG_BOT_TOKEN;
const TG_CHAT = process.env.TG_CHAT_ID;
const SITE_URL = process.env.SITE_URL || "";
const NOTIFY_MAX_AGE_DAYS = 3;   // isse purani video par alert nahi (pehli run par spam na ho)
const NOTIFY_MAX_PER_RUN = 10;

const h = s => String(s ?? "").replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

function tgMessage(it) {
  const end = it.endDate
    ? `\n⏳ Last date: <b>${new Date(it.endDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" })}</b>`
    : "";
  const how = it.howTo?.length ? `\n\n📝 <b>How to enter:</b>\n• ${it.howTo.slice(0, 3).map(h).join("\n• ")}` : "";
  const site = SITE_URL ? `\n\n🔎 All live giveaways: ${h(SITE_URL)}` : "";
  return `🎁 <b>New Giveaway!</b>\n\n<b>${h(it.title)}</b>\n📺 ${h(it.channel)}${end}${how}\n\n▶️ ${h(it.url)}${site}`.slice(0, 1020);
}

async function tgSend(it) {
  const base = `https://api.telegram.org/bot${TG_TOKEN}`;
  const caption = tgMessage(it);
  const body = it.thumb
    ? { method: "sendPhoto", data: { chat_id: TG_CHAT, photo: it.thumb, caption, parse_mode: "HTML" } }
    : { method: "sendMessage", data: { chat_id: TG_CHAT, text: caption, parse_mode: "HTML" } };
  const res = await fetch(`${base}/${body.method}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body.data),
  });
  const j = await res.json().catch(() => ({}));
  if (!j.ok) throw new Error(j.description || res.status);
}

async function notifyNew(items) {
  if (!TG_TOKEN || !TG_CHAT) return;
  const cutoff = Date.now() - NOTIFY_MAX_AGE_DAYS * 864e5;
  const fresh = items.filter(it => !it.notified && it.status === "active" && it.confidence !== "review"
    && new Date(it.publishedAt).getTime() >= cutoff);
  let sent = 0;
  for (const it of fresh.slice(0, NOTIFY_MAX_PER_RUN).reverse()) {   // purana pehle, naya last
    try { await tgSend(it); it.notified = true; sent++; await new Promise(r => setTimeout(r, 1500)); }
    catch (e) { console.warn(`! telegram ${it.videoId}: ${e.message}`); }
  }
  // jo purane hain unhe bhi notified maan lo, taaki baad mein alert na jaye
  for (const it of items) if (!it.notified && new Date(it.publishedAt).getTime() < cutoff) it.notified = true;
  console.log(`Telegram: ${sent} alert bheje.`);
}

// ---------- Discovery: naye channels khud dhoondhna ----------
const DISCOVERY_QUERIES = [
  "giveaway hindi", "iphone giveaway india", "phone giveaway hindi", "giveaway jeeto", "laptop giveaway india",
  "gaming giveaway india", "ps5 giveaway india", "smartphone giveaway", "giveaway announcement hindi", "earbuds giveaway",
];
const DISCOVERY_EVERY_HOURS = 2;  // har 2 ghante 1 search (100 units) => ~1,200 units/din
const MIN_SUBS = 50000;           // isse kam subscribers = "Unverified"
const MAX_DISCOVERED = 150;       // kitne naye channels apne aap track honge (quota ke hisaab se)
const SEARCH_LOOKBACK_DAYS = 3;

function guessCategory(text = "") {
  if (/free\s?fire|bgmi|pubg|gaming|gamer|minecraft|\bgta\b|\bps5\b|\bps4\b|\buc\b|diamonds?|valorant|game/i.test(text)) return "gaming";
  if (/iphone|phone|mobile|laptop|tech|samsung|oneplus|redmi|vivo|oppo|realme|pixel|earbuds|smartwatch|gadget/i.test(text)) return "tech";
  return "other";
}

async function discover(state, seenIds) {
  const hour = new Date().getUTCHours();
  if (hour % DISCOVERY_EVERY_HOURS !== 0 && !process.env.FORCE_DISCOVERY) return [];
  const q = DISCOVERY_QUERIES[(state.queryIndex || 0) % DISCOVERY_QUERIES.length];
  state.queryIndex = (state.queryIndex || 0) + 1;
  const r = await yt("search", {
    part: "snippet", type: "video", order: "date", maxResults: 50, q,
    regionCode: "IN", relevanceLanguage: "hi",
    publishedAfter: new Date(Date.now() - SEARCH_LOOKBACK_DAYS * 864e5).toISOString(),
  });
  const hits = (r.items || []).filter(i => i.id?.videoId && !seenIds.has(i.id.videoId));
  console.log(`Discovery "${q}": ${r.items?.length || 0} result, ${hits.length} nayi`);
  return hits.map(i => ({ videoId: i.id.videoId, channelId: i.snippet.channelId }));
}

async function channelInfo(ids) {
  const out = {};
  for (let i = 0; i < ids.length; i += 50) {
    const r = await yt("channels", { part: "snippet,statistics,contentDetails", id: ids.slice(i, i + 50).join(",") });
    for (const c of r.items || []) {
      out[c.id] = {
        channelId: c.id,
        title: c.snippet.title,
        thumb: c.snippet.thumbnails?.default?.url || "",
        uploads: c.contentDetails.relatedPlaylists.uploads,
        subs: c.statistics.hiddenSubscriberCount ? 0 : +c.statistics.subscriberCount || 0,
      };
    }
  }
  return out;
}

// ---------- Main ----------
async function main() {
  if (!KEY) { console.error("YT_API_KEY set karo. Example: YT_API_KEY=xxxx node fetch.js"); process.exit(1); }
  fs.mkdirSync(DATA, { recursive: true });

  const channels = readJSON(FILES.channels, []);
  const overrides = readJSON(FILES.overrides, { approved: [], rejected: [] });
  const cache = await resolveChannels(channels, readJSON(FILES.cache, {}));
  writeJSON(FILES.cache, cache);
  const disc = readJSON(FILES.discovered, { queryIndex: 0, channels: {} });

  const prev = readJSON(FILES.out, { items: [] });
  const byId = new Map(prev.items.map(it => [it.videoId, it]));
  const seenIds = new Set(prev.scanned || []);

  // kaun-kaun se channels track honge: aapki list + apne aap mile (bade wale pehle)
  const activeKeys = new Set(channels.map(c => c.id || c.handle));
  const manual = Object.entries(cache).filter(([k]) => activeKeys.has(k)).map(([, ch]) => ({ ...ch, manual: true }));
  const manualIds = new Set(manual.map(c => c.channelId));
  const discovered = Object.values(disc.channels)
    .filter(c => !manualIds.has(c.channelId))
    .sort((a, b) => b.subs - a.subs).slice(0, MAX_DISCOVERED);
  // quota bachane ke liye discovered channels har doosre ghante
  const checkDiscovered = new Date().getUTCHours() % 2 === 0 || process.env.FORCE_DISCOVERY;
  const tracked = [...manual, ...(checkDiscovered ? discovered : [])];

  // 1. track kiye channels ki nayi uploads
  const toCheck = [];
  const chanOf = {};
  for (const ch of tracked) {
    try {
      const ids = await recentVideoIds(ch.uploads);
      for (const id of ids) {
        chanOf[id] = ch;
        if (!seenIds.has(id) || overrides.approved.includes(id)) toCheck.push(id);
      }
    } catch (e) {
      console.warn(`! uploads ${ch.title}: ${e.message}`);
      if (e.reason === "quotaExceeded") break;
    }
  }

  // 2. discovery: YouTube search se naye giveaway videos
  try {
    const found = await discover(disc, seenIds);
    const newChan = [...new Set(found.map(f => f.channelId))].filter(id => !manualIds.has(id));
    const info = newChan.length ? await channelInfo(newChan) : {};
    for (const f of found) {
      if (chanOf[f.videoId]) continue;
      const known = manual.find(c => c.channelId === f.channelId);
      chanOf[f.videoId] = known || { ...(info[f.channelId] || {}), discovered: true };
      toCheck.push(f.videoId);
    }
  } catch (e) {
    console.warn(`! discovery: ${e.message}`);
  }

  // 3. nayi videos ka title + description
  let found = 0, added = 0;
  const details = toCheck.length ? await videoDetails([...new Set(toCheck)]) : [];
  for (const v of details) {
    seenIds.add(v.id);
    const { title, description, publishedAt, thumbnails, channelTitle } = v.snippet;
    if (!languageOk(v.snippet)) continue;
    const forced = overrides.approved.includes(v.id);
    const { score, ended, hits } = scoreText(title, description);
    if (!forced && score < 3) continue;
    const ch = chanOf[v.id] || {};
    const subs = ch.subs ?? null;
    const bigChannel = ch.manual || subs >= MIN_SUBS;
    // bada channel giveaway kar raha hai to use aage ke liye track list mein daal do
    if (ch.discovered && bigChannel && !ended && hits.some(h => h.startsWith("title:")) && !disc.channels[ch.channelId]) {
      disc.channels[ch.channelId] = { ...ch, discovered: undefined, category: guessCategory(title + " " + ch.title), addedAt: new Date().toISOString() };
      added++;
    }
    const category = ch.category || disc.channels[ch.channelId]?.category || guessCategory(title + " " + (ch.title || ""));
    byId.set(v.id, {
      videoId: v.id,
      url: `https://www.youtube.com/watch?v=${v.id}`,
      title,
      channel: channelTitle,
      channelId: v.snippet.channelId,
      channelThumb: ch.thumb || "",
      subs,
      verifiedChannel: !!bigChannel,
      category,
      thumb: thumbnails?.high?.url || thumbnails?.medium?.url || thumbnails?.default?.url || "",
      publishedAt,
      endDate: findEndDate(description, publishedAt),
      howTo: keyLines(description),
      isShort: isShort(v.contentDetails?.duration),
      score,
      confidence: forced ? "approved" : !bigChannel ? "review" : score >= 5 || hits.some(h => h.startsWith("title:")) ? "high" : "review",
      resultVideo: ended,
      hits,
      notified: byId.get(v.id)?.notified || false,
    });
    found++;
  }

  // 4. status + safai
  const now = Date.now();
  const items = [...byId.values()]
    .filter(it => !overrides.rejected.includes(it.videoId))
    .filter(it => now - new Date(it.publishedAt).getTime() < KEEP_DAYS * 864e5)
    .map(it => {
      if (overrides.approved.includes(it.videoId)) it.confidence = "approved";
      let status = "active";
      if (it.resultVideo) status = "ended";
      else if (it.endDate && new Date(it.endDate).getTime() < now) status = "ended";
      else if (!it.endDate && now - new Date(it.publishedAt).getTime() > ACTIVE_DAYS * 864e5) status = "maybe-ended";
      return { ...it, status };
    })
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));

  await notifyNew(items);

  writeJSON(FILES.discovered, disc);
  writeJSON(FILES.out, {
    updatedAt: new Date().toISOString(),
    channelsTracked: manual.length + discovered.length,
    items,
    scanned: [...seenIds].slice(-8000),
  });
  console.log(`Done. ${toCheck.length} videos check ki, ${found} giveaway mile, ${added} naye channel track list mein, list mein total ${items.length}.`);
}

if (require.main === module) {
  main().catch(e => { console.error(e.message); process.exit(1); });
}
module.exports = { scoreText, keyLines, findEndDate, isShort, guessCategory, languageOk };
