# 🎁 Giveaway Pulse (giveawaypulse.com)

YouTube ke chalu giveaways ek radar par, **English (`/`) aur Hindi (`/hi/`)** dono mein. Isme do hisse hain:
1. **Radar (automatic):** Aapke chune channels aur YouTube search se mile naye channels, dono ke giveaways har ghante apne aap list mein aate hain.
2. **Giveaway pages (aap banate ho):** Bade giveaways ke liye alag page, jisme rules, countdown aur winners ki list hoti hai. Google se traffic inhi pages par aata hai.

Server ka koi kharcha nahi: GitHub Actions + GitHub Pages par free chalta hai.

## Files
| File | Kaam |
|---|---|
| `site-config.json` | **Saari settings ek jagah:** website link, Telegram link, Google Form, AdSense code |
| `channels.json` | Aapke chune channels (handle + category: tech / gaming / global / other) |
| `posts/*.txt` | Giveaway pages (`_TEMPLATE.txt` copy karke banao) |
| `overrides.json` | Haath se control: `approved` = zabardasti dikhao, `rejected` = hata do (video ID daalo) |
| `fetch.js` | Radar: YouTube se giveaways dhoondhta hai, Telegram alert bhejta hai |
| `build-posts.js` | `posts/` se `g/` mein pages banata hai, saath mein sitemap.xml |
| `index.html` (English), `hi/index.html` (Hindi) | Homepage: radar, YouTube/SaaS button, list |
| `assets/app.js`, `assets/app.css` | Radar aur list ka code + design (dono languages isi se chalti hain) |
| `assets/page.css` | Giveaway pages ka design |
| `data/` | Script khud likhta hai, haath mat lagao |

## Setup (ek baar, ~20 min)
1. **YouTube API key:** console.cloud.google.com → naya project → "YouTube Data API v3" enable → Credentials → API key (sirf YouTube API par restrict karo).
2. **GitHub repo** banao, saari files daalo.
3. Repo → Settings → Secrets and variables → Actions:
   - **Secrets:** `YT_API_KEY`, `TG_BOT_TOKEN`, `TG_CHAT_ID`
   - **Variables:** `SITE_URL` = website ka link (jaise `https://giveawayradar.in`)
4. Settings → Pages → "Deploy from a branch" → `main` / root.
5. `site-config.json` bharo (siteUrl pehle se `https://giveawaypulse.com` hai; telegram, suggestForm, saasForm).
   Custom domain: Settings → Pages → Custom domain = `giveawaypulse.com`, aur GoDaddy DNS mein GitHub Pages ke A records daalo (GitHub ka "Managing a custom domain" guide).
6. Actions tab → "Update giveaways" → **Run workflow**.

### Telegram
@BotFather → `/newbot` → token. Public channel banao, bot ko **admin** banao. `TG_CHAT_ID` = `@ChannelKaNaam`.
Alert kab jaata hai: radar ka naya verified giveaway, aapka naya page, aur winners announce hone par.

## Naya giveaway page kaise banayein (5 min)
1. `posts/_TEMPLATE.txt` ki copy banao, jaise `carryminati-ps5-giveaway.txt`.
2. Jaankari bharo, **sirf wahi jo creator ne video mein bataya hai**. Last date `30-12-2026` jaise likho.
   Hindi page ke liye `title_hi`, `inaam_hi`, `kaise_participate_hi`, `note_hi` bharo (optional — khaali chhodoge to English text dikhega, labels Hindi mein rahenge).
3. GitHub par upload/commit karo. 1–2 minute mein **do page** ban jayenge: `/g/carryminati-ps5-giveaway.html` (English) aur `/hi/g/carryminati-ps5-giveaway.html` (Hindi), homepage par ⭐ Featured mein dikhega, aur Telegram par alert jayega.
4. Winner announce ho to usi file mein `winners:` ke neeche naam daalo:
   ```
   winners:
   - @rahul_23
   - Priya S.
   winners_video: https://www.youtube.com/watch?v=...
   ```
   Page par 🏆 Winners dikhega aur Telegram par "Winners announce!" post jayegi.
5. Page hatana ho to `.txt` file delete kar do, page bhi hat jayega.

Galti hogi (galat link, galat date, winners mein phone number) to wo page nahi banega aur Actions log mein Hindi mein wajah likhi aayegi.

**Hamesha:** har page par "official page nahi hai" wali line apne aap aati hai. Winners ka phone number ya address kabhi mat daalna.

## Homepage
- Radar par har chalu giveaway ek bindi hai: **hari** = radar ne khud dhoondha, **sunehri** = aapka Featured page. Naya giveaway beech mein, purana kinare par.
- Bindi par tap karne par neeche se card khulta hai. Radar ke neeche wahi giveaways list mein bhi hain.
- **SaaS** button: abhi "Coming soon" + "Submit your SaaS giveaway" (link `site-config.json` ke `saasForm` mein daalo).
- Upar **EN | हिंदी** toggle. Dono version ke alag URL hain aur `hreflang` tag lage hain, taaki Google English search par English aur Hindi search par Hindi page dikhaye.
- Sitemap mein dono languages ke saare pages apne aap jaate hain. Google Search Console mein `sitemap.xml` submit kar dena.

## Radar kaise kaam karta hai
- **Aapke channels:** har ghante check hote hain (`channels.json`).
- **Discovery:** har 2 ghante YouTube par "giveaway", "jeeto", "free iphone giveaway"… jaise shabd search hote hain.
  50K+ subscribers wale channel ka giveaway mila to wo channel **apne aap track list mein jud jaata hai** (max 150).
  50K se chhote channel ka giveaway "Unverified" mein jaata hai, jo tabhi dikhta hai jab user "Unverified bhi" tick kare.
- **Pehchaan:** title + description mein giveaway, गिववे, lucky winner, jeeto, contest… Sponsor wali "win amazing deals" jaisi lines nahi pakadta.
- Galat match ka video ID `overrides.json` ke `rejected` mein daalo, aur chhoota hua giveaway ka ID `approved` mein.

## Quota (free = 10,000 units/din)
~150 aapke channels har ghante (~3,600) + 150 discovered har 2 ghante (~1,800) + search (~1,200) ≈ **7,000/din**.
`channels.json` mein 150 se zyada channel daaloge to quota khatam ho sakta hai.

## Ads
Apna domain lo (~₹800/saal). AdSense approve hone ke baad `index.html` aur `g/` pages ke `<head>` mein AdSense script daalo, aur ad unit code `site-config.json` ke `adHtml` mein. Ad har 6 cards ke baad aur har giveaway page par dikhega.

## Limitations
- Community posts aur pinned comment wale giveaways radar nahi pakadta. Aise giveaways ke liye page bana do.
- Instagram abhi nahi hai.
