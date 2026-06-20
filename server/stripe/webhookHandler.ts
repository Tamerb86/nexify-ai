import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");

export async function handleStripeWebhook(event: Stripe.Event) {
  console.log(`[Webhook] Processing event: ${event.type}`);

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
        break;

      case "customer.subscription.updated":
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;

      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;

      case "invoice.payment_succeeded":
        await handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice);
        break;

      case "invoice.payment_failed":
        await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
        break;

      default:
        console.log(`[Webhook] Unhandled event type: ${event.type}`);
    }

    return { success: true };
  } catch (error) {
    console.error("[Webhook] Error processing event:", error);
    throw error;
  }
}

async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
  console.log(`[Webhook] Checkout session completed: ${session.id}`);

  const userId = session.metadata?.user_id;
  if (!userId) {
    console.error("[Webhook] No user_id in session metadata");
    return;
  }

  // Get the subscription from Stripe
  if (session.subscription) {
    const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
    
    // Update or create subscription in database
    const priceId = subscription.items.data[0]?.price.id;
    const tier = getTierFromPriceId(priceId);

    console.log(`[Webhook] Subscription created/updated for user ${userId}: tier=${tier}`);
    
    // TODO: Update database with subscription details
    // await updateUserSubscription(userId, { tier, stripeSubscriptionId: subscription.id, stripePriceId: priceId });
  }
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  console.log(`[Webhook] Subscription updated: ${subscription.id}`);

  const priceId = subscription.items.data[0]?.price.id;
  const tier = getTierFromPriceId(priceId);

  console.log(`[Webhook] Subscription tier updated to: ${tier}`);
  
  // TODO: Update database with new subscription details
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  console.log(`[Webhook] Subscription deleted: ${subscription.id}`);

  // TODO: Mark subscription as canceled in database
  console.log(`[Webhook] Subscription canceled`);
}

async function handleInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
  console.log(`[Webhook] Invoice payment succeeded: ${invoice.id}`);

  // Log the payment for billing history
  console.log(`[Webhook] Payment recorded: ${invoice.amount_paid / 100} ${invoice.currency.toUpperCase()}`);
  
  // TODO: Log payment in database
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  console.log(`[Webhook] Invoice payment failed: ${invoice.id}`);

  // Log payment failure
  console.log(`[Webhook] Payment failed for invoice ${invoice.id}`);
  // TODO: Send email notification to user
}

function getTierFromPriceId(priceId: string | undefined): string {
  if (!priceId) return "FREE";

  // Map Stripe price IDs to tiers
  // This should match your products.ts configuration
  if (priceId.includes("pro")) return "PRO";
  if (priceId.includes("enterprise")) return "ENTERPRISE";
  
  return "FREE";
}
