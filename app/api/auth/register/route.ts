import { NextResponse } from "next/server"
import { hashPassword, setSessionCookie, isAdminUsername } from "@/lib/auth"
import { getUser, saveUser, validUsername, validEmail, EMPTY_SUB } from "@/lib/users"

export const runtime = "nodejs"

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { username?: string; email?: string; password?: string }
    const username = (body.username ?? "").trim()
    const email = (body.email ?? "").trim().toLowerCase()
    const password = body.password ?? ""

    if (!validUsername(username)) {
      return NextResponse.json(
        { error: "Username must be 3–24 characters (letters, numbers, underscores)." },
        { status: 400 }
      )
    }
    if (!validEmail(email)) {
      return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 })
    }
    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 })
    }
    if (isAdminUsername(username)) {
      return NextResponse.json({ error: "That username is reserved." }, { status: 400 })
    }
    if (await getUser(username)) {
      return NextResponse.json({ error: "That username is already taken." }, { status: 409 })
    }

    await saveUser({
      username,
      email,
      passHash: hashPassword(password),
      role: "user",
      createdAt: new Date().toISOString(),
      subscription: { ...EMPTY_SUB },
    })

    await setSessionCookie({ username, role: "user" })
    return NextResponse.json({ ok: true, username })
  } catch {
    return NextResponse.json({ error: "Registration failed. Try again." }, { status: 500 })
  }
}
