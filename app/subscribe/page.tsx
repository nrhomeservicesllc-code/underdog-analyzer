"use client"

import { useState } from "react"

const MONTHLY_PRICE = process.env.NEXT_PUBLIC_PRICE_MONTHLY_DISPLAY ?? "$9.99"
const YEARLY_PRICE  = process.env.NEXT_PUBLIC_PRICE_YEARLY_DISPLAY  ?? "$79.99"

const PERKS = [
  "Daily sharp underdog pick — live & upcoming",
  "Real odds from your bookmakers, vig stripped",
  "Expected-value edge on every pick",
  "Pick tracking & your win/loss record",
]

export default function SubscribePage() {
  const [busy, setBusy] = useState<"monthly" | "yearly" | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function checkout(plan: "monthly" | "yearly") {
    setBusy(plan)
    setError(null)
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Checkout failed")
      window.location.href = json.url
    } catch (err) {
      setError((err as Error).message)
      setBusy(null)
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" })
    window.location.href = "/login"
  }

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-3xl font-black">Sharp<span className="text-emerald-400">Dog</span></h1>
          <p className="text-zinc-400 text-sm font-medium">Unlock today&apos;s picks</p>
        </div>

        <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-5 space-y-2">
          {PERKS.map((p) => (
            <p key={p} className="text-zinc-400 text-sm flex gap-2">
              <span className="text-emerald-400">✓</span>{p}
            </p>
          ))}
        </div>

        <div className="space-y-3">
          {/* Yearly — best value, listed first */}
          <button
            onClick={() => checkout("yearly")}
            disabled={busy !== null}
            className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-2xl p-4 text-left relative overflow-hidden"
          >
            <span className="absolute top-3 right-3 bg-black/30 text-emerald-200 text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded">
              Best value
            </span>
            <p className="font-black text-lg">{busy === "yearly" ? "Opening checkout…" : "Yearly"}</p>
            <p className="text-emerald-100 text-sm">{YEARLY_PRICE} / year — 2 months free</p>
          </button>

          <button
            onClick={() => checkout("monthly")}
            disabled={busy !== null}
            className="w-full bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 disabled:opacity-50 rounded-2xl p-4 text-left"
          >
            <p className="font-black text-lg">{busy === "monthly" ? "Opening checkout…" : "Monthly"}</p>
            <p className="text-zinc-400 text-sm">{MONTHLY_PRICE} / month — cancel anytime</p>
          </button>
        </div>

        {error && <p className="text-red-400 text-xs text-center">{error}</p>}

        <p className="text-center text-zinc-600 text-[11px] leading-relaxed">
          Secure payment via Stripe. Cancel anytime from your account.
          For entertainment purposes only — not betting advice.
        </p>

        <button onClick={logout} className="w-full text-zinc-600 hover:text-zinc-400 text-xs">
          Sign out
        </button>
      </div>
    </div>
  )
}
