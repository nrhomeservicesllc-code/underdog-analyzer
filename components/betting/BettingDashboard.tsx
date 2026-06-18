"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import type { AnalysisResponse, BetAnalysis, TrackedBet } from "@/types/betting"
import { BetTracker } from "./BetTracker"
import { loadBets, trackBet, untrackBet, isTracked, calcRecord } from "@/lib/tracker"

const REFRESH_INTERVAL_MS = 60 * 60_000  // 1 hour
const MAX_UPCOMING = 3                    // how many upcoming picks to display

function fmtAmerican(n: number) { return n > 0 ? `+${n}` : `${n}` }

function sharePick(pick: BetAnalysis) {
  const ud = pick.underdogTeam
  const text = `🐶 SharpDog pick: ${ud.team} ${ud.bestAmericanOdds > 0 ? "+" : ""}${ud.bestAmericanOdds} vs ${pick.favoriteTeam.team} — ${pick.expectedValuePct > 0 ? "+" : ""}${pick.expectedValuePct.toFixed(1)}% edge`
  const url = window.location.origin
  if (navigator.share) {
    navigator.share({ title: "SharpDog", text, url }).catch(() => {})
  } else {
    navigator.clipboard?.writeText(`${text}\n${url}`).catch(() => {})
  }
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

      {/* Track + share */}
      <div className="px-4 pb-4 pt-1 flex gap-2">
        <button onClick={onTrack} className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all ${
          tracked
            ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
            : "bg-emerald-600 hover:bg-emerald-500 text-white"
        }`}>
          {tracked ? "✓ Tracking this pick" : "Track This Pick"}
        </button>
        <button onClick={() => sharePick(pick)} title="Share this pick"
          className="px-4 py-3 rounded-xl font-bold text-sm bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800">
          ↗
        </button>
      </div>
    </div>
  )
}

export function BettingDashboard() {
  const [data,         setData]         = useState<AnalysisResponse | null>(null)
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState<string | null>(null)
  const [tab,          setTab]          = useState<"pick" | "record">("pick")
  const [trackedBets,  setTrackedBets]  = useState<TrackedBet[]>([])
  const [refreshed,    setRefreshed]    = useState<Date | null>(null)
  const [livePicks,    setLivePicks]    = useState<BetAnalysis[]>([])
  const [upcomingPicks,setUpcomingPicks]= useState<BetAnalysis[]>([])
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => { setTrackedBets(loadBets()) }, [])

  // Auth + subscription gate
  const [me, setMe] = useState<{ username: string; role: string } | null>(null)
  useEffect(() => {
    fetch("/api/me")
      .then(async (r) => {
        if (r.status === 401) { window.location.href = "/login"; return null }
        return r.json()
      })
      .then((json) => {
        if (!json) return
        if (!json.access) { window.location.href = "/subscribe"; return }
        setMe({ username: json.username, role: json.role })
      })
      .catch(() => {})
  }, [])

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" })
    window.location.href = "/login"
  }

  const reloadBets = useCallback(() => setTrackedBets(loadBets()), [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res  = await fetch("/api/odds")
      if (res.status === 401) { window.location.href = "/login"; return }
      if (res.status === 402) { window.location.href = "/subscribe"; return }
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

  // Split analyses into live and upcoming lists on every data refresh
  useEffect(() => {
    if (!data) return
    // analyzeAll already sorted: live first, then by underdogScore desc
    setLivePicks(data.allAnalyses.filter((a) => a.isLive))
    setUpcomingPicks(data.allAnalyses.filter((a) => !a.isLive).slice(0, MAX_UPCOMING))
  }, [data])

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

  // ── API key / quota / setup error ──
  if (data.hasKey && data.apiError && data.allAnalyses.length === 0) {
    const isSetup     = data.errorCode === 0
    const isQuota     = data.errorCode === 422
    const isRateLimit = data.errorCode === 429
    const isBadKey    = data.errorCode === 401
    const title = isSetup ? "One-Time Setup Required"
                : isQuota ? "Hourly Quota Reached"
                : isRateLimit ? "Rate Limited"
                : isBadKey ? "API Key Rejected"
                : "API Request Error"
    const icon  = isSetup ? "📋" : isQuota ? "📊" : isRateLimit ? "⏱" : isBadKey ? "🔑" : "⚠️"
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 gap-6">
        <span className="text-2xl font-black">Sharp<span className="text-emerald-400">Dog</span></span>
        <div className="bg-zinc-950 border border-amber-900/60 rounded-2xl p-6 max-w-md w-full space-y-4">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{icon}</span>
            <p className="text-white font-bold text-lg">{title}</p>
          </div>
          {isSetup ? (
            <div className="space-y-3">
              <p className="text-zinc-400 text-sm">Your API key works, but you need to select bookmakers in your odds-api.io account before odds data can be fetched.</p>
              <div className="bg-zinc-900 rounded-lg px-3 py-2.5 space-y-1.5">
                <p className="text-zinc-400 text-[11px] font-bold uppercase tracking-wider">How to fix (one time)</p>
                <p className="text-zinc-500 text-xs">1. Go to <strong className="text-zinc-300">odds-api.io/manage</strong></p>
                <p className="text-zinc-500 text-xs">2. Find "Bookmakers" → select 1–2 bookmakers (e.g. Bet365, Pinnacle)</p>
                <p className="text-zinc-500 text-xs">3. Save, then come back and hit Retry below</p>
              </div>
            </div>
          ) : (
            <>
              <p className="text-red-400 text-sm font-mono leading-relaxed">{data.apiError}</p>
              {isQuota && <p className="text-zinc-500 text-xs">Your quota resets automatically — try again soon.</p>}
              {(isBadKey || (!isSetup && !isQuota && !isRateLimit)) && (
                <div className="bg-zinc-900 rounded-lg px-3 py-2.5 space-y-1.5">
                  <p className="text-zinc-400 text-[11px] font-bold uppercase tracking-wider">How to fix</p>
                  <p className="text-zinc-500 text-xs">1. Log in to <strong className="text-zinc-300">odds-api.io</strong> → copy your API key</p>
                  <p className="text-zinc-500 text-xs">2. Vercel → Settings → Environment Variables → edit <code className="text-zinc-300">ODDS_API_KEY</code></p>
                  <p className="text-zinc-500 text-xs">3. Paste key → Save → Redeploy</p>
                </div>
              )}
            </>
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
            {me && <span className="text-zinc-600 text-xs font-medium">{me.username}{me.role === "admin" ? " ★" : ""}</span>}
            <span className="text-zinc-700 text-xs">{refreshed?.toLocaleTimeString()}</span>
            <button onClick={load} disabled={loading}
              className="w-7 h-7 flex items-center justify-center rounded bg-zinc-900 text-zinc-400 hover:bg-zinc-800 disabled:opacity-30">
              {loading
                ? <span className="w-3 h-3 border border-zinc-500 border-t-transparent rounded-full animate-spin" />
                : "↻"}
            </button>
            <button onClick={logout} title="Sign out"
              className="w-7 h-7 flex items-center justify-center rounded bg-zinc-900 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 text-xs">
              ⎋
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
        <main className="max-w-md mx-auto px-4 py-6 space-y-8">

          {/* ── Live Now ── */}
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              <span className="text-[11px] text-zinc-500 font-bold uppercase tracking-widest">
                Live Now
              </span>
              {livePicks.length > 0 && (
                <span className="ml-auto bg-red-500/20 text-red-400 text-[10px] font-black px-2 py-0.5 rounded-full">
                  {livePicks.length} game{livePicks.length > 1 ? "s" : ""}
                </span>
              )}
            </div>

            {livePicks.length > 0 ? (
              <div className="space-y-4">
                {livePicks.map((pick, i) => (
                  <ThePickCard
                    key={pick.eventId}
                    pick={pick}
                    label={i === 0 ? "🔴 Best Live Underdog" : "🔴 Live Underdog"}
                    tracked={isTracked(pick.eventId, trackedBets)}
                    onTrack={() => handleTrack(pick)}
                  />
                ))}
              </div>
            ) : (
              <div className="bg-zinc-950 border border-zinc-800/60 rounded-xl px-4 py-5 text-center">
                <p className="text-zinc-600 text-sm">No live games right now</p>
                <p className="text-zinc-700 text-xs mt-0.5">Check back during game time</p>
              </div>
            )}
          </section>

          {/* ── Coming Up ── */}
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span className="text-[11px] text-zinc-500 font-bold uppercase tracking-widest">Coming Up</span>
              {upcomingPicks.length > 1 && (
                <span className="ml-auto text-zinc-700 text-[10px]">Top {upcomingPicks.length} picks by edge</span>
              )}
            </div>

            {upcomingPicks.length > 0 ? (
              <div className="space-y-4">
                {upcomingPicks.map((pick, i) => (
                  <ThePickCard
                    key={pick.eventId}
                    pick={pick}
                    label={i === 0 ? "⭐ Best Pick" : `#${i + 1} Pick`}
                    tracked={isTracked(pick.eventId, trackedBets)}
                    onTrack={() => handleTrack(pick)}
                  />
                ))}
              </div>
            ) : (
              <div className="bg-zinc-950 border border-zinc-800/60 rounded-xl px-4 py-5 text-center">
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
