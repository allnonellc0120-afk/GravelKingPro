// GravelKing Productions — branded document preamble (pandoc-typst pipeline)
#let brand-dark = rgb("#0B3B2E")
#let brand-green = rgb("#059669")
#let brand-green-deep = rgb("#065F46")
#let ink = rgb("#1F2937")
#let ink-muted = rgb("#6B7280")
#let hairline = rgb("#E5E7EB")

#let horizontalrule = block(above: 1.2em, below: 1.2em, line(length: 100%, stroke: 0.5pt + hairline))

#set page(
  paper: "us-letter",
  margin: (top: 2.6cm, bottom: 2.8cm, left: 2.3cm, right: 2.3cm),
  header: context {
    if counter(page).get().first() > 1 [
      #grid(columns: (1fr, auto),
        text(size: 8pt, fill: ink-muted, tracking: 0.08em)[#upper[__DOCTITLE__]],
        text(size: 8pt, fill: brand-green)[GravelKing Productions]
      )
      #v(-0.4em)
      #line(length: 100%, stroke: 0.5pt + hairline)
    ]
  },
  footer: context [
    #line(length: 100%, stroke: 0.5pt + hairline)
    #v(-0.35em)
    #grid(columns: (1fr, auto),
      text(size: 8pt, fill: ink-muted)[GravelKing Productions — Morris Law Kernel v3.5],
      text(size: 8pt, fill: ink-muted)[Page #counter(page).display("1 of 1", both: true)]
    )
  ]
)

#set text(font: ("Inter", "DejaVu Sans"), size: 10.2pt, fill: ink)
#set par(justify: false, leading: 0.66em, spacing: 1.05em)
#set list(indent: 1em, spacing: 0.75em)
#set enum(indent: 1em, spacing: 0.75em)

#show heading.where(level: 1): it => block(above: 1.7em, below: 0.75em)[
  #text(size: 15pt, weight: "bold", fill: brand-dark)[#it.body]
]
#show heading.where(level: 2): it => block(above: 1.5em, below: 0.65em)[
  #text(size: 12.5pt, weight: "bold", fill: brand-green-deep)[#it.body]
]
#show heading.where(level: 3): it => block(above: 1.3em, below: 0.55em)[
  #text(size: 11pt, weight: "semibold", fill: ink)[#it.body]
]
#show link: set text(fill: brand-green)
#show table: set table(stroke: 0.5pt + hairline, inset: 6.5pt)
#show table.cell.where(y: 0): set text(weight: "bold", fill: brand-green-deep, size: 9.5pt)
#show table.cell: set text(size: 9.5pt)
#show raw.where(block: true): it => block(
  width: 100%, fill: rgb("#F3F4F6"), inset: 9pt, radius: 3pt,
  text(size: 8.5pt, font: ("DejaVu Sans Mono", "Liberation Mono"), it)
)
#show raw.where(block: false): set text(size: 9pt, font: ("DejaVu Sans Mono", "Liberation Mono"))
#show quote.where(block: true): it => block(inset: (left: 1em), text(fill: ink-muted, it))

// ---- Title block ----
#block[
  #text(size: 9pt, weight: "semibold", fill: brand-green, tracking: 0.16em)[GRAVELKING PRODUCTIONS]
  #v(0.5em)
  #text(size: 21pt, weight: "bold", fill: brand-dark)[__DOCTITLE__]
  #v(0.55em)
  #line(length: 4.8cm, stroke: 2.2pt + brand-green)
  #v(0.5em)
  #text(size: 9.5pt, fill: ink-muted)[Morris Law Kernel v3.5 + IP Protection System · Kevin Morris · July 2026]
]
#v(1.1em)
