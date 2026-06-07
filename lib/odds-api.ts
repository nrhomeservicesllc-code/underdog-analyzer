import { OddsAPIClient as SdkClient, InvalidAPIKeyError, RateLimitExceededError } from "odds-api-io"
import type { Event as SdkEvent, EventOdds, Sport, Bookmaker as SdkBookmaker, MarketOdds } from "odds-api-io"
import type { OddsApiEvent, Bookmaker, Outcome } from "@/types/betting"

export interface LiveScore {
  homeScore: string
  awayScore: string
  lastUpdate: string
}

export interface OddsDebug {
  sportsFound:    number
  sportIds:       string[]
  allBooks:       number
  selectedBooks:  number
  bookmakerStr:   string
  eventsFound:    number
  oddsEntries:    number
  oddsError:      string | null
  mappedEvents:   number
}

// Priority sport IDs as odds-api.io uses them
const PRIORITY_SPORTS = [
  "basketball", "soccer", "football", "american-football",
  "baseball", "ice-hockey", "tennis", "mma", "boxing", "rugby", "cricket",
]

// Fallback bookmakers if the API returns nothing
const FALLBACK_BOOKMAKERS = "singbet,bet365,pinnacle,betfair,1xbet,williamhill,unibet,bwin,betway,marathonbet"

const MAX_EVENTS = 20

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

  const homeName = sdkEvent.homeParticipant?.name ?? "Home"
  const awayName = sdkEvent.awayParticipant?.name ?? "Away"

  // Find moneyline market — accept any common variant, fall back to first market
  const ml = oddsEntry.markets.find((m: MarketOdds) => {
    const mk = (m.market ?? "").toLowerCase()
    return mk === "moneyline" || mk === "ml" || mk === "h2h" || mk === "1x2" || mk === "match winner" || mk === "match result"
  }) ?? oddsEntry.markets[0]

  if (!ml?.outcomes?.length) return null

  // Group outcomes by bookmaker — outcomes array is flat: [{name, odds, bookmaker}]
  const byBook = new Map<string, { home?: number; away?: number; draw?: number }>()
  for (const o of ml.outcomes) {
    if (!o.bookmaker) continue
    if (!byBook.has(o.bookmaker)) byBook.set(o.bookmaker, {})
    const entry   = byBook.get(o.bookmaker)!
    const nameLow = (o.name ?? "").toLowerCase()
    const homeLow = homeName.toLowerCase()
    const awayLow = awayName.toLowerCase()

    if      (nameLow === homeLow || nameLow === "home" || nameLow === "1")          entry.home = o.odds
    else if (nameLow === awayLow || nameLow === "away" || nameLow === "2")          entry.away = o.odds
    else if (nameLow === "draw" || nameLow === "x" || nameLow === "tie")            entry.draw = o.odds
    else if (entry.home === undefined)                                               entry.home = o.odds
    else if (entry.away === undefined)                                               entry.away = o.odds
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

  const sport  = sdkEvent.sport  ?? "sports"
  const league = sdkEvent.league ?? ""
  const sportKey = `${sport}_${league}`
    .toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "")

  return {
    id:            sdkEvent.id,
    sport_key:     sportKey,
    sport_title:   league ? `${sport} — ${league}` : sport,
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

  async getOdds(): Promise<{ events: OddsApiEvent[]; quota: number; liveEventIds: Set<string>; debug: OddsDebug }> {
    const debug: OddsDebug = {
      sportsFound: 0, sportIds: [], allBooks: 0, selectedBooks: 0,
      bookmakerStr: "", eventsFound: 0, oddsEntries: 0, oddsError: null, mappedEvents: 0,
    }

    try {
      // ── Step 1: discover sports + bookmakers in parallel ───────────────────
      const [sportsRes, allBooksRes, selBooksRes] = await Promise.allSettled([
        this.sdk.getSports(),
        this.sdk.getBookmakers(),
        this.sdk.getSelectedBookmakers(),
      ])

      const allSports:  Sport[]        = sportsRes.status    === "fulfilled" ? sportsRes.value    : []
      const allBooks:   SdkBookmaker[] = allBooksRes.status  === "fulfilled" ? allBooksRes.value  : []
      const selBooks:   SdkBookmaker[] = selBooksRes.status  === "fulfilled" ? selBooksRes.value  : []

      debug.allBooks      = allBooks.length
      debug.selectedBooks = selBooks.length

      // Prefer selected bookmakers; fall back to all; then hardcoded fallback
      const booksToUse = selBooks.length > 0 ? selBooks
                       : allBooks.length > 0  ? allBooks.slice(0, 15)
                       : []
      const bookmakerStr = booksToUse
        .filter((b) => !!b.id).map((b) => b.id).join(",") || FALLBACK_BOOKMAKERS

      debug.bookmakerStr = bookmakerStr.slice(0, 120)

      // Filter sports to priority list; fall back to first 8 available
      const validSports = allSports.filter((s) => !!s.id)
      let sports = validSports
        .filter((s) => PRIORITY_SPORTS.some((p) => s.id.toLowerCase().includes(p)))
        .slice(0, 8)
      if (sports.length === 0 && validSports.length > 0) sports = validSports.slice(0, 8)

      debug.sportsFound = sports.length
      debug.sportIds    = sports.map((s) => s.id)

      if (sports.length === 0) {
        return { events: [], quota: 5000, liveEventIds: new Set(), debug }
      }

      // ── Step 2: fetch events per sport — single call, no status filter ─────
      const now  = Date.now()
      const from = new Date(now - 12 * 60 * 60 * 1000).toISOString()
      const to   = new Date(now + 24 * 60 * 60 * 1000).toISOString()

      const eventBatches = await Promise.all(
        sports.map((s) =>
          this.sdk.getEvents({ sport: s.id, from, to }).catch(() => [] as SdkEvent[])
        )
      )

      const liveEventIds = new Set<string>()
      const seen         = new Set<string>()
      const allSdkEvents: SdkEvent[] = []
      for (const batch of eventBatches) {
        for (const ev of batch) {
          if (seen.has(ev.id)) continue
          seen.add(ev.id)
          allSdkEvents.push(ev)
          if (ev.status === "live") liveEventIds.add(ev.id)
        }
      }

      debug.eventsFound = allSdkEvents.length

      const todayEvents = allSdkEvents.slice(0, MAX_EVENTS)
      if (todayEvents.length === 0) return { events: [], quota: 5000, liveEventIds, debug }

      // ── Step 3: batch odds — surface errors instead of silencing them ──────
      const eventIds = todayEvents.map((e) => e.id).join(",")
      let oddsArr: EventOdds[] = []
      try {
        oddsArr = await this.sdk.getOddsForMultipleEvents({ eventIds, bookmakers: bookmakerStr })
      } catch (e) {
        debug.oddsError = (e as Error).message
      }

      debug.oddsEntries = oddsArr.length

      const oddsById = new Map<string, EventOdds>()
      for (const o of oddsArr) oddsById.set(o.eventId, o)

      // ── Step 4: map to OddsApiEvent ────────────────────────────────────────
      const events: OddsApiEvent[] = []
      for (const sdkEv of todayEvents) {
        const mapped = mapSdkEventToOddsApi(sdkEv, oddsById.get(sdkEv.id))
        if (mapped) events.push(mapped)
      }

      debug.mappedEvents = events.length

      return { events, quota: 5000, liveEventIds, debug }

    } catch (err) {
      if (err instanceof InvalidAPIKeyError)     throw new Error("Events fetch failed: 401")
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
