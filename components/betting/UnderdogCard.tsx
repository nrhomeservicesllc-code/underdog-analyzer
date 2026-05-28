"use client"

import type { BetAnalysis } from "@/types/betting"

const REC = {
  "STRONG BUY": { bar: "bg-emerald-500", badge: "bg-emerald-500 text-white", ring: "ring-emerald-500/40" },
  BUY:          { bar: "bg-blue-500",    badge: "bg-blue-500 text-white",    ring: "ring-blue-500/40" },
  WATCH:        { bar: "bg-amber-400",   badge: "bg-amber-400 text-white",   ring: "ring-amber-400/40" },
  AVOID:        { bar: "bg-zinc-600",    badge: "bg-zinc-600 text-white",    ring: "ring-zinc-600/30" },
}

function fmt(n: number) { return n > 0 ? `+${n}` : `${n}` }

function gameTime(iso: string, live: boolean) {
  if (live) return null
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
}

export function UnderdogCard({
  analysis,
  rank,
  expanded,
  tracked,
  onToggle,
  onTrack,
}: {
  analysis: BetAnalysis
  rank: number
  expanded: boolean
  tracked: boolean
  onToggle: () => void
  onTrack: () => void
}) {
  const r = REC[analysis.recommendation]
  const ud = analysis.underdogTeam
  const fav = analysis.favoriteTeam
  const time = gameTime(analysis.commenceTime, analysis.isLive)

  return (
    <div
      className={`rounded-2xl bg-zinc-900 border overflow-hidden transition-all ${
        tracked
          ? "border-amber-500/50 ring-1 ring-amber-500/20"
          : expanded
          ? `border-zinc-700 ring-2 ${r.ring}`
          : "border-zinc-800 hover:border-zinc-700"
      }`}
    >
      {/* color bar */}
      <div className={`h-1 w-full ${r.bar}`} />

      <div className="p-4 cursor-pointer" onClick={onToggle}>
        <div className="flex items-start gap-3">
          {/* rank */}
          <span className="flex-shrink-0 w-7 h-7 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-400">
            {rank}
          </span>

          <div className="flex-1 min-w-0">
            {/* sport + status row */}
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                {analysis.sportTitle}
              </span>
              {analysis.isLive ? (
                <span className="flex items-center gap-1 text-xs font-bold text-red-400">
                  <span className="live-dot w-1.5 h-1.5 rounded-full bg-red-400 inline-block" />
                  LIVE
                </span>
              ) : (
                <span className="text-xs text-zinc-600">{time}</span>
              )}
              <span className="text-xs text-zinc-600">{analysis.bookmakerCount} books</span>
              {tracked && (
                <span className="text-xs font-semibold text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded-full">
                  Tracking
                </span>
              )}
            </div>

            {/* matchup */}
            <div className="text-sm font-medium text-zinc-300 mb-2">
              {analysis.homeTeam} <span className="text-zinc-600">vs</span> {analysis.awayTeam}
            </div>

            {/* key metrics */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <div>
                <span className="text-xs text-zinc-500 mr-1">Underdog</span>
                <span className="font-semibold text-white">{ud.team}</span>
                <span className={`ml-2 font-mono font-bold text-lg ${analysis.expectedValuePct > 0 ? "text-emerald-400" : "text-zinc-300"}`}>
                  {fmt(ud.bestAmericanOdds)}
                </span>
                <span className="text-xs text-zinc-600 ml-1">@ {ud.bestBookmaker}</span>
              </div>

              <div className="flex items-center gap-2 text-xs">
                <span className={`px-2 py-0.5 rounded-full font-semibold ${analysis.expectedValuePct > 0 ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"}`}>
                  EV {fmt(parseFloat(analysis.expectedValuePct.toFixed(1)))}%
                </span>
                <span className="bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded-full">
                  Win prob {(analysis.consensusProbability * 100).toFixed(1)}%
                </span>
                {analysis.lineShoppingEdge > 0.01 && (
                  <span className="bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded-full">
                    +{(analysis.lineShoppingEdge * 100).toFixed(1)}pp edge
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* rec badge */}
          <span className={`flex-shrink-0 text-xs font-bold px-3 py-1 rounded-lg ${r.badge}`}>
            {analysis.recommendation}
          </span>
        </div>
      </div>

      {/* expanded detail */}
      {expanded && (
        <div className="border-t border-zinc-800 px-4 py-4 space-y-5">
          {/* payout calc */}
          <div className="grid grid-cols-3 gap-3 text-center">
            {[
              { label: "No-vig win prob", val: `${(analysis.consensusProbability * 100).toFixed(1)}%` },
              { label: "$100 bet returns", val: `$${(ud.bestDecimalOdds * 100).toFixed(0)}` },
              { label: "Expected value", val: `${analysis.expectedValue >= 0 ? "+" : ""}$${(analysis.expectedValue * 100).toFixed(2)}`, green: analysis.expectedValue > 0 },
            ].map((s) => (
              <div key={s.label} className="bg-zinc-800 rounded-xl p-3">
                <div className="text-xs text-zinc-500 mb-1">{s.label}</div>
                <div className={`font-bold text-lg ${s.green ? "text-emerald-400" : s.green === false ? "text-red-400" : "text-white"}`}>
                  {s.val}
                </div>
              </div>
            ))}
          </div>

          {/* live odds table — updates every refresh */}
          <div className="grid grid-cols-2 gap-4">
            {[{ team: ud, label: "Underdog" }, { team: fav, label: "Favorite" }].map(({ team, label }) => (
              <div key={team.team}>
                <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">
                  {label}: <span className="text-zinc-300 normal-case">{team.team}</span>
                </div>
                <div className="space-y-1">
                  {team.allOdds.map((o) => (
                    <div key={o.bookmaker} className="flex justify-between text-xs">
                      <span className="text-zinc-500">{o.bookmaker}</span>
                      <span className={`font-mono font-semibold ${o.decimal === team.bestDecimalOdds && label === "Underdog" ? "text-emerald-400" : "text-zinc-300"}`}>
                        {fmt(o.american)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* analysis notes */}
          {analysis.analysisNotes.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Analysis</div>
              {analysis.analysisNotes.map((n, i) => (
                <div key={i} className="flex gap-2 text-sm text-zinc-400">
                  <span className="text-emerald-500 flex-shrink-0">▸</span>
                  {n}
                </div>
              ))}
            </div>
          )}

          {/* Track pick button */}
          <div className="border-t border-zinc-800 pt-4">
            <button
              onClick={(e) => { e.stopPropagation(); onTrack() }}
              className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                tracked
                  ? "bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-red-500/20 hover:text-red-400 hover:border-red-500/30"
                  : "bg-emerald-600 hover:bg-emerald-500 text-white"
              }`}
            >
              {tracked ? "Remove from My Picks" : "Track This Pick"}
            </button>
          </div>

          <p className="text-xs text-zinc-600 italic">
            Positive EV reflects statistical value over a large sample — not a guaranteed outcome. Gamble responsibly.
          </p>
        </div>
      )}
    </div>
  )
}
