import { OddsAPIClient as SdkClient, InvalidAPIKeyError, RateLimitExceededError } from "odds-api-io"
import type { OddsApiEvent, Bookmaker } from "@/types/betting"

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

function decimalToAmerican(n: number): number {
  if (!n || n <= 1) return 0
  if (n >= 2) return Math.round((n - 1) * 100)
  return Math.round(-100 / (n - 1))
}

// Actual API response per value bet (SDK types are incorrect):
// {
//   id:              string  — composite "{eventId}-{market}-{betSide}-{bookmaker}-{line}"
//   eventId:         string  — numeric event ID
//   betSide:         "home"|"away"
//   expectedValue:   number
//   market:          { name: string, hdp?: number, home: string, away: string, max?: number }
//   bookmaker:       string
//   bookmakerOdds:   { home: string, away: string, hdp?: string, href: string }
//   event?:          Event   (when includeEventDetails: true)
// }
type RawBet = Record<string, unknown>

// Markets where home/away odds represent TEAM win probability
const MONEYLINE_NAMES = new Set([
  "ml", "moneyline", "money line", "1x2", "match winner", "match result",
  "fulltime result", "ft result", "h2h", "2-way", "win",
])
const TOTAL_NAMES = new Set(["total", "over/under", "o/u", "over", "under"])

function isMoneyline(marketName: string): boolean {
  return MONEYLINE_NAMES.has(marketName.toLowerCase().trim())
}
function isTotal(marketName: string): boolean {
  const n = marketName.toLowerCase().trim()
  return TOTAL_NAMES.has(n) || n.startsWith("total ") || n.startsWith("over ") || n.includes("totals")
}

// Try multiple field name conventions used across sports/bookmakers:
//   home/away (Spread), 1/2 (European ML), or any two decimal numbers in range
function extractOdds(obj: RawBet): { home: number; away: number } | null {
  const candidates = [
    [obj.home, obj.away],
    [obj["1"],  obj["2"]],
  ]
  for (const [h, a] of candidates) {
    const hN = parseFloat(String(h ?? ""))
    const aN = parseFloat(String(a ?? ""))
    if (hN > 1 && aN > 1) return { home: hN, away: aN }
  }
  // Last resort: first two numbers in 1.01–50 range (skip href, hdp, max)
  const SKIP = new Set(["href", "hdp", "max"])
  const nums: number[] = []
  for (const [k, v] of Object.entries(obj)) {
    if (SKIP.has(k)) continue
    const n = parseFloat(String(v ?? ""))
    if (n > 1.01 && n < 50) { nums.push(n); if (nums.length === 2) break }
  }
  return nums.length === 2 ? { home: nums[0], away: nums[1] } : null
}

function isSpread(market: RawBet): boolean {
  const hdpRaw = market.hdp
  if (hdpRaw === undefined || hdpRaw === null) return false
  const n = Number(hdpRaw)
  return !isNaN(n) && n !== 0
}

function convertBets(
  betsByEvent: Map<string, RawBet[]>,
  moneylineOnly: boolean
): { events: OddsApiEvent[]; liveEventIds: Set<string> } {
  const events: OddsApiEvent[] = []
  const liveEventIds = new Set<string>()

  for (const [eventId, vbs] of betsByEvent) {
    if (!eventId || eventId === "undefined") continue

    const withEvent = vbs.find((v) => v.event != null)
    if (!withEvent) continue

    const ev     = withEvent.event as RawBet
    const status = String(ev.status ?? "")
    if (status === "finished") continue

    // Event may use homeParticipant.name (Event type) or plain home/away strings (DroppingOddsEntry type)
    const homeP    = ev.homeParticipant as RawBet | undefined
    const awayP    = ev.awayParticipant as RawBet | undefined
    const homeName = String(homeP?.name ?? ev.home ?? ev.homeTeam ?? "")
    const awayName = String(awayP?.name ?? ev.away ?? ev.awayTeam ?? "")
    if (!homeName || !awayName) continue

    const isLive = status === "live"
    const books: Bookmaker[] = []

    for (const vb of vbs) {
      const market = vb.market as RawBet | undefined
      if (!market) continue

      const marketName = String(market.name ?? "")
      if (isTotal(marketName)) continue
      if (isSpread(market)) continue                          // skip spread/handicap

      if (moneylineOnly && !isMoneyline(marketName)) continue // strict mode

      // Try bookmakerOdds first, fall back to market consensus odds
      const bkOdds = vb.bookmakerOdds as RawBet | undefined
      const odds   = (bkOdds ? extractOdds(bkOdds) : null) ?? extractOdds(market)
      if (!odds) continue

      const bkName = String(vb.bookmaker ?? "Unknown")
      const lu     = new Date().toISOString()

      books.push({
        key:         bkName.toLowerCase().replace(/[^a-z0-9]/g, "_"),
        title:       bkName,
        last_update: lu,
        markets:     [{
          key:         "h2h",
          last_update: lu,
          outcomes:    [
            { name: homeName, price: decimalToAmerican(odds.home) },
            { name: awayName, price: decimalToAmerican(odds.away) },
          ],
        }],
      })
    }

    if (!books.length) continue
    if (isLive) liveEventIds.add(eventId)

    const sportRaw  = ev.sport  as RawBet | string | undefined
    const leagueRaw = ev.league as RawBet | string | undefined
    const sportStr  = typeof sportRaw  === "object" ? String((sportRaw  as RawBet)?.name ?? (sportRaw  as RawBet)?.slug ?? "Sports") : String(sportRaw  ?? "Sports")
    const leagueStr = typeof leagueRaw === "object" ? String((leagueRaw as RawBet)?.name ?? (leagueRaw as RawBet)?.slug ?? "")       : String(leagueRaw ?? "")
    const sportKey  = `${sportStr}_${leagueStr}`.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "")

    events.push({
      id:            eventId,
      sport_key:     sportKey,
      sport_title:   leagueStr ? `${sportStr} — ${leagueStr}` : sportStr,
      commence_time: String(ev.startTime ?? ev.date ?? new Date().toISOString()),
      home_team:     homeName,
      away_team:     awayName,
      bookmakers:    books,
    })
  }

  return { events, liveEventIds }
}

function asArray<T>(val: unknown): T[] {
  if (Array.isArray(val)) return val as T[]
  if (val && typeof val === "object") {
    for (const key of ["data", "bookmakers", "results", "items", "selected", "bets", "valueBets"]) {
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
      // ── Step 1: selected bookmakers ─────────────────────────────────────────
      const BASE = "https://api2.odds-api.io/v3"
      const [authBooksRaw, selBooksRes] = await Promise.allSettled([
        fetch(`${BASE}/bookmakers?apiKey=${this.key}`, {
          headers: { "User-Agent": "odds-api-io-node-sdk/1.0.0" },
        }).then((r) => r.json()),
        this.sdk.getSelectedBookmakers(),
      ])

      const allBooks = authBooksRaw.status === "fulfilled" ? asArray<RawBet>(authBooksRaw.value) : []
      const selBooks = selBooksRes.status  === "fulfilled" ? asArray<unknown>(selBooksRes.value) : []

      debug.allBooks       = allBooks.length
      debug.selectedBooks  = selBooks.length
      debug.firstBookmaker = allBooks[0] ? JSON.stringify(allBooks[0]) : (selBooks[0] ? JSON.stringify(selBooks[0]) : "none")

      const toBookId = (b: unknown): string => {
        if (typeof b === "string") return b
        const raw = b as RawBet
        return String(raw.id ?? raw.slug ?? raw.key ?? raw.name ?? "")
      }

      if (selBooks.length === 0) {
        throw new Error(
          "SETUP_BOOKMAKERS: Your odds-api.io account has no bookmakers selected. " +
          "Log in at odds-api.io/manage, select 1–2 bookmakers, then refresh."
        )
      }

      const selBookIds = selBooks.map(toBookId).filter(Boolean)
      debug.bookmakerStr = selBookIds.join(",").slice(0, 120)

      // ── Step 2: value bets per selected bookmaker ───────────────────────────
      const allRawBets: RawBet[] = []
      const betErrors: string[]  = []

      for (let i = 0; i < selBookIds.length; i++) {
        if (i > 0) await new Promise((r) => setTimeout(r, 350))
        try {
          const raw  = await this.sdk.getValueBets({ bookmaker: selBookIds[i], includeEventDetails: true })
          const bets = asArray<RawBet>(raw)
          allRawBets.push(...bets)
        } catch (e: unknown) {
          betErrors.push(`${selBookIds[i]}: ${(e as Error).message.slice(0, 60)}`)
        }
      }

      debug.oddsEntries = allRawBets.length
      if (betErrors.length) debug.oddsError = betErrors.join(" | ")

      if (allRawBets.length === 0) {
        debug.oddsError = (debug.oddsError ? debug.oddsError + " | " : "") +
          `No value bets returned for: ${selBookIds.join(",")}`
        return { events: [], quota: 5000, liveEventIds: new Set(), debug }
      }

      // ── Step 3: group by event ─────────────────────────────────────────────
      // vb.eventId is the plain numeric event ID; fall back to parsing composite id
      const betsByEvent = new Map<string, RawBet[]>()
      for (const vb of allRawBets) {
        const eid = String(vb.eventId ?? String(vb.id ?? "").split("-")[0] ?? "")
        if (!eid) continue
        if (!betsByEvent.has(eid)) betsByEvent.set(eid, [])
        betsByEvent.get(eid)!.push(vb)
      }

      debug.eventsFound = betsByEvent.size

      // ── Step 4: map to OddsApiEvent ────────────────────────────────────────
      // First pass: strict moneyline markets only
      let { events, liveEventIds } = convertBets(betsByEvent, true)

      // Second pass: if no moneyline value bets, include all non-total markets
      if (events.length === 0) {
        ({ events, liveEventIds } = convertBets(betsByEvent, false))
      }

      debug.mappedEvents = events.length

      if (events.length === 0 && allRawBets.length > 0) {
        const names = [...new Set(allRawBets.map((v) => {
          const m = v.market as RawBet | undefined
          return String(m?.name ?? "?")
        }))].join(",")
        // Show first ML entry structure for diagnosis
        const firstML = allRawBets.find((v) => String((v.market as RawBet | undefined)?.name ?? "").toLowerCase() === "ml")
        const { event: _ev, ...mlRest } = firstML ?? {}
        const mlStr = firstML ? ` | First ML: ${JSON.stringify(mlRest).slice(0, 220)}` : ""
        debug.oddsError = (debug.oddsError ? debug.oddsError + " | " : "") +
          `Still 0 mapped. Markets: [${names}]${mlStr}`
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
