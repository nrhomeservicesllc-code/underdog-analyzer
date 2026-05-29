"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import type { AnalysisResponse, BetAnalysis, TrackedBet } from "@/types/betting"
import { BetTracker } from "./BetTracker"
import { loadBets, trackBet, untrackBet, isTracked, calcRecord } from "@/lib/tracker"

const LIVE_INTERVAL_MS = 20_000
const IDLE_INTERVAL_MS = 60_000

function fmtAmerican(n: number) { return n > 0 ? `+${n}` : `${n}` }

const REC_COLOR: Record<string, string> = {
  "STRONG BUY": "bg-emerald-500 text-black",
  "BUY":        "bg-blue-500 text-white",
  "WATCH":      "bg-amber-500 text-black",
  "AVOID":      "bg-zinc-700 text-zinc-400",
}

function oddsDir(curr: number, prev: number | undefined): "up" | "down" | null {
  if (prev === undefined) return null
  if (curr > prev) return "up"
  if (curr < prev) return "down"
  return null
}

function OddsBox({ odds, dir, highlight }: { odds: number; dir: "up" | "down" | null; highlight: boolean }) {
  return (
    <div className={`flex items-center gap-1 px-3 py-1.5 rounded border font-mono font-bold text-sm min-w-[72px] justify-center transition-all duration-300 ${
      highlight ? "bg-emerald-950 border-emerald-600 text-emerald-300" : "bg-zinc-900 border-zinc-700 text-zinc-300"
    } ${dir === "up" ? "ring-1 ring-emerald-400" : dir === "down" ? "ring-1 ring-red-400" : ""}`}>
      {fmtAmerican(odds)}
      {dir === "up"   && <span className="text-emerald-400 text-[10px]">↑</span>}
      {dir === "down" && <span className="text-red-400 text-[10px]">↓</span>}
    </div>
  )
}

function GameCard({
  analysis, prevOdds, tracked, onTrack, isLive,
}: {
  analysis: BetAnalysis
  prevOdds?: { fav: number; ud: number }
  tracked: boolean
  onTrack: () => void
  isLive: boolean
}) {
  const [open, setOpen] = useState(false)
  const { favoriteTeam: fav, underdogTeam: ud } = analysis
  const score = analysis.currentScore
  const evPos = analysis.expectedValuePct > 0

  // Match score to team position
  const favScore = score ? (fav.isHome ? score.homeScore : score.awayScore) : null
  const udScore  = score ? (ud.isHome  ? score.homeScore : score.awayScore) : null

  const favDir = oddsDir(fav.bestAmericanOdds, prevOdds?.fav)
  const udDir  = oddsDir(ud.bestAmericanOdds,  prevOdds?.ud)

  const gameTime = new Date(analysis.commenceTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })

  return (
    <div className={`rounded-xl overflow-hidden border ${tracked ? "border-amber-500/60" : isLive ? "border-red-500/30" : "border-zinc-800"}`}>
      {/* Header bar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-950 border-b border-zinc-800/80">
        <div className="flex items-center gap-2">
          {isLive ? (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
              <span className="text-red-400 text-[11px] font-black uppercase tracking-wider">LIVE</span>
            </>
          ) : (
            <span className="text-zinc-500 text-[11px] font-medium">{gameTime}</span>
          )}
          <span className="text-zinc-700">·</span>
          <span className="text-zinc-500 text-[11px] uppercase tracking-wide">{analysis.sportTitle}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {tracked && <span className="text-amber-400 text-[10px] font-bold">Tracking</span>}
          <span className={`text-[10px] font-black px-2 py-0.5 rounded ${REC_COLOR[analysis.recommendation]}`}>
            {analysis.recommendation}
          </span>
        </div>
      </div>

      {/* Teams + odds */}
      <div className="bg-zinc-950/40">
        {/* Favorite */}
        <div className="flex items-center px-3 py-2.5 border-b border-zinc-900/60 gap-3">
          <span className="flex-1 text-zinc-400 text-sm font-medium truncate">{fav.team}</span>
          {favScore !== null && <span className="text-zinc-300 text-lg font-black w-7 text-center tabular-nums">{favScore}</span>}
          <OddsBox odds={fav.bestAmericanOdds} dir={favDir} highlight={false} />
        </div>
        {/* Underdog — highlighted */}
        <div className="flex items-center px-3 py-2.5 gap-3 bg-emerald-950/20">
          <div className="flex-1 min-w-0">
            <span className="text-white text-sm font-bold truncate block">{ud.team}</span>
          </div>
          {udScore !== null && <span className="text-emerald-300 text-lg font-black w-7 text-center tabular-nums">{udScore}</span>}
          <OddsBox odds={ud.bestAmericanOdds} dir={udDir} highlight={true} />
        </div>
      </div>

      {/* Stats footer */}
      <div className="px-3 py-2 bg-zinc-950 border-t border-zinc-900 flex items-center gap-3 text-xs flex-wrap">
        <span className="text-zinc-500">Win <span className="text-white font-bold">{(analysis.consensusProbability * 100).toFixed(0)}%</span></span>
        <span className={`font-bold ${evPos ? "text-emerald-400" : "text-red-400"}`}>
          EV {evPos ? "+" : ""}{analysis.expectedValuePct.toFixed(1)}%
        </span>
        <span className="text-zinc-600">$100→<span className="text-zinc-400 font-medium">${((ud.bestDecimalOdds - 1) * 100).toFixed(0)}</span></span>
        <span className="text-zinc-700 text-[10px]">Best: {ud.bestBookmaker}</span>
        <div className="ml-auto flex items-center gap-1.5">
          <button onClick={() => setOpen(o => !o)} className="text-zinc-600 hover:text-zinc-400 text-[11px]">
            {open ? "▲" : "▼"}
          </button>
          <button onClick={onTrack} className={`text-xs px-2.5 py-1 rounded font-bold ${
            tracked ? "bg-amber-500/20 text-amber-400 border border-amber-500/30" : "bg-emerald-700 hover:bg-emerald-600 text-white"
          }`}>
            {tracked ? "Tracking" : "+ Track"}
          </button>
        </div>
      </div>

      {/* Expanded detail */}
      {open && (
        <div className="bg-zinc-950 border-t border-zinc-900 px-3 py-3 space-y-3">
          <div>
            <p className="text-[10px] text-zinc-600 uppercase tracking-widest mb-2">Lines — {ud.team}</p>
            {ud.allOdds.map((o) => (
              <div key={o.bookmaker} className="flex justify-between py-0.5">
                <span className="text-zinc-500 text-xs">{o.bookmaker}</span>
                <span className={`text-xs font-bold font-mono ${o.decimal === ud.bestDecimalOdds ? "text-emerald-400" : "text-zinc-400"}`}>
                  {fmtAmerican(o.american)}{o.decimal === ud.bestDecimalOdds && <span className="text-emerald-700 ml-1 text-[10px]">BEST</span>}
                </span>
              </div>
            ))}
          </div>
          {analysis.analysisNotes.length > 0 && (
            <div className="pt-2 border-t border-zinc-900 space-y-1">
              {analysis.analysisNotes.map((n, i) => <p key={i} className="text-zinc-600 text-xs">▸ {n}</p>)}
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
      const json: AnalysisResponse & { error?: string } = await res.json()
      if (json.error) throw new Error(json.error)

      // Snapshot odds for movement tracking
      const snap = new Map<string, { fav: number; ud: number }>()
      for (const a of json.allAnalyses) {
        snap.set(a.eventId, { fav: a.favoriteTeam.bestAmericanOdds, ud: a.underdogTeam.bestAmericanOdds })
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
    const ms = (data?.marketStats.liveCount ?? 0) > 0 ? LIVE_INTERVAL_MS : IDLE_INTERVAL_MS
    intervalRef.current = setInterval(load, ms)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [load, data?.marketStats.liveCount])

  function handleTrack(a: BetAnalysis) {
    if (isTracked(a.eventId, trackedBets)) untrackBet(a.eventId)
    else trackBet(a)
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
        <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-6 max-w-sm text-center space-y-3">
          <p className="text-red-400 text-sm font-medium">{error}</p>
          <button onClick={load} className="bg-emerald-700 text-white px-5 py-2 rounded-lg text-sm font-bold hover:bg-emerald-600">Retry</button>
        </div>
      </div>
    )
  }

  if (!data) return null

  const liveGames   = data.allAnalyses.filter((a) => a.isLive)
  const upcoming    = data.allAnalyses.filter((a) => !a.isLive)
  const hasLive     = liveGames.length > 0

  return (
    <div className="min-h-screen bg-black text-white">

      {/* Header */}
      <header className="bg-zinc-950 border-b border-zinc-800 sticky top-0 z-20">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xl font-black">Sharp<span className="text-emerald-400">Dog</span></span>
            {hasLive ? (
              <span className="flex items-center gap-1.5 bg-red-500/20 border border-red-500/40 text-red-400 text-[11px] font-black px-2 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />{liveGames.length} LIVE
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-zinc-700 text-xs">{refreshed?.toLocaleTimeString()}</span>
            <button onClick={load} disabled={loading}
              className="w-7 h-7 flex items-center justify-center rounded bg-zinc-900 text-zinc-400 hover:bg-zinc-800 disabled:opacity-30">
              {loading ? <span className="w-3 h-3 border border-zinc-500 border-t-transparent rounded-full animate-spin" /> : "↻"}
            </button>
          </div>
        </div>
        <div className="max-w-2xl mx-auto px-4 flex border-t border-zinc-900">
          {(["picks", "record"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${
                tab === t ? "border-emerald-400 text-white" : "border-transparent text-zinc-600 hover:text-zinc-400"
              }`}>
              {t === "picks" ? "Live Lines" : "My Record"}
              {t === "record" && trackedBets.length > 0 && (
                <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${rec.pnl >= 0 ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"}`}>
                  {rec.wins}W-{rec.losses}L
                </span>
              )}
            </button>
          ))}
        </div>
      </header>

      {/* LINES TAB */}
      {tab === "picks" && (
        <main className="max-w-2xl mx-auto px-4 py-4 space-y-4">

          {/* Stats */}
          <div className="grid grid-cols-4 gap-2 text-center">
            {[
              { v: liveGames.length, l: "Live Now", c: hasLive ? "text-red-400" : "text-zinc-600" },
              { v: data.marketStats.positiveEvCount, l: "+EV Bets", c: "text-emerald-400" },
              { v: data.marketStats.strongBuyCount,  l: "Strong Buy", c: "text-white" },
              { v: data.totalGamesScanned,           l: "Today", c: "text-zinc-400" },
            ].map((s) => (
              <div key={s.l} className="bg-zinc-950 border border-zinc-900 rounded-lg py-2">
                <div className={`text-xl font-black tabular-nums ${s.c}`}>{s.v}</div>
                <div className="text-[10px] text-zinc-600 uppercase tracking-wide mt-0.5">{s.l}</div>
              </div>
            ))}
          </div>

          {/* Live games */}
          {liveGames.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                <span className="text-[11px] text-zinc-500 uppercase tracking-widest font-bold">
                  Live Now — {liveGames.length} game{liveGames.length !== 1 ? "s" : ""} in progress
                </span>
              </div>
              {liveGames.map((a) => (
                <GameCard key={a.eventId} analysis={a} isLive={true}
                  prevOdds={oddsMovement.get(a.eventId)}
                  tracked={isTracked(a.eventId, trackedBets)}
                  onTrack={() => handleTrack(a)} />
              ))}
            </section>
          )}

          {/* Upcoming today */}
          {upcoming.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-zinc-500 uppercase tracking-widest font-bold">
                  Today's Lines — {upcoming.length} upcoming
                </span>
                <span className="text-[10px] text-zinc-700">sorted by EV</span>
              </div>
              {upcoming.map((a) => (
                <GameCard key={a.eventId} analysis={a} isLive={false}
                  prevOdds={oddsMovement.get(a.eventId)}
                  tracked={isTracked(a.eventId, trackedBets)}
                  onTrack={() => handleTrack(a)} />
              ))}
            </section>
          )}

          {liveGames.length === 0 && upcoming.length === 0 && (
            <div className="bg-zinc-950 border border-zinc-900 rounded-xl p-10 text-center">
              <p className="text-zinc-400 font-semibold mb-1">No lines available right now</p>
              <p className="text-zinc-600 text-sm">Check back soon — auto-refreshing every {Math.round(IDLE_INTERVAL_MS / 1000)}s</p>
            </div>
          )}

          {data.apiQuotaRemaining !== undefined && (
            <p className="text-[10px] text-zinc-800 text-center py-2">
              API quota: {data.apiQuotaRemaining.toLocaleString()} remaining
            </p>
          )}
        </main>
      )}

      {/* RECORD TAB */}
      {tab === "record" && (
        <main className="max-w-2xl mx-auto px-4 py-4">
          <BetTracker bets={trackedBets} onChange={reloadBets} fullPage />
        </main>
      )}
    </div>
  )
}
