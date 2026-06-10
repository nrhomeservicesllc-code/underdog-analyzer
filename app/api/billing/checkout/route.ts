import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { getUser, saveUser } from "@/lib/users"
import { getStripe, priceId } from "@/lib/stripe"

export const runtime = "nodejs"

export async function POST(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Not logged in" }, { status: 401 })

  const stripe = getStripe()
  if (!stripe) {
    return NextResponse.json(
      { error: "Payments aren't configured yet. Set the Stripe environment variables." },
      { status: 503 }
    )
  }

  const body = (await req.json().catch(() => ({}))) as { plan?: string }
  const plan = body.plan === "yearly" ? "yearly" : "monthly"
  const price = priceId(plan)
  if (!price) {
    return NextResponse.json({ error: `No Stripe price configured for the ${plan} plan.` }, { status: 503 })
  }

  const user = await getUser(session.username)
  if (!user) return NextResponse.json({ error: "Account not found" }, { status: 401 })

  const origin = req.headers.get("origin") ?? new URL(req.url).origin

  try {
    // Reuse the Stripe customer if they've checked out before
    let customerId = user.subscription.stripeCustomerId
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email || undefined,
        metadata: { username: user.username },
      })
      customerId = customer.id
      user.subscription.stripeCustomerId = customerId
      await saveUser(user)
    }

    const checkout = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price, quantity: 1 }],
      allow_promotion_codes: true,
      subscription_data: { metadata: { username: user.username, plan } },
      metadata: { username: user.username, plan },
      success_url: `${origin}/?upgraded=1`,
      cancel_url: `${origin}/subscribe`,
    })

    return NextResponse.json({ url: checkout.url })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
