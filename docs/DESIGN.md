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
  mic / speaker ── /api/voice/* ──► speech-to-text / text-to-speech
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

**Expansion Opportunity Score** = 0.35 demand pressure + 0.25 growth + 0.25 congestion + 0.15 scale, each a 0–100 percentile (demand pressure averages load factor and the share of seats flown at LF ≥ 85%; scale is passengers). BOS: 0.35 × 81.76 + 0.25 × 46.77 + 0.25 × 78.51 + 0.15 × 93.35 = **73.94**, rank 1 of the New England airports. Weights are parameters: weighting growth at 0.6 moves Portland (PWM) to first place (67.43 vs BOS 66.89).

Congestion comparability: all airports in a run use the same indicator set, namely those available for at least 90% of peers. If the FAA service is down the index falls back to the peak-month factor alone for everyone, with lower confidence. An airport missing an indicator the others have gets no congestion score rather than one built from different inputs.

## Where AI is used, and where it is not

The language model picks tools, passes identifiers and parameters, resolves ambiguous names ("Portland" returns both PDX and PWM), and writes the explanation from tool output. It does not compute, estimate or fetch data; it has no shell, file or web tools. Instructions require a direct answer first, an "Assumptions and limits" close, and plain disclosure of missing data. Speech (ElevenLabs) is used only for voice.

## Key tradeoffs

- **Snapshot, not live, for T-100:** reproducible and fast; stale by about four months.
- **Unmet demand is a proxy:** T-100 shows only passengers flown, not turned away. A full flight can reflect capacity discipline or pricing as much as unserved demand. The result is labelled `demand-pressure-proxy` and `isObservedLostDemand: false`.
- **Congestion without delay data:** public delay data needs a login or is too large. Runway, peak and land constraints stand in.
- **Percentile scores are relative:** an airport's score shifts with the peer set. They rank; they do not predict returns.
- **No gate or terminal-area data:** "terminal expansion" is inferred from demand pressure and land constraint.
- **No database:** sessions live in eve's workflow store; refreshing a session URL replays it, and restarting the dev server makes older sessions read-only.

## Assumptions, uncertainty and scope

Every result carries its thresholds, data window and a confidence level (high, medium or low) derived from months of service, sample size, growth baseline and congestion indicators in use. Out of scope: construction cost, financing, regulation, absolute return forecasts, general aviation.

Expected values in tests are hand-written and never computed by the code under test. They include real BTS route-months summed by hand from the raw file.

## What I would do next

Add BTS On-Time Performance for delay-based congestion; add gate and terminal data if a source is found; a dashboard on the same library; deploy with the snapshot bundled; calibrate weights against historical expansion projects.
