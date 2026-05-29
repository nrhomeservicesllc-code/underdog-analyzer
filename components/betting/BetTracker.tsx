"use client"

import { useState } from "react"
import type { TrackedBet } from "@/types/betting"
import { settleBet, removeBet, calcRecord } from "@/lib/tracker"

function fmt(n: number) { return n > 0 ? `+${n}` : `${n}` }

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
}

export function BetTracker({
  bets,
  onChange,
}: {
  bets: TrackedBet[]
  onChange: () => void
}) {
  const [open, setOpen] = useState(true)

  if (bets.length === 0) return null

  const rec = calcRecord(bets)
  const pending = bets.filter((b) => b.status === "PENDING")
  const settled = bets.filter((b) => b.status !== "PENDING")

  function settle(id: string, status: "WON" | "LOST") {
    settleBet(id, status)
    onChange()
  }

  function remove(id: string) {
    removeBet(id)
    onChange()
  }

  return (
    <div className="rounded-2xl border border-zinc-700 bg-zinc-900 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-zinc-800/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="font-bold text-white text-sm">My Picks</span>
          <div className="flex items-center gap-1.5 text-xs">
            {rec.wins > 0 && (
              <span className="bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full font-semibold">
                {rec.wins}W
              </span>
            )}
            {rec.losses > 0 && (
              <span className="bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full font-semibold">
                {rec.losses}L
              </span>
            )}
            {rec.pending > 0 && (
              <span className="bg-zinc-700 text-zinc-400 px-2 py-0.5 rounded-full font-semibold">
                {rec.pending} pending
              </span>
            )}
          </div>
          {(rec.wins > 0 || rec.losses > 0) && (
            <span className={`text-sm font-bold ${rec.pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {rec.pnl >= 0 ? "+" : ""}${rec.pnl.toFixed(0)} P&amp;L
            </span>
          )}
        </div>
        <span className="text-zinc-500 text-xs">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="border-t border-zinc-800">
          {/* ROI stats strip */}
          {settled.length > 0 && (() => {
            const totalSettled = rec.wins + rec.losses
            const winRate = totalSettled > 0 ? (rec.wins / totalSettled) * 100 : 0
            const roi = totalSettled > 0 ? (rec.pnl / (totalSettled * 100)) * 100 : 0
            return (
              <div className="grid grid-cols-4 divide-x divide-zinc-800 border-b border-zinc-800 bg-zinc-950/60">
                {[
                  { label: "Win Rate", value: `${winRate.toFixed(0)}%`, positive: winRate >= 50 },
                  { label: "Total P&L", value: `${rec.pnl >= 0 ? "+" : ""}$${rec.pnl.toFixed(0)}`, positive: rec.pnl >= 0 },
                  { label: "ROI", value: `${roi >= 0 ? "+" : ""}${roi.toFixed(1)}%`, positive: roi >= 0 },
                  { label: "Settled", value: `${totalSettled}`, positive: null },
                ].map((s) => (
                  <div key={s.label} className="flex flex-col items-center py-3 px-2">
                    <span className={`text-base font-black tabular-nums ${s.positive === null ? "text-white" : s.positive ? "text-emerald-400" : "text-red-400"}`}>
                      {s.value}
                    </span>
                    <span className="text-[10px] text-zinc-500 uppercase tracking-wide mt-0.5">{s.label}</span>
                  </div>
                ))}
              </div>
            )
          })()}

          {/* Pending bets */}
          {pending.length > 0 && (
            <div className="divide-y divide-zinc-800">
              {pending.map((b) => (
                <div key={b.id} className="px-5 py-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <span className="text-xs text-zinc-500 uppercase tracking-wide">{b.sportTitle}</span>
                      <span className="live-dot w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
                      <span className="text-xs text-amber-400 font-semibold">PENDING</span>
                    </div>
                    <div className="text-sm font-semibold text-white">
                      {b.underdogTeam}
                      <span className={`ml-2 font-mono ${b.odds > 0 ? "text-emerald-400" : "text-zinc-300"}`}>
                        {fmt(b.odds)}
                      </span>
                      <span className="text-xs text-zinc-500 ml-1">@ {b.bookmaker}</span>
                    </div>
                    <div className="text-xs text-zinc-600 mt-0.5">
                      {b.homeTeam} vs {b.awayTeam} · tracked {fmtDate(b.trackedAt)}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => settle(b.id, "WON")}
                      className="text-xs px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition-colors"
                    >
                      Won
                    </button>
                    <button
                      onClick={() => settle(b.id, "LOST")}
                      className="text-xs px-2.5 py-1 rounded-lg bg-red-700 hover:bg-red-600 text-white font-semibold transition-colors"
                    >
                      Lost
                    </button>
                    <button
                      onClick={() => remove(b.id)}
                      className="text-xs px-2 py-1 rounded-lg text-zinc-600 hover:text-zinc-400 transition-colors"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Settled bets */}
          {settled.length > 0 && (
            <div className="border-t border-zinc-800">
              <div className="px-5 py-2 text-xs text-zinc-600 uppercase tracking-wide font-semibold">History</div>
              <div className="divide-y divide-zinc-800/60">
                {settled.map((b) => {
                  const dec = b.odds > 0 ? b.odds / 100 + 1 : 100 / Math.abs(b.odds) + 1
                  const pnl = b.status === "WON" ? (dec - 1) * 100 : -100
                  return (
                    <div key={b.id} className="px-5 py-2.5 flex items-center gap-3 opacity-70">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                            b.status === "WON"
                              ? "bg-emerald-500/20 text-emerald-400"
                              : "bg-red-500/20 text-red-400"
                          }`}>{b.status}</span>
                          <span className="text-xs text-zinc-500">{b.sportTitle}</span>
                        </div>
                        <div className="text-sm text-zinc-300">
                          {b.underdogTeam}
                          <span className="font-mono ml-2 text-zinc-400">{fmt(b.odds)}</span>
                        </div>
                        <div className="text-xs text-zinc-600">{b.homeTeam} vs {b.awayTeam}</div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className={`text-sm font-bold ${pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {pnl >= 0 ? "+" : ""}${pnl.toFixed(0)}
                        </div>
                        <div className="text-xs text-zinc-600">$100 stake</div>
                      </div>
                      <button
                        onClick={() => remove(b.id)}
                        className="text-xs px-2 py-1 rounded-lg text-zinc-700 hover:text-zinc-500 transition-colors flex-shrink-0"
                      >
                        ✕
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
