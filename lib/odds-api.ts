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

// Major sports first — odds-api.io coverage is best for these
const SPORT_IDS = [
  "american-football",
  "basketball",
  "baseball",
  "ice-hockey",
  "football",   // soccer
  "tennis",
  "mma",
  "boxing",
]

const ODDS_BATCH_SIZE   = 10   // odds-api.io /odds/multi max event IDs
const MAX_EVENTS_TOTAL  = 80   // collect up to this many events across all sports
const NEED_MAPPED       = 2    // stop batching once we have a live + upcoming

function decimalToAmerican(n: number): number {
  if (!n || n <= 1) return 0
  if (n >= 2) return Math.round((n - 1) * 100)
  return Math.round(-100 / (n - 1))
}

// Maps a raw odds-api.io response entry.
// Actual shape: {id, home, away, date, status, sport, league, urls, bookmakers}
// where bookmakers is Record<bookmakerName, Array<{name: string, odds: Array<Record<string,number>>}>>
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

    // Prefer moneyline/h2h; fall back to first market
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
      // ── Step 1: get selected bookmaker IDs ────────────────────────────────
      const BASE = "https://api2.odds-api.io/v3"
      const [authBooksRaw, selBooksRes] = await Promise.allSettled([
        fetch(`${BASE}/bookmakers?apiKey=${this.key}`, {
          headers: { "User-Agent": "odds-api-io-node-sdk/1.0.0" },
        }).then((r) => r.json()),
        this.sdk.getSelectedBookmakers(),
      ])

      const allBooks = authBooksRaw.status === "fulfilled" ? asArray<Record<string, unknown>>(authBooksRaw.value) : []
      const selBooks = selBooksRes.status  === "fulfilled" ? asArray<unknown>(selBooksRes.value) : []

      debug.allBooks       = allBooks.length
      debug.selectedBooks  = selBooks.length
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

      // ── Step 2: collect events sequentially across all sports ─────────────
      // 350ms delay between requests to avoid rate limits.
      // Collect up to MAX_EVENTS_TOTAL so we have enough candidates.
      const seen         = new Set<string>()
      const allSdkEvents: SdkEvent[] = []
      const sportErrors: string[] = []

      for (let i = 0; i < SPORT_IDS.length; i++) {
        if (allSdkEvents.length >= MAX_EVENTS_TOTAL) break
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

      if (sportErrors.length) debug.oddsError = sportErrors.slice(0, 2).join(" | ")
      debug.eventsFound = allSdkEvents.length

      if (allSdkEvents.length === 0) return { events: [], quota: 5000, liveEventIds: new Set(), debug }

      // ── Step 3: fetch odds in batches of 10 until we get mapped results ───
      // Bet365/Stake only cover major leagues — skip batches with empty odds.
      const liveEventIds   = new Set<string>()
      const events: OddsApiEvent[] = []
      let   totalOddsEntries = 0
      let   lastBatchError: string | null = null

      for (let offset = 0; offset < allSdkEvents.length; offset += ODDS_BATCH_SIZE) {
        if (events.length >= NEED_MAPPED) break

        const batchEvents = allSdkEvents.slice(offset, offset + ODDS_BATCH_SIZE)
        const eventIds    = batchEvents.map((e) => e.id).join(",")

        if (offset > 0) await new Promise((r) => setTimeout(r, 350))

        let oddsArr: EventOdds[] = []
        try {
          oddsArr = asArray<EventOdds>(
            await this.sdk.getOddsForMultipleEvents({ eventIds, bookmakers: bookmakerStr })
          )
        } catch (e: unknown) {
          lastBatchError = (e as Error).message.slice(0, 80)
          continue
        }

        totalOddsEntries += oddsArr.length

        for (const o of oddsArr) {
          const raw    = o as unknown as Record<string, unknown>
          const result = mapOddsEntryToEvent(raw)
          if (!result) continue
          events.push(result.event)
          if (result.isLive) liveEventIds.add(result.event.id)
        }
      }

      debug.oddsEntries = totalOddsEntries
      debug.mappedEvents = events.length

      if (events.length === 0) {
        debug.oddsError = lastBatchError
          ? `No odds with bookmaker coverage found (last error: ${lastBatchError})`
          : `No odds with bookmaker coverage found across ${allSdkEvents.length} events`
      }

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

export const SPORT_PRIORITY = ["american-football", "basketball", "baseball", "ice-hockey", "football"]
