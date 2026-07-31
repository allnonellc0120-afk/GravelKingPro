---
name: Two distinct "MLK v3.5" products
description: Naming collision between the audio Morris Law Kernel and the matrix-multiplication licensing site
---

The repo contains TWO unrelated products both branded "MLK v3.5":

1. **Morris Law Kernel v3.5 (audio)** — adaptive mastering + watermarking + cryptographic IP provenance. Lives in MorrisLawKernel/ (showcase repo), powers GravelKing Pro, and is the subject of the business-package/ docs and artifacts/mlk-pitch-deck.
2. **MLK V3.5 Licensing Platform** (artifacts/mlk-licensing) — a *matrix multiplication* kernel site (FP64/AVX-512/HFT copy, light theme).

**Why:** A screenshot of mlk-licensing nearly ended up in the audio pitch deck — wrong product, would have been dishonest.
**How to apply:** Never mix assets, screenshots, or copy between the two. When the user says "MLK", determine which product from context (audio/mastering vs matrix/HPC).

Also: branded PDF pipeline lives in business-package/ (pandoc→typst, `build_pdfs.py [font-dir]`); nix Inter fonts aren't in fontconfig — pass the /nix/store/...-inter-*/share/fonts/truetype dir as argv. Never `find /nix/store` unbounded (times out); glob store dir names instead.
