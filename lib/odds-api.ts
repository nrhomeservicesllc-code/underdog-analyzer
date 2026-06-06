import type { OddsApiEvent, Bookmaker, Outcome } from "@/types/betting"

// odds-api.io v3  —  base URL from official quickstart docs
const BASE = "https://api.odds-api.io/v3"

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

// ---------- internal types for odds-api.io response ----------

interface OddsApiIoSport  { name: string; slug: string }

interface OddsApiIoEvent {
  id: number | string
  home: string
  away: string
  // API may return the start time under different field names
  date?: string
  startTime?: string
  commenceTime?: string
  sport?:  OddsApiIoSport
  league?: OddsApiIoSport
  status?: string
}

interface OddsApiIoMarket {
  market?: string
  home?:   number
  draw?:   number
  away?:   number
  lastUpdate?: string
  last_update?: string
}

interface OddsApiIoOddsEntry {
  id?:        number | string
  eventId?:   number | string
  bookmakers?: Record<string, OddsApiIoMarket[]>
}

// ---------- helpers ----------

// Decimal odds (1.85) → American (-118); American odds arrive as ints > 100 / < -100
function toAmerican(n: number): number {
  if (!n || n === 0) return 0
  // Already American: integers like -150, +230
  if (Number.isInteger(n) && (n > 100 || n < -100)) return n
  // Decimal: always >= 1.01
  if (n >= 2) return Math.round((n - 1) * 100)
  if (n > 1)  return Math.round(-100 / (n - 1))
  return 0
}

function eventTime(e: OddsApiIoEvent): string {
  return e.date ?? e.startTime ?? e.commenceTime ?? new Date().toISOString()
}

function mapEvent(e: OddsApiIoEvent, bookmakers?: Record<string, OddsApiIoMarket[]>): OddsApiEvent | null {
  const books: Bookmaker[] = []

  if (bookmakers && typeof bookmakers === "object" && !Array.isArray(bookmakers)) {
    for (const [bookName, markets] of Object.entries(bookmakers)) {
      if (!Array.isArray(markets) || markets.length === 0) continue

      // Accept any moneyline variant; fall back to first market if none found
      const ml = markets.find((m) => {
        const mk = (m.market ?? "").toUpperCase()
        return !mk || mk === "ML" || mk === "MONEYLINE" || mk === "H2H" || mk === "1X2"
      }) ?? markets[0]

      if (!ml) continue

      const lu = ml.lastUpdate ?? ml.last_update ?? new Date().toISOString()
      const outcomes: Outcome[] = []

      if (ml.home !== undefined) outcomes.push({ name: e.home, price: toAmerican(ml.home) })
      if (ml.away !== undefined) outcomes.push({ name: e.away, price: toAmerican(ml.away) })
      if (ml.draw !== undefined) outcomes.push({ name: "Draw",  price: toAmerican(ml.draw)  })

      if (outcomes.length < 2) continue

      books.push({
        key:         bookName.toLowerCase().replace(/[^a-z0-9]/g, "_"),
        title:       bookName,
        last_update: lu,
        markets:     [{ key: "h2h", last_update: lu, outcomes }],
      })
    }
  }

  if (books.length === 0) return null

  const sportSlug  = (e.sport?.slug  ?? "unknown").toLowerCase().replace(/-/g, "_")
  const leagueSlug = (e.league?.slug ?? "unknown").toLowerCase().replace(/-/g, "_")

  return {
    id:           String(e.id),
    sport_key:    `${sportSlug}_${leagueSlug}`,
    sport_title:  e.league?.name
      ? `${e.sport?.name ?? ""} — ${e.league.name}`.replace(/^— /, "")
      : (e.sport?.name ?? "Sports"),
    commence_time: eventTime(e),
    home_team:    e.home,
    away_team:    e.away,
    bookmakers:   books,
  }
}

// ---------- client ----------

export class OddsApiClient {
  constructor(private key: string) {}

  async getOdds(): Promise<{ events: OddsApiEvent[]; quota: number; liveEventIds: Set<string> }> {
    // ── Step 1: fetch all events (minimal params — date filter happens in code) ──
    const evUrl = new URL(`${BASE}/events`)
    evUrl.searchParams.set("apiKey", this.key)

    const evRes = await fetch(evUrl.toString(), { cache: "no-store" })
    if (!evRes.ok) throw new Error(`Events fetch failed: ${evRes.status}`)

    const rawAll: OddsApiIoEvent[] = await evRes.json()
    if (!Array.isArray(rawAll)) throw new Error("Events: unexpected response format")

    // Filter to today window (past 12 h → next 24 h) and de-duplicate
    const now = Date.now()
    const winStart = now - 12 * 60 * 60 * 1000
    const winEnd   = now + 24 * 60 * 60 * 1000
    const seen  = new Set<string>()
    const today: OddsApiIoEvent[] = []
    for (const e of rawAll) {
      const id = String(e.id)
      if (seen.has(id)) continue
      const t = new Date(eventTime(e)).getTime()
      if (!isNaN(t) && (t < winStart || t > winEnd)) continue
      seen.add(id)
      today.push(e)
    }

    const liveEventIds = new Set<string>()
    for (const e of today) {
      const s = (e.status ?? "").toLowerCase()
      if (s === "live" || s === "inplay" || s === "in_play" || s === "in-play") {
        liveEventIds.add(String(e.id))
      }
    }

    if (today.length === 0) {
      return { events: [], quota: parseInt(evRes.headers.get("x-requests-remaining") ?? "5000"), liveEventIds }
    }

    // ── Step 2: fetch odds for today's events in one call ──
    const oddsUrl = new URL(`${BASE}/odds/multi`)
    oddsUrl.searchParams.set("apiKey", this.key)
    oddsUrl.searchParams.set("eventIds", today.map((e) => e.id).join(","))
    oddsUrl.searchParams.set("includeEventDetails", "true")

    const oddsRes = await fetch(oddsUrl.toString(), { cache: "no-store" })
    const quota   = parseInt(oddsRes.headers.get("x-requests-remaining") ?? "5000")

    // Build eventId → bookmakers map
    const byId = new Map<string, Record<string, OddsApiIoMarket[]>>()
    if (oddsRes.ok) {
      const oddsRaw: OddsApiIoOddsEntry[] = await oddsRes.json()
      for (const o of Array.isArray(oddsRaw) ? oddsRaw : []) {
        const id = String(o.eventId ?? o.id ?? "")
        if (id && id !== "undefined" && o.bookmakers) byId.set(id, o.bookmakers)
      }
    }
    // Non-OK odds: log but don't crash — events without odds are filtered out below

    const events: OddsApiEvent[] = []
    for (const ev of today) {
      const mapped = mapEvent(ev, byId.get(String(ev.id)))
      if (mapped) events.push(mapped)
    }

    return { events, quota, liveEventIds }
  }

  // Kept for interface compatibility
  async getLiveScores(_sport: string): Promise<Map<string, LiveScore>> {
    return new Map()
  }
}

export function getClient() {
  const key = process.env.ODDS_API_KEY?.trim()
  if (!key) throw new Error("ODDS_API_KEY not set")
  return new OddsApiClient(key)
}

// Fallback live-window used when event status field is absent
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
  "basketball_nba",
  "baseball_mlb",
  "icehockey_nhl",
  "americanfootball_nfl",
  "mma_mixed_martial_arts",
]
