"use client"

import type { TrackedBet } from "@/types/betting"
import { settleBet, removeBet, calcRecord } from "@/lib/tracker"

function fmt(n: number) { return n > 0 ? `+${n}` : `${n}` }

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
}

export function BetTracker({
  bets,
  onChange,
  fullPage = false,
}: {
  bets: TrackedBet[]
  onChange: () => void
  fullPage?: boolean
}) {
  const rec = calcRecord(bets)
  const pending = bets.filter((b) => b.status === "PENDING")
  const settled = bets.filter((b) => b.status !== "PENDING")
  const totalSettled = rec.wins + rec.losses
  const winRate = totalSettled > 0 ? (rec.wins / totalSettled) * 100 : 0
  const roi = totalSettled > 0 ? (rec.pnl / (totalSettled * 100)) * 100 : 0

  function settle(id: string, status: "WON" | "LOST") { settleBet(id, status); onChange() }
  function remove(id: string) { removeBet(id); onChange() }

  // Compact mode (in picks tab): only show when there are bets, no header needed
  if (!fullPage) {
    if (bets.length === 0) return null
    return (
      <div className="rounded-2xl border border-zinc-700 bg-zinc-900 overflow-hidden">
        <div className="px-5 py-3 flex items-center gap-3 flex-wrap">
          <span className="font-bold text-white text-sm">My Picks</span>
          {rec.wins > 0 && <span className="bg-emerald-500/20 text-emerald-400 text-xs px-2 py-0.5 rounded-full font-semibold">{rec.wins}W</span>}
          {rec.losses > 0 && <span className="bg-red-500/20 text-red-400 text-xs px-2 py-0.5 rounded-full font-semibold">{rec.losses}L</span>}
          {rec.pending > 0 && <span className="bg-zinc-700 text-zinc-400 text-xs px-2 py-0.5 rounded-full font-semibold">{rec.pending} pending</span>}
          {totalSettled > 0 && (
            <span className={`text-sm font-bold ml-auto ${rec.pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {rec.pnl >= 0 ? "+" : ""}${rec.pnl.toFixed(0)} P&L · ROI {roi >= 0 ? "+" : ""}{roi.toFixed(1)}%
            </span>
          )}
        </div>
      </div>
    )
  }

  // Full page mode (My Record tab)
  return (
    <div className="space-y-6 pb-8">
      {bets.length === 0 ? (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-12 text-center space-y-3">
          <div className="text-3xl">📋</div>
          <div className="text-white font-semibold">No picks tracked yet</div>
          <div className="text-zinc-500 text-sm max-w-xs mx-auto">
            Go to the Picks tab, expand any card, and tap "Track This Pick" to start recording your bets.
          </div>
        </div>
      ) : (
        <>
          {/* ROI stats */}
          {totalSettled > 0 && (
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: "Win Rate", value: `${winRate.toFixed(0)}%`, green: winRate >= 50 },
                { label: "Total P&L", value: `${rec.pnl >= 0 ? "+" : ""}$${rec.pnl.toFixed(0)}`, green: rec.pnl >= 0 },
                { label: "ROI", value: `${roi >= 0 ? "+" : ""}${roi.toFixed(1)}%`, green: roi >= 0 },
                { label: "Settled", value: `${totalSettled}`, neutral: true },
              ].map((s) => (
                <div key={s.label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
                  <div className={`text-2xl font-black tabular-nums ${
                    (s as { neutral?: boolean }).neutral ? "text-white" : s.green ? "text-emerald-400" : "text-red-400"
                  }`}>{s.value}</div>
                  <div className="text-xs text-zinc-500 uppercase tracking-wide mt-1">{s.label}</div>
                </div>
              ))}
            </div>
          )}

          {/* Pending picks */}
          {pending.length > 0 && (
            <div>
              <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-3">
                Pending · {pending.length} bet{pending.length !== 1 ? "s" : ""}
              </h3>
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900 overflow-hidden divide-y divide-zinc-800">
                {pending.map((b) => (
                  <div key={b.id} className="px-5 py-4 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-xs text-zinc-500 uppercase tracking-wide">{b.sportTitle}</span>
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
                        <span className="text-xs text-amber-400 font-semibold">PENDING</span>
                      </div>
                      <div className="text-base font-bold text-white">
                        {b.underdogTeam}
                        <span className={`ml-2 ${b.odds > 0 ? "text-emerald-400" : "text-zinc-300"}`}>{fmt(b.odds)}</span>
                        <span className="text-xs text-zinc-500 font-normal ml-1">@ {b.bookmaker}</span>
                      </div>
                      <div className="text-xs text-zinc-600 mt-0.5">
                        {b.homeTeam} vs {b.awayTeam} · tracked {fmtDate(b.trackedAt)}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button onClick={() => settle(b.id, "WON")}
                        className="text-xs px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold">Won ✓</button>
                      <button onClick={() => settle(b.id, "LOST")}
                        className="text-xs px-3 py-1.5 rounded-lg bg-red-800 hover:bg-red-700 text-white font-bold">Lost ✗</button>
                      <button onClick={() => remove(b.id)}
                        className="text-xs px-2 py-1.5 text-zinc-600 hover:text-zinc-400">✕</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Settled history */}
          {settled.length > 0 && (
            <div>
              <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-3">History</h3>
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900 overflow-hidden divide-y divide-zinc-800">
                {settled.map((b) => {
                  const dec = b.odds > 0 ? b.odds / 100 + 1 : 100 / Math.abs(b.odds) + 1
                  const pnl = b.status === "WON" ? (dec - 1) * 100 : -100
                  return (
                    <div key={b.id} className="px-5 py-3.5 flex items-center gap-3">
                      <div className={`w-1 h-10 rounded-full flex-shrink-0 ${b.status === "WON" ? "bg-emerald-500" : "bg-red-500"}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                            b.status === "WON" ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"
                          }`}>{b.status}</span>
                          <span className="text-xs text-zinc-500">{b.sportTitle}</span>
                        </div>
                        <div className="text-sm font-semibold text-zinc-200">
                          {b.underdogTeam} <span className="text-zinc-400 font-normal">{fmt(b.odds)}</span>
                        </div>
                        <div className="text-xs text-zinc-600">{b.homeTeam} vs {b.awayTeam}</div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className={`text-lg font-black ${pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {pnl >= 0 ? "+" : ""}${pnl.toFixed(0)}
                        </div>
                        <div className="text-xs text-zinc-600">$100 stake</div>
                      </div>
                      <button onClick={() => remove(b.id)}
                        className="text-xs px-2 py-1 text-zinc-700 hover:text-zinc-500 flex-shrink-0">✕</button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
