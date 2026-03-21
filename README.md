# 🏏 IPL Auction

Live fantasy cricket auction for friends. Real-time bidding, fantasy points, transfers, season report.

---

## Setup — 3 steps

### Step 1 — Supabase (2 min)
1. Create a project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** → paste and run `supabase/setup.sql`
3. Copy your **Project URL** and **anon key** from Settings → API

### Step 2 — GitHub repo (2 min)
1. Create a **private** repo, push this code to `main`
2. Go to repo **Settings → Secrets → Actions**, add:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_ANTHROPIC_API_KEY` ← get from [console.anthropic.com](https://console.anthropic.com)
   - `VITE_BASE_PATH` = `/your-repo-name/`  *(e.g. `/ipl-auction/`)*
3. Go to **Settings → Pages → Source: GitHub Actions**

### Step 3 — Deploy
Push to `main`. GitHub Actions builds and deploys automatically.  
Your app: `https://yourusername.github.io/your-repo-name/`

---

## First use

1. Open the app → **Create Room** → choose Virtual or Physical mode
2. Share the **Room Code** with friends, keep the **Admin Code** for yourself
3. Admin Panel → **🌐 Sync Now** — fetches IPL 2026 rosters + full schedule from web
4. Wait for friends to join → **Start Auction**

---

## During the season

After each match day: Admin Panel → **📊 Update Scores** — one click, fully automatic.  
Transfer window: Admin Panel → **Open Transfer Window** (after 7+ matches).

---

## Cost

| | |
|--|--|
| Supabase | Free |
| GitHub Pages | Free |
| Anthropic API (full season) | ~₹210 |

---

## How it works

- **Virtual mode** — everyone bids from their phone/laptop in real-time
- **Physical mode** — in-person auction, admin records who won and at what price
- **Points** — Claude fetches IPL scorecards and calculates fantasy points automatically
- **Transfers** — propose player swaps after 7 matches, historical points follow the player
- **Season End** — per-team report card with Claude-written narrative

## Files
```
src/pages/       — 8 pages (Landing, Auction, Squads, Leaderboard, Transfers, MatchDay, Admin, SeasonEnd)
src/components/  — 10 components
src/contexts/    — AuctionContext (all real-time state)
src/utils/       — bid rules, fantasy points calculator
supabase/        — setup.sql (everything in one file) 
```
