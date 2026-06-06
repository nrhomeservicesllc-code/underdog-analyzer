"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import type { AnalysisResponse, BetAnalysis, TrackedBet } from "@/types/betting"
import { BetTracker } from "./BetTracker"
import { loadBets, trackBet, untrackBet, isTracked, calcRecord } from "@/lib/tracker"

const REFRESH_INTERVAL_MS = 60 * 60_000  // 1 hour
const LIVE_PICK_KEY     = "sharpdog_live_pick"
const UPCOMING_PICK_KEY = "sharpdog_upcoming_pick"

function fmtAmerican(n: number) { return n > 0 ? `+${n}` : `${n}` }

function getSaved(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}
function savePick(key: string, id: string) {
  try { localStorage.setItem(key, id) } catch {}
}

// Hold the same pick until its event leaves the dataset, then auto-advance
function resolvePick(analyses: BetAnalysis[], savedId: string | null, key: string): BetAnalysis | null {
  if (!analyses.length) return null
  if (savedId) {
    const found = analyses.find((a) => a.eventId === savedId)
    if (found) return found
  }
  const next = analyses[0]
  savePick(key, next.eventId)
  return next
}

function ThePickCard({ pick, tracked, onTrack, label }: {
  pick: BetAnalysis
  tracked: boolean
  onTrack: () => void
  label: string
}) {
  const { favoriteTeam: fav, underdogTeam: ud } = pick
  const evPos    = pick.expectedValuePct > 0
  const payout   = ((ud.bestDecimalOdds - 1) * 100).toFixed(0)
  const gameTime = new Date(pick.commenceTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  const score    = pick.currentScore
  const favScore = score ? (fav.isHome ? score.homeScore : score.awayScore) : null
  const udScore  = score ? (ud.isHome  ? score.homeScore : score.awayScore) : null

  return (
    <div className="rounded-2xl border border-emerald-500/40 bg-gradient-to-b from-emerald-950/40 to-zinc-950 overflow-hidden relative">
      <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent" />

      {/* Sport + time */}
      <div className="flex items-center justify-between px-4 pt-4 pb-1">
        <span className="text-zinc-500 text-xs uppercase tracking-widest">{pick.sportTitle}</span>
        {pick.isLive ? (
          <span className="flex items-center gap-1.5 text-red-400 text-xs font-black">
            <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />LIVE
          </span>
        ) : (
          <span className="text-zinc-600 text-xs">{gameTime}</span>
        )}
      </div>

      {/* Label */}
      <div className="px-4 pb-2">
        <span className="text-emerald-400 text-[11px] font-black uppercase tracking-[0.18em]">{label}</span>
      </div>

      {/* Matchup */}
      <div className="px-4 pb-3 space-y-1">
        {/* Favorite */}
        <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-zinc-900/60">
          <span className="text-zinc-400 text-sm">{fav.team}</span>
          <div className="flex items-center gap-3">
            {favScore !== null && <span className="text-zinc-300 font-black tabular-nums">{favScore}</span>}
            <span className="font-mono font-bold text-zinc-500 text-sm w-16 text-right">{fmtAmerican(fav.bestAmericanOdds)}</span>
          </div>
        </div>
        {/* Underdog — THE pick */}
        <div className="flex items-center justify-between px-3 py-3 rounded-xl bg-emerald-950/50 border border-emerald-700/30">
          <div className="flex flex-col gap-0.5">
            <span className="text-white font-bold text-base">{ud.team}</span>
            <span className="text-emerald-500 text-[10px] font-bold uppercase tracking-wider">← Take this</span>
          </div>
          <div className="flex items-center gap-3">
            {udScore !== null && <span className="text-emerald-300 font-black text-lg tabular-nums">{udScore}</span>}
            <span className="font-mono font-black text-emerald-300 text-3xl">{fmtAmerican(ud.bestAmericanOdds)}</span>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 border-t border-zinc-800/60 divide-x divide-zinc-800/60">
        <div className="px-3 py-3 text-center">
          <p className="text-white font-black text-xl">{(pick.consensusProbability * 100).toFixed(0)}%</p>
          <p className="text-zinc-600 text-[10px] uppercase tracking-wide mt-0.5">Win Prob</p>
        </div>
        <div className="px-3 py-3 text-center">
          <p className={`font-black text-xl ${evPos ? "text-emerald-400" : "text-zinc-400"}`}>
            {evPos ? "+" : ""}{pick.expectedValuePct.toFixed(1)}%
          </p>
          <p className="text-zinc-600 text-[10px] uppercase tracking-wide mt-0.5">Edge</p>
        </div>
        <div className="px-3 py-3 text-center">
          <p className="text-white font-black text-xl">${payout}</p>
          <p className="text-zinc-600 text-[10px] uppercase tracking-wide mt-0.5">per $100</p>
        </div>
      </div>

      {/* Best line */}
      <div className="flex items-center justify-between px-4 py-2 border-t border-zinc-800/60">
        <span className="text-zinc-700 text-xs">Best odds at</span>
        <span className="text-zinc-400 text-xs font-bold">{ud.bestBookmaker}</span>
      </div>

      {/* Notes */}
      {pick.analysisNotes.length > 0 && (
        <div className="px-4 pb-3 space-y-1">
          {pick.analysisNotes.slice(0, 2).map((n, i) => (
            <p key={i} className="text-zinc-600 text-xs">▸ {n}</p>
          ))}
        </div>
      )}

      {/* Track */}
      <div className="px-4 pb-4 pt-1">
        <button onClick={onTrack} className={`w-full py-3 rounded-xl font-bold text-sm transition-all ${
          tracked
            ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
            : "bg-emerald-600 hover:bg-emerald-500 text-white"
        }`}>
          {tracked ? "✓ Tracking this pick" : "Track This Pick"}
        </button>
      </div>
    </div>
  )
}

export function BettingDashboard() {
  const [data,            setData]            = useState<AnalysisResponse | null>(null)
  const [loading,         setLoading]         = useState(true)
  const [error,           setError]           = useState<string | null>(null)
  const [tab,             setTab]             = useState<"pick" | "record">("pick")
  const [trackedBets,     setTrackedBets]     = useState<TrackedBet[]>([])
  const [refreshed,       setRefreshed]       = useState<Date | null>(null)
  const [savedLiveId,     setSavedLiveId]     = useState<string | null>(null)
  const [savedUpcomingId, setSavedUpcomingId] = useState<string | null>(null)
  const [livePick,        setLivePick]        = useState<BetAnalysis | null>(null)
  const [upcomingPick,    setUpcomingPick]    = useState<BetAnalysis | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    setTrackedBets(loadBets())
    setSavedLiveId(getSaved(LIVE_PICK_KEY))
    setSavedUpcomingId(getSaved(UPCOMING_PICK_KEY))
  }, [])

  const reloadBets = useCallback(() => setTrackedBets(loadBets()), [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res  = await fetch("/api/odds")
      const json: AnalysisResponse & { error?: string } = await res.json()
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

  // Refresh once per hour
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    intervalRef.current = setInterval(load, REFRESH_INTERVAL_MS)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [load])

  // Resolve both picks whenever analyses update
  useEffect(() => {
    if (!data) return
    const liveGames = data.allAnalyses.filter((a) => a.isLive)
    const upcoming  = data.allAnalyses.filter((a) => !a.isLive)

    const lp = resolvePick(liveGames, savedLiveId, LIVE_PICK_KEY)
    setLivePick(lp)
    if (lp && lp.eventId !== savedLiveId) setSavedLiveId(lp.eventId)

    const up = resolvePick(upcoming, savedUpcomingId, UPCOMING_PICK_KEY)
    setUpcomingPick(up)
    if (up && up.eventId !== savedUpcomingId) setSavedUpcomingId(up.eventId)
  }, [data, savedLiveId, savedUpcomingId])

  function handleTrack(a: BetAnalysis) {
    if (isTracked(a.eventId, trackedBets)) untrackBet(a.eventId)
    else trackBet(a)
    reloadBets()
  }

  const rec = calcRecord(trackedBets)

  // ── Loading ──
  if (loading && !data) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-zinc-500 text-sm">Finding the best pick…</p>
        </div>
      </div>
    )
  }

  // ── Network error ──
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

  // ── API key / quota error ──
  if (data.hasKey && data.apiError && data.allAnalyses.length === 0) {
    const isQuota     = data.errorCode === 422
    const isRateLimit = data.errorCode === 429
    const isBadKey    = data.errorCode === 401
    const title = isQuota ? "Hourly Quota Reached" : isRateLimit ? "Rate Limited" : isBadKey ? "API Key Rejected" : "API Request Error"
    const icon  = isQuota ? "📊" : isRateLimit ? "⏱" : isBadKey ? "🔑" : "⚠️"
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 gap-6">
        <span className="text-2xl font-black">Sharp<span className="text-emerald-400">Dog</span></span>
        <div className="bg-zinc-950 border border-red-900/60 rounded-2xl p-6 max-w-md w-full space-y-4">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{icon}</span>
            <p className="text-white font-bold text-lg">{title}</p>
          </div>
          <p className="text-red-400 text-sm font-mono leading-relaxed">{data.apiError}</p>
          {isQuota && (
            <p className="text-zinc-500 text-xs">Your hourly quota resets automatically — try again in a few minutes.</p>
          )}
          {(isBadKey || (!isQuota && !isRateLimit)) && (
            <div className="bg-zinc-900 rounded-lg px-3 py-2.5 space-y-1.5">
              <p className="text-zinc-400 text-[11px] font-bold uppercase tracking-wider">How to fix</p>
              <p className="text-zinc-500 text-xs">1. Log in to <strong className="text-zinc-300">odds-api.io</strong> → copy your API key</p>
              <p className="text-zinc-500 text-xs">2. Vercel → Settings → Environment Variables → edit <code className="text-zinc-300">ODDS_API_KEY</code></p>
              <p className="text-zinc-500 text-xs">3. Paste key → Save → Redeploy</p>
            </div>
          )}
          <button onClick={load} className="w-full bg-emerald-700 hover:bg-emerald-600 text-white py-2.5 rounded-xl text-sm font-bold">Retry</button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <header className="bg-zinc-950 border-b border-zinc-800 sticky top-0 z-20">
        <div className="max-w-md mx-auto px-4 py-3 flex items-center justify-between">
          <span className="text-xl font-black">Sharp<span className="text-emerald-400">Dog</span></span>
          <div className="flex items-center gap-2">
            <span className="text-zinc-700 text-xs">{refreshed?.toLocaleTimeString()}</span>
            <button onClick={load} disabled={loading}
              className="w-7 h-7 flex items-center justify-center rounded bg-zinc-900 text-zinc-400 hover:bg-zinc-800 disabled:opacity-30">
              {loading
                ? <span className="w-3 h-3 border border-zinc-500 border-t-transparent rounded-full animate-spin" />
                : "↻"}
            </button>
          </div>
        </div>
        <div className="max-w-md mx-auto px-4 flex border-t border-zinc-900">
          {(["pick", "record"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${
                tab === t ? "border-emerald-400 text-white" : "border-transparent text-zinc-600 hover:text-zinc-400"
              }`}>
              {t === "pick" ? "The Pick" : "My Record"}
              {t === "record" && trackedBets.length > 0 && (
                <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${
                  rec.pnl >= 0 ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"
                }`}>
                  {rec.wins}W-{rec.losses}L
                </span>
              )}
            </button>
          ))}
        </div>
      </header>

      {/* PICKS tab */}
      {tab === "pick" && (
        <main className="max-w-md mx-auto px-4 py-6 space-y-6">

          {/* Live pick */}
          <section className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              <span className="text-[11px] text-zinc-500 font-bold uppercase tracking-widest">Live Now</span>
            </div>
            {livePick ? (
              <ThePickCard
                pick={livePick}
                label="🔴 Live Underdog"
                tracked={isTracked(livePick.eventId, trackedBets)}
                onTrack={() => handleTrack(livePick)}
              />
            ) : (
              <div className="bg-zinc-950 border border-zinc-900 rounded-xl px-4 py-6 text-center">
                <p className="text-zinc-600 text-sm">No live games right now</p>
              </div>
            )}
          </section>

          {/* Upcoming pick */}
          <section className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-500" />
              <span className="text-[11px] text-zinc-500 font-bold uppercase tracking-widest">Coming Up</span>
            </div>
            {upcomingPick ? (
              <ThePickCard
                pick={upcomingPick}
                label="⭐ Next Best Pick"
                tracked={isTracked(upcomingPick.eventId, trackedBets)}
                onTrack={() => handleTrack(upcomingPick)}
              />
            ) : (
              <div className="bg-zinc-950 border border-zinc-900 rounded-xl px-4 py-6 text-center">
                <p className="text-zinc-600 text-sm">No upcoming games in window</p>
              </div>
            )}
          </section>

          <p className="text-center text-zinc-700 text-[11px]">
            {data.totalGamesScanned} games scanned · refreshes every hour
          </p>
        </main>
      )}

      {/* RECORD tab */}
      {tab === "record" && (
        <main className="max-w-md mx-auto px-4 py-4">
          <BetTracker bets={trackedBets} onChange={reloadBets} fullPage />
        </main>
      )}
    </div>
  )
}
