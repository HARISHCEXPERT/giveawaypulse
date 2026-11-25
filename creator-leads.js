// Giveaway Pulse - creator leads
// Chhote creators (default 1k–50k subscribers) dhoondhta hai jinhone haal hi mein giveaway video daali hai.
// Outreach ke liye CSV banata hai: channel, subscribers, channel link, giveaway video, public email (agar description mein ho).
//
// Chalane ka tareeka:
//   YT_API_KEY=xxxx node creator-leads.js
//   Options (env): MAX_SUBS=50000 MIN_SUBS=1000 DAYS=14 SEARCHES=6
//
// Quota: har search = 100 units, channels.list = 1 unit / 50 channels.
//   SEARCHES=6 => ~610 units. Hourly fetch.js ~7,000/day leta hai, to ek din mein 1–2 baar hi chalao.

const fs = require("fs");
const path = require("path");

const API = "https://www.googleapis.com/youtube/v3";
const KEY = process.env.YT_API_KEY;
const MAX_SUBS = +process.env.MAX_SUBS || 50000;
const MIN_SUBS = process.env.MIN_SUBS === undefined || process.env.MIN_SUBS === "" ? 1000 : +process.env.MIN_SUBS;
const DAYS = +process.env.DAYS || 14;
const SEARCHES = Math.min(+process.env.SEARCHES || 6, 20);
const OUT_DIR = path.join(__dirname, "leads");

const QUERIES = [
  "giveaway hindi", "giveaway india", "iphone giveaway", "phone giveaway hindi", "giveaway jeeto",
  "gaming giveaway india", "free fire giveaway", "bgmi giveaway", "earbuds giveaway", "laptop giveaway india",
  "giveaway announcement", "subscriber giveaway", "1k subscribers giveaway", "10k giveaway", "live giveaway hindi",
  "smartwatch giveaway", "ps5 giveaway india", "giveaway winner announcement", "redeem code giveaway", "giveaway 2026",
];

async function yt(endpoint, params) {
  const url = new URL(`${API}/${endpoint}`);
  for (const [k, v] of Object.entries({ ...params, key: KEY })) url.searchParams.set(k, v);
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const reason = body?.error?.errors?.[0]?.reason || res.status;
    const err = new Error(`${endpoint}: ${reason} - ${body?.error?.message || ""}`);
    err.reason = reason;
    throw err;
  }
  return body;
}

const readJSON = (f, d) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return d; } };
const csv = v => `"${String(v ?? "").replace(/"/g, '""').replace(/\r?\n/g, " ")}"`;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const emailsIn = t => [...new Set((String(t || "").match(EMAIL_RE) || []).map(e => e.toLowerCase().replace(/\.$/, "")))];
const GIVEAWAY_RE = /giveaway|give\s?away|giveway|jeeto|free\s+(iphone|phone|mobile|laptop)|winner/i;

async function main() {
  if (!KEY) { console.error("YT_API_KEY set karo. Example: YT_API_KEY=xxxx node creator-leads.js"); process.exit(1); }

  // pehle se track ho rahe channels skip (wo already site pe hain)
  const known = new Set();
  for (const c of Object.values(readJSON(path.join(__dirname, "data/channel-cache.json"), {}))) if (c.channelId) known.add(c.channelId);
  for (const id of Object.keys(readJSON(path.join(__dirname, "data/discovered-channels.json"), {}).channels || {})) known.add(id);

  const after = new Date(Date.now() - DAYS * 864e5).toISOString();
  const videosByChannel = {};
  let used = 0;

  for (const q of QUERIES.slice(0, SEARCHES)) {
    try {
      const r = await yt("search", {
        part: "snippet", type: "video", order: "date", maxResults: 50, q,
        regionCode: "IN", relevanceLanguage: "hi", publishedAfter: after,
      });
      used += 100;
      let n = 0;
      for (const it of r.items || []) {
        const s = it.snippet, vid = it.id?.videoId;
        if (!vid || !GIVEAWAY_RE.test(`${s.title} ${s.description}`)) continue;
        const list = (videosByChannel[s.channelId] ||= []);
        if (!list.some(v => v.id === vid)) { list.push({ id: vid, title: s.title, at: s.publishedAt }); n++; }
      }
      console.log(`search "${q}": ${r.items?.length || 0} results, ${n} giveaway videos`);
    } catch (e) {
      console.warn(`! ${e.message}`);
      if (e.reason === "quotaExceeded") { console.warn("Quota khatam — jitna mila utna save kar raha hoon."); break; }
    }
  }

  const ids = Object.keys(videosByChannel).filter(id => !known.has(id));
  const leads = [];
  for (let i = 0; i < ids.length; i += 50) {
    const r = await yt("channels", { part: "snippet,statistics", id: ids.slice(i, i + 50).join(",") });
    used += 1;
    for (const c of r.items || []) {
      const st = c.statistics || {};
      if (st.hiddenSubscriberCount) continue;
      const subs = +st.subscriberCount || 0;
      if (subs < MIN_SUBS || subs > MAX_SUBS) continue;
      const vids = videosByChannel[c.id].sort((a, b) => b.at.localeCompare(a.at));
      leads.push({
        name: c.snippet.title,
        subs,
        videos: +st.videoCount || 0,
        channelCreated: (c.snippet.publishedAt || "").slice(0, 10),
        country: c.snippet.country || "",
        channelUrl: c.snippet.customUrl ? `https://youtube.com/${c.snippet.customUrl}` : `https://youtube.com/channel/${c.id}`,
        email: emailsIn(c.snippet.description).join(" "),
        latestGiveaway: vids[0].title,
        latestGiveawayUrl: `https://youtu.be/${vids[0].id}`,
        latestGiveawayDate: vids[0].at.slice(0, 10),
        giveawayVideosFound: vids.length,
      });
    }
  }

  // email wale pehle, phir zyada subscribers wale
  leads.sort((a, b) => (!!b.email - !!a.email) || b.subs - a.subs);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const cols = ["name", "subs", "email", "channelUrl", "latestGiveaway", "latestGiveawayUrl", "latestGiveawayDate", "giveawayVideosFound", "videos", "channelCreated", "country"];
  const file = path.join(OUT_DIR, `creator-leads-${new Date().toISOString().slice(0, 10)}.csv`);
  // BOM taaki Excel Hindi naam sahi dikhaye
  fs.writeFileSync(file, "﻿" + [cols.join(","), ...leads.map(l => cols.map(c => csv(l[c])).join(","))].join("\n") + "\n");

  const withEmail = leads.filter(l => l.email).length;
  const summary = [
    `## Creator leads (${MIN_SUBS.toLocaleString("en-IN")}–${MAX_SUBS.toLocaleString("en-IN")} subs, last ${DAYS} days)`,
    ``,
    `- Channels found: **${leads.length}** (${withEmail} with a public email in their description)`,
    `- Searches run: ${SEARCHES} · approx quota used: ${used} units`,
    `- Download the CSV from **Artifacts** at the bottom of this run.`,
    ``,
    `| Channel | Subs | Latest giveaway |`,
    `|---|---:|---|`,
    ...leads.slice(0, 40).map(l => `| [${l.name.replace(/\|/g, "/")}](${l.channelUrl}) | ${l.subs.toLocaleString("en-IN")} | [${l.latestGiveaway.replace(/\|/g, "/").slice(0, 60)}](${l.latestGiveawayUrl}) |`),
  ].join("\n");
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + "\n");
  console.log(`\nDone: ${leads.length} leads (${withEmail} with email) -> ${path.relative(__dirname, file)} · ~${used} units used`);
}

main().catch(e => { console.error(e); process.exit(1); });
