import { NextResponse } from "next/server"
import { getSession, getSessionUser, hasAccess, billingEnabled } from "@/lib/auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Not logged in" }, { status: 401 })

  const user = await getSessionUser(session)
  if (!user) return NextResponse.json({ error: "Account not found" }, { status: 401 })

  return NextResponse.json({
    username: user.username,
    role: user.role,
    access: hasAccess(user),
    billingEnabled: billingEnabled(),
    subscription: {
      status: user.subscription.status,
      plan: user.subscription.plan,
      renewsAt: user.subscription.currentPeriodEnd,
    },
  })
}
