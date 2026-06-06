import { OddsAPIClient as SdkClient, InvalidAPIKeyError, RateLimitExceededError } from "odds-api-io"
import type { Event as SdkEvent, EventOdds, Sport, Bookmaker as SdkBookmaker, MarketOdds } from "odds-api-io"
import type { OddsApiEvent, Bookmaker, Outcome } from "@/types/betting"

export interface LiveScore {
  homeScore: string
  awayScore: string
  lastUpdate: string
}

// Priority sport IDs as odds-api.io uses them (discovered via getSports())
const PRIORITY_SPORTS = [
  "basketball",
  "soccer",
  "football",           // some APIs use football for soccer
  "american-football",
  "baseball",
  "ice-hockey",
  "tennis",
  "mma",
  "boxing",
  "rugby",
  "cricket",
]

const MAX_EVENTS = 60  // cap to avoid huge odds/multi calls

function decimalToAmerican(n: number): number {
  if (!n || n <= 1) return 0
  if (n >= 2) return Math.round((n - 1) * 100)
  return Math.round(-100 / (n - 1))
}

function mapSdkEventToOddsApi(
  sdkEvent: SdkEvent,
  oddsEntry: EventOdds | undefined
): OddsApiEvent | null {
  if (!oddsEntry || !oddsEntry.markets?.length) return null

  const homeName = sdkEvent.homeParticipant.name
  const awayName = sdkEvent.awayParticipant.name

  // Find moneyline market — try common names
  const ml = oddsEntry.markets.find((m: MarketOdds) => {
    const mk = (m.market ?? "").toLowerCase()
    return mk === "moneyline" || mk === "ml" || mk === "h2h" || mk === "1x2" || mk === "match winner"
  }) ?? oddsEntry.markets[0]

  if (!ml?.outcomes?.length) return null

  // Group outcomes by bookmaker
  const byBook = new Map<string, { home?: number; away?: number; draw?: number }>()
  for (const o of ml.outcomes) {
    if (!byBook.has(o.bookmaker)) byBook.set(o.bookmaker, {})
    const entry = byBook.get(o.bookmaker)!
    const nameLower = (o.name ?? "").toLowerCase()
    const homeMatch = nameLower === homeName.toLowerCase() || nameLower.includes("home") || nameLower === "1"
    const awayMatch = nameLower === awayName.toLowerCase() || nameLower.includes("away") || nameLower === "2"
    const drawMatch = nameLower === "draw" || nameLower === "x" || nameLower === "tie"
    if      (homeMatch) entry.home = o.odds
    else if (awayMatch) entry.away = o.odds
    else if (drawMatch) entry.draw = o.odds
    else {
      // fallback: first unknown → home, second → away
      if (entry.home === undefined) entry.home = o.odds
      else if (entry.away === undefined) entry.away = o.odds
    }
  }

  const books: Bookmaker[] = []
  for (const [bkName, odds] of byBook) {
    if (odds.home === undefined || odds.away === undefined) continue
    const lu = new Date().toISOString()
    const outcomes: Outcome[] = [
      { name: homeName, price: decimalToAmerican(odds.home) },
      { name: awayName, price: decimalToAmerican(odds.away) },
    ]
    if (odds.draw !== undefined) outcomes.push({ name: "Draw", price: decimalToAmerican(odds.draw) })
    books.push({
      key:         bkName.toLowerCase().replace(/[^a-z0-9]/g, "_"),
      title:       bkName,
      last_update: lu,
      markets:     [{ key: "h2h", last_update: lu, outcomes }],
    })
  }

  if (books.length === 0) return null

  const sportKey = `${sdkEvent.sport}_${sdkEvent.league}`
    .toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "")

  return {
    id:            sdkEvent.id,
    sport_key:     sportKey,
    sport_title:   `${sdkEvent.sport} — ${sdkEvent.league}`,
    commence_time: sdkEvent.startTime,
    home_team:     homeName,
    away_team:     awayName,
    bookmakers:    books,
  }
}

export class OddsApiClient {
  private sdk: SdkClient

  constructor(private key: string) {
    this.sdk = new SdkClient({ apiKey: key })
  }

  async getOdds(): Promise<{ events: OddsApiEvent[]; quota: number; liveEventIds: Set<string> }> {
    try {
      // ── Step 1: discover sports and bookmakers in parallel ──────────────────
      const [sportsRes, booksRes] = await Promise.allSettled([
        this.sdk.getSports(),
        this.sdk.getBookmakers(),
      ])

      const allSports: Sport[]         = sportsRes.status === "fulfilled" ? sportsRes.value : []
      const allBooks:  SdkBookmaker[]  = booksRes.status  === "fulfilled" ? booksRes.value  : []

      // Filter sports to our priority list
      const sports = allSports
        .filter((s) => PRIORITY_SPORTS.some((p) => s.id.toLowerCase().includes(p)))
        .slice(0, 8)

      if (sports.length === 0 && allSports.length > 0) {
        // No priority match — take the first 8 available
        sports.push(...allSports.slice(0, 8))
      }

      // Build bookmaker string (comma-separated IDs)
      const bookmakerStr = allBooks.map((b) => b.id).slice(0, 30).join(",")

      // ── Step 2: fetch events per sport ──────────────────────────────────────
      const now  = Date.now()
      const from = new Date(now - 12 * 60 * 60 * 1000).toISOString()
      const to   = new Date(now + 24 * 60 * 60 * 1000).toISOString()

      const eventFetches = sports.flatMap((sport) => [
        this.sdk.getEvents({ sport: sport.id, status: "upcoming", from, to }).catch(() => [] as SdkEvent[]),
        this.sdk.getEvents({ sport: sport.id, status: "live"     }).catch(() => [] as SdkEvent[]),
      ])

      const eventBatches = await Promise.all(eventFetches)

      // Combine and de-duplicate
      const liveEventIds = new Set<string>()
      const seen         = new Set<string>()
      const allSdkEvents: SdkEvent[] = []
      for (let i = 0; i < eventBatches.length; i++) {
        const isLiveBatch = i % 2 === 1
        for (const ev of eventBatches[i]) {
          if (seen.has(ev.id)) continue
          seen.add(ev.id)
          allSdkEvents.push(ev)
          if (isLiveBatch || ev.status === "live") liveEventIds.add(ev.id)
        }
      }

      // Cap to avoid huge odds calls
      const todayEvents = allSdkEvents.slice(0, MAX_EVENTS)
      if (todayEvents.length === 0) return { events: [], quota: 5000, liveEventIds }

      // ── Step 3: batch odds fetch ─────────────────────────────────────────────
      const eventIds = todayEvents.map((e) => e.id).join(",")
      const oddsArr: EventOdds[] = bookmakerStr
        ? await this.sdk.getOddsForMultipleEvents({ eventIds, bookmakers: bookmakerStr }).catch(() => [])
        : []

      const oddsById = new Map<string, EventOdds>()
      for (const o of oddsArr) oddsById.set(o.eventId, o)

      // ── Step 4: map to OddsApiEvent ──────────────────────────────────────────
      const events: OddsApiEvent[] = []
      for (const sdkEv of todayEvents) {
        const mapped = mapSdkEventToOddsApi(sdkEv, oddsById.get(sdkEv.id))
        if (mapped) events.push(mapped)
      }

      return { events, quota: 5000, liveEventIds }

    } catch (err) {
      if (err instanceof InvalidAPIKeyError)   throw new Error("Events fetch failed: 401")
      if (err instanceof RateLimitExceededError) throw new Error("Events fetch failed: 429")
      throw err
    }
  }

  async getLiveScores(_sport: string): Promise<Map<string, LiveScore>> {
    return new Map()
  }
}

export function getClient() {
  const key = process.env.ODDS_API_KEY?.trim()
  if (!key) throw new Error("ODDS_API_KEY not set")
  return new OddsApiClient(key)
}

export const LIVE_WINDOW_MINUTES: Record<string, number> = {
  basketball_nba: 150,
  baseball_mlb: 240,
  icehockey_nhl: 150,
  americanfootball_nfl: 210,
  soccer_epl: 130,
}

export const SPORT_PRIORITY = ["basketball", "soccer", "american-football", "baseball", "ice-hockey"]
