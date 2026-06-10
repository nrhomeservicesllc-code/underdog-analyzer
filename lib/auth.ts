import { SignJWT, jwtVerify } from "jose"
import { cookies } from "next/headers"
import bcrypt from "bcryptjs"
import { getUser, EMPTY_SUB, type User } from "./users"

export const SESSION_COOKIE = "sharpdog_session"
const SESSION_DAYS = 30

// IMPORTANT: set AUTH_SECRET in production (any long random string).
// The fallback keeps dev working but must not be relied on once live.
function secret(): Uint8Array {
  const s = process.env.AUTH_SECRET ?? "sharpdog-dev-secret-change-me-before-launch"
  return new TextEncoder().encode(s)
}

// Admin account — credentials configurable via env, with the requested defaults.
// ADMIN_PASSWORD_HASH is a bcrypt hash; override it in Vercel env to rotate.
const ADMIN_USERNAME = process.env.ADMIN_USERNAME ?? "sharpdogadmin"
const ADMIN_PASSWORD_HASH =
  process.env.ADMIN_PASSWORD_HASH ?? "$2b$10$sByH9EHcC8eZyjdXNB5kpOFzqfH2bJit.JrGYj4EIJvDzKuqR8lBa"

export interface SessionPayload {
  username: string
  role: "user" | "admin"
}

export async function createSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ u: payload.username, r: payload.role })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secret())
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret())
    const username = String(payload.u ?? "")
    const role = payload.r === "admin" ? "admin" : "user"
    if (!username) return null
    return { username, role }
  } catch {
    return null
  }
}

export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  if (!token) return null
  return verifySessionToken(token)
}

export async function setSessionCookie(payload: SessionPayload): Promise<void> {
  const token = await createSessionToken(payload)
  const store = await cookies()
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  })
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies()
  store.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 })
}

export function hashPassword(plain: string): string {
  return bcrypt.hashSync(plain, 10)
}

export function checkPassword(plain: string, hash: string): boolean {
  try { return bcrypt.compareSync(plain, hash) } catch { return false }
}

export function isAdminLogin(username: string, password: string): boolean {
  return (
    username.toLowerCase() === ADMIN_USERNAME.toLowerCase() &&
    checkPassword(password, ADMIN_PASSWORD_HASH)
  )
}

export function isAdminUsername(username: string): boolean {
  return username.toLowerCase() === ADMIN_USERNAME.toLowerCase()
}

export function billingEnabled(): boolean {
  return !!(
    process.env.STRIPE_SECRET_KEY &&
    process.env.STRIPE_PRICE_MONTHLY &&
    process.env.STRIPE_PRICE_YEARLY
  )
}

// Resolve the full user record for a session (admin has a virtual record).
export async function getSessionUser(session: SessionPayload): Promise<User | null> {
  if (session.role === "admin") {
    return {
      username: session.username,
      email: "",
      passHash: "",
      role: "admin",
      createdAt: "",
      subscription: { ...EMPTY_SUB, status: "active" },
    }
  }
  return getUser(session.username)
}

// Access rule: admins always; subscribers while active; everyone while
// billing isn't configured yet (launch ramp — flip on by adding Stripe env).
export function hasAccess(user: User): boolean {
  if (user.role === "admin") return true
  if (!billingEnabled()) return true
  if (user.subscription.status !== "active") return false
  const end = user.subscription.currentPeriodEnd
  // Grace: if Stripe gave us a period end, honor it; webhook keeps it fresh
  return !end || new Date(end).getTime() > Date.now() - 24 * 60 * 60 * 1000
}
