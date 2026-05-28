"use client"

import { useState, useEffect, useCallback } from "react"
import type { AnalysisResponse, BetAnalysis } from "@/types/betting"
import { UnderdogCard } from "./UnderdogCard"

type Filter = "LIVE NOW" | "ALL" | "STRONG BUY" | "BUY" | "WATCH"
type Sort = "score" | "ev" | "odds"

const FILTERS: Filter[] = ["LIVE NOW", "ALL", "STRONG BUY", "BUY", "WATCH"]

function applyFilter(list: BetAnalysis[], f: Filter) {
  if (f === "LIVE NOW") return list.filter((a) => a.isLive)
  if (f === "ALL") return list
  return list.filter((a) => a.recommendation === f)
}

function applySort(list: BetAnalysis[], s: Sort) {
  return [...list].sort((a, b) => {
    // Always keep live on top within each sort
    if (a.isLive && !b.isLive) return -1
    if (!a.isLive && b.isLive) return 1
    if (s === "ev") return b.expectedValuePct - a.expectedValuePct
    if (s === "odds") return b.underdogTeam.bestAmericanOdds - a.underdogTeam.bestAmericanOdds
    return b.underdogScore - a.underdogScore
  })
}

function fmt(n: number) { return n > 0 ? `+${n}` : `${n}` }

export function BettingDashboard() {
  const [data, setData] = useState<AnalysisResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>("LIVE NOW")
  const [sort, setSort] = useState<Sort>("score")
  const [expanded, setExpanded] = useState<string | null>(null)
  const [refreshed, setRefreshed] = useState<Date | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/odds")
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      setData(json)
      setRefreshed(new Date())
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(load, 45_000)
    return () => clearInterval(t)
  }, [load])

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
              Underdog Analyzer
              {data.marketStats.liveCount > 0 && (
                <span className="flex items-center gap-1 text-xs font-bold bg-red-500/20 text-red-400 border border-red-500/30 px-2 py-0.5 rounded-full">
                  <span className="live-dot w-1.5 h-1.5 rounded-full bg-red-400 inline-block" />
                  {data.marketStats.liveCount} LIVE
                </span>
              )}
              {data.isDemo && (
                <span className="text-xs font-normal bg-amber-500/20 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-full">DEMO</span>
              )}
            </h1>
            <p className="text-xs text-zinc-500">
              {data.totalGamesScanned} games · {data.sportsAnalyzed.length} sports
              {refreshed && ` · ${refreshed.toLocaleTimeString()}`}
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
        {/* Demo banner */}
        {data.isDemo && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
            Running on sample data. Add <code className="bg-amber-500/20 px-1 rounded text-xs">ODDS_API_KEY</code> to <code className="bg-amber-500/20 px-1 rounded text-xs">.env.local</code> for live odds across 30+ sports. Free at <strong>the-odds-api.com</strong>.
          </div>
        )}

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
              {top.isLive ? (
                <><span className="live-dot w-1.5 h-1.5 rounded-full bg-red-400 inline-block" />Top Live Underdog Pick</>
              ) : "Top Underdog Pick"}
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
                  ? "No live games detected right now. Check back soon or switch to ALL."
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
              <UnderdogCard key={a.eventId} analysis={a} rank={i + 1}
                expanded={expanded === a.eventId}
                onToggle={() => setExpanded((prev) => (prev === a.eventId ? null : a.eventId))} />
            ))
          )}
        </div>

        {/* API quota */}
        {data.apiQuotaRemaining !== undefined && (
          <p className="text-xs text-zinc-600 text-center">
            The Odds API quota remaining: {data.apiQuotaRemaining} requests
          </p>
        )}

        {/* How it works */}
        <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-5 space-y-3">
          <div className="font-semibold text-zinc-300 text-sm">How the analysis works</div>
          <div className="grid sm:grid-cols-2 gap-2">
            {[
              ["Live detection", "Sport-specific time windows (e.g. 5h for tennis, 4h for baseball) flag in-progress games"],
              ["No-vig probability", "Bookmaker margin stripped out to expose true market consensus win probability"],
              ["Expected Value (EV%)", "(win_prob × profit) − (loss_prob × stake) — positive means statistically mispriced"],
              ["Value rating", "Gap between no-vig consensus and book's implied probability — positive = underpriced underdog"],
              ["Line-shopping edge", "Best available odds vs average across all books — includes US, UK, EU & AU markets"],
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
