import type { OddsApiEvent, OddsApiSport } from "@/types/betting"

const BASE = "https://api.the-odds-api.com/v4"

export interface ScoreEvent {
  id: string
  home_team: string
  away_team: string
  completed: boolean
  scores: { name: string; score: string }[] | null
  last_update: string | null
}

export interface LiveScore {
  homeScore: string
  awayScore: string
  lastUpdate: string
}

export class OddsApiClient {
  constructor(private key: string) {}

  async getSports(): Promise<OddsApiSport[]> {
    const res = await fetch(`${BASE}/sports?api_key=${encodeURIComponent(this.key)}`, { cache: "no-store" })
    if (!res.ok) throw new Error(`Sports fetch failed: ${res.status}`)
    return res.json()
  }

  async getOdds(sport: string): Promise<{ events: OddsApiEvent[]; quota: number }> {
    const url = new URL(`${BASE}/sports/${sport}/odds`)
    url.searchParams.set("api_key", this.key)
    url.searchParams.set("regions", "us,us2,uk,eu,au")
    url.searchParams.set("markets", "h2h")
    url.searchParams.set("oddsFormat", "american")
    url.searchParams.set("dateFormat", "iso")

    const res = await fetch(url.toString(), { cache: "no-store" })
    if (!res.ok) throw new Error(`Odds fetch failed for ${sport}: ${res.status}`)

    const quota = parseInt(res.headers.get("x-requests-remaining") ?? "0")
    return { events: await res.json(), quota }
  }

  async getLiveScores(sport: string): Promise<Map<string, LiveScore>> {
    try {
      const url = new URL(`${BASE}/sports/${sport}/scores`)
      url.searchParams.set("api_key", this.key)
      url.searchParams.set("daysFrom", "1")
      url.searchParams.set("dateFormat", "iso")

      const res = await fetch(url.toString(), { cache: "no-store" })
      if (!res.ok) return new Map()

      const data: ScoreEvent[] = await res.json()
      const result = new Map<string, LiveScore>()

      for (const e of data) {
        if (!Array.isArray(e.scores) || e.scores.length < 2 || e.completed) continue
        const home = e.scores.find((s) => s.name === e.home_team)
        const away = e.scores.find((s) => s.name === e.away_team)
        if (!home || !away) continue
        result.set(e.id, {
          homeScore: home.score,
          awayScore: away.score,
          lastUpdate: e.last_update ?? "",
        })
      }

      return result
    } catch {
      return new Map()
    }
  }
}

export function getClient() {
  const key = process.env.ODDS_API_KEY?.trim()
  if (!key) throw new Error("ODDS_API_KEY not set")
  return new OddsApiClient(key)
}

// How long after start we still consider a game "live" (fallback only — Scores API is authoritative)
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

export const SPORT_PRIORITY = [
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
  "basketball_nba",
  "baseball_mlb",
  "icehockey_nhl",
  "americanfootball_nfl",
  "basketball_ncaab",
  "americanfootball_ncaaf",
  "tennis_atp_french_open",
  "tennis_wta_french_open",
  "tennis_atp_wimbledon",
  "tennis_wta_wimbledon",
  "tennis_atp_us_open",
  "tennis_wta_us_open",
  "tennis_atp_australian_open",
  "tennis_wta_australian_open",
  "mma_mixed_martial_arts",
  "boxing_boxing",
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
  "esports_lol",
  "esports_csgo",
  "esports_dota_2",
  "esports_valorant",
  "esports_r6",
  "esports_overwatch",
  "esports_kog",
]
