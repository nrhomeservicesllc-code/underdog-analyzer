"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"

export default function RegisterPage() {
  const router = useRouter()
  const [username, setUsername] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email, password }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Registration failed")
      router.push("/")
      router.refresh()
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-3xl font-black">Sharp<span className="text-emerald-400">Dog</span></h1>
          <p className="text-zinc-500 text-sm">Create your account to see today&apos;s picks</p>
        </div>

        <form onSubmit={submit} className="bg-zinc-950 border border-zinc-800 rounded-2xl p-5 space-y-4">
          <div className="space-y-1.5">
            <label className="text-zinc-400 text-xs font-bold uppercase tracking-wider">Username</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              placeholder="3–24 letters, numbers, _"
              required
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-emerald-600 placeholder:text-zinc-700"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-zinc-400 text-xs font-bold uppercase tracking-wider">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-emerald-600"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-zinc-400 text-xs font-bold uppercase tracking-wider">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              placeholder="At least 8 characters"
              required
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-emerald-600 placeholder:text-zinc-700"
            />
          </div>

          {error && <p className="text-red-400 text-xs">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white py-3 rounded-xl font-bold text-sm"
          >
            {busy ? "Creating account…" : "Create Account"}
          </button>

          <p className="text-zinc-600 text-[11px] text-center leading-relaxed">
            For entertainment and informational purposes only. Not betting advice.
            Must be of legal betting age in your jurisdiction.
          </p>
        </form>

        <p className="text-center text-zinc-500 text-sm">
          Already have an account?{" "}
          <Link href="/login" className="text-emerald-400 font-bold hover:text-emerald-300">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
