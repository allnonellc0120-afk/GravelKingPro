# GravelKing Pro
## From an idea to a finished record—with your creative history attached

**Plain-English product walkthrough for creators, partners, and investors**

---

## 1. What GravelKing Pro Is

GravelKing Pro is an online creative-audio workspace for independent artists.

Instead of bouncing between separate songwriting, recording, mastering, file-conversion, and proof-of-creation tools, the artist can move through one connected workflow:

1. Develop the song with JAX.
2. Edit and organize the lyrics.
3. Record vocals over a beat in Vocal Booth.
4. Finish the sound in The Foundry.
5. Convert the file for delivery.
6. Keep a timestamped authorship and audio record when certification is selected.

The goal is simple: help an everyday creator go from a blank page to a release-ready file while preserving useful evidence of how the work was made.

---

## 2. Why It Exists

Independent artists often face four problems:

- Their writing history is scattered across chats, notes, and phones.
- Recording and editing tools can feel too technical.
- A mix may sound good in headphones but not be ready for streaming.
- It can be difficult to show when a song existed, what source material was used, and how much human work went into it.

GravelKing Pro brings those steps together in one creator-focused process.

It does **not** replace a lawyer, performing-rights organization, distributor, label, or copyright office. Its certificate and edit history are supporting records—not an automatic copyright registration or a guarantee that a court, label, or platform will accept a claim.

---

## 3. The Four Core Tools

### Tool 1: JAX — Songwriting Companion

JAX helps an artist develop:

- Hooks
- Verses
- Bridges
- Rhyme ideas
- Meter and flow
- Imagery
- Song structure
- Constructive lyric feedback

The artist describes the idea, mood, story, or section they need. JAX returns writing suggestions focused only on songwriting.

The artist remains in control. They can keep, reject, rewrite, or replace every line.

The current product also includes:

- Five free JAX text prompts per day for ordinary accounts
- Expanded access for eligible paid/developer accounts
- Optional JAX voice playback
- Optional song generation using credits
- A creative ledger that records edits and produces a 0–100 human-authorship score

**Important:** the ledger records activity by the signed-in account. It is evidence of account activity and revision history; it cannot prove who was physically typing at every moment.

---

### Tool 2: Vocal Booth — Record Over Your Beat

Vocal Booth is the performance workspace.

The artist can:

- Upload a backing track
- Display timed or approximate lyrics
- Record vocals through the device microphone
- Monitor the vocal performance with effects
- View the song waveform and playhead
- Clip, splice, arrange, and layer takes
- Mix the vocal with the backing track
- Send the result through the Morris Law audio process

The guide vocal is not supposed to be baked into the final mixdown. It is there to help the performer stay on time.

When precise synced lyrics are available, the product can use timestamped lyric data. When they are not available, the interface should clearly identify approximate timing rather than pretending it is exact.

---

### Tool 3: The Foundry — Mastering

The Foundry turns an uploaded or recorded mix into a more controlled final master.

The normal creator flow is:

1. Upload the mix.
2. Choose a preset.
3. Optionally apply noise reduction.
4. Preview or process the full song.
5. Download WAV or MP3 output.
6. Optionally certify the work.

The mastering engine applies:

- Multi-band tonal shaping
- Saturation
- Adaptive sidechain compression
- Limiting
- Loudness staging
- Stereo-link controls
- Preset-specific loudness and peak targets

There is no single loudness target for every preset. For example:

- **Baseline:** −14 LUFS, −0.8 dB ceiling
- **YouTube:** −14 LUFS, −1.0 dB ceiling
- **Apple:** −16 LUFS, −1.0 dB ceiling
- **Club:** −12 LUFS, −0.5 dB ceiling

This lets the artist choose an output suited to the intended destination rather than forcing every song through one setting.

---

### Tool 4: Format Converter

The converter prepares audio for different delivery needs.

Supported outputs in the current server code:

- MP3
- WAV
- FLAC
- M4A/AAC
- OGG

Available sample rates:

- 22,050 Hz
- 44,100 Hz
- 48,000 Hz

The server can accept an audio or video container, remove the video stream, and convert the audio. Lossy formats can use a selected bitrate; WAV and FLAC remain lossless formats.

**Current implementation note:** the converter screen still contains “Free” wording, but the server currently requires Pro or King access. The server gate is the enforceable behavior until that copy is reconciled.

---

## 4. The Complete Creator Walkthrough

### Step 1: Start With an Idea

The artist opens JAX and explains the goal:

> “I need a hook about rebuilding after losing everything.”

JAX can offer hook ideas, rhyme directions, imagery, or a complete section. The artist chooses what helps and rewrites what does not.

### Step 2: Make the Lyrics Their Own

The artist edits lines in the songwriting canvas.

The creative ledger can track:

- Revision activity
- Edit count
- Timestamps
- The final text
- A hash of the work
- A human-authorship score

This creates a clearer record than a final lyric file with no history behind it.

### Step 3: Generate a Take or Bring a Beat

The artist can either:

- Generate a song take for **20 credits**, or
- Bring an existing instrumental or beat into Vocal Booth.

User-supplied lyrics are screened before generation so a crafted client cannot simply bypass the product’s copyright-safety step.

### Step 4: Record in Vocal Booth

The artist loads the beat, follows the lyrics, records a performance, and edits the take.

They can layer recordings, adjust timing, and prepare a complete vocal mix.

### Step 5: Finish the Record in The Foundry

The artist uploads the mix, selects a mastering preset, and processes the song.

A full **master plus download costs 75 credits** when the credit wallet path is used. A failed mastering run is designed not to keep the charge; credit deductions occur after successful kernel processing, and later failures can trigger refunds.

### Step 6: Download and Convert

The artist downloads WAV or MP3 output. If another format is required, the converter can create MP3, WAV, FLAC, M4A, or OGG.

### Step 7: Create Supporting Proof

When certification is selected, GravelKing Pro can:

- Hash the source audio before mastering
- Create a unique certificate ID
- Embed one half of a cryptographic proof in the WAV
- Keep the other half on the server
- Bind both halves with HMAC-SHA256
- Record a UTC timestamp
- Store attribution and screening information
- Produce JSON and PDF certificate documents

Certification is opt-in. An ordinary master does not automatically create a certificate or watermark.

---

## 5. Current Pricing and Credits

The live pricing screen loads prices from Stripe and falls back to these values:

### Free

- Limited JAX access
- Foundry preview access
- One full free mastering download under the current free-usage path
- Basic exploration of the workflow

### Pro — $6.99 per week

- All four creator tools
- 800 credits reset each paid week
- 10 WAV exports per rolling week
- Unlimited MP3 exports
- Vocal Booth recording and editing
- Foundry mastering
- Certificate creation
- Format conversion

### King — $24.99 per month

- Everything in Pro
- 2,500 credits reset each paid month
- 40 WAV exports per rolling month
- Advanced Foundry controls
- Expanded JAX workflow
- Vocal Booth editing
- PDF reports and provenance documents

### Credit Costs

- Generated song or remix: **20 credits**
- Full master plus download: **75 credits**
- Certificate stamping: **0 credits**

### Credit Packs

- Starter: 500 + 250 bonus credits for $10
- Artist: 1,250 + 500 bonus credits for $20
- Studio: 2,500 + 1,000 bonus credits for $30

Subscription credits reset to the plan amount at renewal; unused subscription credits do not roll over.

---

## 6. What the Certificate Means

The certificate is designed to support a creator’s chain of custody.

It can show:

- A timestamp
- Hashes tied to lyrics and/or audio
- The artist handle used during certification
- A certificate ID
- A server-verified cryptographic handshake
- Optional IPI, ISWC, and ISRC identifiers
- AI-model attribution when applicable
- A human-authorship score
- The copyright-screen result available at certification time

If a label, distributor, publisher, collaborator, or attorney receives the original certified WAV, they can submit it to GravelKing’s verification endpoint. The server checks whether the embedded proof matches the server-retained record.

Possible outcomes include:

- **Intact:** the embedded and server records match.
- **Tampered:** a proof exists but the chain no longer matches.
- **No watermark:** the file was not certified or was lossily re-encoded.

Lossy conversion such as MP3 or AAC destroys the current LSB watermark. The lossless WAV should be kept as the archival evidence copy.

---

## 7. What Happens When a Track Is Submitted

### To a record label

The artist can provide:

- The finished audio
- The original certified WAV
- The certificate PDF or JSON
- The lyric/edit history
- Any supplied IPI, ISWC, or ISRC identifiers

This gives the label a more organized due-diligence package. It does not force the label to accept the work or eliminate the need for contracts and rights clearance.

### To a streaming platform

The artist normally sends the distributor a release-ready audio file and metadata. The certificate is supporting provenance material and may be retained for disputes, audits, or partner review.

### In a copyright dispute

The timestamp, hashes, edit history, and dual-anchor verification may help establish that a particular account possessed a specific version of the work at a particular time.

They do not by themselves prove every element of copyright ownership, originality, identity, work-for-hire status, collaborator consent, or legal authorship. Those conclusions depend on facts, contracts, registration records, and applicable law.

---

## 8. The Investor Summary

GravelKing Pro is not just another audio effect.

Its product strategy connects four creator actions:

1. **Create** with JAX.
2. **Perform** in Vocal Booth.
3. **Finish** in The Foundry.
4. **Deliver and document** with conversion and certificates.

The business model combines:

- Weekly and monthly subscriptions
- Usage credits
- Credit packs
- Creator retention through saved work and provenance history
- Potential partner APIs for verification and ingestion

The central value is a single workflow where creation, audio finishing, and evidence stay connected.
