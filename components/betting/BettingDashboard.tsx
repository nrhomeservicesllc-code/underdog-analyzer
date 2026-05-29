"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import type { AnalysisResponse, BetAnalysis, TrackedBet } from "@/types/betting"
import { UnderdogCard } from "./UnderdogCard"
import { BetTracker } from "./BetTracker"
import { loadBets, trackBet, untrackBet, isTracked } from "@/lib/tracker"

type Filter = "LIVE NOW" | "ALL" | "STRONG BUY" | "BUY" | "WATCH"
type Sort = "score" | "ev" | "odds"

const FILTERS: Filter[] = ["LIVE NOW", "ALL", "STRONG BUY", "BUY", "WATCH"]

// Faster refresh when games are live, slower when only upcoming
const LIVE_INTERVAL_MS = 30_000
const IDLE_INTERVAL_MS = 90_000

function applyFilter(list: BetAnalysis[], f: Filter) {
  if (f === "LIVE NOW") return list.filter((a) => a.isLive)
  if (f === "ALL") return list
  return list.filter((a) => a.recommendation === f)
}

function applySort(list: BetAnalysis[], s: Sort) {
  return [...list].sort((a, b) => {
    if (a.isLive && !b.isLive) return -1
    if (!a.isLive && b.isLive) return 1
    if (s === "ev") return b.expectedValuePct - a.expectedValuePct
    if (s === "odds") return b.underdogTeam.bestAmericanOdds - a.underdogTeam.bestAmericanOdds
    return b.underdogScore - a.underdogScore
  })
}

function fmt(n: number) { return n > 0 ? `+${n}` : `${n}` }

function SetupScreen() {
  return (
    <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center p-4">
      <div className="max-w-lg w-full space-y-6">
        <div className="text-center space-y-2">
          <div className="text-5xl font-black tracking-tight">Underdog<span className="text-emerald-400">.</span></div>
          <p className="text-zinc-400 text-sm">Real-time sports betting value finder — powered by live odds across 30+ sports</p>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 space-y-5">
          <div className="font-semibold text-white">Connect live odds data</div>
          <div className="space-y-3 text-sm">
            {[
              { n: "1", title: "Get a free API key", body: <>Visit <span className="text-emerald-400 font-medium">the-odds-api.com</span> and create a free account. Free tier includes 500 requests/month.</> },
              { n: "2", title: "Add it to Vercel", body: <>In your Vercel project go to <span className="text-zinc-300">Settings → Environment Variables</span> and add <code className="bg-zinc-800 px-1.5 py-0.5 rounded text-xs text-emerald-400">ODDS_API_KEY</code> with your key.</> },
              { n: "3", title: "Redeploy", body: <>Trigger a new deployment. The app will immediately start pulling live odds from 40+ bookmakers.</> },
            ].map((s) => (
              <div key={s.n} className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold flex items-center justify-center mt-0.5">{s.n}</span>
                <div>
                  <div className="font-medium text-zinc-200 mb-0.5">{s.title}</div>
                  <div className="text-zinc-500">{s.body}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5 space-y-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">What you get</div>
          <div className="grid grid-cols-2 gap-2">
            {[
              ["30+ sports", "NBA, NFL, MLB, NHL, soccer, tennis, MMA, cricket & more"],
              ["40+ bookmakers", "FanDuel, DraftKings, BetMGM, Bet365, Caesars and more"],
              ["No-vig EV analysis", "Strips bookmaker margin to find true statistical value"],
              ["Live line updates", "Odds refresh every 30s during live games, ended games removed"],
              ["Line-shopping edge", "Best odds vs. market average across all books"],
              ["Win/loss tracker", "Track your picks and record P&L across all bets"],
            ].map(([title, desc]) => (
              <div key={title} className="flex gap-2 text-xs">
                <span className="text-emerald-500 flex-shrink-0 mt-0.5">▸</span>
                <span><span className="text-zinc-300 font-medium">{title}</span> — <span className="text-zinc-600">{desc}</span></span>
              </div>
            ))}
          </div>
        </div>

        <p className="text-center text-xs text-zinc-600">
          Positive EV reflects long-run statistical value, not a guaranteed outcome. Gamble responsibly.
        </p>
      </div>
    </div>
  )
}

export function BettingDashboard() {
  const [data, setData] = useState<AnalysisResponse | null>(null)
  const [needsSetup, setNeedsSetup] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>("LIVE NOW")
  const [sort, setSort] = useState<Sort>("score")
  const [expanded, setExpanded] = useState<string | null>(null)
  const [refreshed, setRefreshed] = useState<Date | null>(null)
  const [trackedBets, setTrackedBets] = useState<TrackedBet[]>([])
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Load tracked bets from localStorage (client only)
  useEffect(() => { setTrackedBets(loadBets()) }, [])

  const reloadBets = useCallback(() => setTrackedBets(loadBets()), [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/odds")
      const json = await res.json()
      if (json.needsSetup) { setNeedsSetup(true); return }
      if (json.error) throw new Error(json.error)
      setData(json)
      setRefreshed(new Date())
      // Auto-switch from LIVE NOW to ALL when no live games exist
      setFilter((prev) => prev === "LIVE NOW" && json.marketStats.liveCount === 0 ? "ALL" : prev)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Dynamic refresh interval: faster when games are live
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    const hasLive = (data?.marketStats.liveCount ?? 0) > 0
    intervalRef.current = setInterval(load, hasLive ? LIVE_INTERVAL_MS : IDLE_INTERVAL_MS)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [load, data?.marketStats.liveCount])

  function handleTrack(analysis: BetAnalysis) {
    if (isTracked(analysis.eventId, trackedBets)) {
      untrackBet(analysis.eventId)
    } else {
      trackBet(analysis)
    }
    reloadBets()
  }

  if (needsSetup) return <SetupScreen />

  if (loading && !data) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-zinc-400 text-sm">Scanning live markets across all sports…</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
        <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-6 max-w-sm text-center space-y-3">
          <div className="text-3xl">⚠️</div>
          <p className="text-red-400 text-sm">{error}</p>
          <button onClick={load} className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-500">Retry</button>
        </div>
      </div>
    )
  }

  if (!data) return null

  const top = data.topUnderdog
  const sorted = applySort(data.allAnalyses, sort)
  const visible = applyFilter(sorted, filter)
  const hasLive = data.marketStats.liveCount > 0

  const counts: Record<Filter, number> = {
    "LIVE NOW": data.allAnalyses.filter((a) => a.isLive).length,
    ALL: data.allAnalyses.length,
    "STRONG BUY": data.allAnalyses.filter((a) => a.recommendation === "STRONG BUY").length,
    BUY: data.allAnalyses.filter((a) => a.recommendation === "BUY").length,
    WATCH: data.allAnalyses.filter((a) => a.recommendation === "WATCH").length,
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-950/90 backdrop-blur sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div>
            <h1 className="font-bold text-white flex items-center gap-2">
              Underdog<span className="text-emerald-400">.</span>
              {hasLive && (
                <span className="flex items-center gap-1 text-xs font-bold bg-red-500/20 text-red-400 border border-red-500/30 px-2 py-0.5 rounded-full">
                  <span className="live-dot w-1.5 h-1.5 rounded-full bg-red-400 inline-block" />
                  {data.marketStats.liveCount} LIVE
                </span>
              )}
            </h1>
            <p className="text-xs text-zinc-500">
              {data.totalGamesScanned} games · {data.sportsAnalyzed.length} sports
              {refreshed && ` · ${refreshed.toLocaleTimeString()}`}
              {hasLive && <span className="text-zinc-600"> · refreshing every 30s</span>}
            </p>
          </div>
          <button onClick={load} disabled={loading}
            className="text-xs px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700 disabled:opacity-40 flex items-center gap-1.5">
            {loading && <span className="w-3 h-3 border border-zinc-400 border-t-transparent rounded-full animate-spin" />}
            Refresh
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">

        {/* Demo mode banner */}
        {data.isDemo && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 flex items-start gap-3">
            <span className="text-amber-400 text-lg flex-shrink-0">⚡</span>
            <div className="text-sm">
              <span className="font-semibold text-amber-300">Demo mode</span>
              <span className="text-amber-500/80"> — showing sample data so you can explore the full UI. To switch to real live odds, add </span>
              <code className="bg-amber-500/20 px-1 rounded text-xs text-amber-300">ODDS_API_KEY</code>
              <span className="text-amber-500/80"> in your Vercel project settings. Free API key at </span>
              <span className="text-amber-300 font-medium">the-odds-api.com</span>
              <span className="text-amber-500/80">.</span>
            </div>
          </div>
        )}

        {/* Win/Loss tracker — only shows when picks have been added */}
        <BetTracker bets={trackedBets} onChange={reloadBets} />

        {/* Stat strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Live Games", val: data.liveGameCount.toString(), sub: "in progress now", accent: "red" },
            { label: "Positive EV", val: data.marketStats.positiveEvCount.toString(), sub: "value bets found", accent: "green" },
            { label: "Strong Buys", val: data.marketStats.strongBuyCount.toString(), sub: "best picks", accent: "" },
            { label: "Sports", val: data.sportsAnalyzed.length.toString(), sub: `${data.totalGamesScanned} games total`, accent: "" },
          ].map((s) => (
            <div key={s.label} className={`rounded-xl p-4 border ${
              s.accent === "red" ? "bg-red-500/10 border-red-500/30" :
              s.accent === "green" ? "bg-emerald-500/10 border-emerald-500/30" :
              "bg-zinc-900 border-zinc-800"
            }`}>
              <div className="text-xs text-zinc-500 mb-1">{s.label}</div>
              <div className={`text-2xl font-bold ${
                s.accent === "red" ? "text-red-400" :
                s.accent === "green" ? "text-emerald-400" :
                "text-white"
              }`}>{s.val}</div>
              <div className="text-xs text-zinc-600">{s.sub}</div>
            </div>
          ))}
        </div>

        {/* Sports currently live */}
        {data.liveAnalyses.length > 0 && (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="live-dot w-2 h-2 rounded-full bg-red-400 inline-block" />
              <span className="text-sm font-bold text-red-400 uppercase tracking-wide">Live Right Now</span>
              <span className="text-xs text-zinc-600">— {data.liveAnalyses.length} games in progress</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {[...new Set(data.liveAnalyses.map((a) => a.sportTitle))].map((sport) => {
                const count = data.liveAnalyses.filter((a) => a.sportTitle === sport).length
                return (
                  <span key={sport} className="text-xs bg-zinc-800 border border-zinc-700 text-zinc-300 px-2 py-1 rounded-lg">
                    {sport} <span className="text-zinc-500">({count})</span>
                  </span>
                )
              })}
            </div>
          </div>
        )}

        {/* Top pick hero */}
        {top && (
          <div className={`rounded-2xl border p-5 ${
            top.isLive
              ? "bg-gradient-to-br from-red-900/30 to-emerald-900/40 border-red-500/30"
              : "bg-gradient-to-br from-emerald-900/50 to-teal-900/50 border-emerald-500/30"
          }`}>
            <div className="text-xs font-bold uppercase tracking-widest mb-1 flex items-center gap-2" style={{ color: top.isLive ? "#f87171" : "#34d399" }}>
              {top.isLive
                ? <><span className="live-dot w-1.5 h-1.5 rounded-full bg-red-400 inline-block" />Top Live Underdog Pick</>
                : "Top Underdog Pick"}
            </div>
            <div className="flex items-start justify-between flex-wrap gap-3">
              <div>
                <div className="text-2xl font-black text-white">{top.underdogTeam.team}</div>
                <div className="text-sm text-zinc-400">{top.homeTeam} vs {top.awayTeam}</div>
                <div className="text-xs text-zinc-500 mt-0.5">{top.sportTitle}</div>
              </div>
              <div className="flex items-center gap-5 flex-wrap">
                <div>
                  <div className="text-xs text-zinc-500 mb-0.5">Best odds</div>
                  <div className="text-4xl font-black text-emerald-400">{fmt(top.underdogTeam.bestAmericanOdds)}</div>
                  <div className="text-xs text-zinc-500">@ {top.underdogTeam.bestBookmaker}</div>
                </div>
                <div>
                  <div className="text-xs text-zinc-500 mb-0.5">EV</div>
                  <div className={`text-3xl font-bold ${top.expectedValuePct > 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {top.expectedValuePct > 0 ? "+" : ""}{top.expectedValuePct.toFixed(1)}%
                  </div>
                </div>
                <div>
                  <div className="text-xs text-zinc-500 mb-0.5">$100 wins</div>
                  <div className="text-3xl font-bold text-white">${((top.underdogTeam.bestDecimalOdds - 1) * 100).toFixed(0)}</div>
                </div>
              </div>
            </div>
            {top.analysisNotes[0] && (
              <div className="mt-3 text-sm text-zinc-300 bg-black/20 rounded-lg px-3 py-2">{top.analysisNotes[0]}</div>
            )}
          </div>
        )}

        {/* Filters + sort */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                  filter === f
                    ? f === "LIVE NOW" ? "bg-red-600 text-white"
                    : f === "STRONG BUY" ? "bg-emerald-600 text-white"
                    : f === "BUY" ? "bg-blue-600 text-white"
                    : f === "WATCH" ? "bg-amber-500 text-white"
                    : "bg-white text-zinc-900"
                    : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                }`}>
                {f === "LIVE NOW" && filter !== f && counts[f] > 0 && (
                  <span className="live-dot w-1.5 h-1.5 rounded-full bg-red-400 inline-block mr-1" />
                )}
                {f} {counts[f] > 0 && <span className="opacity-70">({counts[f]})</span>}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs text-zinc-600 mr-1">Sort:</span>
            {(["score", "ev", "odds"] as Sort[]).map((s) => (
              <button key={s} onClick={() => setSort(s)}
                className={`text-xs px-2 py-1 rounded-lg ${sort === s ? "bg-zinc-700 text-white" : "text-zinc-500 hover:text-zinc-300"}`}>
                {s === "score" ? "Score" : s === "ev" ? "EV%" : "Odds"}
              </button>
            ))}
          </div>
        </div>

        {/* Cards */}
        <div className="space-y-3">
          {visible.length === 0 ? (
            <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-8 text-center space-y-2">
              <p className="text-zinc-500 text-sm">
                {filter === "LIVE NOW"
                  ? "No live games in progress right now. Check back soon or view upcoming games."
                  : "No bets match this filter."}
              </p>
              {filter === "LIVE NOW" && (
                <button onClick={() => setFilter("ALL")} className="text-xs text-emerald-400 underline">
                  Show all upcoming games
                </button>
              )}
            </div>
          ) : (
            visible.map((a, i) => (
              <UnderdogCard
                key={a.eventId}
                analysis={a}
                rank={i + 1}
                expanded={expanded === a.eventId}
                tracked={isTracked(a.eventId, trackedBets)}
                onToggle={() => setExpanded((prev) => (prev === a.eventId ? null : a.eventId))}
                onTrack={() => handleTrack(a)}
              />
            ))
          )}
        </div>

        {/* API quota */}
        {data.apiQuotaRemaining !== undefined && (
          <p className="text-xs text-zinc-600 text-center">
            Odds API requests remaining this month: {data.apiQuotaRemaining.toLocaleString()}
          </p>
        )}

        {/* How it works */}
        <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-5 space-y-3">
          <div className="font-semibold text-zinc-300 text-sm">How the analysis works</div>
          <div className="grid sm:grid-cols-2 gap-2">
            {[
              ["No-vig probability", "Bookmaker margin stripped out to expose true market consensus win probability"],
              ["Expected Value (EV%)", "(win_prob × profit) − (loss_prob × stake) — positive means statistically mispriced"],
              ["Value rating", "Gap between no-vig consensus and book's implied probability — positive = underpriced underdog"],
              ["Line-shopping edge", "Best available odds vs average across all books — includes US, UK, EU & AU markets"],
              ["Live detection", "Sport-specific time windows (e.g. 5h for tennis, 4h for baseball) flag in-progress games"],
              ["Underdog score", "Weighted composite + live bonus: EV 45% · value 30% · line-shopping 15% · gap 10%"],
            ].map(([title, desc]) => (
              <div key={title} className="flex gap-2 text-xs">
                <span className="text-emerald-500 flex-shrink-0 mt-0.5">▸</span>
                <span><span className="text-zinc-300 font-medium">{title}</span> — <span className="text-zinc-500">{desc}</span></span>
              </div>
            ))}
          </div>
          <p className="text-xs text-zinc-600 border-t border-zinc-800 pt-3">
            Positive EV indicates long-run statistical value, not a guaranteed win on any single bet. Sports betting carries substantial financial risk. This tool is for informational purposes only.
          </p>
        </div>
      </main>
    </div>
  )
}
