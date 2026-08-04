from __future__ import annotations

import datetime as dt
import os
import textwrap
import zipfile
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "deliverables"
OUT.mkdir(parents=True, exist_ok=True)

NAVY = colors.HexColor("#0B132B")
BLUE = colors.HexColor("#2563EB")
CYAN = colors.HexColor("#06B6D4")
GREEN = colors.HexColor("#16A34A")
AMBER = colors.HexColor("#D97706")
RED = colors.HexColor("#DC2626")
SLATE = colors.HexColor("#475569")
LIGHT = colors.HexColor("#F1F5F9")
PALE_BLUE = colors.HexColor("#EFF6FF")
PALE_GREEN = colors.HexColor("#F0FDF4")
PALE_AMBER = colors.HexColor("#FFFBEB")
PALE_RED = colors.HexColor("#FEF2F2")

TODAY = "August 4, 2026"


def p(text: str, style: ParagraphStyle) -> Paragraph:
    return Paragraph(text, style)


def make_styles():
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle(
            "TitleGK", parent=base["Title"], fontName="Helvetica-Bold",
            fontSize=32, leading=37, textColor=colors.white, alignment=TA_LEFT,
            spaceAfter=5,
        ),
        "subtitle": ParagraphStyle(
            "SubtitleGK", parent=base["Normal"], fontName="Helvetica",
            fontSize=16, leading=20, textColor=colors.HexColor("#D7E3F4"),
        ),
        "h1": ParagraphStyle(
            "H1GK", parent=base["Heading1"], fontName="Helvetica-Bold",
            fontSize=28, leading=33, textColor=NAVY, spaceBefore=8, spaceAfter=9,
        ),
        "h2": ParagraphStyle(
            "H2GK", parent=base["Heading2"], fontName="Helvetica-Bold",
            fontSize=19, leading=23, textColor=NAVY, spaceBefore=4, spaceAfter=5,
        ),
        "body": ParagraphStyle(
            "BodyGK", parent=base["BodyText"], fontName="Helvetica",
            fontSize=17, leading=23, textColor=colors.HexColor("#1E293B"),
            spaceAfter=7,
        ),
        "small": ParagraphStyle(
            "SmallGK", parent=base["BodyText"], fontName="Helvetica",
            fontSize=11, leading=14, textColor=SLATE,
        ),
        "small_white": ParagraphStyle(
            "SmallWhiteGK", parent=base["BodyText"], fontName="Helvetica",
            fontSize=11, leading=14, textColor=colors.white,
        ),
        "metric": ParagraphStyle(
            "MetricGK", parent=base["BodyText"], fontName="Helvetica-Bold",
            fontSize=34, leading=39, textColor=NAVY, alignment=TA_CENTER,
        ),
        "metric_label": ParagraphStyle(
            "MetricLabelGK", parent=base["BodyText"], fontName="Helvetica",
            fontSize=14, leading=17, textColor=SLATE, alignment=TA_CENTER,
        ),
        "table": ParagraphStyle(
            "TableGK", parent=base["BodyText"], fontName="Helvetica",
            fontSize=15, leading=19, textColor=colors.HexColor("#1E293B"),
        ),
        "table_bold": ParagraphStyle(
            "TableBoldGK", parent=base["BodyText"], fontName="Helvetica-Bold",
            fontSize=15, leading=19, textColor=NAVY,
        ),
        "callout": ParagraphStyle(
            "CalloutGK", parent=base["BodyText"], fontName="Helvetica-Bold",
            fontSize=19, leading=25, textColor=NAVY,
        ),
    }


STYLES = make_styles()


def header_footer(canv: canvas.Canvas, doc):
    canv.saveState()
    width, height = landscape(A4)
    canv.setFillColor(NAVY)
    canv.rect(0, height - 4 * mm, width, 4 * mm, fill=1, stroke=0)
    canv.setStrokeColor(colors.HexColor("#CBD5E1"))
    canv.line(18 * mm, 14 * mm, width - 18 * mm, 14 * mm)
    canv.setFont("Helvetica", 7)
    canv.setFillColor(SLATE)
    canv.drawString(18 * mm, 8.5 * mm, "GravelKing Pro • MLK v3.5 • Joel meeting brief")
    canv.drawRightString(width - 18 * mm, 8.5 * mm, f"{doc.page}")
    canv.restoreState()


def hero(title: str, subtitle: str):
    data = [[p(title, STYLES["title"])], [p(subtitle, STYLES["subtitle"])]]
    t = Table(data, colWidths=[265 * mm], rowHeights=[22 * mm, 19 * mm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), NAVY),
        ("LEFTPADDING", (0, 0), (-1, -1), 10 * mm),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10 * mm),
        ("TOPPADDING", (0, 0), (-1, 0), 8 * mm),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 0),
        ("TOPPADDING", (0, 1), (-1, 1), 0),
        ("BOTTOMPADDING", (0, 1), (-1, 1), 7 * mm),
    ]))
    return t


def metric_cards():
    cards = [
        ("1,000/1,000", "health checks returned HTTP 200", PALE_GREEN),
        ("500/500", "MLK v3 requests returned HTTP 200", PALE_GREEN),
        ("74/74", "automated API checks passed", PALE_GREEN),
        ("3 lanes", "current mastering concurrency cap", PALE_AMBER),
    ]
    row = []
    for value, label, bg in cards:
        row.append(Table(
            [[p(value, STYLES["metric"])], [p(label, STYLES["metric_label"])]],
            colWidths=[61 * mm], rowHeights=[17 * mm, 18 * mm],
            style=TableStyle([
                ("BACKGROUND", (0, 0), (-1, -1), bg),
                ("BOX", (0, 0), (-1, -1), 0.6, colors.HexColor("#CBD5E1")),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), 2 * mm),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 2 * mm),
            ]),
        ))
    outer = Table([row], colWidths=[65 * mm] * 4)
    outer.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))
    return outer


def bullet(text: str):
    return p(f"• {text}", STYLES["body"])


def build_readiness_pdf():
    path = OUT / "joel-api-readiness-and-load-test-report.pdf"
    doc = SimpleDocTemplate(
        str(path), pagesize=landscape(A4), rightMargin=16 * mm, leftMargin=16 * mm,
        topMargin=15 * mm, bottomMargin=18 * mm, title="GravelKing Pro API Readiness and Load Test Report",
        author="GravelKing Productions",
    )
    story = [
        hero(
            "API Readiness & Load-Test Report",
            f"GravelKing Pro / Morris Law Kernel v3.5 • Prepared {TODAY} for the Joel integration meeting",
        ),
        Spacer(1, 9 * mm),
        metric_cards(),
        Spacer(1, 11 * mm),
        p("Executive readout", STYLES["h1"]),
        p(
            "<b>The core is healthy and measured.</b><br/>"
            "The public API is live. Controlled tests passed across health, MLK processing, malformed input, and missing routes.",
            STYLES["body"],
        ),
        Spacer(1, 4 * mm),
        Table(
            [[p("<b>GO</b><br/>Core health and load evidence", STYLES["table"]),
              p("<b>HOLD</b><br/>Partner credential handoff", STYLES["table"])]],
            colWidths=[125 * mm, 125 * mm],
            style=TableStyle([
                ("BACKGROUND", (0, 0), (0, 0), PALE_GREEN),
                ("BACKGROUND", (1, 0), (1, 0), PALE_RED),
                ("BOX", (0, 0), (-1, -1), 0.6, colors.HexColor("#CBD5E1")),
                ("INNERGRID", (0, 0), (-1, -1), 0.6, colors.HexColor("#CBD5E1")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 5 * mm),
                ("RIGHTPADDING", (0, 0), (-1, -1), 5 * mm),
                ("TOPPADDING", (0, 0), (-1, -1), 4 * mm),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4 * mm),
            ]),
        ),
        Spacer(1, 3 * mm),
        p("The partner handoff gates are simple: publish <b>/api/v1/ingest</b>, hard-gate <b>x-api-key</b>, and run one real production smoke test before issuing a credential.", STYLES["body"]),
        PageBreak(),
        hero(
            "What we tested",
            "Controlled traffic results • clear handling of valid, invalid, and unknown requests",
        ),
        Spacer(1, 9 * mm),
    ]

    test_rows = [
        [p("Test", STYLES["table_bold"]), p("Observed result", STYLES["table_bold"]), p("Meaning", STYLES["table_bold"])],
        [p("Health endpoint", STYLES["table"]), p("<b>1,000 / 1,000 HTTP 200</b>", STYLES["table"]), p("No failed health requests in the controlled run.", STYLES["table"])],
        [p("MLK v3 processing", STYLES["table"]), p("<b>500 / 500 HTTP 200</b>", STYLES["table"]), p("Kernel processing route stayed available under the test load.", STYLES["table"])],
        [p("Raw processing baseline", STYLES["table"]), p("<b>1,000 / 1,000 HTTP 200</b>", STYLES["table"]), p("Baseline API request handling remained stable.", STYLES["table"])],
        [p("Invalid payloads", STYLES["table"]), p("<b>200 / 200 HTTP 400</b>", STYLES["table"]), p("Bad requests were rejected cleanly, not as server crashes.", STYLES["table"])],
        [p("Missing routes", STYLES["table"]), p("<b>200 / 200 HTTP 404</b>", STYLES["table"]), p("Unknown paths failed predictably.", STYLES["table"])],
        [p("After-load health", STYLES["table"]), p("<b>HTTP 200</b>", STYLES["table"]), p("The service remained healthy after traffic stopped.", STYLES["table"])],
    ]
    story.append(Table(test_rows, colWidths=[75 * mm, 74 * mm, 102 * mm], repeatRows=1, style=TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), LIGHT),
        ("BOX", (0, 0), (-1, -1), 0.6, colors.HexColor("#CBD5E1")),
        ("INNERGRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#E2E8F0")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 3 * mm),
        ("RIGHTPADDING", (0, 0), (-1, -1), 3 * mm),
        ("TOPPADDING", (0, 0), (-1, -1), 4 * mm),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4 * mm),
    ])))
    story.extend([
        Spacer(1, 7 * mm),
        p("Automated API verification", STYLES["h1"]),
        p("<b>74 passed checks. 0 failures.</b> 17 technical-brief checks • 16 studio/MLK checks • 20 pricing checks • 21 download-security checks.", STYLES["body"]),
        PageBreak(),
        hero(
            "Partner stress result",
            "The system applies deliberate back-pressure instead of crashing under excess concurrent mastering work",
        ),
        Spacer(1, 12 * mm),
        Table(
            [[p("<b>3</b><br/>Requests processed", STYLES["metric"]), p("<b>27</b><br/>Clean HTTP 503 responses", STYLES["metric"]), p("<b>3</b><br/>Active mastering lanes", STYLES["metric"])]],
            colWidths=[83 * mm, 83 * mm, 83 * mm],
            style=TableStyle([
                ("BACKGROUND", (0, 0), (0, 0), PALE_GREEN),
                ("BACKGROUND", (1, 0), (1, 0), PALE_AMBER),
                ("BACKGROUND", (2, 0), (2, 0), PALE_BLUE),
                ("BOX", (0, 0), (-1, -1), 0.6, colors.HexColor("#CBD5E1")),
                ("INNERGRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#E2E8F0")),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 4 * mm),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4 * mm),
                ("TOPPADDING", (0, 0), (-1, -1), 9 * mm),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 9 * mm),
            ]),
        ),
        Spacer(1, 10 * mm),
        p("<b>Interpretation:</b> the service refused excess simultaneous work cleanly. This protects CPU and memory. It is not a crash.", STYLES["body"]),
        p("<b>Honest boundary:</b> a three-lane synchronous service is not yet a durable 500-track batch queue. It needs job IDs, retries, idempotency, status, and callbacks before a production 500-track promise.", STYLES["body"]),
        PageBreak(),
        hero(
            "How the IP diff / verification works",
            "The system does not use Diffie–Hellman. It uses a split-proof record tied to the audio bytes.",
        ),
        Spacer(1, 10 * mm),
        p("How we know what changed", STYLES["h1"]),
        p(
            "A certified track receives a <b>SHA-256 content fingerprint</b> and two linked anchors.<br/>"
            "<b>Anchor A</b> is embedded in lossless WAV/PCM audio. <b>Anchor B</b> stays on the server. "
            "An <b>HMAC-SHA256</b> binding proves the two anchors belong to the same certificate.",
            STYLES["body"],
        ),
        Table(
            [[p("<b>Step</b>", STYLES["table_bold"]), p("<b>What happens</b>", STYLES["table_bold"]), p("<b>Result</b>", STYLES["table_bold"])],
             [p("1. Read", STYLES["table_bold"]), p("Extract the embedded Anchor A and certificate ID from the submitted signal.", STYLES["table"]), p("If absent: NO_WATERMARK.", STYLES["table"])],
             [p("2. Hash", STYLES["table_bold"]), p("Hash the received bytes and compare them with the stored certificate record.", STYLES["table"]), p("A changed file produces a different fingerprint.", STYLES["table"])],
             [p("3. Bind", STYLES["table_bold"]), p("Recompute the server-side HMAC using the hidden Anchor B and extracted Anchor A.", STYLES["table"]), p("Only the server can produce the valid binding.", STYLES["table"])],
             [p("4. Verdict", STYLES["table_bold"]), p("Return a structured result for the partner or investigator.", STYLES["table"]), p("INTACT, TAMPERED, or NO_WATERMARK.", STYLES["table"])]],
            colWidths=[40 * mm, 145 * mm, 66 * mm],
            style=TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), LIGHT),
                ("BOX", (0, 0), (-1, -1), 0.6, colors.HexColor("#CBD5E1")),
                ("INNERGRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#E2E8F0")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 3 * mm),
                ("RIGHTPADDING", (0, 0), (-1, -1), 3 * mm),
                ("TOPPADDING", (0, 0), (-1, -1), 5 * mm),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5 * mm),
            ]),
        ),
        Spacer(1, 4 * mm),
        p("A certificate validates the issued signal and stored provenance chain. It is not, by itself, a court ruling or a guarantee of legal ownership.", STYLES["small"]),
        PageBreak(),
        hero(
            "Measured speed vs. capacity plan",
            "Keep the observed evidence separate from the projected partner pilot",
        ),
        Spacer(1, 10 * mm),
        p("Measured now", STYLES["h1"]),
        p(
            "<b>109× realtime</b> was measured as a separate DSP benchmark on commodity CPU hardware. "
            "That is not an end-to-end API service-level agreement. The current API has <b>3 active mastering lanes</b>.",
            STYLES["body"],
        ),
        p("Projected pilot", STYLES["h1"]),
        Table(
            [[p("<b>Planning case</b>", STYLES["table_bold"]), p("<b>Illustrative estimate</b>", STYLES["table_bold"]), p("<b>Status</b>", STYLES["table_bold"])],
             [p("500 tracks at 3 concurrent lanes", STYLES["table"]), p("At an 8–45 second mastering range: roughly 22–125 minutes, before retries, upload time, and queue overhead.", STYLES["table"]), p("Projection only — validate with Joel's real track mix.", STYLES["table"])],
             [p("Controlled partner pilot", STYLES["table"]), p("Start with 10 tracks, then 50, then 100; observe p50/p95 duration, errors, CPU, memory, and queue depth.", STYLES["table"]), p("Recommended next step.", STYLES["table"])],
             [p("500-track production batch", STYLES["table"]), p("Use a queue, durable job IDs, retries, idempotency, status polling, and optional callbacks before promising this.", STYLES["table"]), p("Not ready today.", STYLES["table"])]],
            colWidths=[72 * mm, 126 * mm, 53 * mm],
            style=TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), LIGHT),
                ("BACKGROUND", (2, 1), (2, 1), PALE_AMBER),
                ("BACKGROUND", (2, 2), (2, 2), PALE_GREEN),
                ("BACKGROUND", (2, 3), (2, 3), PALE_RED),
                ("BOX", (0, 0), (-1, -1), 0.6, colors.HexColor("#CBD5E1")),
                ("INNERGRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#E2E8F0")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 3 * mm),
                ("RIGHTPADDING", (0, 0), (-1, -1), 3 * mm),
                ("TOPPADDING", (0, 0), (-1, -1), 5 * mm),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5 * mm),
            ]),
        ),
        PageBreak(),
        hero(
            "Joel handoff checklist",
            "Use this page as the meeting close: agree on the pilot, then finish the production handoff gates.",
        ),
        Spacer(1, 10 * mm),
    ])
    checklist = [
        ["✓", "Evidence", "Show the 1,000/1,000 health result, 500/500 MLK result, and 74/74 API checks."],
        ["✓", "Explain the diff", "Walk through Anchor A in the audio, Anchor B on the server, SHA-256, HMAC, and the three verdicts."],
        ["□", "Publish", "Publish the source containing POST /api/v1/ingest and POST /api/v1/verify."],
        ["□", "Secure", "Make x-api-key a hard gate and verify no-key / wrong-key requests fail before audio processing."],
        ["□", "Smoke test", "Run one real production audio file with a valid partner key; confirm output headers and certificate behavior."],
        ["□", "Pilot limits", "Agree on 10 → 50 → 100 tracks first; measure p50/p95 latency, errors, CPU, memory, and queue depth."],
        ["□", "Scale plan", "Add queueing, retries, idempotency, job status, and callbacks before a 500-track production promise."],
    ]
    rows = [[p("<b>State</b>", STYLES["table_bold"]), p("<b>Meeting item</b>", STYLES["table_bold"]), p("<b>What to say / confirm</b>", STYLES["table_bold"])]]
    for mark, name, detail in checklist:
        state_style = ParagraphStyle("state", parent=STYLES["table_bold"], textColor=GREEN if mark == "✓" else AMBER, fontSize=13, alignment=TA_CENTER)
        rows.append([p(mark, state_style), p(f"<b>{name}</b>", STYLES["table"]), p(detail, STYLES["table"])])
    story.append(Table(rows, colWidths=[18 * mm, 39 * mm, 109 * mm], repeatRows=1, style=TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), LIGHT),
        ("BOX", (0, 0), (-1, -1), 0.6, colors.HexColor("#CBD5E1")),
        ("INNERGRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#E2E8F0")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (0, 1), (0, -1), "CENTER"),
        ("LEFTPADDING", (0, 0), (-1, -1), 3 * mm),
        ("RIGHTPADDING", (0, 0), (-1, -1), 3 * mm),
        ("TOPPADDING", (0, 0), (-1, -1), 3.3 * mm),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3.3 * mm),
    ])))
    story.extend([
        Spacer(1, 7 * mm),
        Table([[p(
            "<b>Suggested opening:</b> “The core is already tested: 1,000 of 1,000 health requests, 500 of 500 MLK "
            "processing requests, and 74 of 74 automated checks passed. What I want to agree with you today is the controlled "
            "partner pilot and the final production handoff gates—not pretend that a three-lane synchronous service is already a 500-track queue.”",
            STYLES["callout"],
        )]], colWidths=[166 * mm], style=TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), PALE_BLUE),
            ("BOX", (0, 0), (-1, -1), 1, BLUE),
            ("LEFTPADDING", (0, 0), (-1, -1), 6 * mm),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6 * mm),
            ("TOPPADDING", (0, 0), (-1, -1), 5 * mm),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5 * mm),
        ])),
        Spacer(1, 5 * mm),
        p("Source note: results are from controlled workspace/API tests and production endpoint probes available on August 4, 2026. Projection figures are explicitly labeled estimates and must be re-measured with the partner's real workload.", STYLES["small"]),
    ])
    doc.build(story, onFirstPage=header_footer, onLaterPages=header_footer)
    return path


def xml_text(text: str, x: int, y: int, w: int, h: int, size: int = 1800,
             color: str = "FFFFFF", bold: bool = False, align: str = "l") -> str:
    font = "Aptos Display" if bold else "Aptos"
    bold_flag = "1" if bold else "0"
    paras = []
    for line in text.split("\n"):
        paras.append(
            f'<a:p><a:pPr algn="{align}"/><a:r><a:rPr lang="en-US" sz="{size}" b="{bold_flag}">'
            f'<a:solidFill><a:srgbClr val="{color}"/></a:solidFill><a:latin typeface="{font}"/></a:rPr>'
            f'<a:t>{escape(line)}</a:t></a:r></a:p>'
        )
    joined_paras = "".join(paras)
    return (
        f'<p:sp><p:nvSpPr><p:cNvPr id="{abs(hash((text, x, y))) % 100000}" name="TextBox"/>'
        f'<p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="{x}" y="{y}"/>'
        f'<a:ext cx="{w}" cy="{h}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom>'
        f'<a:noFill/><a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr wrap="square"/>'
        f'<a:lstStyle/>{joined_paras}</p:txBody></p:sp>'
    )


def pptx_slide_xml() -> str:
    # 16:9 slide, dimensions are EMU.
    W, H = 12192000, 6858000
    shapes = []
    shapes.append(
        f'<p:sp><p:nvSpPr><p:cNvPr id="2" name="Background"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>'
        f'<p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="{W}" cy="{H}"/></a:xfrm>'
        f'<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="0B132B"/></a:solidFill>'
        f'<a:ln><a:noFill/></a:ln></p:spPr></p:sp>'
    )
    shapes.append(
        f'<p:sp><p:nvSpPr><p:cNvPr id="3" name="Accent"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>'
        f'<p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="180000" cy="{H}"/></a:xfrm>'
        f'<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="06B6D4"/></a:solidFill>'
        f'<a:ln><a:noFill/></a:ln></p:spPr></p:sp>'
    )
    shapes.append(xml_text("THE JOEL MEETING", 650000, 420000, 5000000, 300000, 1700, "67E8F9", True))
    shapes.append(xml_text("The core is tested.\nThe partner handoff is the decision.", 650000, 850000, 9000000, 1600000, 3700, "FFFFFF", True))
    shapes.append(xml_text("GravelKing Pro  •  Morris Law Kernel v3.5  •  August 4, 2026", 680000, 2650000, 8000000, 300000, 1450, "CBD5E1"))
    cards = [
        (650000, "1,000 / 1,000", "health checks • HTTP 200", "16A34A"),
        (3150000, "500 / 500", "MLK v3 requests • HTTP 200", "16A34A"),
        (5650000, "74 / 74", "automated API checks passed", "16A34A"),
    ]
    for x, value, label, accent in cards:
        shapes.append(
            f'<p:sp><p:nvSpPr><p:cNvPr id="{10 + x}" name="MetricCard"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>'
            f'<p:spPr><a:xfrm><a:off x="{x}" y="3300000"/><a:ext cx="2200000" cy="1350000"/></a:xfrm>'
            f'<a:prstGeom prst="roundRect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="F0FDF4"/></a:solidFill>'
            f'<a:ln w="10000"><a:solidFill><a:srgbClr val="CBD5E1"/></a:solidFill></a:ln></p:spPr></p:sp>'
        )
        shapes.append(xml_text(value, x + 100000, 3550000, 2000000, 400000, 3000, "0B132B", True, "ctr"))
        shapes.append(xml_text(label, x + 100000, 4060000, 2000000, 300000, 1250, "475569", False, "ctr"))
    shapes.append(xml_text("The honest close", 650000, 5000000, 3000000, 300000, 1750, "67E8F9", True))
    shapes.append(xml_text(
        "Controlled load is green. Current mastering is capped at 3 concurrent jobs. "
        "Before credentials: publish /api/v1/ingest, hard-gate x-api-key, run one real production smoke test, "
        "then pilot 10 → 50 → 100 tracks before promising a 500-track queue.",
        650000, 5350000, 10500000, 850000, 1900, "FFFFFF", False
    ))
    shapes.append(xml_text("Opening line: “I can show you what is measured, what is protected, and exactly what we will validate next.”", 650000, 6350000, 10500000, 250000, 1200, "CBD5E1"))
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
        'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">'
        '<p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>'
        + "".join(shapes)
        + '</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>'
    )


def write_pptx(path: Path):
    files = {
        "[Content_Types].xml": """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
<Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>""",
        "_rels/.rels": """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>""",
        "ppt/presentation.xml": """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" saveSubsetFonts="1" autoCompressPictures="0">
<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>
<p:sldIdLst><p:sldId id="256" r:id="rId2"/></p:sldIdLst>
<p:sldSz cx="12192000" cy="6858000" type="screen16x9"/><p:notesSz cx="6858000" cy="9144000"/>
</p:presentation>""",
        "ppt/_rels/presentation.xml.rels": """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>
</Relationships>""",
        "ppt/slideMasters/slideMaster1.xml": """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
<p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr></p:spTree></p:cSld>
<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>
<p:sldLayoutIdLst><p:sldLayoutId id="1" r:id="rId1"/></p:sldLayoutIdLst></p:sldMaster>""",
        "ppt/slideMasters/_rels/slideMaster1.xml.rels": """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>
</Relationships>""",
        "ppt/slideLayouts/slideLayout1.xml": """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank"><p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>""",
        "ppt/slideLayouts/_rels/slideLayout1.xml.rels": """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>""",
        "ppt/slides/slide1.xml": pptx_slide_xml(),
        "ppt/slides/_rels/slide1.xml.rels": """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>""",
        "ppt/theme/theme1.xml": """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="GravelKing"><a:themeElements><a:clrScheme name="GravelKing"><a:dk1><a:srgbClr val="0B132B"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="475569"/></a:dk2><a:lt2><a:srgbClr val="F1F5F9"/></a:lt2><a:accent1><a:srgbClr val="2563EB"/></a:accent1><a:accent2><a:srgbClr val="06B6D4"/></a:accent2><a:accent3><a:srgbClr val="16A34A"/></a:accent3><a:accent4><a:srgbClr val="D97706"/></a:accent4><a:accent5><a:srgbClr val="DC2626"/></a:accent5><a:accent6><a:srgbClr val="CBD5E1"/></a:accent6><a:hlink><a:srgbClr val="2563EB"/></a:hlink><a:folHlink><a:srgbClr val="7C3AED"/></a:folHlink></a:clrScheme><a:fontScheme name="GravelKing"><a:majorFont><a:latin typeface="Aptos Display"/></a:majorFont><a:minorFont><a:latin typeface="Aptos"/></a:minorFont></a:fontScheme><a:fmtScheme name="GravelKing"><a:fillStyleLst/><a:lnStyleLst/><a:effectStyleLst/><a:bgFillStyleLst/></a:fmtScheme></a:themeElements></a:theme>""",
        "docProps/core.xml": f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Joel Meeting Opening — GravelKing Pro API</dc:title><dc:creator>GravelKing Productions</dc:creator><dc:date>2026-08-04T00:00:00Z</dc:date></cp:coreProperties>""",
        "docProps/app.xml": """<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>GravelKing Productions</Application><PresentationFormat>Widescreen</PresentationFormat><Slides>1</Slides></Properties>""",
    }
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        for name, content in files.items():
            z.writestr(name, content)


def build_opening_pdf():
    path = OUT / "joel-meeting-opening-one-page.pdf"
    c = canvas.Canvas(str(path), pagesize=landscape(A4))
    W, H = landscape(A4)
    c.setFillColor(NAVY)
    c.rect(0, 0, W, H, fill=1, stroke=0)
    c.setFillColor(CYAN)
    c.rect(0, 0, 7 * mm, H, fill=1, stroke=0)
    c.setFillColor(colors.HexColor("#67E8F9"))
    c.setFont("Helvetica-Bold", 15)
    c.drawString(22 * mm, H - 22 * mm, "THE JOEL MEETING")
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 38)
    c.drawString(22 * mm, H - 42 * mm, "The core is tested.")
    c.drawString(22 * mm, H - 59 * mm, "The partner handoff is the decision.")
    c.setFillColor(colors.HexColor("#CBD5E1"))
    c.setFont("Helvetica", 14)
    c.drawString(22 * mm, H - 76 * mm, "GravelKing Pro  •  Morris Law Kernel v3.5  •  August 4, 2026")
    x0, y0, cw, ch, gap = 22 * mm, H - 142 * mm, 77 * mm, 42 * mm, 9 * mm
    for i, (value, label) in enumerate([
        ("1,000 / 1,000", "health checks • HTTP 200"),
        ("500 / 500", "MLK v3 requests • HTTP 200"),
        ("74 / 74", "automated API checks passed"),
    ]):
        x = x0 + i * (cw + gap)
        c.setFillColor(colors.HexColor("#F0FDF4"))
        c.roundRect(x, y0, cw, ch, 3 * mm, fill=1, stroke=0)
        c.setFillColor(NAVY)
        c.setFont("Helvetica-Bold", 28)
        c.drawCentredString(x + cw / 2, y0 + 26 * mm, value)
        c.setFillColor(SLATE)
        c.setFont("Helvetica", 12)
        c.drawCentredString(x + cw / 2, y0 + 13 * mm, label)
    c.setFillColor(colors.HexColor("#67E8F9"))
    c.setFont("Helvetica-Bold", 15)
    c.drawString(22 * mm, 62 * mm, "THE HONEST CLOSE")
    c.setFillColor(colors.white)
    c.setFont("Helvetica", 16)
    text = c.beginText(22 * mm, 49 * mm)
    text.setLeading(21)
    for line in textwrap.wrap(
        "Controlled load is green. Current mastering is capped at 3 concurrent jobs. Before credentials: publish /api/v1/ingest, hard-gate x-api-key, run one real production smoke test, then pilot 10 → 50 → 100 tracks before promising a 500-track queue.",
        width=104,
    ):
        text.textLine(line)
    c.drawText(text)
    c.setFillColor(colors.HexColor("#CBD5E1"))
    c.setFont("Helvetica", 10)
    c.drawString(22 * mm, 12 * mm, "Opening line: “I can show you what is measured, what is protected, and exactly what we will validate next.”")
    c.save()
    return path


if __name__ == "__main__":
    pdf = build_readiness_pdf()
    opening_pdf = build_opening_pdf()
    pptx = OUT / "joel-meeting-opening-one-page.pptx"
    write_pptx(pptx)
    print(pdf)
    print(opening_pdf)
    print(pptx)