"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import type { AnalysisResponse, BetAnalysis, TrackedBet } from "@/types/betting"
import { BetTracker } from "./BetTracker"
import { loadBets, trackBet, untrackBet, isTracked, calcRecord } from "@/lib/tracker"

const LIVE_INTERVAL_MS = 20_000   // 20s when live games active
const IDLE_INTERVAL_MS = 60_000   // 60s when no live games

function fmtAmerican(n: number) { return n > 0 ? `+${n}` : `${n}` }

const REC_STYLES: Record<string, string> = {
  "STRONG BUY": "bg-emerald-500 text-black",
  "BUY":        "bg-blue-500 text-white",
  "WATCH":      "bg-amber-500/80 text-black",
  "AVOID":      "bg-zinc-700 text-zinc-400",
}

// Odds movement: positive = odds got BETTER for bettor (more positive / less negative)
function oddsDir(curr: number, prev: number | undefined): "up" | "down" | null {
  if (prev === undefined) return null
  if (curr > prev) return "up"
  if (curr < prev) return "down"
  return null
}

function OddsBox({
  odds, dir, highlight,
}: { odds: number; dir: "up" | "down" | null; highlight: boolean }) {
  const base = highlight ? "bg-emerald-900/60 border-emerald-500/40 text-emerald-300" : "bg-zinc-900 border-zinc-700 text-zinc-300"
  const flash = dir === "up" ? "ring-1 ring-emerald-400" : dir === "down" ? "ring-1 ring-red-400" : ""
  return (
    <div className={`flex items-center gap-1 px-3 py-1.5 rounded border font-mono font-bold text-sm min-w-[72px] justify-center ${base} ${flash} transition-all duration-300`}>
      {fmtAmerican(odds)}
      {dir === "up" && <span className="text-emerald-400 text-xs">↑</span>}
      {dir === "down" && <span className="text-red-400 text-xs">↓</span>}
    </div>
  )
}

function GameCard({
  analysis,
  prevOdds,
  tracked,
  onTrack,
}: {
  analysis: BetAnalysis
  prevOdds?: { fav: number; ud: number }
  tracked: boolean
  onTrack: () => void
}) {
  const [open, setOpen] = useState(false)
  const fav = analysis.favoriteTeam
  const ud = analysis.underdogTeam
  const score = analysis.currentScore
  const evPositive = analysis.expectedValuePct > 0

  // Determine score for home vs away
  const homeIsUD = ud.isHome
  const homeScore = homeIsUD ? score?.homeScore : score?.homeScore
  const awayScore = homeIsUD ? score?.awayScore : score?.awayScore

  const favIsHome = fav.isHome
  const favScore = favIsHome ? score?.homeScore : score?.awayScore
  const udScore = homeIsUD ? score?.homeScore : score?.awayScore

  const favDir = oddsDir(fav.bestAmericanOdds, prevOdds?.fav)
  const udDir = oddsDir(ud.bestAmericanOdds, prevOdds?.ud)

  return (
    <div className={`rounded-xl overflow-hidden border transition-colors ${
      tracked ? "border-amber-500/50" : "border-zinc-800"
    }`}>
      {/* Sport + status bar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-950 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
          <span className="text-red-400 text-[11px] font-black uppercase tracking-wider">LIVE</span>
          <span className="text-zinc-600 text-[11px]">·</span>
          <span className="text-zinc-500 text-[11px] font-medium uppercase tracking-wide">{analysis.sportTitle}</span>
        </div>
        <div className="flex items-center gap-2">
          {tracked && <span className="text-amber-400 text-[10px] font-bold uppercase">Tracking</span>}
          <span className={`text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-wide ${REC_STYLES[analysis.recommendation]}`}>
            {analysis.recommendation}
          </span>
        </div>
      </div>

      {/* Teams + odds — Vegas betting line style */}
      <div className="bg-black">
        {/* Favorite row */}
        <div className="flex items-center px-3 py-2.5 border-b border-zinc-900">
          <div className="flex-1 min-w-0">
            <span className="text-zinc-400 text-sm font-medium truncate block">{fav.team}</span>
          </div>
          {score && (
            <span className="text-zinc-300 text-lg font-black w-8 text-center mr-3 tabular-nums">{favScore}</span>
          )}
          <OddsBox odds={fav.bestAmericanOdds} dir={favDir} highlight={false} />
        </div>

        {/* Underdog row — highlighted */}
        <div className="flex items-center px-3 py-2.5 bg-emerald-950/20">
          <div className="flex-1 min-w-0">
            <span className="text-white text-sm font-bold truncate block">{ud.team}</span>
            <span className="text-emerald-500/70 text-[10px]">← underdog</span>
          </div>
          {score && (
            <span className="text-emerald-300 text-lg font-black w-8 text-center mr-3 tabular-nums">{udScore}</span>
          )}
          <OddsBox odds={ud.bestAmericanOdds} dir={udDir} highlight={true} />
        </div>
      </div>

      {/* Stats bar */}
      <div className="px-3 py-2 bg-zinc-950 flex items-center gap-4 text-xs border-t border-zinc-900">
        <span className="text-zinc-500">
          Win prob <span className="text-white font-bold">{(analysis.consensusProbability * 100).toFixed(0)}%</span>
        </span>
        <span className={`font-bold ${evPositive ? "text-emerald-400" : "text-red-400"}`}>
          EV {evPositive ? "+" : ""}{analysis.expectedValuePct.toFixed(1)}%
        </span>
        <span className="text-zinc-600">
          $100 → <span className="text-zinc-400">${((ud.bestDecimalOdds - 1) * 100).toFixed(0)}</span>
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setOpen((o) => !o)}
            className="text-zinc-600 hover:text-zinc-400 text-xs"
          >
            {open ? "▲ less" : "▼ more"}
          </button>
          <button
            onClick={onTrack}
            className={`text-xs px-2.5 py-1 rounded font-bold transition-colors ${
              tracked
                ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                : "bg-emerald-600 hover:bg-emerald-500 text-white"
            }`}
          >
            {tracked ? "Tracking" : "+ Track"}
          </button>
        </div>
      </div>

      {/* Expanded: all book odds */}
      {open && (
        <div className="bg-zinc-950 border-t border-zinc-900 px-3 py-3 space-y-3">
          <div>
            <div className="text-[10px] text-zinc-600 uppercase tracking-widest mb-2">Underdog odds — {ud.team}</div>
            <div className="space-y-1">
              {ud.allOdds.map((o) => (
                <div key={o.bookmaker} className="flex items-center justify-between">
                  <span className="text-zinc-500 text-xs">{o.bookmaker}</span>
                  <span className={`text-xs font-bold font-mono ${
                    o.decimal === ud.bestDecimalOdds ? "text-emerald-400" : "text-zinc-400"
                  }`}>
                    {fmtAmerican(o.american)}
                    {o.decimal === ud.bestDecimalOdds && <span className="text-emerald-600 text-[10px] ml-1">BEST</span>}
                  </span>
                </div>
              ))}
            </div>
          </div>
          {analysis.analysisNotes.length > 0 && (
            <div className="space-y-1 pt-2 border-t border-zinc-900">
              {analysis.analysisNotes.map((n, i) => (
                <p key={i} className="text-zinc-500 text-xs leading-relaxed">▸ {n}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function BettingDashboard() {
  const [data, setData] = useState<AnalysisResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<"picks" | "record">("picks")
  const [trackedBets, setTrackedBets] = useState<TrackedBet[]>([])
  const [refreshed, setRefreshed] = useState<Date | null>(null)
  // Odds movement tracking
  const prevOddsRef = useRef<Map<string, { fav: number; ud: number }>>(new Map())
  const [oddsMovement, setOddsMovement] = useState<Map<string, { fav: number; ud: number }>>(new Map())
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => { setTrackedBets(loadBets()) }, [])
  const reloadBets = useCallback(() => setTrackedBets(loadBets()), [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/odds")
      const json: AnalysisResponse = await res.json()
      if ((json as { error?: string }).error) throw new Error((json as { error?: string }).error)

      // Compute odds movement vs previous load
      const snap = new Map<string, { fav: number; ud: number }>()
      for (const a of json.allAnalyses) {
        snap.set(a.eventId, {
          fav: a.favoriteTeam.bestAmericanOdds,
          ud: a.underdogTeam.bestAmericanOdds,
        })
      }
      setOddsMovement(new Map(prevOddsRef.current))
      prevOddsRef.current = snap

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
    if (isTracked(analysis.eventId, trackedBets)) untrackBet(analysis.eventId)
    else trackBet(analysis)
    reloadBets()
  }

  const rec = calcRecord(trackedBets)

  if (loading && !data) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-zinc-500 text-sm">Scanning live lines…</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4">
        <div className="bg-zinc-950 rounded-xl border border-zinc-800 p-6 max-w-sm text-center space-y-3">
          <p className="text-red-400 text-sm">{error}</p>
          <button onClick={load} className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-emerald-500">Retry</button>
        </div>
      </div>
    )
  }

  if (!data) return null

  const liveGames = data.allAnalyses.filter((a) => a.isLive)
  const hasLive = liveGames.length > 0

  return (
    <div className="min-h-screen bg-black text-white font-sans">
      {/* Header — Vegas scoreboard style */}
      <header className="bg-zinc-950 border-b border-zinc-800 sticky top-0 z-20">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xl font-black tracking-tight text-white">
              Sharp<span className="text-emerald-400">Dog</span>
            </span>
            {hasLive ? (
              <span className="flex items-center gap-1.5 bg-red-500/20 border border-red-500/40 text-red-400 text-[11px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full animate-pulse">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                {liveGames.length} Live
              </span>
            ) : (
              <span className="text-zinc-700 text-[11px] uppercase tracking-wide">No live games</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-zinc-700 text-xs tabular-nums">{refreshed?.toLocaleTimeString()}</span>
            <button onClick={load} disabled={loading}
              className="w-7 h-7 flex items-center justify-center rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-400 disabled:opacity-30 text-sm">
              {loading ? <span className="w-3 h-3 border border-zinc-500 border-t-transparent rounded-full animate-spin" /> : "↻"}
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="max-w-2xl mx-auto px-4 flex border-t border-zinc-900">
          <button
            onClick={() => setTab("picks")}
            className={`px-4 py-2.5 text-sm font-bold border-b-2 transition-colors ${
              tab === "picks" ? "border-emerald-400 text-white" : "border-transparent text-zinc-600 hover:text-zinc-400"
            }`}
          >
            Live Lines
          </button>
          <button
            onClick={() => setTab("record")}
            className={`px-4 py-2.5 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${
              tab === "record" ? "border-emerald-400 text-white" : "border-transparent text-zinc-600 hover:text-zinc-400"
            }`}
          >
            My Record
            {trackedBets.length > 0 && (
              <span className={`text-[10px] font-black px-1.5 py-0.5 rounded tabular-nums ${
                rec.pnl >= 0 ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"
              }`}>
                {rec.wins}W-{rec.losses}L
              </span>
            )}
          </button>
        </div>
      </header>

      {/* LIVE LINES TAB */}
      {tab === "picks" && (
        <main className="max-w-2xl mx-auto px-4 py-4 space-y-3">
          {/* Quick stats */}
          <div className="grid grid-cols-4 gap-2 text-center">
            {[
              { v: liveGames.length, l: "Live Now", c: liveGames.length > 0 ? "text-red-400" : "text-zinc-600" },
              { v: data.marketStats.positiveEvCount, l: "+EV", c: "text-emerald-400" },
              { v: data.marketStats.strongBuyCount, l: "Strong Buy", c: "text-white" },
              { v: data.totalGamesScanned, l: "Games", c: "text-zinc-400" },
            ].map((s) => (
              <div key={s.l} className="bg-zinc-950 border border-zinc-900 rounded-lg py-2">
                <div className={`text-lg font-black tabular-nums ${s.c}`}>{s.v}</div>
                <div className="text-[10px] text-zinc-600 uppercase tracking-wide">{s.l}</div>
              </div>
            ))}
          </div>

          {liveGames.length === 0 ? (
            <div className="bg-zinc-950 border border-zinc-900 rounded-xl p-10 text-center space-y-2">
              <div className="text-4xl">🕐</div>
              <p className="text-zinc-400 font-semibold">No live games right now</p>
              <p className="text-zinc-600 text-sm">
                Lines update every {Math.round(IDLE_INTERVAL_MS / 1000)}s · {data.totalGamesScanned} games on today's slate
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 py-1">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                <span className="text-xs text-zinc-500 uppercase tracking-widest font-bold">Live Betting Lines — {liveGames.length} games in progress</span>
              </div>
              {liveGames.map((a) => {
                const prev = oddsMovement.get(a.eventId)
                return (
                  <GameCard
                    key={a.eventId}
                    analysis={a}
                    prevOdds={prev}
                    tracked={isTracked(a.eventId, trackedBets)}
                    onTrack={() => handleTrack(a)}
                  />
                )
              })}
            </>
          )}

          {data.apiQuotaRemaining !== undefined && (
            <p className="text-[10px] text-zinc-800 text-center py-2">
              API quota remaining: {data.apiQuotaRemaining.toLocaleString()}
            </p>
          )}
        </main>
      )}

      {/* MY RECORD TAB */}
      {tab === "record" && (
        <main className="max-w-2xl mx-auto px-4 py-4">
          <BetTracker bets={trackedBets} onChange={reloadBets} fullPage />
        </main>
      )}
    </div>
  )
}
