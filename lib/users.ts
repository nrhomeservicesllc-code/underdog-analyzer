// User storage — uses Upstash/Vercel KV (Redis over REST) when configured,
// falls back to in-memory storage otherwise (dev/demo only: resets on redeploy).
//
// Env (either pair works — Vercel KV and Upstash both expose these):
//   KV_REST_API_URL  + KV_REST_API_TOKEN
//   UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN

export interface Subscription {
  status: "none" | "active" | "past_due" | "canceled"
  plan: "monthly" | "yearly" | null
  currentPeriodEnd: string | null
  stripeCustomerId: string | null
  stripeSubscriptionId: string | null
}

export interface User {
  username: string
  email: string
  passHash: string
  role: "user" | "admin"
  createdAt: string
  subscription: Subscription
}

export const EMPTY_SUB: Subscription = {
  status: "none",
  plan: null,
  currentPeriodEnd: null,
  stripeCustomerId: null,
  stripeSubscriptionId: null,
}

function kvConfig(): { url: string; token: string } | null {
  const url   = process.env.KV_REST_API_URL  ?? process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN
  return url && token ? { url, token } : null
}

export function storageConfigured(): boolean {
  return kvConfig() !== null
}

// In-memory fallback shared across hot reloads within one server instance
const mem = (globalThis as Record<string, unknown>).__sharpdog_users as Map<string, string>
  ?? new Map<string, string>()
;(globalThis as Record<string, unknown>).__sharpdog_users = mem

async function kvGet(key: string): Promise<string | null> {
  const cfg = kvConfig()
  if (!cfg) return mem.get(key) ?? null
  const res = await fetch(`${cfg.url}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${cfg.token}` },
    cache: "no-store",
  })
  if (!res.ok) return null
  const body = (await res.json()) as { result: string | null }
  return body.result
}

async function kvSet(key: string, value: string): Promise<void> {
  const cfg = kvConfig()
  if (!cfg) { mem.set(key, value); return }
  await fetch(`${cfg.url}/set/${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.token}` },
    body: value,
  })
}

const userKey = (username: string) => `user:${username.toLowerCase()}`
const custKey = (customerId: string) => `cust:${customerId}`

export async function getUser(username: string): Promise<User | null> {
  const raw = await kvGet(userKey(username))
  if (!raw) return null
  try { return JSON.parse(raw) as User } catch { return null }
}

export async function saveUser(user: User): Promise<void> {
  await kvSet(userKey(user.username), JSON.stringify(user))
  const cid = user.subscription.stripeCustomerId
  if (cid) await kvSet(custKey(cid), user.username.toLowerCase())
}

export async function getUserByCustomerId(customerId: string): Promise<User | null> {
  const username = await kvGet(custKey(customerId))
  return username ? getUser(username) : null
}

export function validUsername(u: string): boolean {
  return /^[a-zA-Z0-9_]{3,24}$/.test(u)
}

export function validEmail(e: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)
}
