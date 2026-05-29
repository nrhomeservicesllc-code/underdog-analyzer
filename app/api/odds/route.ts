import { NextResponse } from "next/server"
import { getClient, SPORT_PRIORITY, LIVE_WINDOW_MINUTES } from "@/lib/odds-api"
import type { LiveScore } from "@/lib/odds-api"
import { analyzeAll } from "@/lib/analyzer"
import { demoEvents } from "@/lib/demo"
import type { OddsApiEvent } from "@/types/betting"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const apiKey = process.env.ODDS_API_KEY
  const isDemo = !apiKey

  try {
    const allEvents: OddsApiEvent[] = []
    const sportsFound: string[] = []
    let quota: number | undefined
    const liveScores = new Map<string, LiveScore>()

    if (isDemo) {
      const demo = demoEvents()
      allEvents.push(...demo)
      sportsFound.push(...[...new Set(demo.map((e) => e.sport_title))])
      const now = Date.now()
      for (const e of demo) {
        if (new Date(e.commence_time).getTime() < now) {
          liveScores.set(e.id, { homeScore: "—", awayScore: "—", lastUpdate: "" })
        }
      }
    } else {
      const client = getClient()

      const available = await client.getSports()
      const activeKeys = new Set(
        available.filter((s) => s.active && !s.has_outrights).map((s) => s.key)
      )

      const prioritised = SPORT_PRIORITY.filter((k) => activeKeys.has(k))
      const remaining = [...activeKeys].filter((k) => !SPORT_PRIORITY.includes(k))
      const toFetch = [...prioritised, ...remaining]

      // Fetch all sports' odds in parallel
      const results = await Promise.allSettled(
        toFetch.map((sport) => client.getOdds(sport))
      )

      for (const r of results) {
        if (r.status !== "fulfilled") continue
        quota = r.value.quota
        allEvents.push(...r.value.events)
        if (r.value.events.length) sportsFound.push(r.value.events[0].sport_title)
      }

      // Filter to games from today only (UTC window: past 12h → next 24h covers "today")
      const now = Date.now()
      const windowStart = now - 12 * 60 * 60 * 1000  // started up to 12h ago (might still be live)
      const windowEnd = now + 24 * 60 * 60 * 1000    // starts within next 24h (today's slate)
      const todayEvents = allEvents.filter((e) => {
        const t = new Date(e.commence_time).getTime()
        return t >= windowStart && t <= windowEnd
      })
      allEvents.length = 0
      allEvents.push(...todayEvents)

      // Identify sports with potentially-live games and fetch their live scores
      const sportsNeedingScores = new Set<string>()
      for (const e of allEvents) {
        const start = new Date(e.commence_time).getTime()
        if (start >= now) continue
        const windowMs = (LIVE_WINDOW_MINUTES[e.sport_key] ?? 180) * 60_000
        if (now - start < windowMs) sportsNeedingScores.add(e.sport_key)
      }

      if (sportsNeedingScores.size > 0) {
        const scoreResults = await Promise.allSettled(
          [...sportsNeedingScores].map((sport) => client.getLiveScores(sport))
        )
        for (const r of scoreResults) {
          if (r.status === "fulfilled") {
            for (const [id, s] of r.value) liveScores.set(id, s)
          }
        }
      }
    }

    const analyses = analyzeAll(allEvents, liveScores)
    const live = analyses.filter((a) => a.isLive)
    const upcoming = analyses.filter((a) => !a.isLive)
    const positive = analyses.filter((a) => a.expectedValuePct > 0)
    const strong = analyses.filter((a) => a.recommendation === "STRONG BUY")

    let totalVig = 0, vigCount = 0
    for (const e of allEvents) {
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
      totalGamesScanned: allEvents.length,
      liveGameCount: live.length,
      totalBetsAnalyzed: analyses.length,
      liveAnalyses: live,
      upcomingAnalyses: upcoming,
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
