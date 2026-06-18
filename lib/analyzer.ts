import type { OddsApiEvent, BetAnalysis, TeamOdds, Bookmaker } from "@/types/betting"

export function toDecimal(american: number) {
  return american > 0 ? american / 100 + 1 : 100 / Math.abs(american) + 1
}

export function toAmerican(decimal: number) {
  return decimal >= 2 ? Math.round((decimal - 1) * 100) : Math.round(-100 / (decimal - 1))
}

function noVig(probs: number[]) {
  const sum = probs.reduce((s, p) => s + p, 0)
  return probs.map((p) => p / sum)
}

function aggregate(team: string, isHome: boolean, books: Bookmaker[]): TeamOdds | null {
  const entries: { bookmaker: string; american: number; decimal: number }[] = []

  for (const book of books) {
    const market = book.markets.find((m) => m.key === "h2h")
    const outcome = market?.outcomes.find((o) => o.name === team)
    if (!outcome) continue
    entries.push({ bookmaker: book.title, american: outcome.price, decimal: toDecimal(outcome.price) })
  }

  if (!entries.length) return null

  const bestDec = Math.max(...entries.map((e) => e.decimal))
  const best    = entries.find((e) => e.decimal === bestDec)!
  const avgDec  = entries.reduce((s, e) => s + e.decimal, 0) / entries.length

  return {
    team,
    isHome,
    bestAmericanOdds:  best.american,
    bestDecimalOdds:   bestDec,
    bestBookmaker:     best.bookmaker,
    impliedProbability: 1 / bestDec,
    noVigProbability:  0,
    avgAmericanOdds:   toAmerican(avgDec),
    avgDecimalOdds:    avgDec,
    oddsRange: {
      min: Math.min(...entries.map((e) => e.american)),
      max: Math.max(...entries.map((e) => e.american)),
    },
    allOdds: entries,
  }
}

// ── Odds quality: research shows +130 to +280 underdogs give the best
// long-term win rate vs. implied probability. Extreme longshots have too much
// variance; near-coin-flips don't have enough upside to cover the vig.
function oddsQuality(american: number): number {
  if (american < 110)  return 0.0   // barely an underdog — no meaningful edge
  if (american <= 150) return 0.65  // small dog, lower upside
  if (american <= 200) return 0.90  // solid underdog sweet spot
  if (american <= 280) return 1.00  // optimal risk/reward range
  if (american <= 350) return 0.80  // decent, but variance climbing
  if (american <= 450) return 0.50  // high variance, use only if EV is large
  return 0.20                       // lottery ticket territory — avoid unless enormous edge
}

// ── Hard quality gates applied before we score or surface a pick ──
// Returns a reason string if the pick should be excluded, null if it passes.
function qualityGate(ud: TeamOdds, apiEV: number | undefined, evPct: number): string | null {
  if (ud.bestAmericanOdds < 105) return "not-underdog"    // basically a coin flip
  if (ud.bestAmericanOdds > 600) return "too-volatile"    // extreme longshot
  // Require EITHER the API EV to be positive OR our own 2-book EV to be positive
  const primaryEV = apiEV ?? evPct
  if (primaryEV <= 0) return "negative-ev"
  return null
}

// ── Score (0–100) used to rank picks against each other.
// Primary signal: the API's sharp-book EV (computed against 30+ reference books).
// Secondary: odds quality (sweet-spot bonus).
// Tertiary: our own 2-book EV as a sanity check.
function score(
  evPct:   number,
  apiEV:   number | undefined,
  american: number,
  isLive:  boolean
): number {
  const liveBonus = isLive ? 6 : 0

  // Primary: use the API's EV if available; fall back to our own.
  // Capped: 20% EV → 100% contribution on this axis.
  const primaryEV = apiEV ?? evPct
  const evSignal  = Math.max(-1, Math.min(1, primaryEV / 20)) * 50

  // Secondary: odds quality — heavy weight so sweet-spot picks (+130–+280)
  // beat extreme longshots even when the longshot shows higher raw EV.
  const oqSignal  = oddsQuality(american) * 35

  // Tertiary: our own 2-book EV as secondary confirmation.
  const ownSignal = Math.max(-0.5, Math.min(1, evPct / 15)) * 15

  return evSignal + oqSignal + ownSignal + liveBonus
}

function recommend(apiEV: number | undefined, evPct: number, american: number): BetAnalysis["recommendation"] {
  const primary = apiEV ?? evPct
  const oq = oddsQuality(american)

  if (primary > 10 && oq >= 0.8) return "STRONG BUY"
  if (primary > 5  && oq >= 0.5) return "BUY"
  if (primary > 2)               return "WATCH"
  return "AVOID"
}

function notes(
  ud:        TeamOdds,
  evPct:     number,
  apiEV:     number | undefined,
  lineEdge:  number,
  bookCount: number,
  isLive:    boolean
): string[] {
  const out: string[] = []

  if (isLive) out.push("Game is LIVE — odds reflect current in-game state")

  if (apiEV !== undefined) {
    out.push(
      apiEV > 0
        ? `Sharp-book consensus shows +${apiEV.toFixed(1)}% edge — books are pricing ${ud.team} too cheap`
        : `Sharp books show ${apiEV.toFixed(1)}% — proceed with caution`
    )
  } else if (evPct > 0) {
    out.push(`+${evPct.toFixed(1)}% EV on the underdog at best available odds`)
  } else {
    out.push(`${evPct.toFixed(1)}% EV — market favors the favorite`)
  }

  const american = ud.bestAmericanOdds
  if (american >= 130 && american <= 280) {
    out.push(`Odds of +${american} are in the value sweet-spot — strong risk/reward`)
  } else if (american > 350) {
    out.push(`Long-shot at +${american} — high variance, best suited for small unit size`)
  }

  if (lineEdge > 0.025 && bookCount >= 2) {
    out.push(`Line-shopping saves +${(lineEdge * 100).toFixed(1)}pp — best price at ${ud.bestBookmaker}`)
  }

  if (ud.oddsRange.max - ud.oddsRange.min > 40) {
    out.push(`Wide market spread (${ud.oddsRange.min > 0 ? "+" : ""}${ud.oddsRange.min} to +${ud.oddsRange.max}) — books disagree, soft line`)
  }

  return out
}

export function analyzeEvent(event: OddsApiEvent): BetAnalysis | null {
  if (!event.bookmakers?.length) return null

  const home = aggregate(event.home_team, true,  event.bookmakers)
  const away = aggregate(event.away_team, false, event.bookmakers)
  if (!home || !away) return null

  const [hv, av] = noVig([home.impliedProbability, away.impliedProbability])
  home.noVigProbability = hv
  away.noVigProbability = av

  const [fav, ud] =
    home.bestDecimalOdds < away.bestDecimalOdds ? [home, away] : [away, home]

  // Our own 2-book EV (weaker signal, used as confirmation)
  const profit = ud.bestAmericanOdds > 0 ? ud.bestAmericanOdds / 100 : 100 / Math.abs(ud.bestAmericanOdds)
  const ev     = ud.noVigProbability * profit - (1 - ud.noVigProbability)
  const evPct  = ev * 100

  const valueRating = ud.noVigProbability - ud.impliedProbability
  const lineEdge    = 1 / ud.avgDecimalOdds - 1 / ud.bestDecimalOdds
  const live        = (event as OddsApiEvent & { _confirmedLive?: boolean })._confirmedLive ?? false
  const apiEV       = event._apiEV   // EV% from the API's sharp-book calc

  // Hard quality gate — skip pre-match picks that would hurt the record.
  // Live games bypass the gate: we always want to show in-progress games
  // even when the pre-match EV is no longer accurate.
  const gateResult = qualityGate(ud, apiEV, evPct)
  if (gateResult && !live) return null

  const udScore = score(evPct, apiEV, ud.bestAmericanOdds, live)
  const rec     = recommend(apiEV, evPct, ud.bestAmericanOdds)

  // Win probability: back-calculate from the API's sharp EV when available.
  // This is more accurate than stripping vig from just 2 recreational books.
  // Formula: P(win) = (1 + EV_decimal) / decimal_odds
  const sharpWinProb = apiEV !== undefined
    ? Math.min(0.95, Math.max(0.02, (1 + apiEV / 100) / ud.bestDecimalOdds))
    : ud.noVigProbability

  return {
    eventId:            event.id,
    sport:              event.sport_key,
    sportTitle:         event.sport_title,
    homeTeam:           event.home_team,
    awayTeam:           event.away_team,
    commenceTime:       event.commence_time,
    isLive:             live,
    favoriteTeam:       fav,
    underdogTeam:       ud,
    oddsGap:            Math.abs(valueRating),
    marketEfficiency:   1 - Math.min(1, Math.abs(valueRating) / 0.15),
    expectedValue:      ev,
    // For display: prefer the API's sharper EV% over our own 2-book estimate
    expectedValuePct:   apiEV ?? evPct,
    valueRating,
    underdogScore:      udScore,
    recommendation:     rec,
    bookmakerCount:     event.bookmakers.length,
    consensusProbability: sharpWinProb,
    lineShoppingEdge:   lineEdge,
    analysisNotes:      notes(ud, evPct, apiEV, lineEdge, event.bookmakers.length, live),
  }
}

import type { LiveScore } from "./odds-api"

export function analyzeAll(
  events: OddsApiEvent[],
  liveScores?: Map<string, LiveScore>
): BetAnalysis[] {
  const tagged = liveScores
    ? events.map((e) => {
        const sc = liveScores.get(e.id)
        return { ...e, _confirmedLive: !!sc, _liveScore: sc }
      })
    : events

  return tagged
    .map((e) => {
      const result = analyzeEvent(e)
      if (!result) return null
      const s = (e as OddsApiEvent & { _liveScore?: LiveScore })._liveScore
      if (s) result.currentScore = { homeScore: s.homeScore, awayScore: s.awayScore }
      return result
    })
    .filter((a): a is BetAnalysis => {
      if (!a) return false
      // Always surface live games — pre-match EV may be stale but the game is happening
      if (a.isLive) return true
      // Don't surface pre-match AVOID picks — they'd only hurt the record
      return a.recommendation !== "AVOID"
    })
    .sort((a, b) => {
      if (a.isLive && !b.isLive) return -1
      if (!a.isLive && b.isLive) return 1
      return b.underdogScore - a.underdogScore
    })
}
