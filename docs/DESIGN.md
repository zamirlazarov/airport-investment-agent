# Airport Investment Intelligence Agent: design notes

An analyst asks, in chat or by voice, where renovation of a US airport is likely to pay off through added flight and passenger capacity. The agent answers with ranked, sourced numbers and says what it assumed. The model never computes a number: it chooses tools, and every figure comes from a TypeScript library over public data.

## What it does

Question: *"What is the unmet flight demand in SFO airport and why?"*

1. The agent calls `get_unmet_demand({ airport: "SFO" })`.
2. The tool returns a demand-pressure proxy: 1,433,255 passengers carried above an 80% load factor, 5.4% of all SFO passengers. The routes driving it are EWR (load factor 90.5%), JFK (89.3%), ORD (87.3%), DFW and LAX; the months with the most excess load are June, August and March.
3. The answer opens with that in plain prose, then a table of routes, then "Assumptions and limits": the 80% threshold, the window (Aug 2025 to Jul 2026), and that this is **not observed lost demand**.

Follow-ups re-call the tool with a changed parameter ("use 85%", "what about Boston?"); the agent never edits a figure itself.

## Architecture

```
Browser (Next.js 16)  ── useEveAgent ──►  eve agent (durable sessions)
  mic / speaker ── browser Web Speech API (no server route)
                                      agent/tools/*.ts  (thin: validate, call lib, return JSON)
                                            │
                                      lib/  pure TypeScript, no LLM
                                      data/ BTS snapshot + FAA clients · scoring/ · analysis.ts
```

Every tool returns the same envelope: `result`, `assumptions`, `dataWindow`, `sources`, `confidence`, `confidenceReasons`. The chat UI renders those fields itself, so disclosure does not depend on the model remembering to write it.

## Data sources and why a snapshot

- **BTS T-100 Segment (all carriers):** departures, seats, passengers, distance, by route and month. It has no query API, so `npm run data:refresh` downloads the yearly files and writes a 6.8 MB snapshot that is committed. The app runs offline and answers are reproducible. It lags about four months.
- **FAA/NTAD facilities and runways (ArcGIS):** acreage and runway length and surface, live, cached 24 hours. Measured coverage of the 233 peer airports: 99.6% for runways, 99.1% for acreage. Palm Beach (PBI) is missing from the FAA layer; Sitka has no acreage. BTS uses IATA codes and FAA tables use FAA identifiers, so six airports need an alias (for example SCE to UNV).
- **FAA NAS status:** live delays and closures, shown as context and never part of a score.

Rejected: OpenSky (needs an account), FAA ASPM/OPSNET (login), BTS On-Time Performance (30 MB per month, domestic only).

## Scoring methodology

Peer set: 233 US airports with at least 100,000 scheduled passengers in the trailing 12 months. Percentiles are `(below + 0.5 × equal) / n`, within the peer set. Worked numbers are Boston (BOS).

| KPI | Definition | Example |
|---|---|---|
| Load factor | passengers ÷ seats | BOS 81.4% |
| Long-haul share | departures on routes ≥ 2,500 mi ÷ all departures, passenger-only and all-flights views | Anchorage: 3,745 ÷ 37,243 = 10.1% passenger flights; 36,075 ÷ 87,249 = 41.3% with cargo |
| Unmet demand (proxy) | per route-month, `seats × (min(LF,1) − threshold)` when LF > threshold (default 0.80) | SFO: 1,433,255 passengers, see above |
| Growth | passenger CAGR 2023→2025, and its gap over seat CAGR | BOS 2.8% and −1.1 points |
| Congestion | mean percentile of departures per usable runway, peak-month factor, boardings per acre | BOS 37,352; 1.14; 8,780 → 78.5 |

**Expansion Opportunity Score** = 0.35 demand pressure + 0.25 growth + 0.25 congestion + 0.15 scale, each a 0–100 percentile (demand pressure averages load factor and the share of seats flown at LF ≥ 85%; scale is passengers). BOS: 0.35 × 81.76 + 0.25 × 46.77 + 0.25 × 78.51 + 0.15 × 93.35 = **73.94**, rank 1 of the New England airports. The weights are a judgment call, not fitted to data. Demand pressure counts most because high load factors are the most direct sign that an airport is running out of room; growth and congestion come next with equal weight; scale counts least, as a tiebreaker for how large the payoff could be. Different weights give a different ranking, so they are parameters: weighting growth at 0.6 moves Portland (PWM) to first place (67.43 vs BOS 66.89).

Missing components: when a component has no value (for example congestion for an airport the FAA table lacks, such as Palm Beach), the score is the weighted mean of the components that exist, with their weights rescaled to sum to 1. Each airport reports `missingComponents` and `effectiveWeights`, and its confidence reasons say so. Example: components 80 / 60 / 10 / 80 score 57.5; with congestion missing the same airport scores 73.3, on weights of 46.7% / 33.3% / 20%. A rescaled score is therefore on a different basis from a complete one, and results that include one say so in their assumptions. Real case: PBI scores 52.43 without congestion.

Congestion comparability: all airports in a run use the same indicator set, namely those available for at least 90% of peers. If the FAA service is down the index falls back to the peak-month factor alone for everyone, with lower confidence. An airport missing an indicator the others have gets no congestion score rather than one built from different inputs.

## Where AI is used, and where it is not

**The language model does three things:** it reads the question and resolves what it refers to ("LA", "New England", "weight growth more heavily"); it chooses which of the seven tools to call and with which parameters; and it explains the result in plain language. Default model: Claude Haiku 5.5 (configurable, see the README).

**It never produces a number.** Every figure, score and rank comes from `lib/`, deterministic TypeScript with no model in it. The instructions forbid stating a number that is not in a tool result from the conversation, and a changed assumption ("use 85%") means calling the tool again, not adjusting the figure.

**Disclosure does not depend on the model.** Assumptions, data window, sources and confidence come back from every tool in a fixed envelope, and the chat UI renders them itself next to the answer.

**How the model's part is checked:** multi-turn evals (`npm run eval`) run the four example questions with their follow-ups against the live agent and assert which tools were called with which inputs (for example SFO at an 85% threshold), plus wording rules such as presenting unmet demand as a proxy, not lost demand.

## Key tradeoffs

- **Snapshot, not live, for T-100:** reproducible and fast; stale by about four months.
- **Unmet demand is a proxy:** T-100 shows only passengers flown, not turned away. A full flight can reflect capacity discipline or pricing as much as unserved demand. The result is labelled `demand-pressure-proxy` and `isObservedLostDemand: false`.
- **Congestion without delay data:** public delay data needs a login or is too large. Runway, peak and land constraints stand in.
- **Percentile scores are relative:** an airport's score shifts with the peer set. They rank; they do not predict returns.
- **No gate or terminal-area data:** "terminal expansion" is inferred from demand pressure and land constraint.
- **Voice is the browser's, not a server service:** the mic and read-aloud use the Web Speech API, so no key or route is needed, but it is English only and recognition works in Chrome and Edge, not Firefox or Safari. Typed chat is not limited this way.
- **No database:** sessions live in eve's workflow store; refreshing a session URL replays it, and restarting the dev server makes older sessions read-only.

## Assumptions, uncertainty and scope

Every result carries its thresholds, data window and a confidence level (high, medium or low) derived from months of service, sample size, growth baseline and congestion indicators in use. Out of scope: construction cost, financing, regulation, absolute return forecasts, general aviation.

Expected values in tests are hand-written and never computed by the code under test. They include real BTS route-months summed by hand from the raw file.

## What I would do next

Add BTS On-Time Performance for delay-based congestion; add gate and terminal data if a source is found; higher-quality voice (for example ElevenLabs) on top of the browser's speech; a dashboard on the same library; deploy with the snapshot bundled; calibrate weights against historical expansion projects.
