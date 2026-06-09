import { OddsAPIClient as SdkClient, InvalidAPIKeyError, RateLimitExceededError } from "odds-api-io"
import type { ValueBet } from "odds-api-io"
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

function decimalToAmerican(n: number): number {
  if (!n || n <= 1) return 0
  if (n >= 2) return Math.round((n - 1) * 100)
  return Math.round(-100 / (n - 1))
}

const MONEYLINE_KEYS = new Set([
  "ml", "moneyline", "h2h", "1x2",
  "match winner", "match result", "fulltime result", "ft result", "1",
])

// Convert grouped ValueBets per event into OddsApiEvent objects.
// For each value bet we know the actual bookmaker odds for the VALUE side.
// We compute synthetic fair-value odds for the OTHER side so the analyzer
// has both outcomes and can calculate EV correctly.
function valueBetsToEvents(
  betsByEvent: Map<string, ValueBet[]>
): { events: OddsApiEvent[]; liveEventIds: Set<string> } {
  const events: OddsApiEvent[] = []
  const liveEventIds = new Set<string>()

  for (const [eventId, vbs] of betsByEvent) {
    const withEvent = vbs.find((v) => v.event)
    if (!withEvent?.event) continue

    const ev = withEvent.event
    if (ev.status === "finished") continue

    const homeName = ev.homeParticipant?.name ?? "Home"
    const awayName = ev.awayParticipant?.name ?? "Away"
    if (homeName === "Home" && awayName === "Away") continue  // no real team names
    const isLive = ev.status === "live"

    const books: Bookmaker[] = []

    for (const vb of vbs) {
      // Only moneyline markets (no spreads/totals)
      if (!MONEYLINE_KEYS.has(vb.market.toLowerCase())) continue
      if (vb.fairOdds <= 1 || vb.odds <= 1) continue

      // Derive other-side fair odds from fairOdds (no-vig probability)
      const fairProb      = 1 / vb.fairOdds
      const otherFairProb = Math.max(0.01, 1 - fairProb)
      const otherFairDec  = 1 / otherFairProb

      // Match outcome to home/away
      const outLow = vb.outcome.toLowerCase()
      const isHome =
        outLow === homeName.toLowerCase() ||
        outLow === "home" ||
        outLow === "1"

      const homeDecimal = isHome ? vb.odds : otherFairDec
      const awayDecimal = isHome ? otherFairDec : vb.odds

      if (homeDecimal <= 1 || awayDecimal <= 1) continue

      const lu       = new Date().toISOString()
      const outcomes: Outcome[] = [
        { name: homeName, price: decimalToAmerican(homeDecimal) },
        { name: awayName, price: decimalToAmerican(awayDecimal) },
      ]

      books.push({
        key:         vb.bookmaker.toLowerCase().replace(/[^a-z0-9]/g, "_"),
        title:       vb.bookmaker,
        last_update: lu,
        markets:     [{ key: "h2h", last_update: lu, outcomes }],
      })
    }

    if (!books.length) continue

    if (isLive) liveEventIds.add(eventId)

    const sportStr  = String(ev.sport  ?? "Sports")
    const leagueStr = String(ev.league ?? "")
    const sportKey  = `${sportStr}_${leagueStr}`
      .toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "")

    events.push({
      id:            eventId,
      sport_key:     sportKey,
      sport_title:   leagueStr ? `${sportStr} — ${leagueStr}` : sportStr,
      commence_time: ev.startTime,
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
      // ── Step 1: get selected bookmakers ──────────────────────────────────────
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

      const selBookIds = selBooks.map(toBookId).filter(Boolean)
      debug.bookmakerStr = selBookIds.join(",").slice(0, 120)

      // ── Step 2: fetch value bets for each selected bookmaker ─────────────────
      // getValueBets takes a single bookmaker; call once per selected bookmaker.
      const allValueBets: ValueBet[] = []
      const betErrors: string[] = []

      for (let i = 0; i < selBookIds.length; i++) {
        if (i > 0) await new Promise((r) => setTimeout(r, 350))
        try {
          const raw = await this.sdk.getValueBets({ bookmaker: selBookIds[i], includeEventDetails: true })
          const bets = asArray<ValueBet>(raw)
          allValueBets.push(...bets)
        } catch (e: unknown) {
          betErrors.push(`${selBookIds[i]}: ${(e as Error).message.slice(0, 60)}`)
        }
      }

      debug.oddsEntries = allValueBets.length

      if (betErrors.length) {
        debug.oddsError = betErrors.join(" | ")
      }

      if (allValueBets.length === 0) {
        debug.oddsError = (debug.oddsError ?? "") +
          (debug.oddsError ? " | " : "") +
          `No value bets returned for bookmakers: ${selBookIds.join(",")}`
        return { events: [], quota: 5000, liveEventIds: new Set(), debug }
      }

      // ── Step 3: group by eventId ──────────────────────────────────────────────
      const betsByEvent = new Map<string, ValueBet[]>()
      for (const vb of allValueBets) {
        if (!betsByEvent.has(vb.eventId)) betsByEvent.set(vb.eventId, [])
        betsByEvent.get(vb.eventId)!.push(vb)
      }

      debug.eventsFound = betsByEvent.size

      // ── Step 4: convert to OddsApiEvent ──────────────────────────────────────
      const { events, liveEventIds } = valueBetsToEvents(betsByEvent)
      debug.mappedEvents = events.length

      if (events.length === 0 && allValueBets.length > 0) {
        const sample = allValueBets[0]
        debug.oddsError = `valueBets found but none mapped. Sample: market=${sample.market} outcome=${sample.outcome} odds=${sample.odds} hasEvent=${!!sample.event}`
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
