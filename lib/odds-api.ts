import { OddsAPIClient as SdkClient, InvalidAPIKeyError, RateLimitExceededError } from "odds-api-io"
import type { Event as SdkEvent, EventOdds } from "odds-api-io"
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

// Known sport IDs for odds-api.io
const SPORT_IDS = [
  "basketball",
  "football",
  "american-football",
  "baseball",
  "ice-hockey",
  "tennis",
  "mma",
  "boxing",
]

const MAX_EVENTS = 10  // odds-api.io /odds/multi limit

function decimalToAmerican(n: number): number {
  if (!n || n <= 1) return 0
  if (n >= 2) return Math.round((n - 1) * 100)
  return Math.round(-100 / (n - 1))
}

// Maps a raw odds-api.io response entry (actual shape: {id, home, away, date, status, sport, league, bookmakers})
// where bookmakers is Record<string, Array<{name: string, odds: Array<Record<string, number>>}>>
function mapOddsEntryToEvent(raw: Record<string, unknown>): { event: OddsApiEvent; isLive: boolean } | null {
  const id = String(raw.id ?? "")
  if (!id) return null

  const homeName = String(raw.home ?? "Home")
  const awayName = String(raw.away ?? "Away")
  const isLive   = String(raw.status ?? "").toLowerCase() === "live"

  const bookmakerData = raw.bookmakers
  if (!bookmakerData || typeof bookmakerData !== "object" || Array.isArray(bookmakerData)) return null

  type RawMarket = { name?: string; odds?: Record<string, unknown>[] }
  const books: Bookmaker[] = []

  for (const [bkName, markets] of Object.entries(bookmakerData as Record<string, unknown>)) {
    if (!Array.isArray(markets) || markets.length === 0) continue

    const rawMarkets = markets as RawMarket[]

    // Prefer moneyline/h2h market; fall back to first
    const ml = rawMarkets.find((m) => {
      const mk = (m.name ?? "").toLowerCase()
      return ["moneyline", "ml", "h2h", "1x2", "match winner", "match result", "fulltime result"].includes(mk)
    }) ?? rawMarkets[0]

    if (!ml?.odds?.length) continue

    let homeOdds: number | undefined
    let awayOdds: number | undefined
    let drawOdds: number | undefined

    for (const sel of ml.odds) {
      for (const [k, v] of Object.entries(sel)) {
        if (typeof v !== "number") continue
        const kl = k.toLowerCase()
        if      (kl === "home" || kl === "1" || kl === homeName.toLowerCase()) homeOdds = v
        else if (kl === "away" || kl === "2" || kl === awayName.toLowerCase()) awayOdds = v
        else if (kl === "draw" || kl === "x" || kl === "tie")                  drawOdds = v
        else if (homeOdds === undefined) homeOdds = v
        else if (awayOdds === undefined) awayOdds = v
      }
    }

    if (homeOdds === undefined || awayOdds === undefined) continue

    const lu = new Date().toISOString()
    const outcomes: Outcome[] = [
      { name: homeName, price: decimalToAmerican(homeOdds) },
      { name: awayName, price: decimalToAmerican(awayOdds) },
    ]
    if (drawOdds !== undefined) outcomes.push({ name: "Draw", price: decimalToAmerican(drawOdds) })

    books.push({
      key:         bkName.toLowerCase().replace(/[^a-z0-9]/g, "_"),
      title:       bkName,
      last_update: lu,
      markets:     [{ key: "h2h", last_update: lu, outcomes }],
    })
  }

  if (books.length === 0) return null

  const sportObj  = raw.sport  as Record<string, unknown> | undefined
  const leagueObj = raw.league as Record<string, unknown> | undefined
  const sportName  = String(sportObj?.name  ?? sportObj?.slug  ?? "Sports")
  const leagueName = String(leagueObj?.name ?? leagueObj?.slug ?? "")
  const sportKey   = `${sportName}_${leagueName}`
    .toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "")

  return {
    event: {
      id,
      sport_key:     sportKey,
      sport_title:   leagueName ? `${sportName} — ${leagueName}` : sportName,
      commence_time: String(raw.date ?? new Date().toISOString()),
      home_team:     homeName,
      away_team:     awayName,
      bookmakers:    books,
    },
    isLive,
  }
}

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
      // ── Step 1: get bookmaker slugs ────────────────────────────────────────
      const BASE = "https://api2.odds-api.io/v3"
      const [authBooksRaw, selBooksRes] = await Promise.allSettled([
        fetch(`${BASE}/bookmakers?apiKey=${this.key}`, {
          headers: { "User-Agent": "odds-api-io-node-sdk/1.0.0" },
        }).then((r) => r.json()),
        this.sdk.getSelectedBookmakers(),
      ])

      const allBooks = authBooksRaw.status === "fulfilled" ? asArray<Record<string, unknown>>(authBooksRaw.value) : []
      const selBooks = selBooksRes.status  === "fulfilled" ? asArray<unknown>(selBooksRes.value)  : []

      debug.allBooks      = allBooks.length
      debug.selectedBooks = selBooks.length
      debug.firstBookmaker = allBooks[0] ? JSON.stringify(allBooks[0]) : (selBooks[0] ? JSON.stringify(selBooks[0]) : "none")

      const toBookId = (b: unknown): string => {
        if (typeof b === "string") return b
        const raw = b as Record<string, unknown>
        return String(raw.id ?? raw.slug ?? raw.key ?? raw.name ?? "")
      }

      if (selBooks.length === 0) {
        throw new Error(
          "SETUP_BOOKMAKERS: Your odds-api.io account has no bookmakers selected. " +
          "Log in at odds-api.io/manage, select 1–2 bookmakers, then refresh."
        )
      }

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

      // ── Step 2: fetch events sequentially to avoid rate limits ───────────────
      // Sequential with 350ms gap; stop as soon as we have MAX_EVENTS
      const sportErrors: string[] = []
      const seen         = new Set<string>()
      const allSdkEvents: SdkEvent[] = []

      for (let i = 0; i < SPORT_IDS.length; i++) {
        if (allSdkEvents.length >= MAX_EVENTS) break
        if (i > 0) await new Promise((r) => setTimeout(r, 350))
        const sportId = SPORT_IDS[i]
        try {
          const batch = asArray<SdkEvent>(await this.sdk.getEvents({ sport: sportId, from, to }))
          for (const ev of batch) {
            if (seen.has(ev.id)) continue
            seen.add(ev.id)
            allSdkEvents.push(ev)
          }
        } catch (e: unknown) {
          sportErrors.push(`${sportId}: ${(e as Error).message}`)
        }
      }

      if (sportErrors.length) {
        debug.oddsError = sportErrors.slice(0, 2).join(" | ")
      }

      debug.eventsFound = allSdkEvents.length

      const todayEvents = allSdkEvents.slice(0, MAX_EVENTS)
      if (todayEvents.length === 0) return { events: [], quota: 5000, liveEventIds: new Set(), debug }

      // ── Step 3: fetch odds ─────────────────────────────────────────────────
      const eventIds = todayEvents.map((e) => e.id).join(",")
      let oddsArr: EventOdds[] = []
      try {
        oddsArr = asArray<EventOdds>(await this.sdk.getOddsForMultipleEvents({ eventIds, bookmakers: bookmakerStr }))
      } catch (e) {
        const msg = `Odds: ${(e as Error).message}`
        debug.oddsError = debug.oddsError ? `${debug.oddsError} | ${msg}` : msg
      }

      debug.oddsEntries = oddsArr.length

      // ── Step 4: map odds entries directly ──────────────────────────────────
      // Actual response shape: {id, home, away, date, status, sport, league, urls, bookmakers}
      // where bookmakers is Record<string, Array<{name, odds}>>
      const liveEventIds = new Set<string>()
      const events: OddsApiEvent[] = []
      for (const o of oddsArr) {
        const raw    = o as unknown as Record<string, unknown>
        const result = mapOddsEntryToEvent(raw)
        if (!result) continue
        events.push(result.event)
        if (result.isLive) liveEventIds.add(result.event.id)
      }

      if (events.length === 0 && oddsArr.length > 0) {
        const raw = oddsArr[0] as unknown as Record<string, unknown>
        const bks = raw.bookmakers
        const bksInfo = bks && typeof bks === "object" && !Array.isArray(bks)
          ? `keys=${Object.keys(bks as object).slice(0, 3).join(",")}`
          : `type=${typeof bks} isArray=${Array.isArray(bks)}`
        debug.oddsError = `Mapping failed. Entry keys: ${Object.keys(raw).join(",")} | bookmakers: ${bksInfo}`
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
