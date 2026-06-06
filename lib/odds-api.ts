import type { OddsApiEvent, Bookmaker, Outcome } from "@/types/betting"

// Odds-API.io v3 — base URL from official Node SDK
const BASE = "https://api2.odds-api.io/v3"

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

// Internal types for odds-api.io response format
interface OddsApiIoSport {
  name: string
  slug: string
}

interface OddsApiIoEvent {
  id: number | string
  home: string
  away: string
  date: string
  sport?: OddsApiIoSport
  league?: OddsApiIoSport
  status?: string
}

interface OddsApiIoMarket {
  market: string
  home?: number
  draw?: number
  away?: number
  lastUpdate?: string
  last_update?: string
}

interface OddsApiIoEventWithOdds extends OddsApiIoEvent {
  bookmakers?: Record<string, OddsApiIoMarket[]>
}

// Convert decimal odds (e.g. 1.85) to American odds (e.g. -118)
function decimalToAmerican(decimal: number): number {
  if (!decimal || decimal <= 1) return 0
  if (decimal >= 2) return Math.round((decimal - 1) * 100)
  return Math.round(-100 / (decimal - 1))
}

function mapToOddsApiEvent(e: OddsApiIoEventWithOdds): OddsApiEvent | null {
  const books: Bookmaker[] = []

  if (e.bookmakers && typeof e.bookmakers === "object" && !Array.isArray(e.bookmakers)) {
    for (const [bookName, markets] of Object.entries(e.bookmakers)) {
      if (!Array.isArray(markets) || markets.length === 0) continue

      // Find moneyline market — "ML", "moneyline", "h2h", "1x2"
      const ml = markets.find((m) => {
        const mk = (m.market ?? "").toUpperCase()
        return mk === "ML" || mk === "MONEYLINE" || mk === "H2H" || mk === "1X2"
      }) ?? markets[0]

      if (!ml) continue

      const lastUpdate = ml.lastUpdate ?? ml.last_update ?? new Date().toISOString()
      const outcomes: Outcome[] = []

      if (ml.home !== undefined && ml.home > 1) {
        outcomes.push({ name: e.home, price: decimalToAmerican(ml.home) })
      }
      if (ml.away !== undefined && ml.away > 1) {
        outcomes.push({ name: e.away, price: decimalToAmerican(ml.away) })
      }
      if (ml.draw !== undefined && ml.draw > 1) {
        outcomes.push({ name: "Draw", price: decimalToAmerican(ml.draw) })
      }

      if (outcomes.length < 2) continue

      books.push({
        key: bookName.toLowerCase().replace(/[^a-z0-9]/g, "_"),
        title: bookName,
        last_update: lastUpdate,
        markets: [{ key: "h2h", last_update: lastUpdate, outcomes }],
      })
    }
  }

  if (books.length === 0) return null

  // Build sport_key: "football" + "premier-league" → "soccer_epl" style key
  const sportSlug  = (e.sport?.slug  ?? "unknown").toLowerCase().replace(/-/g, "_")
  const leagueSlug = (e.league?.slug ?? "unknown").toLowerCase().replace(/-/g, "_")
  const sportKey   = `${sportSlug}_${leagueSlug}`
  const sportTitle = e.league?.name
    ? `${e.sport?.name ?? ""} — ${e.league.name}`.replace(/^— /, "")
    : (e.sport?.name ?? "Sports")

  return {
    id: String(e.id),
    sport_key: sportKey,
    sport_title: sportTitle,
    commence_time: e.date,
    home_team: e.home,
    away_team: e.away,
    bookmakers: books,
  }
}

export class OddsApiClient {
  constructor(private key: string) {}

  async getOdds(): Promise<{ events: OddsApiEvent[]; quota: number; liveEventIds: Set<string> }> {
    const now  = Date.now()
    const from = new Date(now - 12 * 60 * 60 * 1000).toISOString()
    const to   = new Date(now + 24 * 60 * 60 * 1000).toISOString()

    // Fetch live events and upcoming events in parallel
    const [liveRes, upcomingRes] = await Promise.all([
      fetch(`${BASE}/events/live?apiKey=${this.key}`, { cache: "no-store" }),
      fetch(
        `${BASE}/events?apiKey=${this.key}&status=upcoming&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        { cache: "no-store" }
      ),
    ])

    if (!liveRes.ok && !upcomingRes.ok) {
      // Both failed — surface the more informative error
      const status = !liveRes.ok ? liveRes.status : upcomingRes.status
      throw new Error(`Events fetch failed: ${status}`)
    }

    const liveEvents: OddsApiIoEvent[]     = liveRes.ok     ? await liveRes.json()     : []
    const upcomingEvents: OddsApiIoEvent[] = upcomingRes.ok ? await upcomingRes.json() : []

    // Combine, de-duplicate by id
    const seen   = new Set<string>()
    const allRaw: OddsApiIoEvent[] = []
    for (const e of [...liveEvents, ...upcomingEvents]) {
      const id = String(e.id)
      if (!seen.has(id)) { seen.add(id); allRaw.push(e) }
    }

    const liveEventIds = new Set(
      liveEvents.map((e) => String(e.id))
    )

    // Also treat any event with status "live" as live
    for (const e of upcomingEvents) {
      if ((e.status ?? "").toLowerCase() === "live") liveEventIds.add(String(e.id))
    }

    if (allRaw.length === 0) {
      const quota = this.extractQuota(liveRes.ok ? liveRes : upcomingRes)
      return { events: [], quota, liveEventIds }
    }

    // Fetch odds for all events in one batch call
    const eventIds = allRaw.map((e) => e.id).join(",")
    const oddsUrl  = new URL(`${BASE}/odds/multi`)
    oddsUrl.searchParams.set("apiKey", this.key)
    oddsUrl.searchParams.set("eventIds", eventIds)
    oddsUrl.searchParams.set("market", "moneyline")

    const oddsRes = await fetch(oddsUrl.toString(), { cache: "no-store" })
    const quota   = this.extractQuota(oddsRes)

    if (!oddsRes.ok) {
      throw new Error(`Odds fetch failed: ${oddsRes.status}`)
    }

    const oddsData: OddsApiIoEventWithOdds[] = await oddsRes.json()

    // Build lookup: eventId → bookmakers
    const oddsById = new Map<string, Record<string, OddsApiIoMarket[]>>()
    for (const o of Array.isArray(oddsData) ? oddsData : []) {
      const asAny = o as { id?: unknown; eventId?: unknown }
      const id = String(o.id ?? asAny.eventId)
      if (id && o.bookmakers) oddsById.set(id, o.bookmakers)
    }

    const events: OddsApiEvent[] = []
    for (const ev of allRaw) {
      const id   = String(ev.id)
      const bks  = oddsById.get(id)
      const full: OddsApiIoEventWithOdds = { ...ev, bookmakers: bks }
      const mapped = mapToOddsApiEvent(full)
      if (mapped) events.push(mapped)
    }

    return { events, quota, liveEventIds }
  }

  // Legacy method kept for interface compatibility — live status now comes from events API
  async getLiveScores(_sport: string): Promise<Map<string, LiveScore>> {
    return new Map()
  }

  private extractQuota(res: Response): number {
    return parseInt(
      res.headers.get("x-requests-remaining") ??
      res.headers.get("x-ratelimit-remaining") ??
      res.headers.get("x-hourly-remaining") ??
      "5000"
    )
  }
}

export function getClient() {
  const key = process.env.ODDS_API_KEY?.trim()
  if (!key) throw new Error("ODDS_API_KEY not set")
  return new OddsApiClient(key)
}

// Fallback live-window used when event status is unknown (not from API)
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
  "basketball_nba",
  "baseball_mlb",
  "icehockey_nhl",
  "americanfootball_nfl",
  "mma_mixed_martial_arts",
  "boxing_boxing",
]
