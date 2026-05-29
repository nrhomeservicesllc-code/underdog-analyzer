"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import type { AnalysisResponse, BetAnalysis, TrackedBet } from "@/types/betting"
import { UnderdogCard } from "./UnderdogCard"
import { BetTracker } from "./BetTracker"
import { loadBets, trackBet, untrackBet, isTracked, calcRecord } from "@/lib/tracker"

const LIVE_INTERVAL_MS = 30_000
const IDLE_INTERVAL_MS = 90_000

function fmt(n: number) { return n > 0 ? `+${n}` : `${n}` }

export function BettingDashboard() {
  const [data, setData] = useState<AnalysisResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<"picks" | "record">("picks")
  const [expanded, setExpanded] = useState<string | null>(null)
  const [refreshed, setRefreshed] = useState<Date | null>(null)
  const [trackedBets, setTrackedBets] = useState<TrackedBet[]>([])
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => { setTrackedBets(loadBets()) }, [])
  const reloadBets = useCallback(() => setTrackedBets(loadBets()), [])

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

  useEffect(() => { load() }, [load])

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

  const rec = calcRecord(trackedBets)
  const hasRecord = trackedBets.length > 0

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
          <p className="text-red-400 text-sm">{error}</p>
          <button onClick={load} className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-500">Retry</button>
        </div>
      </div>
    )
  }

  if (!data) return null

  const liveGames = data.allAnalyses.filter((a) => a.isLive)
  const topPicks = data.allAnalyses
    .filter((a) => !a.isLive && (a.recommendation === "STRONG BUY" || a.recommendation === "BUY"))
  const hasLive = liveGames.length > 0

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-950/90 backdrop-blur sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-black tracking-tight">
              Underdog<span className="text-emerald-400">.</span>
            </h1>
            {hasLive && (
              <span className="flex items-center gap-1.5 text-xs font-bold bg-red-500/20 text-red-400 border border-red-500/30 px-2 py-0.5 rounded-full animate-pulse">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block" />
                {liveGames.length} LIVE
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-600">
              {data.totalGamesScanned} games · {refreshed?.toLocaleTimeString()}
            </span>
            <button onClick={load} disabled={loading}
              className="text-xs px-2.5 py-1 rounded-lg bg-zinc-800 text-zinc-400 hover:bg-zinc-700 disabled:opacity-40">
              {loading ? "…" : "↻"}
            </button>
          </div>
        </div>

        {/* Tab bar */}
        <div className="max-w-4xl mx-auto px-4 flex gap-1 pb-0">
          <button
            onClick={() => setTab("picks")}
            className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${
              tab === "picks"
                ? "border-emerald-400 text-white"
                : "border-transparent text-zinc-500 hover:text-zinc-300"
            }`}
          >
            Picks
          </button>
          <button
            onClick={() => setTab("record")}
            className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${
              tab === "record"
                ? "border-emerald-400 text-white"
                : "border-transparent text-zinc-500 hover:text-zinc-300"
            }`}
          >
            My Record
            {hasRecord && (
              <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                rec.pnl >= 0 ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"
              }`}>
                {rec.wins}W-{rec.losses}L
              </span>
            )}
          </button>
        </div>
      </header>

      {/* PICKS TAB */}
      {tab === "picks" && (
        <main className="max-w-4xl mx-auto px-4 py-5 space-y-6">

          {/* Stats strip */}
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: "Live Now", val: liveGames.length, color: liveGames.length > 0 ? "text-red-400" : "text-zinc-400" },
              { label: "+EV Picks", val: data.marketStats.positiveEvCount, color: "text-emerald-400" },
              { label: "Strong Buy", val: data.marketStats.strongBuyCount, color: "text-white" },
              { label: "Sports", val: data.sportsAnalyzed.length, color: "text-zinc-300" },
            ].map((s) => (
              <div key={s.label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
                <div className={`text-xl font-black ${s.color}`}>{s.val}</div>
                <div className="text-[10px] text-zinc-500 mt-0.5 uppercase tracking-wide">{s.label}</div>
              </div>
            ))}
          </div>

          {/* LIVE GAMES SECTION */}
          {liveGames.length > 0 ? (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse inline-block" />
                <h2 className="text-sm font-bold text-red-400 uppercase tracking-widest">Live Right Now</h2>
                <span className="text-xs text-zinc-600">{liveGames.length} game{liveGames.length !== 1 ? "s" : ""} in progress</span>
              </div>
              <div className="space-y-3">
                {liveGames.map((a, i) => (
                  <UnderdogCard
                    key={a.eventId}
                    analysis={a}
                    rank={i + 1}
                    expanded={expanded === a.eventId}
                    tracked={isTracked(a.eventId, trackedBets)}
                    onToggle={() => setExpanded((p) => p === a.eventId ? null : a.eventId)}
                    onTrack={() => handleTrack(a)}
                  />
                ))}
              </div>
            </section>
          ) : (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-3 flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-zinc-600 inline-block" />
              <span className="text-sm text-zinc-500">No live games right now — refreshing automatically</span>
            </div>
          )}

          {/* TOP PICKS SECTION */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-white uppercase tracking-widest">Top Underdog Picks</h2>
              <span className="text-xs text-zinc-600">Strong Buy + Buy only</span>
            </div>

            {topPicks.length === 0 ? (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 text-center">
                <p className="text-zinc-500 text-sm">No strong picks available right now. Check back soon.</p>
              </div>
            ) : (
              <>
                {/* Hero: best pick */}
                {(() => {
                  const top = topPicks[0]
                  return (
                    <div className="rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-900/30 to-zinc-900 p-5 mb-4">
                      <div className="text-xs font-bold text-emerald-400 uppercase tracking-widest mb-2">Best Pick Right Now</div>
                      <div className="flex items-start justify-between flex-wrap gap-4">
                        <div>
                          <div className="text-2xl font-black text-white">{top.underdogTeam.team}</div>
                          <div className="text-sm text-zinc-400 mt-0.5">{top.homeTeam} vs {top.awayTeam}</div>
                          <div className="text-xs text-zinc-600">{top.sportTitle} · {new Date(top.commenceTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
                        </div>
                        <div className="flex gap-6">
                          <div>
                            <div className="text-xs text-zinc-500 mb-0.5">Best Odds</div>
                            <div className="text-3xl font-black text-emerald-400">{fmt(top.underdogTeam.bestAmericanOdds)}</div>
                            <div className="text-xs text-zinc-500">@ {top.underdogTeam.bestBookmaker}</div>
                          </div>
                          <div>
                            <div className="text-xs text-zinc-500 mb-0.5">Win Prob</div>
                            <div className="text-3xl font-black text-white">{(top.consensusProbability * 100).toFixed(0)}%</div>
                          </div>
                          <div>
                            <div className="text-xs text-zinc-500 mb-0.5">EV</div>
                            <div className={`text-3xl font-black ${top.expectedValuePct > 0 ? "text-emerald-400" : "text-red-400"}`}>
                              {top.expectedValuePct > 0 ? "+" : ""}{top.expectedValuePct.toFixed(1)}%
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="mt-3 flex items-center gap-2 flex-wrap">
                        {top.analysisNotes.slice(0, 2).map((n, i) => (
                          <span key={i} className="text-xs text-zinc-400 bg-black/30 rounded-lg px-3 py-1.5">▸ {n}</span>
                        ))}
                      </div>
                    </div>
                  )
                })()}

                {/* Rest of top picks */}
                <div className="space-y-3">
                  {topPicks.slice(1).map((a, i) => (
                    <UnderdogCard
                      key={a.eventId}
                      analysis={a}
                      rank={i + 2}
                      expanded={expanded === a.eventId}
                      tracked={isTracked(a.eventId, trackedBets)}
                      onToggle={() => setExpanded((p) => p === a.eventId ? null : a.eventId)}
                      onTrack={() => handleTrack(a)}
                    />
                  ))}
                </div>
              </>
            )}
          </section>

          <p className="text-xs text-zinc-700 text-center pb-4">
            Positive EV = statistically mispriced odds. Not a guaranteed win. Bet responsibly.
            {data.apiQuotaRemaining !== undefined && ` · API quota: ${data.apiQuotaRemaining.toLocaleString()} remaining`}
          </p>
        </main>
      )}

      {/* MY RECORD TAB */}
      {tab === "record" && (
        <main className="max-w-4xl mx-auto px-4 py-5">
          <BetTracker bets={trackedBets} onChange={reloadBets} fullPage />
        </main>
      )}
    </div>
  )
}
