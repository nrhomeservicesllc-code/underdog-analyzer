import AsyncStorage from "@react-native-async-storage/async-storage"
import type { TrackedBet, BetAnalysis } from "@/types/betting"

const KEY = "underdog_tracked_bets"

export async function loadBets(): Promise<TrackedBet[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

async function saveBets(bets: TrackedBet[]) {
  await AsyncStorage.setItem(KEY, JSON.stringify(bets))
}

export async function trackBet(analysis: BetAnalysis): Promise<void> {
  const bets = await loadBets()
  const bet: TrackedBet = {
    id: `${analysis.eventId}-${Date.now()}`,
    eventId: analysis.eventId,
    trackedAt: new Date().toISOString(),
    sportTitle: analysis.sportTitle,
    homeTeam: analysis.homeTeam,
    awayTeam: analysis.awayTeam,
    underdogTeam: analysis.underdogTeam.team,
    odds: analysis.underdogTeam.bestAmericanOdds,
    bookmaker: analysis.underdogTeam.bestBookmaker,
    evPct: analysis.expectedValuePct,
    commenceTime: analysis.commenceTime,
    status: "PENDING",
  }
  await saveBets([bet, ...bets])
}

export async function untrackBet(eventId: string): Promise<void> {
  const bets = await loadBets()
  await saveBets(bets.filter((b) => b.eventId !== eventId))
}

export async function settleBet(id: string, status: "WON" | "LOST"): Promise<void> {
  const bets = await loadBets()
  await saveBets(
    bets.map((b) =>
      b.id === id ? { ...b, status, settledAt: new Date().toISOString() } : b
    )
  )
}

export async function removeBet(id: string): Promise<void> {
  const bets = await loadBets()
  await saveBets(bets.filter((b) => b.id !== id))
}

export function isTracked(eventId: string, bets: TrackedBet[]): boolean {
  return bets.some((b) => b.eventId === eventId && b.status === "PENDING")
}

export function calcRecord(bets: TrackedBet[]) {
  const wins = bets.filter((b) => b.status === "WON")
  const losses = bets.filter((b) => b.status === "LOST")
  const profit = wins.reduce((s, b) => {
    const dec = b.odds > 0 ? b.odds / 100 + 1 : 100 / Math.abs(b.odds) + 1
    return s + (dec - 1) * 100
  }, 0)
  return {
    wins: wins.length,
    losses: losses.length,
    pending: bets.filter((b) => b.status === "PENDING").length,
    pnl: profit - losses.length * 100,
  }
}
