import { Router, Request, Response } from "express";
import Stripe from "stripe";
import { handleStripeWebhook } from "./webhookHandler";

const router = Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "";

/**
 * Stripe Webhook Endpoint
 * 
 * This endpoint receives webhook events from Stripe and processes them.
 * 
 * Webhook events handled:
 * - checkout.session.completed: User completed checkout
 * - customer.subscription.updated: Subscription was updated
 * - customer.subscription.deleted: Subscription was canceled
 * - invoice.payment_succeeded: Payment was successful
 * - invoice.payment_failed: Payment failed
 */
router.post("/webhook", async (req: Request, res: Response) => {
  const sig = req.headers["stripe-signature"] as string;

  if (!sig) {
    console.error("[Webhook] No stripe-signature header");
    return res.status(400).json({ error: "No signature" });
  }

  let event: Stripe.Event;

  try {
    // Verify the webhook signature
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      webhookSecret
    );
  } catch (err: any) {
    console.error("[Webhook] Signature verification failed:", err.message);
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  // Handle test events for development
  if (event.id.startsWith("evt_test_")) {
    console.log("[Webhook] Test event detected, returning verification response");
    return res.json({ verified: true });
  }

  try {
    // Process the webhook event
    await handleStripeWebhook(event);
    
    // Return success response
    res.json({ received: true });
  } catch (error) {
    console.error("[Webhook] Error handling event:", error);
    res.status(500).json({ error: "Webhook processing failed" });
  }
});

export default router;
