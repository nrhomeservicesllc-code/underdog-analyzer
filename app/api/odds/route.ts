import { NextResponse } from "next/server"
import { getClient, SPORT_PRIORITY, LIVE_WINDOW_MINUTES } from "@/lib/odds-api"
import type { LiveScore } from "@/lib/odds-api"
import { analyzeAll } from "@/lib/analyzer"
import { demoEvents } from "@/lib/demo"
import type { OddsApiEvent } from "@/types/betting"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Cap how many sports we fetch per request to protect API quota.
// Priority order already puts the most important sports first.
const MAX_SPORTS = 20

export async function GET() {
  const apiKey = process.env.ODDS_API_KEY?.trim()
  const hasKey = !!apiKey

  try {
    let allEvents: OddsApiEvent[] = []
    const sportsFound: string[] = []
    let quota: number | undefined
    const liveScores = new Map<string, LiveScore>()
    let apiError: string | undefined
    let errorCode: number | undefined

    if (!hasKey) {
      // No key configured — show demo data
      const demo = demoEvents()
      allEvents = demo
      sportsFound.push(...[...new Set(demo.map((e) => e.sport_title))])
      const now = Date.now()
      for (const e of demo) {
        if (new Date(e.commence_time).getTime() < now) {
          liveScores.set(e.id, { homeScore: "—", awayScore: "—", lastUpdate: "" })
        }
      }
    } else {
      // Real API — skip getSports() to save quota, fetch known sports directly.
      // Inactive/off-season sports just return empty arrays (not errors).
      try {
        const client = getClient()
        const toFetch = SPORT_PRIORITY.slice(0, MAX_SPORTS)

        const results = await Promise.allSettled(
          toFetch.map((sport) => client.getOdds(sport))
        )

        let anySuccess = false
        for (const r of results) {
          if (r.status !== "fulfilled") continue
          anySuccess = true
          quota = r.value.quota
          allEvents.push(...r.value.events)
          if (r.value.events.length) sportsFound.push(r.value.events[0].sport_title)
        }

        if (!anySuccess) {
          const firstFail = results.find((r) => r.status === "rejected") as PromiseRejectedResult | undefined
          const raw = firstFail?.reason?.message ?? "All API calls failed"
          // Extract status code from error message
          const match = raw.match(/\b(4\d\d)\b/)
          errorCode = match ? parseInt(match[1]) : undefined
          if (errorCode === 401) {
            apiError = "API key rejected (401) — your key is invalid or deactivated. Go to the-odds-api.com/manage to regenerate it."
          } else if (errorCode === 422) {
            apiError = "Monthly quota exhausted (422) — you've used all requests for this month. Upgrade at the-odds-api.com."
          } else if (errorCode === 429) {
            apiError = "Rate limited (429) — too many requests. Wait a minute then retry."
          } else {
            apiError = raw
          }
        }

        if (allEvents.length > 0) {
          // Filter to today only (past 12h → next 24h)
          const now = Date.now()
          const windowStart = now - 12 * 60 * 60 * 1000
          const windowEnd   = now + 24 * 60 * 60 * 1000
          allEvents = allEvents.filter((e) => {
            const t = new Date(e.commence_time).getTime()
            return t >= windowStart && t <= windowEnd
          })

          // Fetch live scores only for sports that may have in-progress games
          const sportsNeedingScores = new Set<string>()
          const now2 = Date.now()
          for (const e of allEvents) {
            const start = new Date(e.commence_time).getTime()
            if (start >= now2) continue
            const windowMs = (LIVE_WINDOW_MINUTES[e.sport_key] ?? 180) * 60_000
            if (now2 - start < windowMs) sportsNeedingScores.add(e.sport_key)
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
      } catch (err) {
        const raw = (err as Error).message
        const match = raw.match(/\b(4\d\d)\b/)
        errorCode = match ? parseInt(match[1]) : undefined
        apiError = raw
      }
    }

    // API key is set but everything failed — return error without demo fallback
    if (hasKey && apiError && allEvents.length === 0) {
      return NextResponse.json({
        timestamp: new Date().toISOString(),
        needsSetup: false,
        isDemo: false,
        hasKey: true,
        apiError,
        errorCode,
        sportsAnalyzed: [],
        totalGamesScanned: 0,
        liveGameCount: 0,
        totalBetsAnalyzed: 0,
        liveAnalyses: [],
        upcomingAnalyses: [],
        topUnderdog: null,
        allAnalyses: [],
        marketStats: { avgVigPct: 0, avgOddsGap: 0, positiveEvCount: 0, strongBuyCount: 0, liveCount: 0 },
        apiQuotaRemaining: quota,
      }, { headers: { "Cache-Control": "no-store, max-age=0" } })
    }

    const analyses = analyzeAll(allEvents, liveScores)
    const live     = analyses.filter((a) => a.isLive)
    const upcoming = analyses.filter((a) => !a.isLive)
    const positive = analyses.filter((a) => a.expectedValuePct > 0)
    const strong   = analyses.filter((a) => a.recommendation === "STRONG BUY")

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
      isDemo: !hasKey,
      hasKey,
      apiError,
      errorCode,
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
    }, { headers: { "Cache-Control": "no-store, max-age=0" } })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
