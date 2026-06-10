import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { getUser } from "@/lib/users"
import { getStripe } from "@/lib/stripe"

export const runtime = "nodejs"

// Opens Stripe's hosted billing portal so subscribers can manage/cancel.
export async function POST(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Not logged in" }, { status: 401 })

  const stripe = getStripe()
  if (!stripe) return NextResponse.json({ error: "Payments not configured." }, { status: 503 })

  const user = await getUser(session.username)
  const customerId = user?.subscription.stripeCustomerId
  if (!customerId) return NextResponse.json({ error: "No subscription found." }, { status: 404 })

  const origin = req.headers.get("origin") ?? new URL(req.url).origin
  const portal = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${origin}/`,
  })
  return NextResponse.json({ url: portal.url })
}
