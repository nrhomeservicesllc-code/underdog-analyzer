import type { AnalysisResponse } from "@/types/betting"

// Point this at your deployed Vercel URL
const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? "https://underdog-analyzer.vercel.app"

export async function fetchOdds(): Promise<AnalysisResponse> {
  const res = await fetch(`${API_BASE}/api/odds`, {
    headers: { Accept: "application/json" },
  })
  if (!res.ok) throw new Error(`API error ${res.status}`)
  return res.json()
}
