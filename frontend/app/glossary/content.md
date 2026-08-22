# Glossary

Every term used anywhere on this site, defined once, in one place. Grouped by topic rather than
strict A-Z, since most terms make more sense next to their neighbors.

## Core metrics

**On-time rate** — Share of flights that arrived within 15 minutes of their scheduled arrival
time. This is DOT/BTS's own standard, not something this site invented. Cancelled flights are
excluded from this and every delay-based calculation.

**ArrDelay / DepDelay** — Arrival and departure delay, in minutes, as recorded by BTS. A negative
value means the flight arrived or departed early.

**ArrDel15** — BTS's own binary flag for "arrived 15+ minutes late." This is what "on-time rate"
is built from.

**Avg arrival delay** — Mean `ArrDelay` across non-cancelled flights in scope. Because it's an
average, a small share of very late flights can pull this number up even when most flights ran
close to on time — the Health Score's "delay severity" and "severe-delay exposure" components
exist specifically to capture that shape separately.

**Cancellation rate** — Share of scheduled flights that were cancelled.

**Distance** — Scheduled flight distance in miles, as recorded by BTS. Used for the haul-length
buckets below.

## Delay and cancellation causes

**Delay causes** — BTS's own coded categories for why a *delayed* flight ran late: Carrier,
Weather, NAS (National Air System), Security, Late Aircraft. These represent the *largest
contributing category* BTS assigned, not a root-cause diagnosis — a flight delayed partly by
weather and partly by a late inbound aircraft only gets one code.

**Cancellation causes** — A separate BTS-coded field (`CancellationCode`) for why a flight was
*cancelled* outright: Carrier, Weather, National Air System, Security. Distinct from delay causes,
since a cancelled flight never ran and therefore was never "delayed."

**Late Aircraft** (delay cause) — BTS's own attribution for delay caused by the incoming aircraft
arriving late. This is BTS's version of the same phenomenon the Delay Propagation feature measures
independently — the two won't match exactly (different methodology), but they should tell a
roughly consistent story for the same scope.

## Haul length

**Short-haul** — Under 500 scheduled miles.
**Medium-haul** — 500 to 1,500 scheduled miles.
**Long-haul** — Over 1,500 scheduled miles. These three buckets cover essentially all domestic BTS
routes, including mainland-Hawaii legs.

## Carriers and codeshare

**Marketing carrier** — The airline a flight is *sold* under (its flight number and branding).
This site's 11 tracked carriers (American, Delta, United, Southwest, Alaska, JetBlue, Spirit,
Frontier, Allegiant, Hawaiian, Virgin America) are marketing carriers — regional partners fold
into whichever major carrier's code they're flying under.

**Operating carrier** — The airline that actually *flies* the aircraft, which can differ from the
marketing carrier. Data here comes from BTS's `Operating_Airline` field.

**Codeshare-operated** — A flight sold under one carrier's code but actually flown by a different
(usually regional) operating carrier — e.g. a Delta-coded flight operated by Endeavor Air.

**Self-operated** — A flight where the marketing and operating carrier are the same.

## Schedule and timing

**Schedule padding** — The gap between a flight's scheduled elapsed time (`CRSElapsedTime`) and
its actual elapsed time (`ActualElapsedTime`). A widening gap over time would suggest a carrier is
building more buffer into its schedule to inflate on-time stats, without the flight actually
getting any faster.

**CRS-** (prefix, e.g. `CRSDepTime`, `CRSArrTime`, `CRSElapsedTime`) — "Computer Reservation
System": the *scheduled* value, fixed before the flight happens, as opposed to what actually
occurred.

**Turnaround** — The ground time between one flight landing and the next flight (same tail)
departing. Classified here as **tight** (≤25 min), **normal** (26–45 min), or **loose** (>45 min).

**Taxi out / Taxi in** — Time from gate pushback to wheels-off, and from wheels-on to gate arrival,
respectively.

## Turnbacks and diversions

**Turnback / gate return** — A flight that pushed back from the gate, then returned to it before
actually departing. Identified via BTS's `FirstDepTime` field, which is only populated when this
happens; `TotalAddGTime` is the extra ground time it cost. Counted as a departure-side event only.

**Diversion** — A flight that landed somewhere other than its original scheduled destination
before either continuing on or terminating there. `DivAirportLandings` counts how many airports it
touched before stopping; `DivReachedDest` records whether it eventually reached the original
destination anyway.

## Delay propagation and aircraft rotation

**Delay propagation** — Whether a late-arriving aircraft's delay carries over to its *next*
flight, same tail, same calendar day. Measured as a correlation between the predecessor flight's
arrival delay and the next flight's departure delay, computed live from real data (not a
pre-calibrated score).

**Aircraft rotation** — The literal sequence of flights one tail number flew on one calendar day,
in scheduled order.

## Health Score

**Health Score** — A single 0–100 score per carrier, airport, route, or aircraft, built from five
components with empirically calibrated weights (not hand-picked): **reliability** (29.0%),
**severe-delay exposure** (27.5%), **delay severity** (25.1%), **cancellation resilience**
(12.5%), **diversion resilience** (5.9%). Weights were derived by testing which components
actually predicted a route's *future* on-time performance, not just its past. Full methodology and
formulas are on the [Methodology](/methodology) page.

**Rating bands** — Excellent / Strong / Watch / Weak / Critical, mapped from the 0–100 Health
Score.

## The 737 MAX grounding study

**Exposure tier** — How dependent a specific carrier-route was on the 737 MAX in the immediate
pre-grounding window: **high** (≥50% of that route's flights were MAX), **moderate** (20–49%),
**low** (5–19%), or **incidental** (under 5%). Prioritization bands, not causal thresholds.

**Pre-grounding window** — January 1 – March 12, 2019: the network as it actually existed right
before the March 13, 2019 grounding, deliberately recent rather than a multi-year average.

**Post-2019 window** — March 13 – December 31, 2019: the remainder of 2019 after the grounding
took effect.

**Early-2020 window** — January – February 2020: still within the grounding, but before COVID's
major US disruption (~March 2020) — the one window in the study that isolates grounding impact
from the pandemic.

## Data and methodology notes

**Observed / observed carrier** — Language used deliberately instead of "operated by" or "owned
by" when describing which carrier flies a given tail number, since BTS flight records aren't a
complete fleet ownership registry — this site can only say what it actually observed in the data.

**11 carriers** — This site tracks only the 11 marketing carriers BTS requires to report (per 14
CFR Part 234, any carrier with ≥0.5% of domestic scheduled passenger revenue). Regional partners
aren't separately tracked; their flights fold into whichever major carrier's code they operated
under.
