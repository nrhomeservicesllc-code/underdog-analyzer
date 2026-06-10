import { NextResponse } from "next/server"
import { checkPassword, isAdminLogin, setSessionCookie } from "@/lib/auth"
import { getUser } from "@/lib/users"

export const runtime = "nodejs"

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { username?: string; password?: string }
    const username = (body.username ?? "").trim()
    const password = body.password ?? ""

    if (!username || !password) {
      return NextResponse.json({ error: "Enter your username and password." }, { status: 400 })
    }

    if (isAdminLogin(username, password)) {
      await setSessionCookie({ username, role: "admin" })
      return NextResponse.json({ ok: true, username, role: "admin" })
    }

    const user = await getUser(username)
    if (!user || !checkPassword(password, user.passHash)) {
      return NextResponse.json({ error: "Wrong username or password." }, { status: 401 })
    }

    await setSessionCookie({ username: user.username, role: user.role })
    return NextResponse.json({ ok: true, username: user.username, role: user.role })
  } catch {
    return NextResponse.json({ error: "Login failed. Try again." }, { status: 500 })
  }
}
