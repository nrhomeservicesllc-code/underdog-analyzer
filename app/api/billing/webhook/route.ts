import { NextResponse } from "next/server"
import type Stripe from "stripe"
import { getStripe } from "@/lib/stripe"
import { getUser, getUserByCustomerId, saveUser, type User } from "@/lib/users"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Stripe calls this on subscription events. Configure the endpoint in the
// Stripe dashboard pointing at /api/billing/webhook with STRIPE_WEBHOOK_SECRET.

async function resolveUser(sub: Stripe.Subscription): Promise<User | null> {
  const byMeta = sub.metadata?.username ? await getUser(sub.metadata.username) : null
  if (byMeta) return byMeta
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id
  return getUserByCustomerId(customerId)
}

function applySubscription(user: User, sub: Stripe.Subscription): void {
  const item = sub.items.data[0]
  const interval = item?.price.recurring?.interval
  const periodEnd = item?.current_period_end

  user.subscription.stripeCustomerId =
    typeof sub.customer === "string" ? sub.customer : sub.customer.id
  user.subscription.stripeSubscriptionId = sub.id
  user.subscription.plan = interval === "year" ? "yearly" : "monthly"
  user.subscription.currentPeriodEnd = periodEnd
    ? new Date(periodEnd * 1000).toISOString()
    : null
  user.subscription.status =
    sub.status === "active" || sub.status === "trialing" ? "active"
    : sub.status === "past_due" ? "past_due"
    : "canceled"
}

export async function POST(req: Request) {
  const stripe = getStripe()
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!stripe || !secret) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 })
  }

  const payload = await req.text()
  const signature = req.headers.get("stripe-signature") ?? ""

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(payload, signature, secret)
  } catch {
    return NextResponse.json({ error: "Bad signature" }, { status: 400 })
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const cs = event.data.object as Stripe.Checkout.Session
        if (cs.mode !== "subscription" || !cs.subscription) break
        const subId = typeof cs.subscription === "string" ? cs.subscription : cs.subscription.id
        const sub = await stripe.subscriptions.retrieve(subId)
        const user = await resolveUser(sub)
        if (user) { applySubscription(user, sub); await saveUser(user) }
        break
      }
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription
        const user = await resolveUser(sub)
        if (user) { applySubscription(user, sub); await saveUser(user) }
        break
      }
    }
  } catch {
    // Return 200 anyway — Stripe retries on 5xx and the next event re-syncs state
  }

  return NextResponse.json({ received: true })
}
