import { NextResponse } from "next/server"
import { getClient, SPORT_PRIORITY, LIVE_WINDOW_MINUTES } from "@/lib/odds-api"
import { analyzeAll } from "@/lib/analyzer"
import type { OddsApiEvent } from "@/types/betting"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const apiKey = process.env.ODDS_API_KEY

  if (!apiKey) {
    return NextResponse.json({ needsSetup: true }, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    })
  }

  try {
    const client = getClient()

    // Get all active sports (no outrights/futures — head-to-head only)
    const available = await client.getSports()
    const activeKeys = new Set(
      available.filter((s) => s.active && !s.has_outrights).map((s) => s.key)
    )

    // Fetch all active sports — prioritised order, no limit
    const prioritised = SPORT_PRIORITY.filter((k) => activeKeys.has(k))
    const remaining = [...activeKeys].filter((k) => !SPORT_PRIORITY.includes(k))
    const toFetch = [...prioritised, ...remaining]

    const results = await Promise.allSettled(
      toFetch.map((sport) => client.getOdds(sport))
    )

    const events: OddsApiEvent[] = []
    const sportsFound: string[] = []
    let quota: number | undefined

    for (const r of results) {
      if (r.status !== "fulfilled") continue
      quota = r.value.quota
      events.push(...r.value.events)
      if (r.value.events.length) {
        sportsFound.push(r.value.events[0].sport_title)
      }
    }

    // Confirm which games are truly live using the Scores API
    // Only check sports where games might be in progress (saves quota)
    const now = Date.now()
    const sportsNeedingScores = new Set<string>()
    for (const e of events) {
      const start = new Date(e.commence_time).getTime()
      if (start >= now) continue
      const windowMs = (LIVE_WINDOW_MINUTES[e.sport_key] ?? 180) * 60_000
      if (now - start < windowMs) sportsNeedingScores.add(e.sport_key)
    }

    const confirmedLive = new Set<string>()
    if (sportsNeedingScores.size > 0) {
      const scoreResults = await Promise.allSettled(
        [...sportsNeedingScores].map((sport) => client.getLiveEventIds(sport))
      )
      for (const r of scoreResults) {
        if (r.status === "fulfilled") {
          for (const id of r.value) confirmedLive.add(id)
        }
      }
    }

    const analyses = analyzeAll(events, confirmedLive)
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
      isDemo: false,
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
