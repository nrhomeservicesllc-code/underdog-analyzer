import type { OddsApiEvent, OddsApiSport } from "@/types/betting"

const BASE = "https://api.the-odds-api.com/v4"

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
    url.searchParams.set("regions", "us")
    url.searchParams.set("markets", "h2h")
    url.searchParams.set("oddsFormat", "american")

    const res = await fetch(url.toString(), { next: { revalidate: 60 } })
    if (!res.ok) throw new Error(`Odds fetch failed for ${sport}: ${res.status}`)

    const quota = parseInt(res.headers.get("x-requests-remaining") ?? "0")
    return { events: await res.json(), quota }
  }
}

export function getClient() {
  const key = process.env.ODDS_API_KEY
  if (!key) throw new Error("ODDS_API_KEY not set")
  return new OddsApiClient(key)
}

// Priority order — most betting volume first
export const SPORT_PRIORITY = [
  "basketball_nba",
  "baseball_mlb",
  "icehockey_nhl",
  "soccer_usa_mls",
  "soccer_epl",
  "soccer_spain_la_liga",
  "soccer_germany_bundesliga",
  "soccer_italy_serie_a",
  "americanfootball_nfl",
  "mma_mixed_martial_arts",
  "boxing_boxing",
  "tennis_atp_french_open",
  "tennis_wta_french_open",
]
