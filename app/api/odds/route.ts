import { NextResponse } from "next/server"
import { getClient, SPORT_PRIORITY, LIVE_WINDOW_MINUTES } from "@/lib/odds-api"
import { analyzeAll } from "@/lib/analyzer"
import { demoEvents } from "@/lib/demo"
import type { OddsApiEvent } from "@/types/betting"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const isDemo = !process.env.ODDS_API_KEY

  try {
    let events: OddsApiEvent[] = []
    let quota: number | undefined
    const sportsFound: string[] = []
    // Maps event ID → confirmed live (from Scores API)
    const confirmedLive = new Set<string>()

    if (isDemo) {
      events = demoEvents()
      sportsFound.push(...[...new Set(events.map((e) => e.sport_title))])
      // Demo: mark events with commence_time in the past as live
      const now = Date.now()
      for (const e of events) {
        if (new Date(e.commence_time).getTime() < now) confirmedLive.add(e.id)
      }
    } else {
      const client = getClient()

      const available = await client.getSports()
      const activeKeys = new Set(
        available.filter((s) => s.active && !s.has_outrights).map((s) => s.key)
      )

      const prioritised = SPORT_PRIORITY.filter((k) => activeKeys.has(k))
      const remaining = [...activeKeys].filter((k) => !SPORT_PRIORITY.includes(k))
      const toFetch = [...prioritised, ...remaining].slice(0, 30)

      const results = await Promise.allSettled(
        toFetch.map((sport) => client.getOdds(sport))
      )

      for (const r of results) {
        if (r.status !== "fulfilled") continue
        quota = r.value.quota
        events.push(...r.value.events)
        if (r.value.events.length) {
          sportsFound.push(r.value.events[0].sport_title)
        }
      }

      // Identify which sports have events that might be live (commence_time in past, within window)
      // Then verify with the Scores API — only for those sports to minimize quota usage
      const now = Date.now()
      const sportsNeedingScores = new Set<string>()
      for (const e of events) {
        const start = new Date(e.commence_time).getTime()
        if (start >= now) continue
        const windowMs = (LIVE_WINDOW_MINUTES[e.sport_key] ?? 180) * 60_000
        if (now - start < windowMs) sportsNeedingScores.add(e.sport_key)
      }

      // Fetch scores in parallel for only the sports that need it
      const scoreResults = await Promise.allSettled(
        [...sportsNeedingScores].map((sport) => client.getLiveEventIds(sport))
      )
      for (const r of scoreResults) {
        if (r.status === "fulfilled") {
          for (const id of r.value) confirmedLive.add(id)
        }
      }
    }

    // Inject live status into events before analysis
    const eventsWithLive = events.map((e) => ({
      ...e,
      _confirmedLive: confirmedLive.has(e.id),
    }))

    const analyses = analyzeAll(eventsWithLive, confirmedLive)
    const live = analyses.filter((a) => a.isLive)
    const positive = analyses.filter((a) => a.expectedValuePct > 0)
    const strong = analyses.filter((a) => a.recommendation === "STRONG BUY")

    let totalVig = 0, vigCount = 0
    for (const e of events) {
      for (const book of e.bookmakers ?? []) {
        const market = book.markets.find((m) => m.key === "h2h")
        if (!market || market.outcomes.length < 2) continue
        const overround = market.outcomes.reduce((s, o) => {
          const dec = o.price > 0 ? o.price / 100 + 1 : 100 / Math.abs(o.price) + 1
          return s + 1 / dec
        }, 0)
        totalVig += (overround - 1) * 100
        vigCount++
      }
    }

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      needsSetup: false,
      isDemo,
      sportsAnalyzed: sportsFound,
      totalGamesScanned: events.length,
      liveGameCount: live.length,
      totalBetsAnalyzed: analyses.length,
      liveAnalyses: live,
      topUnderdog: live[0] ?? analyses[0] ?? null,
      allAnalyses: analyses,
      marketStats: {
        avgVigPct: vigCount ? totalVig / vigCount : 0,
        avgOddsGap: analyses.length
          ? analyses.reduce((s, a) => s + a.oddsGap, 0) / analyses.length
          : 0,
        positiveEvCount: positive.length,
        strongBuyCount: strong.length,
        liveCount: live.length,
      },
      apiQuotaRemaining: quota,
    }, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
