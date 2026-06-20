/**
 * Stripe Products and Prices Configuration
 * 
 * This file defines all subscription plans for Innlegg/Nexify AI
 */

export const STRIPE_PRODUCTS = {
  // Free tier - no payment required, managed through trial system
  FREE: {
    name: "Gratis",
    description: "5 AI-genererte innlegg per måned",
    priceNOK: 0,
    interval: "month" as const,
    features: [
      "5 AI-genererte innlegg per måned",
      "En plattform",
      "Grunnleggende support",
    ],
  },
  
  // Pro tier - main revenue driver
  PRO_MONTHLY: {
    name: "Pro Månedlig",
    description: "100 AI-genererte innlegg per måned + alle miksaturer",
    priceNOK: 299,
    interval: "month" as const,
    features: [
      "100 AI-genererte innlegg per måned",
      "AI-bildegenerering",
      "Alle plattformer (LinkedIn, Instagram, Facebook, Twitter, TikTok)",
      "Innholdskalender med smart planlegging",
      "Gjenbruk av innlegg - en til fem",
      "Stemmetrening - AI lærer din skrivestil",
      "Trend og Inspirasjon - Kuraterte emner",
      "AI Content Coach",
      "Norsk innholdskalender",
      "Prioritert support",
    ],
  },
  
  PRO_YEARLY: {
    name: "Pro Årlig",
    description: "100 innlegg/måned + alle miksaturer (spar 17%)",
    priceNOK: 2990, // 299 * 12 * 0.833 = 2989.56 rounded
    interval: "year" as const,
    features: [
      "Alt i Pro Månedlig",
      "Spar 17% sammenlignet med månedlig",
      "1200 innlegg totalt per år",
      "Prioritet i ny funksjonalitet",
    ],
  },
  
  // Enterprise tier - for agencies and large companies
  ENTERPRISE_MONTHLY: {
    name: "Enterprise Månedlig",
    description: "Ubegrenset innlegg + API + dedikert support",
    priceNOK: 1499,
    interval: "month" as const,
    features: [
      "Ubegrenset AI-genererte innlegg",
      "Alle miksaturer i Pro +",
      "API-tilgang for integrasjoner",
      "Avansert analyse og rapportering",
      "Dedikert account manager",
      "24/7 prioritert support",
      "Tilpasset opplæring og onboarding",
      "Prioritet i ny funksjonalitet",
      "Mulighet for hvit merking (White Label)",
    ],
  },
  
  ENTERPRISE_YEARLY: {
    name: "Enterprise Årlig",
    description: "Ubegrenset innlegg + API + dedikert support (spar 17%)",
    priceNOK: 14990, // 1499 * 12 * 0.833 = 14989.56 rounded
    interval: "year" as const,
    features: [
      "Alt i Enterprise Månedlig",
      "Spar 17% sammenlignet med månedlig",
      "Dedikert Slack-kanal",
      "Kvartalsvis strategisk gjennomgang",
    ],
  },
};

export const TRIAL_LIMITS = {
  posts: 5,
  durationDays: 14,
};

// Subscription limits by tier
export const SUBSCRIPTION_LIMITS = {
  FREE: {
    monthlyPosts: 5,
    platforms: 1,
    aiImages: false,
    contentCalendar: false,
    repurpose: false,
    analytics: false,
    apiAccess: false,
  },
  PRO: {
    monthlyPosts: 100,
    platforms: 5,
    aiImages: true,
    contentCalendar: true,
    repurpose: true,
    analytics: true,
    apiAccess: false,
  },
  ENTERPRISE: {
    monthlyPosts: -1, // unlimited
    platforms: 5,
    aiImages: true,
    contentCalendar: true,
    repurpose: true,
    analytics: true,
    apiAccess: true,
  },
};

export type ProductKey = keyof typeof STRIPE_PRODUCTS;
export type SubscriptionTier = "FREE" | "PRO" | "ENTERPRISE";

/**
 * Map product keys to subscription tiers
 */
export function getSubscriptionTier(productKey: ProductKey): SubscriptionTier {
  if (productKey.startsWith("ENTERPRISE")) return "ENTERPRISE";
  if (productKey.startsWith("PRO")) return "PRO";
  return "FREE";
}

/**
 * Get subscription limits for a tier
 */
export function getSubscriptionLimits(tier: SubscriptionTier) {
  return SUBSCRIPTION_LIMITS[tier];
}
