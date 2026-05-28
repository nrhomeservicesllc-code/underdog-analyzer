export interface Bookmaker {
  key: string
  title: string
  last_update: string
  markets: Market[]
}

export interface Market {
  key: string
  last_update: string
  outcomes: Outcome[]
}

export interface Outcome {
  name: string
  price: number
  point?: number
}

export interface OddsApiEvent {
  id: string
  sport_key: string
  sport_title: string
  commence_time: string
  home_team: string
  away_team: string
  bookmakers: Bookmaker[]
}

export interface OddsApiSport {
  key: string
  group: string
  title: string
  description: string
  active: boolean
  has_outrights: boolean
}

export interface TeamOdds {
  team: string
  isHome: boolean
  bestAmericanOdds: number
  bestDecimalOdds: number
  bestBookmaker: string
  impliedProbability: number
  noVigProbability: number
  avgAmericanOdds: number
  avgDecimalOdds: number
  oddsRange: { min: number; max: number }
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
  oddsGap: number
  marketEfficiency: number
  expectedValue: number
  expectedValuePct: number
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
  sportsAnalyzed: string[]
  totalGamesScanned: number
  totalBetsAnalyzed: number
  topUnderdog: BetAnalysis | null
  allAnalyses: BetAnalysis[]
  marketStats: {
    avgVigPct: number
    avgOddsGap: number
    positiveEvCount: number
    strongBuyCount: number
  }
  isDemo: boolean
  apiQuotaRemaining?: number
}
