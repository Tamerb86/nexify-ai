import { protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { analyzeWritingSamples } from "./voiceAnalysis";

export const voiceRouter = router({
  getProfile: protectedProcedure.query(async ({ ctx }) => {
    const { getDb } = await import("./db");
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    const { voiceProfiles } = await import("../drizzle/schema");
    const { eq } = await import("drizzle-orm");
    
    const profiles = await db.select().from(voiceProfiles).where(eq(voiceProfiles.userId, ctx.user.id)).limit(1);
    
    if (profiles.length === 0) {
      await db.insert(voiceProfiles).values({
        userId: ctx.user.id,
        trainingStatus: "not_started",
        samplesCount: 0,
      });
      
      const newProfiles = await db.select().from(voiceProfiles).where(eq(voiceProfiles.userId, ctx.user.id)).limit(1);
      return newProfiles[0] || null;
    }
    
    return profiles[0];
  }),

  addSample: protectedProcedure
    .input(z.object({ sampleText: z.string().min(10).max(5000) }))
    .mutation(async ({ ctx, input }) => {
      const { getDb } = await import("./db");
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const { voiceSamples, voiceProfiles } = await import("../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      
      await db.insert(voiceSamples).values({
        userId: ctx.user.id,
        sampleText: input.sampleText,
      });
      
      await db.update(voiceProfiles).set({ trainingStatus: "in_progress" }).where(eq(voiceProfiles.userId, ctx.user.id));
      
      return { success: true };
    }),

  trainProfile: protectedProcedure.mutation(async ({ ctx }) => {
    const { getDb } = await import("./db");
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    const { voiceSamples, voiceProfiles } = await import("../drizzle/schema");
    const { eq } = await import("drizzle-orm");
    
    const samples = await db.select().from(voiceSamples).where(eq(voiceSamples.userId, ctx.user.id));
    
    if (samples.length === 0) {
      throw new Error("No voice samples to train from");
    }
    
    const sampleTexts = samples.map((s: any) => s.sampleText);
    const analysis = analyzeWritingSamples(sampleTexts);
    
    await db.update(voiceProfiles).set({
      toneProfile: JSON.stringify(analysis.toneProfile),
      vocabularyLevel: analysis.vocabularyLevel,
      sentenceStyle: analysis.sentenceStyle,
      favoriteWords: JSON.stringify(analysis.favoriteWords),
      signaturePhrases: JSON.stringify(analysis.signaturePhrases),
      usesEmojis: analysis.usesEmojis ? 1 : 0,
      usesHashtags: analysis.usesHashtags ? 1 : 0,
      usesQuestions: analysis.usesQuestions ? 1 : 0,
      usesBulletPoints: analysis.usesBulletPoints ? 1 : 0,
      profileSummary: analysis.profileSummary,
      samplesCount: samples.length,
      trainingStatus: "trained",
      lastTrainedAt: new Date(),
    }).where(eq(voiceProfiles.userId, ctx.user.id));
    
    return { success: true, samplesCount: samples.length };
  }),

  getSamples: protectedProcedure.query(async ({ ctx }) => {
    const { getDb } = await import("./db");
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    const { voiceSamples } = await import("../drizzle/schema");
    const { eq, desc } = await import("drizzle-orm");
    
    return await db.select().from(voiceSamples).where(eq(voiceSamples.userId, ctx.user.id)).orderBy(desc(voiceSamples.createdAt));
  }),

  deleteSample: protectedProcedure
    .input(z.object({ sampleId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const { getDb } = await import("./db");
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const { voiceSamples } = await import("../drizzle/schema");
      const { eq, and } = await import("drizzle-orm");
      
      await db.delete(voiceSamples).where(and(
        eq(voiceSamples.id, input.sampleId),
        eq(voiceSamples.userId, ctx.user.id)
      ));
      
      return { success: true };
    }),
});
