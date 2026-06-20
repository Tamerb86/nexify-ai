import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Check, Zap, Smartphone, TrendingUp, Sparkles, Loader2 } from "lucide-react";
import { VippsPaymentDialog } from "@/components/VippsPayment";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";

interface PricingPlan {
  id: string;
  name: string;
  price: number;
  currency: string;
  period: string;
  description: string;
  badge?: string;
  badgeColor?: string;
  features: string[];
  cta: string;
  highlighted?: boolean;
}

const PRICING_PLANS: PricingPlan[] = [
  {
    id: "free",
    name: "Gratis prøve",
    price: 0,
    currency: "kr",
    period: "alltid",
    description: "For å teste plattformen",
    features: [
      "5 innlegg (kun tekst)",
      "Alle plattformer",
      "Grunnleggende dashboard",
      "Ingen AI-bilder",
      "Ingen stemmetrening",
    ],
    cta: "Start gratis",
  },
  {
    id: "pro",
    name: "Pro",
    price: 199,
    currency: "kr",
    period: "mnd",
    description: "For profesjonelle innholdskapere",
    badge: "ANBEFALT",
    badgeColor: "bg-blue-500",
    features: [
      "100 innlegg per måned",
      "AI-genererte bilder inkludert",
      "Stemmetrening (din stil)",
      "Trend og Inspirasjon",
      "Innholdskalender",
      "Gjenbruk-maskin",
      "AI Coach & analyse",
      "Prioritert support",
    ],
    cta: "Start Pro nå",
    highlighted: true,
  },
  {
    id: "business",
    name: "Business",
    price: 499,
    currency: "kr",
    period: "mnd",
    description: "For bedrifter og agenturer",
    features: [
      "500 innlegg per måned",
      "Ubegrenset AI-bilder",
      "Avansert stemmetrening",
      "Multi-bruker tilgang",
      "Team collaboration",
      "Innholdskalender (avansert)",
      "Automatisering og scheduling",
      "API tilgang",
      "Dedikert support",
      "Månedlige rapporter",
    ],
    cta: "Start Business nå",
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: 0,
    currency: "kr",
    period: "custom",
    description: "For store organisasjoner",
    features: [
      "Ubegrenset innlegg",
      "Ubegrenset AI-bilder",
      "Fullstendig tilpasning",
      "Dedikert account manager",
      "Custom integrasjoner",
      "White-label løsning",
      "SLA garantier",
      "Prioritert support 24/7",
      "Årlig strategi-sesjon",
    ],
    cta: "Kontakt oss",
  },
];

export function Pricing() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [showVippsPayment, setShowVippsPayment] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const { data: currentSubscription } = trpc.payment.getCurrentSubscription.useQuery(
    undefined,
    { enabled: !!user }
  );

  const handleSelectPlan = (planId: string) => {
    if (!user && planId !== "free") {
      setLocation("/");
      return;
    }

    if (planId === "free") {
      // Free plan - no payment needed
      setLocation("/dashboard");
      return;
    }

    if (planId === "enterprise") {
      // Enterprise - contact form
      setLocation("/contact");
      return;
    }

    setSelectedPlan(planId);
    setShowVippsPayment(true);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50/80 via-background to-background dark:from-slate-950/50">
      <main className="container py-12 md:py-20 max-w-7xl">
        {/* Header */}
        <div className="text-center mb-16 page-enter">
          <div className="inline-flex items-center gap-2 mb-4 px-3 py-1 rounded-full bg-blue-100 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800">
            <Sparkles className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <span className="text-sm font-medium text-blue-600 dark:text-blue-400">
              Transparent prising
            </span>
          </div>

          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
            Velg din plan
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Alle planer inkluderer 14 dagers gratis prøveperiode. Ingen kredittkort påkrevd.
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
          {PRICING_PLANS.map((plan) => {
            const isCurrentPlan = currentSubscription?.tier === plan.id;

            return (
              <Card
                key={plan.id}
                className={`relative transition-all duration-300 hover:shadow-lg ${
                  plan.highlighted
                    ? "lg:scale-105 border-2 border-blue-500 shadow-xl"
                    : "hover:shadow-md"
                } ${isCurrentPlan ? "ring-2 ring-green-500" : ""}`}
              >
                {plan.badge && (
                  <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                    <span
                      className={`${plan.badgeColor || "bg-purple-500"} text-white text-xs font-bold px-3 py-1 rounded-full`}
                    >
                      {plan.badge}
                    </span>
                  </div>
                )}

                {isCurrentPlan && (
                  <div className="absolute top-4 right-4 bg-green-500 text-white px-3 py-1 rounded-full text-xs font-medium">
                    Din plan
                  </div>
                )}

                <CardHeader className={plan.highlighted ? "pt-8" : ""}>
                  <CardTitle className="text-2xl">{plan.name}</CardTitle>
                  <CardDescription>{plan.description}</CardDescription>

                  <div className="mt-6 mb-4">
                    {plan.price === 0 && plan.period === "custom" ? (
                      <div className="text-3xl font-bold">Custom</div>
                    ) : (
                      <div className="flex items-baseline gap-1">
                        <span className="text-4xl font-bold">{plan.price}</span>
                        <span className="text-muted-foreground">{plan.currency}</span>
                        {plan.period !== "alltid" && (
                          <span className="text-muted-foreground">/{plan.period}</span>
                        )}
                      </div>
                    )}
                    {plan.period !== "custom" && plan.price > 0 && (
                      <p className="text-sm text-muted-foreground mt-2">
                        = {(plan.price / 30).toFixed(2)} kr/dag
                      </p>
                    )}
                  </div>
                </CardHeader>

                <CardContent className="space-y-6">
                  <Button
                    onClick={() => handleSelectPlan(plan.id)}
                    disabled={isCurrentPlan || isLoading}
                    className={`w-full h-11 font-semibold ${
                      plan.highlighted
                        ? "bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                        : ""
                    }`}
                    variant={isCurrentPlan ? "outline" : plan.highlighted ? "default" : "outline"}
                  >
                    {isCurrentPlan ? (
                      "Din plan"
                    ) : (
                      <>
                        {plan.cta}
                        {plan.id !== "enterprise" && plan.id !== "free" && (
                          <Smartphone className="ml-2 h-4 w-4" />
                        )}
                      </>
                    )}
                  </Button>

                  <div className="space-y-3">
                    {plan.features.map((feature, idx) => (
                      <div key={idx} className="flex items-start gap-3">
                        <Check className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                        <span className="text-sm text-foreground">{feature}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Features Comparison */}
        <div className="bg-card rounded-xl border p-8 mb-16">
          <h2 className="text-2xl font-bold mb-8">Sammenlign planer</h2>

          <div className="space-y-4">
            {[
              { feature: "Innlegg per måned", free: "5", pro: "100", business: "500", enterprise: "∞" },
              { feature: "AI-genererte bilder", free: "Nei", pro: "Ja", business: "Ubegrenset", enterprise: "Ubegrenset" },
              { feature: "Stemmetrening", free: "Nei", pro: "Ja", business: "Avansert", enterprise: "Fullstendig" },
              { feature: "Team collaboration", free: "Nei", pro: "Nei", business: "Ja", enterprise: "Ja" },
              { feature: "API tilgang", free: "Nei", pro: "Nei", business: "Ja", enterprise: "Ja" },
              { feature: "Dedikert support", free: "Nei", pro: "Prioritert", business: "Dedikert", enterprise: "24/7" },
            ].map((row, idx) => (
              <div key={idx} className="grid grid-cols-5 gap-4 py-3 border-b last:border-b-0">
                <div className="font-medium col-span-1">{row.feature}</div>
                <div className="text-center text-sm">{row.free}</div>
                <div className="text-center text-sm text-blue-600 font-medium">{row.pro}</div>
                <div className="text-center text-sm">{row.business}</div>
                <div className="text-center text-sm">{row.enterprise}</div>
              </div>
            ))}
          </div>
        </div>

        {/* FAQ Section */}
        <div className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950/20 dark:to-purple-950/20 rounded-xl border p-8">
          <h2 className="text-2xl font-bold mb-8">Vanlige spørsmål</h2>

          <div className="grid md:grid-cols-2 gap-8">
            {[
              {
                q: "Kan jeg bytte plan når som helst?",
                a: "Ja, du kan oppgradere eller nedgradere planen din når som helst. Endringer trer i kraft på neste faktureringsdato.",
              },
              {
                q: "Hva skjer etter prøveperioden?",
                a: "Du vil motta en påminnelse før prøveperioden utløper. Hvis du ikke avbryter, vil du bli belastet for den valgte planen.",
              },
              {
                q: "Tilbyr dere refusjon?",
                a: "Ja, vi tilbyr 30 dagers pengene-tilbake-garanti hvis du ikke er fornøyd.",
              },
              {
                q: "Hva om jeg trenger årlig betaling?",
                a: "Kontakt oss for årlige rabatter. Vi tilbyr normalt 20% rabatt for årlige abonnement.",
              },
            ].map((item, idx) => (
              <div key={idx}>
                <h3 className="font-semibold mb-2 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-blue-600" />
                  {item.q}
                </h3>
                <p className="text-sm text-muted-foreground">{item.a}</p>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Vipps Payment Modal */}
      {showVippsPayment && selectedPlan && (() => {
        const plan = PRICING_PLANS.find((p) => p.id === selectedPlan);
        if (!plan) return null;
        return (
          <VippsPaymentDialog
            amount={plan.price * 100}
            description={`${plan.name}-abonnement`}
            onClose={() => {
              setShowVippsPayment(false);
              setSelectedPlan(null);
            }}
            onSuccess={() => {
              setLocation("/payment/success");
            }}
          />
        );
      })()}
    </div>
  );
}
