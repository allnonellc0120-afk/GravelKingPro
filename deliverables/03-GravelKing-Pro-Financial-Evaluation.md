# GravelKing Pro — Financial Evaluation (Bootstrapped Model)

*September 2026 · All figures are MODEL ASSUMPTIONS for planning, clearly labeled — not actuals. Replace assumptions with live Stripe/Play data as it accumulates.*

---

## 1. Revenue Streams

| Stream | Price | Notes |
|---|---|---|
| Pro subscription | $9.99/mo | Core tier; mastering + generation |
| King subscription | $24.99/mo | Unlimited + certificates + forensics |
| Certificate unlock | $1.99/track | One-off; expected attach on 25–40% of finished songs |
| Referral commissions | −% | Cost of acquisition, paid only on verified paid invoices |

**Blended ARPU assumption:** $11.50/mo (85% Pro, 15% King mix + certificate attach ≈ $0.60/user/mo).

## 2. Unit Economics (per paying user, monthly)

| Cost line | Est. cost | Basis |
|---|---|---|
| Vertex Gemini (JAX chat) | $0.05–0.15 | ~2K tokens/prompt, ~30 prompts/user |
| ElevenLabs (voice/music) | $0.40–0.90 | plan quota amortized |
| Lyria composition | $0.30–0.60 | ~2 compositions/user |
| MLK mastering compute | $0.05–0.20 | CPU worker, minutes/track |
| Storage + bandwidth | $0.10–0.25 | WAV/MP3 vault |
| Stripe/Play fees | ~$0.60 (Pro) / ~$1.00 (King) | 2.9%+$0.30 / Play 15–30% |
| **Total variable cost** | **≈ $1.50–2.70** | |
| **Gross margin** | **≈ 77–87%** | healthy SaaS range |

## 3. Fixed Costs (monthly, bootstrapped)

| Item | Est. |
|---|---|
| Replit hosting (production) | $25–100 |
| Vertex/GCP base + domain + misc | $20–60 |
| ElevenLabs plan base | $5–22 |
| Email/tools/misc | $10–30 |
| **Total fixed** | **≈ $60–210/mo** |

## 4. Break-Even

At $11.50 ARPU and ~$9 contribution margin per subscriber:
- **Break-even ≈ 10–25 paying subscribers** on fixed costs alone.
- **Sustainable operating point (covering founder time at token $2K/mo): ~350 paying subscribers ≈ $4,000 MRR.**

## 5. 24-Month Bootstrapped Scenarios

Assumptions: organic-led growth (see Bootstrap Workflow), 3% visitor→signup, 4% signup→paid (industry 2–5%), 6% monthly churn, referral k-factor 0.15 after month 4.

| Scenario | Mo 6 subs | Mo 12 subs | Mo 24 subs | Mo 24 MRR |
|---|---|---|---|---|
| Conservative | 60 | 220 | 800 | ~$9,200 |
| Base | 120 | 520 | 2,400 | ~$27,600 |
| Breakout (1–2 viral videos/mo) | 300 | 1,500 | 8,000 | ~$92,000 |

Certificate one-offs add ~5–8% on top of subscription revenue in all scenarios.

## 6. Cash Needs (Bootstrapped)

| Phase | Spend | Purpose |
|---|---|---|
| Now → launch | <$500 | Already built; domain, hosting live |
| Launch → 500 subs | $100–300/mo | Hosting scale-up, occasional boosted posts ($5/day tests) |
| 500+ subs | Self-funding | Reinvest 30% of MRR into content + referral payouts |

**No outside capital required.** The only irreplaceable asset already exists: the platform, the kernel, and the certificate system.

## 7. Key Risks & Hedges

| Risk | Hedge |
|---|---|
| LLM/music API price spikes | Usage quotas per tier; costs capped by plan limits |
| Platform dependency (Play/Stripe) | Dual rails already live (web Stripe + Play Billing) |
| Certificate legal challenge | Conservative claims in copy ("evidence of account activity"), notarized-style audit trail |
| Churn after novelty | Song vault + certificate portfolio = switching cost |

## 8. Verdict

The model works at bootstrap scale because variable costs are pennies, fixed costs are hundreds, and the product's most emotional feature (the certificate) is also its highest-margin one. The binding constraint is **attention, not money** — which is why the growth workflow (Document 04) and the 14-day content pack (Document 05) are the real operating plan.
