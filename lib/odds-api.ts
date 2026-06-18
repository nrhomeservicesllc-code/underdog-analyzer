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
  liveDebug:       string
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

    // Extract the best EV% the API computed using its sharp-book reference prices.
    // The API returns expectedValue as a return percentage (108.25 → 8.25% EV).
    let maxApiEV: number | undefined
    for (const vb of vbs) {
      const raw = Number(vb.expectedValue ?? 0)
      if (!raw || isNaN(raw)) continue
      const evPct = raw > 10 ? raw - 100 : raw * 100   // normalise to EV%
      if (maxApiEV === undefined || evPct > maxApiEV) maxApiEV = evPct
    }

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
      _apiEV:        maxApiEV,
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
      firstBookmaker: "", bookmakerStr: "", eventsFound: 0, oddsEntries: 0, oddsError: null, mappedEvents: 0, liveDebug: "",
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

      // ── Step 5: detect genuinely live (in-progress) games ────────────────────
      // Use getLiveEvents with REAL sport slugs derived from the value-bet data
      // (guessed slugs silently return nothing), then getEventOdds for in-play odds.
      const liveDbg: string[] = []

      // Derive real sport slugs from the value bets we already fetched
      const sportSlugs = new Set<string>()
      for (const vb of allRawBets) {
        const ev = vb.event as RawBet | undefined
        const sp = ev?.sport as RawBet | string | undefined
        const slug = typeof sp === "object" ? String((sp as RawBet)?.slug ?? "") : ""
        if (slug) sportSlugs.add(slug)
      }
      for (const s of ["basketball", "baseball", "ice-hockey", "american-football", "football", "tennis", "mma"]) {
        sportSlugs.add(s)
      }
      liveDbg.push(`slugs:[${[...sportSlugs].slice(0, 8).join(",")}]`)

      // Wider book list to retry live odds if our selected books carry no in-play odds
      const wideBookIds = allBooks.map(toBookId).filter(Boolean).slice(0, 25)

      if (liveEventIds.size === 0) {
        liveFetch:
        for (const sport of sportSlugs) {
          let liveEvs: RawBet[] = []
          try {
            await new Promise((r) => setTimeout(r, 300))
            liveEvs = asArray<RawBet>(await this.sdk.getLiveEvents(sport) as unknown)
            if (liveEvs.length) liveDbg.push(`${sport}:${liveEvs.length}ev`)
          } catch (e: unknown) {
            liveDbg.push(`${sport}:ERR(${(e as Error).message.slice(0, 20)})`)
            continue
          }

          if (!liveEvs.length) continue

          for (const lev of liveEvs.slice(0, 3)) {
            const lid      = String(lev.id ?? "")
            if (!lid) continue
            const homeP    = lev.homeParticipant as RawBet | undefined
            const awayP    = lev.awayParticipant as RawBet | undefined
            const homeName = String(homeP?.name ?? lev.home ?? "")
            const awayName = String(awayP?.name ?? lev.away ?? "")
            if (!homeName || !awayName) continue

            // Parse in-play odds from either response shape into Bookmaker[]
            const parseLiveBooks = (odRaw: RawBet): Bookmaker[] => {
              const result: Bookmaker[] = []
              // Format 1 — EventOdds: { markets: [{market, outcomes:[{name,odds,bookmaker}]}] }
              const mktArr   = asArray<RawBet>(odRaw.markets ?? [])
              // Format 2 — HistoricalEventOdds: { bookmakers: {"Bet365": [{name,odds:[...]}]} }
              const bkObjRaw = (!mktArr.length && odRaw.bookmakers && !Array.isArray(odRaw.bookmakers))
                ? (odRaw.bookmakers as Record<string, unknown>)
                : null

              if (mktArr.length > 0) {
                const ml = mktArr.find((m) => {
                  const mk = String(m.market ?? "").toLowerCase()
                  return ["ml","moneyline","h2h","1x2","match winner","match result","2-way","2way"].includes(mk)
                }) ?? mktArr[0]

                const outcomes = asArray<RawBet>(ml?.outcomes ?? [])
                const bkMap = new Map<string, { home?: number; away?: number }>()
                for (const o of outcomes) {
                  const bk  = String(o.bookmaker ?? "")
                  const nm  = String(o.name ?? "").toLowerCase()
                  const dec = Number(o.odds ?? 0)
                  if (!bk || dec <= 1) continue
                  if (!bkMap.has(bk)) bkMap.set(bk, {})
                  const entry = bkMap.get(bk)!
                  if      (nm === homeName.toLowerCase() || nm === "home" || nm === "1") entry.home = dec
                  else if (nm === awayName.toLowerCase() || nm === "away" || nm === "2") entry.away = dec
                  else if (entry.home === undefined) entry.home = dec
                  else if (entry.away === undefined) entry.away = dec
                }
                for (const [bkName, bkOdds] of bkMap) {
                  if (bkOdds.home === undefined || bkOdds.away === undefined) continue
                  const lu = new Date().toISOString()
                  result.push({
                    key: bkName.toLowerCase().replace(/[^a-z0-9]/g, "_"), title: bkName, last_update: lu,
                    markets: [{ key: "h2h", last_update: lu, outcomes: [
                      { name: homeName, price: decimalToAmerican(bkOdds.home) },
                      { name: awayName, price: decimalToAmerican(bkOdds.away) },
                    ]}],
                  })
                }
              } else if (bkObjRaw) {
                for (const [bkName, bkMkts] of Object.entries(bkObjRaw)) {
                  const mkArr = Array.isArray(bkMkts) ? (bkMkts as RawBet[]) : []
                  for (const mkt of mkArr) {
                    const mktName = String(mkt.name ?? "").toLowerCase()
                    if (!["ml","moneyline","h2h","2way","1x2","match winner","match result","fulltime result"].includes(mktName)) continue
                    const oddsArr = asArray<RawBet>(mkt.odds ?? [])
                    const ex = oddsArr.length ? extractOdds(oddsArr[0]) : extractOdds(mkt)
                    if (!ex) continue
                    const lu = new Date().toISOString()
                    result.push({
                      key: bkName.toLowerCase().replace(/[^a-z0-9]/g, "_"), title: bkName, last_update: lu,
                      markets: [{ key: "h2h", last_update: lu, outcomes: [
                        { name: homeName, price: decimalToAmerican(ex.home) },
                        { name: awayName, price: decimalToAmerican(ex.away) },
                      ]}],
                    })
                    break
                  }
                }
              }
              return result
            }

            try {
              await new Promise((r) => setTimeout(r, 200))
              let odRaw = await this.sdk.getEventOdds({ eventId: lid, bookmakers: selBookIds.join(",") }) as unknown as RawBet
              liveDbg.push(`od[${lid.slice(-5)}]:{${Object.keys(odRaw).join(",")}}`)
              let liveBooks = parseLiveBooks(odRaw)

              // Retry with a wider book list if our selected books carry no in-play odds
              if (!liveBooks.length && wideBookIds.length) {
                await new Promise((r) => setTimeout(r, 200))
                odRaw = await this.sdk.getEventOdds({ eventId: lid, bookmakers: wideBookIds.join(",") }) as unknown as RawBet
                liveBooks = parseLiveBooks(odRaw)
                liveDbg.push(`wide:${liveBooks.length}bk`)
              }

              if (!liveBooks.length) {
                liveDbg.push(`${lid.slice(-5)}:no_books`)
                continue
              }

              const sportVal   = lev.sport  as RawBet | string | undefined
              const leagueVal  = lev.league as RawBet | string | undefined
              const sportStr2  = typeof sportVal  === "object" ? String((sportVal  as RawBet)?.name ?? sport) : String(sportVal  ?? sport)
              const leagueStr2 = typeof leagueVal === "object" ? String((leagueVal as RawBet)?.name ?? "")    : String(leagueVal ?? lev.leagueId ?? "")

              events.push({
                id:            lid,
                sport_key:     `${sportStr2}_${leagueStr2}`.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, ""),
                sport_title:   leagueStr2 ? `${sportStr2} — ${leagueStr2}` : sportStr2,
                commence_time: String(lev.startTime ?? lev.date ?? new Date().toISOString()),
                home_team:     homeName,
                away_team:     awayName,
                bookmakers:    liveBooks,
              })
              liveEventIds.add(lid)
              liveDbg.push(`added ${lid.slice(-5)}`)
              break liveFetch
            } catch (e: unknown) {
              liveDbg.push(`${lid.slice(-5)}:odERR(${(e as Error).message.slice(0, 40)})`)
              continue
            }
          }
        }
      }

      debug.liveDebug = liveDbg.join("; ")

      debug.mappedEvents = events.length

      if (events.length === 0 && allRawBets.length > 0) {
        const names = [...new Set(allRawBets.map((v) => {
          const m = v.market as RawBet | undefined
          return String(m?.name ?? "?")
        }))].join(",")
        debug.oddsError = (debug.oddsError ? debug.oddsError + " | " : "") +
          `Still 0 mapped. Markets: [${names}]`
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
