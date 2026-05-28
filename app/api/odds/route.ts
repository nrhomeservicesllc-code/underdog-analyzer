import { NextResponse } from "next/server"
import { getClient, SPORT_PRIORITY } from "@/lib/odds-api"
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
      const activeKeys = new Set(available.filter((s) => s.active && !s.has_outrights).map((s) => s.key))
      const toFetch = SPORT_PRIORITY.filter((k) => activeKeys.has(k)).slice(0, 8)

      for (const sport of toFetch) {
        try {
          const result = await client.getOdds(sport)
          quota = result.quota
          events.push(...result.events)
          if (result.events.length) sportsFound.push(result.events[0].sport_title)
        } catch {
          // sport has no games right now
        }
      }
    }

    const analyses = analyzeAll(events)
    const positive = analyses.filter((a) => a.expectedValuePct > 0)
    const strong = analyses.filter((a) => a.recommendation === "STRONG BUY")

    // avg vig across all books
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
      isDemo,
      sportsAnalyzed: sportsFound,
      totalGamesScanned: events.length,
      totalBetsAnalyzed: analyses.length,
      topUnderdog: analyses[0] ?? null,
      allAnalyses: analyses,
      marketStats: {
        avgVigPct: vigCount ? totalVig / vigCount : 0,
        avgOddsGap: analyses.length ? analyses.reduce((s, a) => s + a.oddsGap, 0) / analyses.length : 0,
        positiveEvCount: positive.length,
        strongBuyCount: strong.length,
      },
      apiQuotaRemaining: quota,
    })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
