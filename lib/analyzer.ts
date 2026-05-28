import type { OddsApiEvent, BetAnalysis, TeamOdds, Bookmaker } from "@/types/betting"
import { isEventLive } from "./odds-api"

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
  const best = entries.find((e) => e.decimal === bestDec)!
  const avgDec = entries.reduce((s, e) => s + e.decimal, 0) / entries.length

  return {
    team,
    isHome,
    bestAmericanOdds: best.american,
    bestDecimalOdds: bestDec,
    bestBookmaker: best.bookmaker,
    impliedProbability: 1 / bestDec,
    noVigProbability: 0,
    avgAmericanOdds: toAmerican(avgDec),
    avgDecimalOdds: avgDec,
    oddsRange: { min: Math.min(...entries.map((e) => e.american)), max: Math.max(...entries.map((e) => e.american)) },
    allOdds: entries,
  }
}

function score(evPct: number, valueRating: number, lineEdge: number, gap: number, isLive: boolean) {
  const liveBonus = isLive ? 8 : 0 // live games get a score boost
  return (
    Math.max(-1, Math.min(1, evPct / 30)) * 0.45 +
    Math.max(-1, Math.min(1, valueRating * 5)) * 0.30 +
    Math.min(1, lineEdge / 0.1) * 0.15 +
    Math.min(1, gap / 0.15) * 0.10
  ) * 100 + liveBonus
}

function recommend(s: number, ev: number): BetAnalysis["recommendation"] {
  if (ev > 8 && s > 60) return "STRONG BUY"
  if (ev > 4 && s > 35) return "BUY"
  if (ev > 0) return "WATCH"
  return "AVOID"
}

function notes(ud: TeamOdds, evPct: number, valueRating: number, lineEdge: number, bookCount: number, isLive: boolean) {
  const out: string[] = []

  if (isLive) out.push("Game is LIVE — odds reflect current in-game state")

  if (evPct > 0)
    out.push(`Positive EV of +${evPct.toFixed(1)}% on the underdog at best available odds`)
  else
    out.push(`Negative EV of ${evPct.toFixed(1)}% — market favors the favorite`)

  if (valueRating > 0.03)
    out.push(
      `Book implied prob (${(ud.impliedProbability * 100).toFixed(1)}%) understates no-vig consensus (${(ud.noVigProbability * 100).toFixed(1)}%) by ${(valueRating * 100).toFixed(1)}pp`
    )

  if (lineEdge > 0.02)
    out.push(`Line-shopping across ${bookCount} books yields +${(lineEdge * 100).toFixed(1)}pp — best odds at ${ud.bestBookmaker}`)

  if (ud.oddsRange.max - ud.oddsRange.min > 40)
    out.push(`Wide market disparity (${ud.oddsRange.min > 0 ? "+" : ""}${ud.oddsRange.min} to +${ud.oddsRange.max}) — books disagree, signaling soft line`)

  if (ud.bestAmericanOdds > 200)
    out.push(`Long-shot at ${ud.bestAmericanOdds > 0 ? "+" : ""}${ud.bestAmericanOdds} returns $${((ud.bestDecimalOdds - 1) * 100).toFixed(0)} profit on $100`)

  return out
}

export function analyzeEvent(event: OddsApiEvent): BetAnalysis | null {
  if (!event.bookmakers?.length) return null

  const home = aggregate(event.home_team, true, event.bookmakers)
  const away = aggregate(event.away_team, false, event.bookmakers)
  if (!home || !away) return null

  const [hv, av] = noVig([home.impliedProbability, away.impliedProbability])
  home.noVigProbability = hv
  away.noVigProbability = av

  const [fav, ud] =
    home.bestDecimalOdds < away.bestDecimalOdds ? [home, away] : [away, home]

  const profit = ud.bestAmericanOdds > 0 ? ud.bestAmericanOdds / 100 : 100 / Math.abs(ud.bestAmericanOdds)
  const ev = ud.noVigProbability * profit - (1 - ud.noVigProbability)
  const evPct = ev * 100
  const valueRating = ud.noVigProbability - ud.impliedProbability
  const lineEdge = 1 / ud.avgDecimalOdds - 1 / ud.bestDecimalOdds
  const gap = Math.abs(valueRating)
  const live = isEventLive(event.commence_time, event.sport_key)
  const udScore = score(evPct, valueRating, lineEdge, gap, live)

  return {
    eventId: event.id,
    sport: event.sport_key,
    sportTitle: event.sport_title,
    homeTeam: event.home_team,
    awayTeam: event.away_team,
    commenceTime: event.commence_time,
    isLive: live,
    favoriteTeam: fav,
    underdogTeam: ud,
    oddsGap: gap,
    marketEfficiency: 1 - Math.min(1, gap / 0.15),
    expectedValue: ev,
    expectedValuePct: evPct,
    valueRating,
    underdogScore: udScore,
    recommendation: recommend(udScore, evPct),
    bookmakerCount: event.bookmakers.length,
    consensusProbability: ud.noVigProbability,
    lineShoppingEdge: lineEdge,
    analysisNotes: notes(ud, evPct, valueRating, lineEdge, event.bookmakers.length, live),
  }
}

export function analyzeAll(events: OddsApiEvent[]): BetAnalysis[] {
  return events
    .map(analyzeEvent)
    .filter((a): a is BetAnalysis => a !== null)
    .sort((a, b) => {
      // Live games always surface first, then by score
      if (a.isLive && !b.isLive) return -1
      if (!a.isLive && b.isLive) return 1
      return b.underdogScore - a.underdogScore
    })
}
