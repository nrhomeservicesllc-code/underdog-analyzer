export interface TeamOdds {
  team: string
  bestAmericanOdds: number
  bestDecimalOdds: number
  bestBookmaker: string
  noVigProbability: number
  impliedProbability: number
  lineShoppingEdge?: number
  allOdds: { bookmaker: string; american: number; decimal: number }[]
}

export interface BetAnalysis {
  eventId: string
  sport: string
  sportTitle: string
  homeTeam: string
  awayTeam: string
  commenceTime: string
  isLive: boolean
  favoriteTeam: TeamOdds
  underdogTeam: TeamOdds
  expectedValuePct: number
  expectedValue: number
  valueRating: number
  underdogScore: number
  recommendation: "STRONG BUY" | "BUY" | "WATCH" | "AVOID"
  bookmakerCount: number
  consensusProbability: number
  lineShoppingEdge: number
  analysisNotes: string[]
}

export interface AnalysisResponse {
  timestamp: string
  needsSetup: boolean
  isDemo: boolean
  sportsAnalyzed: string[]
  totalGamesScanned: number
  liveGameCount: number
  totalBetsAnalyzed: number
  liveAnalyses: BetAnalysis[]
  topUnderdog: BetAnalysis | null
  allAnalyses: BetAnalysis[]
  marketStats: {
    positiveEvCount: number
    strongBuyCount: number
    liveCount: number
  }
  apiQuotaRemaining?: number
}

export interface TrackedBet {
  id: string
  eventId: string
  trackedAt: string
  sportTitle: string
  homeTeam: string
  awayTeam: string
  underdogTeam: string
  odds: number
  bookmaker: string
  evPct: number
  commenceTime: string
  status: "PENDING" | "WON" | "LOST"
  settledAt?: string
}
