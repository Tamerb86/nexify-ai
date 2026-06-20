/**
 * Google OAuth Routes
 * Uses the same session cookie (app_session_id) and JWT structure as Manus OAuth
 * so all existing code remains compatible.
 */

import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import { OAuth2Client } from "google-auth-library";
import * as db from "../db";
import { getSessionCookieOptions } from "../_core/cookies";
import { sdk } from "../_core/sdk";

function getGoogleRedirectUri(req: Request): string {
  // Vercel production URL
  if (process.env.NODE_ENV === "production" && process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}/api/auth/callback/google`;
  }
  
  // Fallback for development and other deployments
  const protocol = (req.headers["x-forwarded-proto"] as string) ?? req.protocol;
  let host = (req.headers["x-forwarded-host"] as string) ?? (req.headers.host as string) ?? "localhost:3000";
  
  // Ensure host doesn't have port in production
  if (process.env.NODE_ENV === "production" && typeof host === "string") {
    host = host.split(":")[0];
  }
  
  return `${protocol}://${host}/api/auth/callback/google`;
}

export function registerGoogleOAuthRoutes(app: Express) {
  /**
   * GET /api/auth/login/google
   * Redirects to Google OAuth consent screen
   */
  app.get("/api/auth/login/google", (req: Request, res: Response) => {
    try {
      const redirectUri = getGoogleRedirectUri(req);
      const googleClient = new OAuth2Client(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        redirectUri
      );

      const authUrl = googleClient.generateAuthUrl({
        access_type: "offline",
        scope: [
          "https://www.googleapis.com/auth/userinfo.email",
          "https://www.googleapis.com/auth/userinfo.profile",
        ],
        prompt: "consent",
      });

      res.redirect(302, authUrl);
    } catch (error) {
      console.error("[Google OAuth] Failed to generate auth URL:", error);
      res.redirect(302, "/login?error=auth_failed");
    }
  });

  /**
   * GET /api/auth/login
   * Returns Google OAuth URL as JSON (for frontend fetch)
   */
  app.get("/api/auth/login", (req: Request, res: Response) => {
    try {
      const redirectUri = getGoogleRedirectUri(req);
      const googleClient = new OAuth2Client(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        redirectUri
      );

      const authUrl = googleClient.generateAuthUrl({
        access_type: "offline",
        scope: [
          "https://www.googleapis.com/auth/userinfo.email",
          "https://www.googleapis.com/auth/userinfo.profile",
        ],
        prompt: "consent",
      });

      res.json({ url: authUrl });
    } catch (error) {
      console.error("[Google OAuth] Failed to generate auth URL:", error);
      res.status(500).json({ error: "Failed to generate login URL" });
    }
  });

  /**
   * GET /api/auth/callback/google
   * Handles Google OAuth callback, creates/updates user, sets session cookie
   */
  app.get("/api/auth/callback/google", async (req: Request, res: Response) => {
    const code = req.query.code as string | undefined;
    const error = req.query.error as string | undefined;

    if (error || !code) {
      console.error("[Google OAuth] Callback error:", error || "Missing code");
      return res.redirect(302, "/login?error=auth_failed");
    }

    try {
      const redirectUri = getGoogleRedirectUri(req);
      const googleClient = new OAuth2Client(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        redirectUri
      );

      // Exchange code for tokens
      const { tokens } = await googleClient.getToken(code);

      if (!tokens.id_token) {
        throw new Error("No id_token received from Google");
      }

      // Verify and decode the ID token
      const ticket = await googleClient.verifyIdToken({
        idToken: tokens.id_token,
        audience: process.env.GOOGLE_CLIENT_ID,
      });

      const payload = ticket.getPayload();
      if (!payload || !payload.sub) {
        throw new Error("Invalid token payload from Google");
      }

      const { sub: googleId, email, name } = payload;

      // Use Google sub as openId (prefixed to avoid collision with Manus IDs)
      const openId = `google_${googleId}`;

      // Upsert user in database
      await db.upsertUser({
        openId,
        name: name || email?.split("@")[0] || "User",
        email: email ?? null,
        loginMethod: "google",
        lastSignedIn: new Date(),
      });

      // Create session token using existing SDK (same JWT structure)
      const sessionToken = await sdk.createSessionToken(openId, {
        name: name || email?.split("@")[0] || "User",
        expiresInMs: ONE_YEAR_MS,
      });

      // Set session cookie (same cookie name and options as Manus OAuth)
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, {
        ...cookieOptions,
        maxAge: ONE_YEAR_MS,
      });

      console.log(`[Google OAuth] User logged in: ${email} (${openId})`);
      res.redirect(302, "/dashboard");
    } catch (err) {
      console.error("[Google OAuth] Callback failed:", err);
      res.redirect(302, "/login?error=auth_failed");
    }
  });

  /**
   * GET /api/auth/session
   * Returns current session user info (for frontend)
   */
  app.get("/api/auth/session", async (req: Request, res: Response) => {
    try {
      const user = await sdk.authenticateRequest(req);
      res.json({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
      });
    } catch {
      res.json({ user: null });
    }
  });
}
