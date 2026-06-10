import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { jwtVerify } from "jose"

const SESSION_COOKIE = "sharpdog_session"

// Edge runtime: verify the JWT only (no bcrypt here)
async function isAuthed(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get(SESSION_COOKIE)?.value
  if (!token) return false
  try {
    const s = process.env.AUTH_SECRET ?? "sharpdog-dev-secret-change-me-before-launch"
    await jwtVerify(token, new TextEncoder().encode(s))
    return true
  } catch {
    return false
  }
}

const PUBLIC_PATHS = new Set(["/login", "/register"])
const PUBLIC_API_PREFIXES = ["/api/auth/", "/api/billing/webhook"]

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (PUBLIC_PATHS.has(pathname)) {
    // Already logged in? Send to the app instead of the login form.
    if (await isAuthed(req)) return NextResponse.redirect(new URL("/", req.url))
    return NextResponse.next()
  }

  if (PUBLIC_API_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  if (await isAuthed(req)) return NextResponse.next()

  // APIs get 401; pages get redirected to login
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 })
  }
  const login = new URL("/login", req.url)
  return NextResponse.redirect(login)
}

export const config = {
  // Protect everything except Next internals and public assets
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.json|icon-generator|icon-.*\\.png|og-image\\.png|robots.txt|sitemap.xml).*)",
  ],
}
