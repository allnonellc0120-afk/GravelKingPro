# GravelKing Productions — Product Overview
### Professional Audio Tools · Built by All N One LLC · Kevin Morris

---

## What Is GravelKing Productions?

GravelKing Productions is an all-in-one music SaaS platform designed for independent artists, producers, and audio professionals. Every tool runs **server-side** — meaning you upload your audio, our servers do the heavy lifting using professional-grade ML models and signal processing pipelines, and you download a studio-quality result. No plugins. No installs. Works in any browser or on the companion mobile app.

The platform combines six production tools, a beat library, a songwriter assistant, and a lyrics database — everything an independent artist needs to take a song from idea to finished record.

---

## Tools

### 1. Voice Removal
Strip vocals from any stereo track and download a clean instrumental.

- Uses **GNS (GravelKing Neural Separator)** powered by **Demucs htdemucs**, a state-of-the-art ML model — not simple FFT phase cancellation
- Handles MP3 and WAV files
- Returns a full-quality WAV instrumental
- **Free users:** One trial split included
- **Splits / Pro / Node Auditor:** Unlimited

---

### 2. Stem Splitting
Separate a full mix into individual frequency stems for remixing, sampling, or analysis.

- GNS + Demucs htdemucs backend — same ML engine used in professional DAW plugins
- Outputs: **Bass** (sub-bass & bass, < 250 Hz), **Midrange** (instruments & melody, 250 Hz – 4 kHz), **Highs** (presence & air, > 4 kHz), and **Instrumental** (vocal-removed, stereo files only)
- All stems delivered as individual WAV files
- **Free users:** One trial split included
- **Splits / Pro / Node Auditor:** Unlimited

---

### 3. Audio Mastering
Apply a professional mastering preset to your track in seconds.

Six presets available:

| Preset | Description | Free |
|--------|-------------|------|
| **Normal** | Balanced loudness — good for any content | ✅ |
| **Broadcast** | EBU R128 standard for streaming platforms | Paid |
| **Vinyl** | Warm analog character with boosted lows | Paid |
| **Podcast** | Voice clarity with dynamic compression | Paid |
| **Club** | Heavy bass and punchy transients | Paid |
| **Film** | Wide cinematic dynamics with presence | Paid |

- Returns a mastered WAV at full resolution
- **Free users:** Normal preset only (30s preview)
- **Splits / Pro / Node Auditor:** All six presets, full length

---

### 4. Voice Changer
Transform any vocal recording with one of five character presets.

| Preset | Effect |
|--------|--------|
| 🎤 **Normal** | Light room ambience — subtle warmth |
| 🤖 **Robot** | Rapid vibrato + metallic echo |
| 🐿️ **Chipmunk** | Higher pitch, faster tempo |
| 🦁 **Deep** | Lower pitch, slower, heavier |
| 👽 **Alien** | Vibrato + reverb + pitch shift |

- Upload any vocal or instrument recording
- Returns a transformed WAV
- Available on **all paid tiers**

---

### 5. Denoise
Clean up recordings by removing background noise, hiss, hum, and room artifacts.

- FFT spectral gating removes broadband noise without introducing artifacts
- Ideal for vocal recordings, podcast audio, field recordings
- Returns a clean WAV
- Available on **all paid tiers**

---

### 6. GravelKing Kernel (Mix Studio / Full Kernel)
The flagship Pro-tier experience — a multi-track analysis and signal processing engine.

- **MLK v3 kernel** runs amplitude analysis, parity validation, efficiency scoring, and decay rate calculations
- Multi-track Mix Studio with speed & pitch control, layering, and voice effects
- Beat Maker generates original instrumentals in up to 120 seconds across 7 genres using the MLK v3 engine
- Live waveform visualization
- Kernel metrics dashboard with throughput, stability, efficiency, and parity status
- Exportable PDF audit reports
- **Pro / Node Auditor only**

---

## Beats Library
**Beats by Kevin Morris** — a curated library of original instrumentals available directly on the platform.

- **Beat of the Month (BOTM):** One featured beat each month, highlighted for the community
- Sample library with genre tags, BPM, key, and mood metadata
- Stream any beat directly in-browser or in the mobile app
- Free downloads — no paywall on the beat library
- One-click send: load any beat directly into Voice Removal or Stem Splitting tools

---

## Songwriter (SongBot)
Generate a complete song structure instantly with AI-assisted scaffolding.

- Input: title, artist name, theme/concept, genre, and mood
- Outputs a full section-by-section song blueprint (Intro → Verse → Hook → Bridge → Outro) with bar counts and lyrical direction notes for each section
- Supported genres: **Hip-Hop, R&B, Pop, Trap, Reggae, Soul, Rock, Afrobeats**
- Supported moods: **Hype, Chill, Emotional, Dark, Motivational, Romantic**
- Structures are genre-accurate (e.g. Trap gets a triple-verse hook structure; R&B gets Pre-Chorus sections)
- **Available free** — no account required

---

## Lyrics Hub
Find synced lyrics for any song as a writing reference.

- Powered by **lrclib.net** — the open lyrics database
- Returns **synchronized LRC lyrics** (with timestamps) when available, plain lyrics as fallback
- Search by song title or artist
- View timestamped lines to study song structure, phrasing, and flow
- Available in-browser and in the mobile app
- **Available free** — no account required

---

## Pricing Plans

| Plan | Price | Best For |
|------|-------|----------|
| **Starter** | Free | Try the platform — no account required |
| **GravelKing Splits** | $9.99 / month | Artists who need unlimited voice removal and stem splitting |
| **GravelKing Pro** | $39.99 / month | Full studio access — mastering, Mix Studio, Beat Maker, kernel metrics |
| **Node Auditor** | $499 / month | Enterprise benchmarking, custom reports, dedicated support, SLA |

### What Each Plan Unlocks

**Starter (Free)**
- Basic kernel analysis
- Server-side audio processing
- Audio preview (no download)
- Songwriter — full access
- Lyrics Hub — full access
- 1 free voice removal / stem split trial
- Mastering: Normal preset only (30s)

**GravelKing Splits — $9.99/mo**
- Everything in Starter
- Unlimited voice removal
- Unlimited stem splitting
- Download all stems as WAV
- All 6 mastering presets, full length
- Processing history

**GravelKing Pro — $39.99/mo**
- Everything in Splits
- Full Mix Studio (multi-track editor)
- Beat Maker up to 120 seconds
- Waveform visualization
- GravelKing Kernel metrics dashboard
- PDF audit report exports
- Priority support

**Node Auditor — $499/mo**
- Everything in Pro
- Enterprise-scale audio benchmarking
- Custom reports
- Dedicated support line
- SLA guarantee

### Promo Code
Have a code? Enter it on the Pricing page to unlock free access. Codes are available to friends and early supporters of GravelKing Productions.

---

## Mobile App
GravelKing Productions is available as a native mobile app (iOS & Android via Expo Go).

**5 screens:**
- **Home** — tool grid, Beat of the Month preview, quick-access pricing tiers
- **Studio** — upload audio files and run any of the four processing tools (Stem Split, Voice Remove, Master, Denoise) from your phone
- **Beats** — stream the full beat library with live playback, pull-to-refresh
- **Lyrics** — search and read synced LRC lyrics on the go
- **Create (SongBot)** — generate a song structure on your phone in seconds

---

## Technology

| Layer | Stack |
|-------|-------|
| Frontend (Web) | React + Vite, TypeScript, Tailwind CSS |
| Mobile | Expo (React Native), iOS + Android |
| Backend | Express 5, Node.js 24, TypeScript |
| Database | PostgreSQL + Drizzle ORM |
| ML Separation | Demucs htdemucs (GNS — GravelKing Neural Separator) |
| Mastering Engine | MLK v3 kernel (proprietary signal processing) |
| Payments | Stripe (subscriptions + one-time checkout) |
| Lyrics | lrclib.net (open database) |

---

## About
**GravelKing Productions** is developed and operated by **All N One LLC**, founded by **Kevin Morris**. Built for independent artists who deserve professional tools without the professional price tag — until they're ready to scale up.

---

*GravelKingPro.it · © 2026 GravelKing Productions · All N One LLC*
