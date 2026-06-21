import "dotenv/config"; // load .env before anything reads process.env (no-op in prod if absent)
import express from "express";
import { createServer } from "http";
import net from "net";
import helmet from "helmet";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { validateEnv } from "./validateEnv";
import { registerTelegramWebhook } from "./telegramWebhookRoute";
import { registerLinkedInCallback } from "./linkedinCallback";
import { registerGoogleOAuthRoutes } from "../routes/googleOAuthRoutes";
import { registerMonitoringRoutes } from "../routes/monitoringRoutes";
import { appRouter } from "../routers";
import { startScheduler } from "../schedulerService";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import sitemapRoutes from "../routes/sitemapRoutes";
import cookieParser from "cookie-parser";
import { ipRateLimiter, userRateLimiter, checkSubscriptionLimit, checkPlanLimit } from "./rateLimiter";
import { checkRequestSize, validateContentMiddleware, checkSuspiciousActivity } from "./abuseProtection";
import { trackUsage } from "./monitoring";
import { configureSecurityHeaders, enforceHttps } from "./securityHeaders";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);

  // Fail-fast: validate the whole environment up front (JWT_SECRET, DATABASE_URL,
  // and — in production — payment/security keys). One clear error beats confusing
  // runtime failures later.
  validateEnv();

  // Security headers with helmet
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://www.googletagmanager.com", "https://cdn.jsdelivr.net"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://fonts.gstatic.com", "https://cdn.jsdelivr.net"],
        imgSrc: ["'self'", "data:", "blob:", "https:"],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "https://fonts.googleapis.com", "https://cdn.jsdelivr.net"],
        connectSrc: ["'self'", "https://api.stripe.com", "https://api.openai.com", "https://www.google-analytics.com", "wss:"],
        frameSrc: ["'self'", "https://js.stripe.com"],
        mediaSrc: ["'self'", "https:"],
        objectSrc: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }));
  
  // Configure security headers first
  configureSecurityHeaders(app);

  // Enforce HTTPS in production
  app.use(enforceHttps);
  
  // Trust proxy for Vercel
  if (process.env.NODE_ENV === "production") {
    app.set("trust proxy", 1);
  }
  
  // Configure body parser with a bounded size limit (was 50mb — DoS risk).
  // Capture the raw body so webhooks (Vipps) can verify HMAC over the exact bytes.
  app.use(express.json({
    limit: "10mb",
    verify: (req, _res, buf) => {
      (req as any).rawBody = buf;
    },
  }));
  app.use(express.urlencoded({ limit: "10mb", extended: true }));
  app.use(cookieParser());

  // Global IP-based rate limiting (brute-force / cost-bombing / DoS protection).
  // NOTE: this uses an in-memory store; on serverless (Vercel) back it with a
  // shared store (Upstash/Redis via rate-limit-redis) for it to be effective.
  app.use(ipRateLimiter);
  
  // Liveness — the process is up.
  app.get("/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Readiness — dependencies (DB, Redis) are reachable. Use for load-balancer /
  // orchestrator readiness gating so traffic only routes to healthy instances.
  app.get("/ready", async (_req, res) => {
    const checks: Record<string, "ok" | "down" | "skipped"> = {};
    try {
      const { getDb } = await import("../db");
      const db = await getDb();
      await (db as any)?.execute?.("SELECT 1");
      checks.database = db ? "ok" : "down";
    } catch {
      checks.database = "down";
    }
    try {
      const { getRedis } = await import("./redis");
      const redis = getRedis();
      if (!redis) checks.redis = "skipped";
      else { await redis.ping(); checks.redis = "ok"; }
    } catch {
      checks.redis = "down";
    }
    const ready = checks.database === "ok" && checks.redis !== "down";
    res.status(ready ? 200 : 503).json({ ready, checks, timestamp: new Date().toISOString() });
  });

  // Populate req.user from the session cookie so downstream Express middleware
  // (rate limiting by identity, abuse detection, usage tracking) actually works.
  // Non-blocking: public procedures still pass through with req.user = null.
  app.use("/api/trpc", async (req, _res, next) => {
    try {
      const { sdk } = await import("./sdk");
      (req as any).user = await sdk.authenticateRequest(req);
    } catch {
      (req as any).user = null;
    }
    next();
  });

  // Usage/latency metrics per authenticated request (now that req.user is set)
  app.use("/api/trpc", trackUsage);

  // Level 2: Per-user/IP rate limiting on the API surface (login, AI, mutations)
  app.use("/api/trpc", userRateLimiter);

  // Level 3: Abuse Protection
  app.use("/api/trpc", checkRequestSize(100)); // 100KB max
  app.use("/api/trpc", checkSuspiciousActivity);
  app.use("/api/trpc", validateContentMiddleware);
  
  // Level 1: Plan-Based Limits (check subscription and plan)
  app.use("/api/trpc", checkSubscriptionLimit);
  app.use("/api/trpc", checkPlanLimit);
  
  // Google OAuth routes (standalone, sets the app session cookie)
  registerGoogleOAuthRoutes(app);
  
  // Development login route (only in development, and only with an explicit opt-in flag)
  if (process.env.NODE_ENV === "development" && process.env.ENABLE_DEV_LOGIN === "true") {
    app.post("/api/auth/dev-login", async (req, res) => {
      try {
        const { COOKIE_NAME, ONE_YEAR_MS } = await import("@shared/const");
        const { getSessionCookieOptions } = await import("./cookies");
        const { sdk } = await import("./sdk");
        const dbModule = await import("../db");
        
        console.log("[Dev Login] Starting dev login...");
        
        // Create or get dev user
        await dbModule.upsertUser({
          openId: "dev_user_12345",
          name: "Dev User",
          email: "dev@innlegg.local",
          loginMethod: "dev",
          lastSignedIn: new Date(),
        });
        
        console.log("[Dev Login] User created/updated");
        
        // Create session token using SDK
        const sessionToken = await sdk.createSessionToken("dev_user_12345", {
          name: "Dev User",
          expiresInMs: ONE_YEAR_MS,
        });
        
        console.log("[Dev Login] Session token created");
        
        // Set session cookie
        const cookieOptions = getSessionCookieOptions(req);
        res.cookie(COOKIE_NAME, sessionToken, {
          ...cookieOptions,
          maxAge: ONE_YEAR_MS,
        });
        
        console.log("[Dev Login] Cookie set, redirecting to dashboard");
        res.redirect(302, "/dashboard");
      } catch (error) {
        console.error("[Dev Login] Failed:", error);
        res.redirect(302, "/login?error=dev_login_failed");
      }
    });
  }
  
  // Monitoring and alerting routes
  registerMonitoringRoutes(app);

  // Telegram webhook
  registerTelegramWebhook(app);
  
  // LinkedIn OAuth callback
  registerLinkedInCallback(app);

  // Sitemap and RSS feed routes
  app.use("/", sitemapRoutes);

  // Stripe webhook - MUST be before express.json() middleware for signature verification
  // Note: We need raw body for Stripe signature verification
  app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), async (req, res) => {
    try {
      const { constructWebhookEvent } = await import("../stripe/stripeService");
      const { updateSubscriptionFromStripe, updateSubscriptionStatus, getUserById, markWebhookEventProcessed } = await import("../db");
      const { notifyNewSubscription, notifySubscriptionCancelled, notifyPaymentFailed } = await import("../subscriptionNotifications");
      
      const signature = req.headers["stripe-signature"] as string;
      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "";
      
      if (!signature || !webhookSecret) {
        console.error("[Stripe Webhook] Missing signature or webhook secret");
        return res.status(400).json({ error: "Missing signature" });
      }

      const event = constructWebhookEvent(
        req.body as Buffer,
        signature,
        webhookSecret
      );

      console.log(`[Stripe Webhook] Received event: ${event.type}`);

      // Idempotency: ignore events we've already processed (Stripe re-delivers).
      if (!(await markWebhookEventProcessed(event.id, "stripe"))) {
        console.log(`[Stripe Webhook] Duplicate event ${event.id} ignored`);
        return res.json({ received: true });
      }

      if (event.type === "checkout.session.completed") {
        const session = event.data.object as any;
        // user_id is set by us on the trusted server side at checkout creation;
        // plan/amount are derived from the trusted product_key, never from the client.
        const userId = parseInt(session.metadata?.user_id || session.client_reference_id || "");
        const productKey = session.metadata?.product_key as string | undefined;

        if (userId && productKey) {
          const { STRIPE_PRODUCTS } = await import("../stripe/products");
          const product = (STRIPE_PRODUCTS as any)[productKey];
          await updateSubscriptionFromStripe(userId, {
            status: "active",
            stripeCustomerId: typeof session.customer === "string" ? session.customer : undefined,
            stripeSubscriptionId: typeof session.subscription === "string" ? session.subscription : undefined,
          });
          const user = await getUserById(userId);
          if (user) {
            await notifyNewSubscription({
              userName: user.name || "Ukjent",
              userEmail: user.email || session.metadata?.customer_email || "",
              planName: product?.name || productKey,
              amount: ((session.amount_total ?? 0) / 100).toFixed(2),
              currency: (session.currency || "nok").toUpperCase(),
            });
          }
        }
      } else if (event.type === "customer.subscription.deleted") {
        const subscription = event.data.object as any;
        const metadata = subscription.metadata || {};
        const userId = parseInt(metadata.userId);

        if (userId) {
          await updateSubscriptionStatus(userId, "cancelled");
          const user = await getUserById(userId);
          if (user) {
            await notifySubscriptionCancelled({
              userName: user.name || "Ukjent",
              userEmail: user.email || "",
            });
          }
        }
      } else if (event.type === "payment_intent.payment_failed") {
        const paymentIntent = event.data.object as any;
        const metadata = paymentIntent.metadata || {};
        const userId = parseInt(metadata.userId);

        if (userId) {
          const user = await getUserById(userId);
          if (user) {
            await notifyPaymentFailed({
              userName: user.name || "Ukjent",
              userEmail: user.email || "",
              errorMessage: paymentIntent.last_payment_error?.message,
            });
          }
        }
      } else if (event.type === "invoice.payment_failed") {
        // Subscription dunning: a recurring charge failed. Stripe retries per its
        // smart-retry schedule and emits customer.subscription.deleted on final failure.
        const invoice = event.data.object as any;
        const customerId = typeof invoice.customer === "string" ? invoice.customer : undefined;
        if (customerId) {
          const { getUserByStripeCustomerId } = await import("../db");
          const user = await getUserByStripeCustomerId(customerId);
          if (user) {
            await notifyPaymentFailed({
              userName: user.name || "Ukjent",
              userEmail: user.email || "",
              errorMessage: "Subscription renewal payment failed — please update your payment method.",
            });
          }
        }
      }

      res.json({ received: true });
    } catch (error) {
      console.error("[Stripe Webhook] Error:", error);
      res.status(400).json({ error: "Webhook error" });
    }
  });

  // Vipps webhook routes (mounts /api/vipps/callback and fallback handlers)
  const { default: vippsWebhookRouter } = await import("../routes/vippsWebhook");
  app.use("/api/vipps", vippsWebhookRouter);

  // tRPC router
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  // Client serving: Vite dev middleware (HMR) in development; the pre-built
  // static client (dist/public) in production. Running setupVite in production
  // makes "/" 500 (it looks for client/index.html which isn't shipped).
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // Error-handling middleware — MUST be registered last so it actually catches
  // errors from the routes/tRPC/webhooks above. Fails closed and never leaks
  // internals to clients.
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error("[Server Error]", err?.message || err);
    if (res.headersSent) return;
    res.status(err?.status || 500).json({ error: "Internal Server Error" });
  });

  // Start scheduler
  startScheduler();

  const port = await findAvailablePort(process.env.PORT ? parseInt(process.env.PORT, 10) : 3000);

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
