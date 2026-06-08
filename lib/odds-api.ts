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
      // ── Step 1: authenticated bookmakers call to get real slugs ────────────
      // SDK's getBookmakers() omits auth and returns {name,active} with no slug.
      // Call with auth manually to get the actual bookmaker ID fields.
      const BASE = "https://api2.odds-api.io/v3"
      const [authBooksRaw, selBooksRes] = await Promise.allSettled([
        fetch(`${BASE}/bookmakers?apiKey=${this.key}`, {
          headers: { "User-Agent": "odds-api-io-node-sdk/1.0.0" },
        }).then((r) => r.json()),
        this.sdk.getSelectedBookmakers(),
      ])

      const allBooks: SdkBookmaker[] = authBooksRaw.status === "fulfilled" ? asArray(authBooksRaw.value) : []
      const selBooks: SdkBookmaker[] = selBooksRes.status  === "fulfilled" ? asArray(selBooksRes.value)  : []

      debug.allBooks       = allBooks.length
      debug.selectedBooks  = selBooks.length
      // Show first authenticated bookmaker — should now include slug/id field
      debug.firstBookmaker = allBooks[0] ? JSON.stringify(allBooks[0]) : (selBooks[0] ? JSON.stringify(selBooks[0]) : "none")

      // Extract ID: try id, slug, key, name in order; fall back to string value
      const toBookId = (b: SdkBookmaker): string => {
        if (typeof b === "string") return b  // pass selected name as-is first
        const raw = b as unknown as Record<string, unknown>
        const val = raw.id ?? raw.slug ?? raw.key ?? raw.name ?? b.id ?? ""
        return String(val)
      }

      if (selBooks.length === 0) {
        throw new Error(
          "SETUP_BOOKMAKERS: Your odds-api.io account has no bookmakers selected. " +
          "Log in at odds-api.io/manage, select 1–2 bookmakers, then refresh."
        )
      }

      // Set sport debug fields before any early return
      debug.sportsFound = SPORT_IDS.length
      debug.sportIds    = SPORT_IDS

      const bookmakerStr = selBooks.map(toBookId).filter(Boolean).join(",")
      if (!bookmakerStr) {
        debug.oddsError = `Cannot read bookmaker IDs. First selected obj: ${JSON.stringify(selBooks[0])}`
        return { events: [], quota: 5000, liveEventIds: new Set(), debug }
      }
      debug.bookmakerStr = bookmakerStr.slice(0, 120)

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

      // Normalize IDs to strings — API may return numeric eventId
      const oddsById = new Map<string, EventOdds>()
      for (const o of oddsArr) oddsById.set(String(o.eventId), o)

      // ── Step 4: map to OddsApiEvent ────────────────────────────────────────
      let idMatchCount = 0
      const events: OddsApiEvent[] = []
      for (const sdkEv of todayEvents) {
        const oddsEntry = oddsById.get(String(sdkEv.id))
        if (oddsEntry) idMatchCount++
        const mapped = mapSdkEventToOddsApi(sdkEv, oddsEntry)
        if (mapped) events.push(mapped)
      }

      if (idMatchCount === 0 && oddsArr.length > 0) {
        // IDs still don't match — show sample IDs in debug to diagnose
        debug.oddsError = `ID mismatch: event[0]=${String(todayEvents[0]?.id)} odds[0]=${String(oddsArr[0]?.eventId)}`
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
