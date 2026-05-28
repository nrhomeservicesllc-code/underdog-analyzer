import type { TrackedBet, BetAnalysis } from "@/types/betting"

const KEY = "underdog_tracked_bets"

export function loadBets(): TrackedBet[] {
  if (typeof window === "undefined") return []
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]")
  } catch {
    return []
  }
}

function saveBets(bets: TrackedBet[]) {
  localStorage.setItem(KEY, JSON.stringify(bets))
}

export function trackBet(analysis: BetAnalysis): TrackedBet {
  const bets = loadBets()
  const bet: TrackedBet = {
    id: `${analysis.eventId}-${Date.now()}`,
    eventId: analysis.eventId,
    trackedAt: new Date().toISOString(),
    sport: analysis.sport,
    sportTitle: analysis.sportTitle,
    homeTeam: analysis.homeTeam,
    awayTeam: analysis.awayTeam,
    underdogTeam: analysis.underdogTeam.team,
    favoriteTeam: analysis.favoriteTeam.team,
    odds: analysis.underdogTeam.bestAmericanOdds,
    bookmaker: analysis.underdogTeam.bestBookmaker,
    evPct: analysis.expectedValuePct,
    commenceTime: analysis.commenceTime,
    status: "PENDING",
  }
  saveBets([bet, ...bets])
  return bet
}

export function untrackBet(eventId: string) {
  saveBets(loadBets().filter((b) => b.eventId !== eventId))
}

export function settleBet(id: string, status: "WON" | "LOST") {
  saveBets(
    loadBets().map((b) =>
      b.id === id ? { ...b, status, settledAt: new Date().toISOString() } : b
    )
  )
}

export function removeBet(id: string) {
  saveBets(loadBets().filter((b) => b.id !== id))
}

export function isTracked(eventId: string, bets: TrackedBet[]): boolean {
  return bets.some((b) => b.eventId === eventId && b.status === "PENDING")
}

export function calcRecord(bets: TrackedBet[]) {
  const settled = bets.filter((b) => b.status !== "PENDING")
  const wins = settled.filter((b) => b.status === "WON")
  const losses = settled.filter((b) => b.status === "LOST")

  // P&L assuming $100 stake per bet
  const profit = wins.reduce((s, b) => {
    const dec = b.odds > 0 ? b.odds / 100 + 1 : 100 / Math.abs(b.odds) + 1
    return s + (dec - 1) * 100
  }, 0)
  const loss = losses.length * 100

  return {
    wins: wins.length,
    losses: losses.length,
    pending: bets.filter((b) => b.status === "PENDING").length,
    pnl: profit - loss,
  }
}
