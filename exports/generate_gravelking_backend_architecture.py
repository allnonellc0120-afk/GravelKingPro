from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT, TA_CENTER
from reportlab.lib.pagesizes import A3, landscape
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph

OUT = "exports/gravelking-live-backend-architecture.pdf"
PAGE = landscape(A3)
W, H = PAGE

NAVY = colors.HexColor("#081522")
PANEL = colors.HexColor("#102437")
PANEL_2 = colors.HexColor("#153149")
INK = colors.HexColor("#EAF3F7")
MUTED = colors.HexColor("#9DB4C2")
CYAN = colors.HexColor("#34D5DB")
TEAL = colors.HexColor("#31C48D")
AMBER = colors.HexColor("#F7B955")
RED = colors.HexColor("#F26B6B")
PURPLE = colors.HexColor("#A78BFA")
BLUE = colors.HexColor("#5DA9FF")
WHITE = colors.white
GRID = colors.HexColor("#25465C")

c = canvas.Canvas(OUT, pagesize=PAGE, pageCompression=1)
c.setTitle("GravelKing Pro — Live Backend Pipeline Architecture")
c.setAuthor("GravelKing Pro / Replit Agent")
c.setSubject("Code-audited implementation map, 15 August 2026")

BODY = ParagraphStyle(
    "body", fontName="Helvetica", fontSize=8.2, leading=10.3,
    textColor=INK, alignment=TA_LEFT, spaceAfter=0,
)
SMALL = ParagraphStyle(
    "small", parent=BODY, fontSize=7.0, leading=8.5, textColor=MUTED,
)
CENTER = ParagraphStyle(
    "center", parent=BODY, alignment=TA_CENTER, fontSize=8.0, leading=9.8,
)
TITLE = ParagraphStyle(
    "box-title", fontName="Helvetica-Bold", fontSize=10.0, leading=12.0,
    textColor=WHITE, alignment=TA_LEFT,
)


def para(text, x, y, w, h, style=BODY):
    p = Paragraph(text, style)
    _, used = p.wrap(w, h)
    p.drawOn(c, x, y + h - used)
    return used


def page_base(number, title, subtitle):
    c.setFillColor(NAVY)
    c.rect(0, 0, W, H, stroke=0, fill=1)
    c.setStrokeColor(colors.HexColor("#15364A"))
    c.setLineWidth(0.35)
    for x in range(0, int(W), 36):
        c.line(x, 0, x, H)
    for y in range(0, int(H), 36):
        c.line(0, y, W, y)

    c.setFillColor(CYAN)
    c.rect(0, H - 12, W, 12, stroke=0, fill=1)
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 23)
    c.drawString(30, H - 48, title)
    c.setFont("Helvetica", 9.5)
    c.setFillColor(MUTED)
    c.drawString(31, H - 64, subtitle)
    c.setStrokeColor(GRID)
    c.line(30, H - 76, W - 30, H - 76)

    c.setFillColor(MUTED)
    c.setFont("Helvetica", 7.3)
    c.drawString(30, 17, "CODE-AUDITED LIVE IMPLEMENTATION • WORKSPACE SNAPSHOT 15 AUG 2026")
    footer = f"GRAVELKING PRO  /  BACKEND PIPELINE ARCHITECTURE  /  {number:02d}"
    c.drawRightString(W - 30, 17, footer)


def box(x, y, w, h, title, body, accent=CYAN, badge=None, dashed=False, title_size=10, body_style=BODY):
    c.saveState()
    c.setFillColor(PANEL)
    c.setStrokeColor(accent)
    c.setLineWidth(1.2)
    if dashed:
        c.setDash(4, 3)
    c.roundRect(x, y, w, h, 8, stroke=1, fill=1)
    c.setDash()
    c.setFillColor(accent)
    c.roundRect(x, y + h - 29, w, 29, 8, stroke=0, fill=1)
    c.rect(x, y + h - 29, w, 10, stroke=0, fill=1)
    c.setFillColor(NAVY)
    c.setFont("Helvetica-Bold", title_size)
    c.drawString(x + 11, y + h - 19, title)
    if badge:
        bw = stringWidth(badge, "Helvetica-Bold", 6.5) + 14
        c.setFillColor(NAVY)
        c.roundRect(x + w - bw - 8, y + h - 23, bw, 15, 7, stroke=0, fill=1)
        c.setFillColor(accent)
        c.setFont("Helvetica-Bold", 6.5)
        c.drawCentredString(x + w - bw / 2 - 8, y + h - 18, badge)
    para(body, x + 11, y + 10, w - 22, h - 45, body_style)
    c.restoreState()


def arrow(x1, y1, x2, y2, color=CYAN, label=None, dashed=False, bend=None):
    c.saveState()
    c.setStrokeColor(color)
    c.setFillColor(color)
    c.setLineWidth(1.6)
    if dashed:
        c.setDash(5, 3)
    if bend is None:
        c.line(x1, y1, x2, y2)
        angle = 0 if x2 >= x1 else 180
    else:
        bx, by = bend
        c.line(x1, y1, bx, by)
        c.line(bx, by, x2, y2)
        angle = 90 if y2 >= by else -90
    import math
    a = math.radians(angle)
    size = 6
    p1 = (x2, y2)
    p2 = (x2 - size * math.cos(a - 0.55), y2 - size * math.sin(a - 0.55))
    p3 = (x2 - size * math.cos(a + 0.55), y2 - size * math.sin(a + 0.55))
    c.setDash()
    c.line(p1[0], p1[1], p2[0], p2[1])
    c.line(p1[0], p1[1], p3[0], p3[1])
    if label:
        mx, my = ((x1 + x2) / 2, (y1 + y2) / 2)
        tw = stringWidth(label, "Helvetica-Bold", 6.8) + 10
        c.setFillColor(NAVY)
        c.roundRect(mx - tw / 2, my - 6, tw, 13, 5, stroke=0, fill=1)
        c.setFillColor(color)
        c.setFont("Helvetica-Bold", 6.8)
        c.drawCentredString(mx, my - 2, label)
    c.restoreState()


def pill(x, y, text, color):
    w = stringWidth(text, "Helvetica-Bold", 7) + 16
    c.setFillColor(color)
    c.roundRect(x, y, w, 18, 9, stroke=0, fill=1)
    c.setFillColor(NAVY)
    c.setFont("Helvetica-Bold", 7)
    c.drawCentredString(x + w / 2, y + 6, text)
    return w


def section_label(x, y, number, title, color=CYAN):
    c.setFillColor(color)
    c.circle(x + 13, y + 12, 13, stroke=0, fill=1)
    c.setFillColor(NAVY)
    c.setFont("Helvetica-Bold", 11)
    c.drawCentredString(x + 13, y + 8, str(number))
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 14)
    c.drawString(x + 34, y + 7, title)


# PAGE 1 — boundary map
page_base(
    1,
    "GravelKing Pro — Live Backend Pipeline Architecture",
    "Exact service boundaries, implemented routes, persistence layers, and failure isolation",
)

box(40, 595, 220, 125, "USER SURFACES", 
    "<b>React / Vite web app</b><br/>Mastering Tool • Songwriting Studio • Studio • Library • Protected Lyrics<br/><br/>"
    "<font color='#9DB4C2'>Browser uploads multipart audio or JSON; Clerk/session cookies remain at the Node boundary.</font>",
    BLUE, "BROWSER")
box(325, 565, 300, 155, "NODE.JS / EXPRESS API", 
    "<b>Primary orchestration and policy boundary</b><br/>"
    "• Routes under <font color='#34D5DB'>/api</font><br/>"
    "• Auth, quotas, local validation, hashing, HMAC, DB transactions<br/>"
    "• Spawns local Python MLK for mastering<br/>"
    "• Calls Vertex AI and dedicated Cloud Run services<br/>"
    "• ACR status controls stamping only",
    CYAN, "LIVE API")
box(700, 595, 210, 125, "LOCAL PYTHON DSP", 
    "<b>python/mlk_master.py</b><br/>Morris Law Kernel v3.5<br/>EQ • saturation • sidechain compression • loudness • limiting<br/><br/>"
    "<font color='#F7B955'>Ordinary mastering does not use Cloud Run.</font>",
    AMBER, "SUBPROCESS")
box(970, 595, 180, 125, "VERTEX AI", 
    "<b>Lyria 3 Interactions API</b><br/>Mixed audio generation<br/><br/>"
    "<b>Gemini</b><br/>Prompt safety, lyric screening, transcription fallback",
    PURPLE, "GCP")

arrow(260, 655, 325, 655, BLUE, "HTTPS / JSON")
arrow(625, 655, 700, 655, AMBER, "SPAWN")
arrow(625, 620, 970, 620, PURPLE, "OAUTH / HTTPS")

box(110, 360, 270, 145, "DEDICATED ACRCLOUD GATEWAY", 
    "<b>Python FastAPI • Google Cloud Run</b><br/>"
    "POST <font color='#34D5DB'>/v1/fingerprint/scan</font><br/>"
    "Internal x-api-key + Cloud Run ID token<br/>"
    "12 s / mono / 8 kHz sample<br/>"
    "Signed ACRCloud Identify request (HMAC-SHA1)<br/>"
    "<b>Returns MATCH / NO_MATCH / UNAVAILABLE</b>",
    TEAL, "CLOUD RUN")
box(460, 360, 250, 145, "SEPARATE DEMUCS SERVICE", 
    "<b>Python audio engine • Cloud Run</b><br/>"
    "Stem separation / voice removal endpoints<br/><br/>"
    "<font color='#F7B955'>A different service from ACRCloud. It is not part of Lyria generation or ordinary mastering.</font>",
    AMBER, "CLOUD RUN")
box(790, 360, 280, 145, "PERSISTENCE", 
    "<b>PostgreSQL / Drizzle</b><br/>lyrics, tracks, purchases, certificate denominators<br/>"
    "<b>Object Storage</b><br/>private WAV/MP3; public previews/covers<br/>"
    "<b>Firestore</b><br/>song drafts + asynchronous certificate replica",
    BLUE, "DATA")

arrow(475, 565, 245, 505, TEAL, "STAMP DECISION", bend=(475, 530))
arrow(570, 565, 585, 505, AMBER, "OTHER AUDIO TOOLS", bend=(570, 535))
arrow(625, 590, 930, 505, BLUE, "READ / WRITE", bend=(930, 550))

box(70, 115, 1020, 165, "NON-NEGOTIABLE AVAILABILITY INVARIANT", 
    "<font size='15'><b>Every tool completes independently. ACRCloud can suppress a stamp; it cannot suppress the audio result.</b></font><br/><br/>"
    "<font color='#31C48D'><b>NO_MATCH</b></font> → eligible path creates the dual-anchor certificate and embeds the LSB nominator.<br/>"
    "<font color='#F26B6B'><b>MATCH</b></font> → processing / generation / storage continues; no certificate row, no LSB payload.<br/>"
    "<font color='#F7B955'><b>UNAVAILABLE</b></font> (timeout, 401, 402, 429, 5xx, billing suspension, missing config) → processing / generation / storage continues; no stamp.<br/><br/>"
    "<font color='#9DB4C2'>Ordinary mastering bypasses ACRCloud completely unless the user explicitly requests certification.</font>",
    TEAL, "IMPLEMENTED")

c.showPage()

# PAGE 2 — mastering + lyrics first
page_base(2, "Scenario Pipelines — Upload/Mastering + Original Lyrics", "Exact request paths and branch behavior")
section_label(40, 720, 1, "Audio Upload & Mastering", BLUE)

x = [40, 245, 450, 655, 860, 1065]
box(x[0], 545, 170, 140, "MASTERING TOOL", 
    "Select/drop audio.<br/>Large files may be compressed client-side.<br/><br/>"
    "<b>POST /api/kernel/master</b><br/>multipart/form-data",
    BLUE, "UI")
box(x[1], 545, 170, 140, "NODE INGEST", 
    "Auth / partner key<br/>Rate + concurrency gates<br/>Multer → /tmp<br/>Preset and parameter validation<br/>Usage / export quota",
    CYAN, "EXPRESS")
box(x[2], 545, 170, 140, "FORMAT PRE-PASS", 
    "ffmpeg auto-detect<br/>Normalize → WAV<br/>Duration guard<br/>Optional denoise<br/>Optional 30 s preview",
    CYAN, "LOCAL")
box(x[3], 545, 170, 140, "MLK V3.5", 
    "<b>Local Python subprocess</b><br/>python/mlk_master.py<br/>No Cloud Run fallback<br/>Failure here fails only this master request",
    AMBER, "DSP")
box(x[4], 545, 170, 140, "RESULT", 
    "Valid mastered WAV<br/>Short-lived HMAC download URL<br/>Response headers expose kernel, timing, and certification status",
    BLUE, "HTTP 200")
box(x[5], 545, 90, 140, "PLAY", 
    "In-app playback<br/>WAV download",
    TEAL)
for a, b in zip(x[:-1], x[1:]):
    arrow(a + (170 if a != x[-2] else 170), 615, b, 615, BLUE)

box(245, 365, 785, 120, "CERTIFICATION BRANCH — ONLY WHEN THE MASTERING CHECKBOX SENDS certify=true", 
    "<b>Checkbox:</b> “Certify this as my original work” → also sends <font color='#34D5DB'>author_assertion=true</font> and optional IPI / ISWC / ISRC.<br/>"
    "Local ownership / metadata / signal checks → Node makes 12 s sample → dedicated ACRCloud Cloud Run gateway.<br/>"
    "<font color='#31C48D'><b>NO_MATCH</b>: stamp after MLK.</font> "
    "<font color='#F26B6B'><b>MATCH</b>: master still returns; stamp skipped.</font> "
    "<font color='#F7B955'><b>UNAVAILABLE</b>: master still returns; stamp skipped.</font><br/>"
    "Header: <font color='#34D5DB'>X-GK-Certification = sealed | skipped-acr-match | skipped-acr-unavailable | not-requested</font>",
    TEAL, "FAIL-SOFT")
arrow(330, 545, 330, 485, TEAL, "certify=true")
arrow(945, 485, 945, 545, TEAL, "stamp decision")

section_label(40, 305, 2, "Original Lyrics First", PURPLE)
lx = [40, 250, 460, 670, 880]
box(lx[0], 105, 175, 155, "STAMP MY LYRICS", 
    "Songwriting Studio import panel<br/>User checks human-original certification<br/><br/><b>POST /api/lyrics/import</b>",
    PURPLE, "UI")
box(lx[1], 105, 175, 155, "NORMALIZE + SCREEN", 
    "CRLF → LF<br/>Trim trailing whitespace<br/>Require ≥5 chars<br/>verifyLyrics copyright screen<br/><br/>Screen unavailable is recorded, not fatal",
    PURPLE, "NODE")
box(lx[2], 105, 175, 155, "LYRICAL ANCHOR", 
    "<b>SHA-256(normalized UTF-8)</b><br/>hashAlgorithm = sha256<br/>stampType = imported_human_original<br/>Canonical certification text",
    CYAN, "HASH")
box(lx[3], 105, 175, 155, "POSTGRESQL", 
    "lyric_imports row<br/>Normalized plaintext<br/>contentHash<br/>charCount<br/>certifiedHumanAuthor<br/><b>DB stampedAt</b>",
    BLUE, "DRIZZLE")
box(lx[4], 105, 270, 155, "OWNER-SCOPED RECORD", 
    "<b>GET /api/lyrics/imports</b><br/>Protected Lyrics displays timestamp + hash<br/><br/>No ACRCloud<br/>No audio watermark<br/>This is the durable lyrical possession anchor",
    TEAL, "PERSISTED")
for i in range(4):
    arrow(lx[i] + 175, 182, lx[i + 1], 182, PURPLE)

c.showPage()

# PAGE 3 — generation routes
page_base(3, "Scenario Pipelines — AI Song + Instrumental Generation", "Lyria produces mixed audio; ACRCloud is non-blocking and controls only the stamp")
section_label(40, 720, 3, "Lyrics + AI Instrumental / Song Generation", PURPLE)

box(40, 535, 190, 145, "SONGWRITING STUDIO", 
    "Advanced mode<br/>Verified original lyrics + style prompt<br/><br/>"
    "<b>POST /api/mlk/v35/generate-master</b><br/>vocalMode = lyrics",
    PURPLE, "UI")
box(270, 535, 190, 145, "NODE GATES", 
    "Pro access<br/>Style prompt required<br/>verifyLyrics on client and server<br/>Normalize lyrics<br/><b>SHA-256 lyrical hash</b>",
    CYAN, "EXPRESS")
box(500, 535, 190, 145, "VERTEX LYRIA 3", 
    "Interactions API<br/>Exact normalized lyrics + sanitized style brief<br/>Async polling<br/><b>Returns one mixed audio file</b>",
    PURPLE, "GCP")
box(730, 535, 190, 145, "NORMALIZE + CLASSIFY", 
    "Write temp audio<br/>ffmpeg → WAV<br/>No auto-mastering<br/>Node → dedicated ACRCloud Cloud Run gateway",
    TEAL, "NODE → RUN")
box(960, 535, 190, 145, "VAULT COMMIT", 
    "Always save private WAV / MP3 / preview / cover<br/>tracks + purchased_tracks<br/>Store user lyrics on track<br/>Return trackId to Library",
    BLUE, "ALWAYS")
for a in [230, 460, 690, 920]:
    arrow(a, 607, a + 40, 607, PURPLE)

box(730, 370, 420, 105, "CLASSIFICATION → OPTIONAL STAMP", 
    "<font color='#31C48D'><b>NO_MATCH</b></font> → SHA-256 audio hash → certId → denominator + HMAC in PostgreSQL → nominator in WAV LSBs → Firestore replica.<br/>"
    "<font color='#F26B6B'><b>MATCH</b></font> or <font color='#F7B955'><b>UNAVAILABLE</b></font> → same generated audio is saved and playable, but <b>certId = null</b> and no stamp is emitted.",
    TEAL, "FAIL-SOFT")
arrow(825, 535, 825, 475, TEAL)

box(40, 370, 610, 105, "REQUESTED TERMS THAT ARE NOT LIVE APPLICATION STAGES", 
    "<b>“AI stem generation”:</b> not performed by this route. Lyria returns a single mixed file. Separate Demucs endpoints exist for user-initiated separation.<br/>"
    "<b>“SynthID tagging”:</b> no GravelKing code generates, reads, verifies, or stores SynthID metadata. The app’s implemented provenance mark is the split-key LSB certificate, only after ACRCloud NO_MATCH.<br/>"
    "<b>“Lyrical fusion”:</b> implemented concretely as exact normalized lyrics inserted into the Lyria prompt plus a SHA-256 lyrical hash bound into certificate metadata.",
    AMBER, "EXACT / NO FICTION")

section_label(40, 305, 4, "Pure Instrumental AI Generation", AMBER)
box(40, 110, 190, 145, "GENERATION REQUEST", 
    "Same endpoint<br/><b>vocalMode = instrumental</b><br/>Style prompt only<br/>No lyricId required<br/>No lyrics hash",
    AMBER, "UI")
box(270, 110, 190, 145, "LYRIA BRIEF", 
    "Sanitized style<br/>Explicit: no vocals, singing, spoken words, or humming<br/>Vertex Lyria 3 returns mixed audio",
    PURPLE, "GCP")
box(500, 110, 190, 145, "ACRCLOUD RUNNER", 
    "Node sample → Cloud Run FastAPI<br/>Cloud Run sample → signed ACRCloud Identify API<br/><b>MATCH / NO_MATCH / UNAVAILABLE</b>",
    TEAL, "PYTHON")
box(730, 110, 190, 145, "STAMP DECISION", 
    "<b>NO_MATCH</b> → certificate + LSB<br/><b>MATCH</b> → no stamp<br/><b>UNAVAILABLE</b> → no stamp<br/><br/>Generation never stops here",
    TEAL, "NON-BLOCKING")
box(960, 110, 190, 145, "PRIVATE LIBRARY", 
    "Always persist playable audio and ownership-scoped track row after successful generation/storage<br/>Mastering remains a separate action",
    BLUE, "ALWAYS")
for a in [230, 460, 690, 920]:
    arrow(a, 182, a + 40, 182, AMBER)

c.showPage()

# PAGE 4 — stamping state machine
page_base(4, "Certificate Stamping Engine — Triggers, Gates, and Isolation", "What can request a stamp, what cannot, and exactly how every ACRCloud state resolves")
section_label(40, 720, 5, "Actual UI Triggers", TEAL)

box(40, 535, 250, 150, "MASTERING TOOL CHECKBOX", 
    "<b>“Certify this as my original work”</b><br/>"
    "artifacts/gravelkingpro/src/pages/mastering.tsx<br/><br/>"
    "Adds certify=true + author_assertion=true. This is the only manual audio certification control.",
    TEAL, "CAN STAMP")
box(330, 535, 250, 150, "AI GENERATION", 
    "<b>Generate Track / Instrumental</b><br/>"
    "Songwriting Studio → /api/mlk/v35/generate-master<br/><br/>"
    "Automatic non-blocking ACR classification; stamp only on NO_MATCH.",
    PURPLE, "AUTO DECISION")
box(620, 535, 250, 150, "STUDIO EXPORT / MASTER", 
    "Sends audio + preset/denoise to /api/kernel/master.<br/><br/>"
    "<b>Does not send certify=true.</b><br/>Runs normally with no ACRCloud dependency.",
    BLUE, "NO STAMP")
box(910, 535, 240, 150, "TRACK SUBMISSION / INGEST", 
    "Local ownership / metadata / signal validation may run.<br/><br/>"
    "<b>No commercial scan dependency and no certificate stamp is created by submission itself.</b>",
    AMBER, "NO STAMP")

section_label(40, 455, "A", "Stamp Gate State Machine", CYAN)
box(40, 280, 190, 145, "1. REQUEST", 
    "certify=true master<br/>or generated audio candidate<br/><br/>Ordinary master skips directly to its audio result.",
    CYAN)
box(270, 280, 190, 145, "2. LOCAL GATES", 
    "Author assertion<br/>Metadata strings<br/>ISRC / ISWC patterns<br/>Label markers<br/>Signal uniqueness",
    CYAN)
box(500, 280, 190, 145, "3. ACR GATEWAY", 
    "ID token + x-api-key<br/>12-second sample<br/>HMAC-SHA1 provider request<br/>Typed classification",
    TEAL)
box(730, 340, 185, 85, "NO_MATCH", 
    "Eligible for certificate creation and LSB embedding.",
    TEAL, "STAMP")
box(730, 240, 185, 85, "MATCH", 
    "Audio result continues.<br/>No stamp.",
    RED, "CONTINUE")
box(730, 160, 185, 85, "UNAVAILABLE", 
    "Audio result continues.<br/>No stamp.",
    AMBER, "CONTINUE")
box(970, 280, 180, 145, "4. OUTPUT", 
    "Master WAV or generated vault track always survives ACR branch.<br/><br/>UI receives sealed / skipped status.",
    BLUE, "HTTP / VAULT")
arrow(230, 352, 270, 352, CYAN)
arrow(460, 352, 500, 352, CYAN)
arrow(690, 352, 730, 382, TEAL)
arrow(690, 352, 730, 282, RED)
arrow(690, 352, 730, 202, AMBER)
arrow(915, 382, 970, 352, TEAL)
arrow(915, 282, 970, 332, RED)
arrow(915, 202, 970, 312, AMBER)

box(40, 35, 650, 115, "SEALED CERTIFICATE PAYLOAD — ONLY AFTER NO_MATCH", 
    "<b>contentHash</b> = SHA-256(pre-master or generated WAV bytes)<br/>"
    "<b>fullHash</b> = SHA-256(contentHash | artist | certId)<br/>"
    "<b>nominator</b> = first 32 hex chars → embedded in WAV LSBs<br/>"
    "<b>denominator</b> = final 32 hex chars → PostgreSQL only<br/>"
    "<b>handshake</b> = HMAC-SHA256(certId | nominator | denominator, SESSION_SECRET)<br/>"
    "Optional IPI / ISWC / ISRC bind to standalone mastering certificate records.",
    TEAL, "SPLIT KEY", body_style=SMALL)
box(730, 35, 420, 115, "PRIMARY CODE REFERENCES",
    "<font size='7'>"
    "<b>Mastering:</b> routes/master.ts • pages/mastering.tsx • python/mlk_master.py<br/>"
    "<b>Validation:</b> middlewares/validateAssetIngestion.ts<br/>"
    "<b>ACR Node client:</b> lib/commercialFingerprint.ts<br/>"
    "<b>ACR Cloud Run:</b> cloud-run/fingerprint-api/main.py + acrcloud.py<br/>"
    "<b>Lyrics:</b> routes/lyrics.ts • pages/songwriting.tsx • protected-lyrics.tsx<br/>"
    "<b>Generation:</b> routes/mlkGenerate.ts • services/mlkOrchestrator.ts<br/>"
    "<b>Stores:</b> @workspace/db schemas • lib/objectStorage.ts • lib/firestore.ts<br/>"
    "<b>Separate stems:</b> demucsCloudRun.ts + Python audio engine endpoints"
    "</font>",
    BLUE, "SOURCE MAP", body_style=SMALL)

c.showPage()
c.save()
print(OUT)