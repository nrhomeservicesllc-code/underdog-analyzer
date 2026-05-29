import { NextResponse } from "next/server"
import { getClient, SPORT_PRIORITY, isEventLive } from "@/lib/odds-api"
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

    if (isDemo) {
      events = demoEvents()
      sportsFound.push(...[...new Set(events.map((e) => e.sport_title))])
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
    }

    const analyses = analyzeAll(events)
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
      liveGameCount: events.filter((e) => isEventLive(e.commence_time, e.sport_key)).length,
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
