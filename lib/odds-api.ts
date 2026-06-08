import { OddsAPIClient as SdkClient, InvalidAPIKeyError, RateLimitExceededError } from "odds-api-io"
import type { Event as SdkEvent, EventOdds, Bookmaker as SdkBookmaker, MarketOdds } from "odds-api-io"
import type { OddsApiEvent, Bookmaker, Outcome } from "@/types/betting"

export interface LiveScore {
  homeScore: string
  awayScore: string
  lastUpdate: string
}

export interface OddsDebug {
  sportsFound:     number
  sportIds:        string[]
  allBooks:        number
  selectedBooks:   number
  firstBookmaker:  string
  bookmakerStr:    string
  eventsFound:     number
  oddsEntries:     number
  oddsError:       string | null
  mappedEvents:    number
}

// Known sport IDs for odds-api.io — used directly (getSports() omits auth header)
const SPORT_IDS = [
  "basketball",
  "football",          // odds-api.io uses "football" not "soccer"
  "american-football",
  "baseball",
  "ice-hockey",
  "tennis",
  "mma",
  "boxing",
]

// Fallback bookmaker IDs if account has none selected
const FALLBACK_BOOKMAKERS = "singbet,bet365,pinnacle,betfair,1xbet,williamhill,unibet,bwin"

const MAX_EVENTS = 10  // odds-api.io /odds/multi limit

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

  // Group flat outcomes array by bookmaker
  const byBook = new Map<string, { home?: number; away?: number; draw?: number }>()
  for (const o of ml.outcomes) {
    if (!o.bookmaker) continue
    if (!byBook.has(o.bookmaker)) byBook.set(o.bookmaker, {})
    const entry   = byBook.get(o.bookmaker)!
    const nameLow = (o.name ?? "").toLowerCase()

    if      (nameLow === homeName.toLowerCase() || nameLow === "home" || nameLow === "1") entry.home = o.odds
    else if (nameLow === awayName.toLowerCase() || nameLow === "away" || nameLow === "2") entry.away = o.odds
    else if (nameLow === "draw" || nameLow === "x" || nameLow === "tie")                  entry.draw = o.odds
    else if (entry.home === undefined)                                                     entry.home = o.odds
    else if (entry.away === undefined)                                                     entry.away = o.odds
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

// The SDK returns raw JSON — actual API shape may differ from TypeScript types.
// Handles plain arrays, {data:[...]}, {bookmakers:[...]}, {results:[...]}, etc.
function asArray<T>(val: unknown): T[] {
  if (Array.isArray(val)) return val as T[]
  if (val && typeof val === "object") {
    for (const key of ["data", "bookmakers", "results", "items", "selected"]) {
      const v = (val as Record<string, unknown>)[key]
      if (Array.isArray(v)) return v as T[]
    }
  }
  return []
}

export class OddsApiClient {
  private sdk: SdkClient

  constructor(private key: string) {
    this.sdk = new SdkClient({ apiKey: key })
  }

  async getOdds(): Promise<{ events: OddsApiEvent[]; quota: number; liveEventIds: Set<string>; debug: OddsDebug }> {
    const debug: OddsDebug = {
      sportsFound: 0, sportIds: [], allBooks: 0, selectedBooks: 0,
      firstBookmaker: "", bookmakerStr: "", eventsFound: 0, oddsEntries: 0, oddsError: null, mappedEvents: 0,
    }

    try {
      // ── Step 1: bookmakers only — getSports() omits auth so always returns empty ──
      const [allBooksRes, selBooksRes] = await Promise.allSettled([
        this.sdk.getBookmakers(),
        this.sdk.getSelectedBookmakers(),
      ])

      const allBooks: SdkBookmaker[] = allBooksRes.status === "fulfilled" ? asArray(allBooksRes.value) : []
      const selBooks: SdkBookmaker[] = selBooksRes.status === "fulfilled" ? asArray(selBooksRes.value) : []

      debug.allBooks       = allBooks.length
      debug.selectedBooks  = selBooks.length
      debug.firstBookmaker = selBooks[0]
        ? JSON.stringify(selBooks[0])
        : (allBooks[0] ? JSON.stringify(allBooks[0]) : "none")

      // Try every plausible field name the API might use for the bookmaker identifier
      const toBookId = (b: SdkBookmaker): string => {
        const raw = b as unknown as Record<string, unknown>
        const val = raw.id ?? raw.slug ?? raw.key ?? raw.bookmaker ?? raw.name ?? b.id ?? ""
        return String(val).toLowerCase().replace(/\s+/g, "")
      }

      if (selBooks.length === 0) {
        throw new Error(
          "SETUP_BOOKMAKERS: Your odds-api.io account has no bookmakers selected. " +
          "Log in at odds-api.io/manage, select 1–2 bookmakers, then refresh."
        )
      }

      const bookmakerStr = selBooks.map(toBookId).filter(Boolean).join(",")
      if (!bookmakerStr) {
        // Can't extract IDs — surface raw object in diagnostic instead of crashing
        debug.oddsError = `Cannot read bookmaker IDs. First selected obj: ${JSON.stringify(selBooks[0])}`
        return { events: [], quota: 5000, liveEventIds: new Set(), debug }
      }
      debug.bookmakerStr = bookmakerStr.slice(0, 120)

      // ── Step 2: fetch events using known sport IDs (no getSports() call) ──
      debug.sportsFound = SPORT_IDS.length
      debug.sportIds    = SPORT_IDS

      const now  = Date.now()
      const from = new Date(now - 12 * 60 * 60 * 1000).toISOString()
      const to   = new Date(now + 24 * 60 * 60 * 1000).toISOString()

      const eventErrors: string[] = []
      const eventBatches = await Promise.all(
        SPORT_IDS.map((sportId, i) =>
          this.sdk.getEvents({ sport: sportId, from, to })
            .then((r) => asArray<SdkEvent>(r))
            .catch((e: Error) => {
              if (i < 2) eventErrors.push(`${sportId}: ${e.message}`)
              return [] as SdkEvent[]
            })
        )
      )

      if (eventErrors.length) {
        debug.oddsError = eventErrors.join(" | ")
      }

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

      // ── Step 3: batch odds — surface errors ────────────────────────────────
      const eventIds = todayEvents.map((e) => e.id).join(",")
      let oddsArr: EventOdds[] = []
      try {
        oddsArr = asArray<EventOdds>(await this.sdk.getOddsForMultipleEvents({ eventIds, bookmakers: bookmakerStr }))
      } catch (e) {
        const msg = `Odds: ${(e as Error).message}`
        debug.oddsError = debug.oddsError ? `${debug.oddsError} | ${msg}` : msg
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
