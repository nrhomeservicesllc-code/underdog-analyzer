import { NextResponse } from "next/server"
import { OddsAPIClient } from "odds-api-io"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Diagnostic endpoint — dumps exactly what the live feed returns so we can see
// why live games aren't showing. Visit /api/live-debug during an in-progress game.
type Raw = Record<string, unknown>

function arr<T = Raw>(v: unknown): T[] {
  if (Array.isArray(v)) return v as T[]
  if (v && typeof v === "object") {
    for (const k of ["data", "events", "results", "items", "bets"]) {
      const x = (v as Raw)[k]
      if (Array.isArray(x)) return x as T[]
    }
  }
  return []
}

export async function GET() {
  const key = process.env.ODDS_API_KEY?.trim()
  if (!key) return NextResponse.json({ error: "ODDS_API_KEY not set" }, { status: 500 })

  const sdk = new OddsAPIClient({ apiKey: key })
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
  const out: Raw = { now: new Date().toISOString() }

  // 1) selected bookmakers
  try {
    const sb = await sdk.getSelectedBookmakers()
    out.selectedBookmakersRaw = sb
  } catch (e) { out.selectedBookmakersError = (e as Error).message }

  const selBooks = arr<unknown>(out.selectedBookmakersRaw)
  const bookIds = selBooks
    .map((b) => (typeof b === "string" ? b : String((b as Raw)?.id ?? (b as Raw)?.slug ?? (b as Raw)?.name ?? "")))
    .filter(Boolean)
  out.bookIds = bookIds

  // 2) value bets → derive real sport slugs
  const slugs = new Set<string>()
  try {
    await sleep(250)
    const vbRaw = await sdk.getValueBets({ bookmaker: bookIds[0] ?? "", includeEventDetails: true })
    const vbs = arr(vbRaw)
    out.valueBetCount = vbs.length
    for (const vb of vbs) {
      const ev = (vb as Raw).event as Raw | undefined
      const sp = ev?.sport as Raw | string | undefined
      const slug = typeof sp === "object" ? String((sp as Raw)?.slug ?? "") : ""
      if (slug) slugs.add(slug)
    }
    out.derivedSlugs = [...slugs]
    out.firstValueBet = vbs[0] ?? null
  } catch (e) { out.valueBetsError = (e as Error).message }

  // merge with common fallbacks
  for (const s of ["basketball", "baseball", "ice-hockey", "american-football", "football", "tennis", "mma"]) slugs.add(s)

  // 3) live events per slug
  const livePerSlug: Raw = {}
  let firstLive: Raw | null = null
  let firstLiveSlug = ""
  for (const slug of slugs) {
    await sleep(250)
    try {
      const le = await sdk.getLiveEvents(slug)
      const events = arr(le)
      livePerSlug[slug] = events.length
      if (events.length && !firstLive) {
        firstLive = events[0] as Raw
        firstLiveSlug = slug
        out.firstLiveEventKeys = Object.keys(firstLive)
        out.firstLiveEvent = firstLive
      }
    } catch (e) {
      livePerSlug[slug] = `ERR: ${(e as Error).message.slice(0, 50)}`
    }
  }
  out.liveEventsPerSlug = livePerSlug
  out.firstLiveSlug = firstLiveSlug

  // 4) odds for the first live event — selected books AND wide book list
  if (firstLive) {
    const lid = String(firstLive.id ?? "")
    out.liveEventIdTested = lid

    await sleep(250)
    try {
      const od = await sdk.getEventOdds({ eventId: lid, bookmakers: bookIds.join(",") })
      out.eventOdds_selectedBooks_keys = Object.keys(od as unknown as Raw)
      out.eventOdds_selectedBooks = od
    } catch (e) { out.eventOdds_selectedBooks_error = (e as Error).message }

    // wide list: pull the public bookmaker catalogue and request many at once
    try {
      await sleep(250)
      const allBooksRaw = await sdk.getBookmakers()
      const allBooks = arr<unknown>(allBooksRaw)
      const wideIds = allBooks
        .map((b) => (typeof b === "string" ? b : String((b as Raw)?.id ?? (b as Raw)?.slug ?? (b as Raw)?.name ?? "")))
        .filter(Boolean)
        .slice(0, 30)
      out.wideBookCount = wideIds.length
      await sleep(250)
      const od2 = await sdk.getEventOdds({ eventId: lid, bookmakers: wideIds.join(",") })
      out.eventOdds_wideBooks_keys = Object.keys(od2 as unknown as Raw)
      out.eventOdds_wideBooks = od2
    } catch (e) { out.eventOdds_wideBooks_error = (e as Error).message }
  } else {
    out.note = "No live events found in any sport right now (nothing currently in progress)."
  }

  return NextResponse.json(out, { headers: { "Cache-Control": "no-store" } })
}
