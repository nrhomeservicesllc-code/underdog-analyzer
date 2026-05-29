import type { OddsApiEvent, OddsApiSport } from "@/types/betting"

const BASE = "https://api.the-odds-api.com/v4"

export interface ScoreEvent {
  id: string
  completed: boolean
  scores: { name: string; score: string }[] | null
}

export class OddsApiClient {
  constructor(private key: string) {}

  async getSports(): Promise<OddsApiSport[]> {
    const res = await fetch(`${BASE}/sports?apiKey=${this.key}`, { next: { revalidate: 300 } })
    if (!res.ok) throw new Error(`Sports fetch failed: ${res.status}`)
    return res.json()
  }

  async getOdds(sport: string): Promise<{ events: OddsApiEvent[]; quota: number }> {
    const url = new URL(`${BASE}/sports/${sport}/odds`)
    url.searchParams.set("apiKey", this.key)
    url.searchParams.set("regions", "us,uk,eu,au")
    url.searchParams.set("markets", "h2h")
    url.searchParams.set("oddsFormat", "american")

    const res = await fetch(url.toString(), { next: { revalidate: 45 } })
    if (!res.ok) throw new Error(`Odds fetch failed for ${sport}: ${res.status}`)

    const quota = parseInt(res.headers.get("x-requests-remaining") ?? "0")
    return { events: await res.json(), quota }
  }

  // Returns a Set of event IDs that are confirmed live (started, not completed)
  async getLiveEventIds(sport: string): Promise<Set<string>> {
    try {
      const url = new URL(`${BASE}/sports/${sport}/scores`)
      url.searchParams.set("apiKey", this.key)
      url.searchParams.set("daysFrom", "1")

      const res = await fetch(url.toString(), { cache: "no-store" })
      if (!res.ok) return new Set()

      const data: ScoreEvent[] = await res.json()
      // scores must be a non-empty array (game has actual score data) and not completed
      return new Set(
        data
          .filter((e) => Array.isArray(e.scores) && e.scores.length > 0 && !e.completed)
          .map((e) => e.id)
      )
    } catch {
      return new Set()
    }
  }
}

export function getClient() {
  const key = process.env.ODDS_API_KEY
  if (!key) throw new Error("ODDS_API_KEY not set")
  return new OddsApiClient(key)
}

// How long a game stays "live" after commence_time (minutes)
export const LIVE_WINDOW_MINUTES: Record<string, number> = {
  basketball_nba: 150,
  basketball_ncaab: 150,
  basketball_euroleague: 150,
  baseball_mlb: 240,
  icehockey_nhl: 150,
  americanfootball_nfl: 210,
  americanfootball_ncaaf: 210,
  soccer_epl: 130,
  soccer_usa_mls: 130,
  soccer_spain_la_liga: 130,
  soccer_germany_bundesliga: 130,
  soccer_italy_serie_a: 130,
  soccer_france_ligue_one: 130,
  soccer_netherlands_eredivisie: 130,
  soccer_portugal_primeira_liga: 130,
  soccer_mexico_ligamx: 130,
  soccer_brazil_campeonato: 130,
  soccer_argentina_primera_division: 130,
  soccer_turkey_super_league: 130,
  soccer_uefa_champs_league: 130,
  soccer_uefa_europa_league: 130,
  mma_mixed_martial_arts: 180,
  boxing_boxing: 180,
  tennis_atp_french_open: 300,
  tennis_wta_french_open: 300,
  tennis_atp_wimbledon: 300,
  tennis_wta_wimbledon: 300,
  tennis_atp_us_open: 300,
  tennis_wta_us_open: 300,
  tennis_atp_australian_open: 300,
  tennis_wta_australian_open: 300,
  cricket_test_match: 7200,
  cricket_odi: 480,
  cricket_t20: 210,
  rugbyleague_nrl: 120,
  rugbyunion_premiership: 120,
  rugbyunion_super_rugby: 120,
  aussierules_afl: 150,
  darts_betway_premier_league: 120,
  esports_lol: 180,
  esports_csgo: 180,
  esports_dota_2: 180,
  esports_valorant: 180,
  esports_r6: 180,
  esports_overwatch: 180,
  esports_kog: 180,
}

export function isEventLive(commenceTime: string, sportKey: string): boolean {
  const now = Date.now()
  const start = new Date(commenceTime).getTime()
  if (start > now) return false
  const windowMs = (LIVE_WINDOW_MINUTES[sportKey] ?? 180) * 60_000
  return now - start < windowMs
}

// Ordered by global betting volume — most liquid markets first
export const SPORT_PRIORITY = [
  // High volume, year-round
  "soccer_epl",
  "soccer_spain_la_liga",
  "soccer_germany_bundesliga",
  "soccer_italy_serie_a",
  "soccer_france_ligue_one",
  "soccer_usa_mls",
  "soccer_netherlands_eredivisie",
  "soccer_portugal_primeira_liga",
  "soccer_mexico_ligamx",
  "soccer_brazil_campeonato",
  "soccer_argentina_primera_division",
  "soccer_turkey_super_league",
  "soccer_uefa_champs_league",
  "soccer_uefa_europa_league",
  // US major sports
  "basketball_nba",
  "baseball_mlb",
  "icehockey_nhl",
  "americanfootball_nfl",
  "basketball_ncaab",
  "americanfootball_ncaaf",
  // Tennis (Grand Slams + tour events)
  "tennis_atp_french_open",
  "tennis_wta_french_open",
  "tennis_atp_wimbledon",
  "tennis_wta_wimbledon",
  "tennis_atp_us_open",
  "tennis_wta_us_open",
  "tennis_atp_australian_open",
  "tennis_wta_australian_open",
  // Combat sports
  "mma_mixed_martial_arts",
  "boxing_boxing",
  // Other
  "basketball_euroleague",
  "rugbyleague_nrl",
  "rugbyunion_premiership",
  "rugbyunion_super_rugby",
  "aussierules_afl",
  "cricket_test_match",
  "cricket_odi",
  "cricket_t20",
  "darts_betway_premier_league",
  "icehockey_sweden_hockey_league",
  // Esports
  "esports_lol",
  "esports_csgo",
  "esports_dota_2",
  "esports_valorant",
  "esports_r6",
  "esports_overwatch",
  "esports_kog",
]
