---
name: MLK benchmark honesty + dev gating
description: The MLK V3.5 licensing benchmark must report only real detected hardware, and the dev open-usage bypass must be fail-closed.
---

# MLK V3.5 benchmark: report real hardware only, gate dev access fail-closed

## Real hardware only (no fabricated specs)
The benchmark page (`artifacts/mlk-licensing/src/pages/benchmark.tsx`) once hardcoded a
fake environment (e.g. "AMD EPYC 9V33" + "NVIDIA A100 80GB" + "Ubuntu 22.04"). The host
is actually CPU-only (Intel Xeon Platinum 8581C, 4 logical cores, ~2.3 GHz, single NUMA
node, **no GPU**). Everything shown must come from the kernel's real detection:

- CPU model ← `/proc/cpuinfo` `model name`
- SIMD ISA ← `/proc/cpuinfo` `flags` (avx512f/avx2/avx/sse4_2)
- BLAS library ← `numpy.show_config(mode="dicts")` (resolves to `scipy-openblas` here)
- `mmap_locked` ← the **actual** `mlockall()` return, not "an mmap buffer exists".
  In this container `mlockall` is **not permitted**, so the honest value is `False`
  (panel shows HEAP, not "PAGES LOCKED").

**Why:** This is a paid product the owner is being billed for; fabricated hardware/metrics
are both dishonest and a support/refund risk. The kernel is a pure FP64 CPU DGEMM — never
imply GPU acceleration.

**How to apply:** When touching the kernel (`.local/mlk-repo/morris_law_kernel_v35_fast.py`)
or the benchmark UI, keep every spec/metric backed by live detection. UI optimization copy
must describe what the code actually does (it sets *process* CPU affinity to the available
cores via `sched_setaffinity` — it does **not** pin each thread to its own core).

## Dev open-usage must be fail-closed
The owner/dev gets uncapped benchmark runs locally. Gate it with
`process.env.NODE_ENV === "development"` (the dev workflow sets that explicitly), **never**
`!== "production"`.

**Why:** `!== "production"` is fail-open — any env with NODE_ENV unset/misconfigured would
hand out free uncapped paid compute. The api-server production deploy explicitly sets
`NODE_ENV=production` (in `artifacts/api-server/.replit-artifact/artifact.toml`, both build
and run env), so `=== "development"` is safe and frictionless (no extra secret to set).

**How to apply:** Any future dev/owner bypass of a paid boundary uses the same fail-closed
`=== "development"` check, defaulting to demo/paid gating otherwise.
