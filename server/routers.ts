import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { voiceRouter } from "./voiceRouter";
import { langchainRouter } from "./langchainRouter";
import { analyticsRouter } from "./analyticsRouter";
import { schedulingRouter } from "./routers/schedulingRouter";
import { postManagementRouter } from "./routers/postManagementRouter";
import { contentEnhancementRouter } from "./routers/contentEnhancementRouter";
import { searchRouter } from "./routers/searchRouter";
import { settingsRouter } from "./routers/settingsRouter";
import { platformRouter } from "./routers/platformRouter";
import { faqRouter } from "./routers/faqRouter";
import { memberMonitoringRouter } from "./memberMonitoringRouter";
import { trendsRouter } from "./routers/trends";
import { hashtagRouter } from "./routers/hashtagRouter";
import { paymentRouter } from "./routers/paymentRouter";
import { adminRouter } from "./routers/adminRouter";
import { securityRouter } from "./routers/securityRouter";
import { supportRouter } from "./routers/supportRouter";
import { vippsRouter } from "./routers/vippsRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { storagePut } from "./storage";
import { getUserPosts, getUserSubscription, getUserPreference } from "./db";

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  payment: paymentRouter,
  admin: adminRouter,
  security: securityRouter,
  support: supportRouter,
  vipps: vippsRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  user: router({
    getPreference: protectedProcedure.query(async ({ ctx }) => {
      const { getUserPreference, createUserPreference } = await import("./db");
      let preference = await getUserPreference(ctx.user.id);
      
      // Create default preference if it doesn't exist
      if (!preference) {
        preference = await createUserPreference({
          userId: ctx.user.id,
          language: "no", // Default to Norwegian
        });
      }
      
      return preference;
    }),
    
    updateLanguage: protectedProcedure
      .input(z.object({ language: z.enum(["no", "en"]) }))
      .mutation(async ({ ctx, input }) => {
        const { updateUserPreference, getUserPreference, createUserPreference } = await import("./db");
        
        const existing = await getUserPreference(ctx.user.id);
        if (existing) {
          await updateUserPreference(ctx.user.id, input.language);
        } else {
          await createUserPreference({
            userId: ctx.user.id,
            language: input.language,
          });
        }
        
        return { success: true };
      }),
      
    updateOpenAIConsent: protectedProcedure
      .input(z.object({ consent: z.number().min(0).max(2) })) // 0 = not asked, 1 = accepted, 2 = declined
      .mutation(async ({ ctx, input }) => {
        const { updateUserOpenAIConsent, getUserPreference, createUserPreference } = await import("./db");
        
        const existing = await getUserPreference(ctx.user.id);
        if (existing) {
          await updateUserOpenAIConsent(ctx.user.id, input.consent);
        } else {
          await createUserPreference({
            userId: ctx.user.id,
            language: "no",
            openaiConsent: input.consent,
          });
        }
        
        return { success: true };
      }),
      
    getOnboardingStatus: protectedProcedure.query(async ({ ctx }) => {
      const { getDb } = await import("./db");
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const { onboardingStatus } = await import("../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      
      let status = await db.select().from(onboardingStatus).where(eq(onboardingStatus.userId, ctx.user.id)).limit(1);
      
      // Create default status if it doesn't exist
      if (!status || status.length === 0) {
        await db.insert(onboardingStatus).values({
          userId: ctx.user.id,
          completed: 0,
        });
        return { completed: false };
      }
      
      return { completed: status[0].completed === 1 };
    }),
    
    completeOnboarding: protectedProcedure.mutation(async ({ ctx }) => {
      const { getDb } = await import("./db");
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const { onboardingStatus } = await import("../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      
      await db.update(onboardingStatus)
        .set({ completed: 1, completedAt: new Date() })
        .where(eq(onboardingStatus.userId, ctx.user.id));
      
      return { success: true };
    }),
    
    restartOnboarding: protectedProcedure.mutation(async ({ ctx }) => {
      const { getDb } = await import("./db");
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const { onboardingStatus } = await import("../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      
      await db.update(onboardingStatus)
        .set({ completed: 0, completedAt: null })
        .where(eq(onboardingStatus.userId, ctx.user.id));
      
      return { success: true };
    }),

    getSubscription: protectedProcedure.query(async ({ ctx }) => {
      const { getUserSubscription, createSubscription } = await import("./db");
      let subscription = await getUserSubscription(ctx.user.id);
      
      // Create default trial subscription if it doesn't exist
      if (!subscription) {
        subscription = await createSubscription({
          userId: ctx.user.id,
          status: "trial",
          postsGenerated: 0,
          trialPostsLimit: 5,
        });
      }
      
      return subscription;
    }),

    getInvoices: protectedProcedure.query(async ({ ctx }) => {
      const { getUserInvoices } = await import("./db");
      return await getUserInvoices(ctx.user.id);
    }),

    updateProfile: protectedProcedure
      .input(z.object({
        name: z.string().min(1).max(100).optional(),
        avatarUrl: z.string().url().optional().nullable(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { upsertUser } = await import("./db");
        await upsertUser({
          openId: ctx.user.openId,
          ...(input.name !== undefined && { name: input.name }),
          ...(input.avatarUrl !== undefined && { avatarUrl: input.avatarUrl }),
        });
        return { success: true };
      }),

    uploadAvatar: protectedProcedure
      .input(z.object({
        base64: z.string(),
        mimeType: z.enum(["image/jpeg", "image/png", "image/webp", "image/gif"]),
      }))
      .mutation(async ({ ctx, input }) => {
        const { storagePut } = await import("./storage");
        const { upsertUser } = await import("./db");
        
        // Convert base64 to buffer
        const buffer = Buffer.from(input.base64, "base64");
        const ext = input.mimeType.split("/")[1];
        const fileKey = `avatars/${ctx.user.id}-${Date.now()}.${ext}`;
        
        const { url } = await storagePut(fileKey, buffer, input.mimeType);
        
        // Update user avatarUrl in DB
        await upsertUser({
          openId: ctx.user.openId,
          avatarUrl: url,
        });
        
        return { url };
      }),

    getStatistics: protectedProcedure.query(async ({ ctx }) => {
      const { getUserStatistics } = await import("./db");
      return await getUserStatistics(ctx.user.id);
    }),

    getUsagePreferences: protectedProcedure.query(async ({ ctx }) => {
      const { getUserUsagePreferences } = await import("./db");
      return await getUserUsagePreferences(ctx.user.id);
    }),

    updateUsagePreferences: protectedProcedure
      .input(z.object({ preferences: z.string().max(1000) }))
      .mutation(async ({ ctx, input }) => {
        const { updateUserUsagePreferences } = await import("./db");
        await updateUserUsagePreferences(ctx.user.id, input.preferences);
        return { success: true };
      }),

    // Export user data (GDPR right to data portability)
    exportData: protectedProcedure.mutation(async ({ ctx }) => {
      // Get user data (already in ctx.user)
      const preferenceData = await getUserPreference(ctx.user.id);
      
      // Get user's posts and other data for export
      const userPosts = await getUserPosts(ctx.user.id);
      const userSubscription = await getUserSubscription(ctx.user.id);
      
      return {
        user: ctx.user,
        preferences: preferenceData,
        exportedAt: new Date().toISOString(),
      };
    }),

    // Delete account (GDPR right to be forgotten)
    deleteAccount: protectedProcedure
      .input(z.object({ 
        confirmation: z.literal("DELETE"),
        reason: z.string().optional()
      }))
      .mutation(async ({ ctx, input }) => {
        const { deleteUser } = await import("./db");
        const cookieOptions = getSessionCookieOptions(ctx.req);
        
        // Delete user account and all related data
        await deleteUser(ctx.user.id);
        
        // Clear session cookie
        ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
        
        // Log deletion reason if provided (for analytics)
        if (input.reason) {
          console.log(`Account deleted - User ID: ${ctx.user.id}, Reason: ${input.reason}`);
        }
        
        return {
          success: true,
          message: "Din konto og alle data har blitt permanent slettet.",
        };
      }),
  }),
  
  content: router({
    generate: protectedProcedure
      .input(z.object({
        topic: z.string().min(1),
        platform: z.enum(["linkedin", "twitter", "instagram", "facebook"]),
        tone: z.enum(["professional", "casual", "friendly", "formal", "humorous"]).optional(),
        length: z.enum(["short", "medium", "long"]).optional(),
        keywords: z.array(z.string()).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { getUserSubscription, enforcePostQuota } = await import("./db");
        const { generateContent } = await import("./openaiService");

        // Single source of truth: checks trial/monthly limit AND reserves the slot
        // server-side (throws if over quota or subscription unusable).
        await enforcePostQuota(ctx.user.id);

        // Generate content using OpenAI
        const content = await generateContent({
          platform: input.platform,
          topic: input.topic,
          tone: input.tone,
          length: input.length,
          keywords: input.keywords,
        });

        // Get updated subscription
        const updatedSubscription = await getUserSubscription(ctx.user.id);
        
        return { 
          content,
          postsGenerated: updatedSubscription?.postsGenerated || 0,
          postsRemaining: updatedSubscription?.status === "trial" 
            ? (updatedSubscription.trialPostsLimit - updatedSubscription.postsGenerated)
            : null,
        };
      }),
      
    improve: protectedProcedure
      .input(z.object({
        content: z.string().min(1),
        platform: z.enum(["linkedin", "twitter", "instagram", "facebook"]),
        improvementType: z.enum(["grammar", "engagement", "clarity", "tone"]),
      }))
      .mutation(async ({ input }) => {
        const { improveContent } = await import("./openaiService");
        
        const improvedContent = await improveContent(
          input.content,
          input.platform,
          input.improvementType
        );
        
        return { content: improvedContent };
      }),
      
    generateImageDallE: protectedProcedure
      .input(z.object({
        topic: z.string().min(1),
        platform: z.enum(["linkedin", "twitter", "instagram", "facebook"]),
        tone: z.enum(["professional", "casual", "friendly", "formal", "humorous"]),
        keywords: z.array(z.string()).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { getUserSubscription } = await import("./db");
        const { generateOptimizedImagePrompt } = await import("./imagePromptOptimizer");
        const { generateImageWithDallE } = await import("./openaiService");
        
        // Check subscription - DALL-E 3 is Pro only
        const subscription = await getUserSubscription(ctx.user.id);
        if (!subscription || subscription.status === "trial") {
          throw new Error("DALL-E 3 image generation requires a Pro subscription. Please upgrade or use Nano Banana (free).");
        }
        
        // Generate optimized prompt
        const optimizedPrompt = generateOptimizedImagePrompt({
          topic: input.topic,
          platform: input.platform,
          tone: input.tone,
          keywords: input.keywords,
        });
        
        // Generate image with DALL-E 3
        const imageUrl = await generateImageWithDallE(optimizedPrompt.prompt);
        
        return { 
          url: imageUrl,
          prompt: optimizedPrompt.prompt,
        };
      }),
      
    generateImageNanoBanana: protectedProcedure
      .input(z.object({
        topic: z.string().min(1),
        platform: z.enum(["linkedin", "twitter", "instagram", "facebook"]),
        tone: z.enum(["professional", "casual", "friendly", "formal", "humorous"]),
        keywords: z.array(z.string()).optional(),
      }))
      .mutation(async ({ input }) => {
        const { generateSimplifiedPrompt } = await import("./imagePromptOptimizer");
        const { generateImage } = await import("./_core/imageGeneration");
        
        // Generate simplified prompt for Nano Banana/Gemini
        const prompt = generateSimplifiedPrompt({
          topic: input.topic,
          platform: input.platform,
          tone: input.tone,
          keywords: input.keywords,
        });
        
        // Generate image with OpenAI (DALL-E 3)
        const result = await generateImage({ prompt });
        
        if (!result.url) {
          throw new Error("Failed to generate image");
        }
        
        return { 
          url: result.url,
          prompt,
        };
      }),
      
    list: protectedProcedure.query(async ({ ctx }) => {
      const { getUserPosts } = await import("./db");
      return getUserPosts(ctx.user.id);
    }),
    
    getActivityData: protectedProcedure.query(async ({ ctx }) => {
      const { getDb } = await import("./db");
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const { posts } = await import("../drizzle/schema");
      const { eq, gte, sql } = await import("drizzle-orm");
      
      // Get posts from last 7 days
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      const recentPosts = await db
        .select({
          createdAt: posts.createdAt,
        })
        .from(posts)
        .where(
          sql`${posts.userId} = ${ctx.user.id} AND ${posts.createdAt} >= ${sevenDaysAgo.getTime()}`
        );
      
      // Group by day
      const activityMap = new Map<string, number>();
      const dayNames = ['Søn', 'Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør'];
      
      // Initialize last 7 days with 0
      for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dayName = dayNames[date.getDay()];
        activityMap.set(dayName, 0);
      }
      
      // Count posts per day
      recentPosts.forEach(post => {
        const date = new Date(post.createdAt);
        const dayName = dayNames[date.getDay()];
        activityMap.set(dayName, (activityMap.get(dayName) || 0) + 1);
      });
      
      // Convert to array format for chart
      const activityData = Array.from(activityMap.entries()).map(([day, posts]) => ({
        day,
        posts,
      }));
      
      return activityData;
    }),
    
    delete: protectedProcedure
      .input(z.object({ postId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const { getPostById, deletePost } = await import("./db");
        
        // Verify ownership
        const post = await getPostById(input.postId);
        if (!post || post.userId !== ctx.user.id) {
          throw new Error("Post not found or unauthorized");
        }
        
        await deletePost(input.postId);
        return { success: true };
      }),
      
    repurpose: protectedProcedure
      .input(z.object({
        postId: z.number(),
        targetPlatform: z.string(),
        repurposeType: z.enum(["platform_adapt", "format_change", "audience_shift", "update"]),
      }))
      .mutation(async ({ ctx, input }) => {
        const { getUserSubscription, getPostById } = await import("./db");
        const { invokeLLM } = await import("./_core/llm");
        
        // Check Pro subscription
        const subscription = await getUserSubscription(ctx.user.id);
        if (!subscription || subscription.status !== "active") {
          throw new Error("Gjenbruk-Maskin krever Pro-abonnement");
        }
        
        // Get original post
        const post = await getPostById(input.postId);
        if (!post || post.userId !== ctx.user.id) {
          throw new Error("Post not found or unauthorized");
        }
        
        // Generate repurposed content
        const repurposeInstructions = {
          platform_adapt: `Tilpass dette innholdet for ${input.targetPlatform}. Juster lengde, tone og format til plattformen.`,
          format_change: `Endre formatet på dette innholdet for ${input.targetPlatform}. Hvis det er en liste, gjør det til en fortelling, og omvendt.`,
          audience_shift: `Skriv om dette innholdet for en annen målgruppe på ${input.targetPlatform}. Juster språk og eksempler.`,
          update: `Oppdater dette innholdet med fersk informasjon og nye insights for ${input.targetPlatform}.`,
        };
        
        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content: `Du er en ekspert på å gjenbruke og tilpasse innhold for sosiale medier. ${repurposeInstructions[input.repurposeType]} Behold kjernebudskapet, men tilpass presentasjonen.`
            },
            {
              role: "user",
              content: `Originalt innlegg (${post.platform}):\n\n${post.generatedContent}\n\nGjenbruk dette for ${input.targetPlatform}.`
            }
          ]
        });
        
        const repurposedContent = response.choices[0]?.message?.content;
        if (typeof repurposedContent !== 'string') {
          throw new Error("Kunne ikke gjenbruke innhold");
        }
        
        return { content: repurposedContent };
      }),
      
    update: protectedProcedure
      .input(z.object({ postId: z.number(), content: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const { getPostById, updatePost } = await import("./db");
        const post = await getPostById(input.postId);
        if (!post || post.userId !== ctx.user.id) {
          throw new Error("Post not found or unauthorized");
        }
        await updatePost(input.postId, input.content);
        return { success: true };
      }),
      
    getScheduledPosts: protectedProcedure.query(async ({ ctx }) => {
      const { getDb } = await import("./db");
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const { posts } = await import("../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      
      // Get all posts for the user (including scheduled, draft, and published)
      const userPosts = await db
        .select()
        .from(posts)
        .where(eq(posts.userId, ctx.user.id));
      
      return userPosts;
    }),
    
    reschedule: protectedProcedure
      .input(z.object({ postId: z.number(), scheduledFor: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const { getDb } = await import("./db");
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const { posts } = await import("../drizzle/schema");
        const { eq, and } = await import("drizzle-orm");
        
        // Verify ownership
        const post = await db.select().from(posts).where(
          and(
            eq(posts.id, input.postId),
            eq(posts.userId, ctx.user.id)
          )
        ).limit(1);
        
        if (!post || post.length === 0) {
          throw new Error("Post not found or unauthorized");
        }
        
        // Update scheduledFor (convert timestamp to Date)
        await db.update(posts)
          .set({ scheduledFor: new Date(input.scheduledFor) })
          .where(eq(posts.id, input.postId));
        
        return { success: true };
      }),
  }),
  
  // voice router moved to voiceRouter.ts
  
  examples: router({
    save: protectedProcedure
      .input(z.object({
        postId: z.number(),
        title: z.string().min(1).max(200),
      }))
      .mutation(async ({ ctx, input }) => {
        const { getPostById, createSavedExample } = await import("./db");
        
        // Get the post
        const post = await getPostById(input.postId);
        if (!post || post.userId !== ctx.user.id) {
          throw new Error("Post not found or unauthorized");
        }
        
        // Save as example
        const example = await createSavedExample({
          userId: ctx.user.id,
          postId: post.id,
          title: input.title,
          platform: post.platform,
          tone: post.tone,
          rawInput: post.rawInput,
          generatedContent: post.generatedContent,
        });
        
        return example;
      }),
      
    list: protectedProcedure.query(async ({ ctx }) => {
      const { getUserSavedExamples } = await import("./db");
      return getUserSavedExamples(ctx.user.id);
    }),
    
    use: protectedProcedure
      .input(z.object({ exampleId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const { getSavedExampleById, incrementExampleUsage } = await import("./db");
        
        const example = await getSavedExampleById(input.exampleId);
        if (!example || example.userId !== ctx.user.id) {
          throw new Error("Example not found or unauthorized");
        }
        
        // Increment usage count
        await incrementExampleUsage(input.exampleId);
        
        return example;
      }),
      
    delete: protectedProcedure
      .input(z.object({ exampleId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const { getSavedExampleById, deleteSavedExample } = await import("./db");
        
        const example = await getSavedExampleById(input.exampleId);
        if (!example || example.userId !== ctx.user.id) {
          throw new Error("Example not found or unauthorized");
        }
        
        await deleteSavedExample(input.exampleId);
        return { success: true };
      }),
  }),
  
  coach: router({
    chat: protectedProcedure
      .input(z.object({ message: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        const { invokeLLM } = await import("./_core/llm");
        const { getUserPosts, getUserContentAnalyses } = await import("./db");
        
        // Get user's posts and analyses for context
        const posts = await getUserPosts(ctx.user.id);
        const analyses = await getUserContentAnalyses(ctx.user.id);
        
        // Build context
        const avgScore = analyses.length > 0
          ? analyses.reduce((sum: number, a: any) => sum + a.overallScore, 0) / analyses.length
          : 0;
        
        const platformCounts = posts.reduce((acc: Record<string, number>, p) => {
          acc[p.platform] = (acc[p.platform] || 0) + 1;
          return acc;
        }, {});
        
        const analysesText = analyses.slice(0, 3).map((a: any) => {
          const strengths = typeof a.strengths === 'string' ? JSON.parse(a.strengths) : a.strengths;
          return `Score: ${a.overallScore}/10, Strengths: ${Array.isArray(strengths) ? strengths.join(", ") : ""}`;
        }).join(" | ");
        
        const context = `You are an expert content coach helping a user improve their social media content.

User Stats:
- Total posts: ${posts.length}
- Average content score: ${avgScore.toFixed(1)}/10
- Platforms used: ${Object.entries(platformCounts).map(([p, c]) => `${p} (${c})`).join(", ")}
- Recent analyses: ${analysesText}

Provide helpful, actionable advice. Be encouraging but honest. Keep responses concise (2-3 paragraphs max).`;
        
        const response = await invokeLLM({
          messages: [
            { role: "system", content: context },
            { role: "user", content: input.message },
          ],
        });
        
        return {
          message: response.choices[0]?.message?.content || "Sorry, I couldn't generate a response.",
        };
      }),
  }),
  
  blog: router({
    list: publicProcedure.query(async () => {
      const { getAllBlogPosts } = await import("./db");
      return await getAllBlogPosts();
    }),
    
    getBySlug: publicProcedure
      .input(z.object({ slug: z.string() }))
      .query(async ({ input }) => {
        const { getBlogPostBySlug } = await import("./db");
        return await getBlogPostBySlug(input.slug);
      }),
    
    getByCategory: publicProcedure
      .input(z.object({ category: z.string() }))
      .query(async ({ input }) => {
        const { getBlogPostsByCategory } = await import("./db");
        return await getBlogPostsByCategory(input.category);
      }),
      
    // Admin procedures
    adminList: protectedProcedure.query(async ({ ctx }) => {
      // Check if user is admin
      if (ctx.user.role !== "admin") {
        throw new Error("Unauthorized: Admin access required");
      }
      
      const { getAllBlogPostsAdmin } = await import("./db");
      return await getAllBlogPostsAdmin();
    }),
    
    create: protectedProcedure
      .input(z.object({
        title: z.string().min(1),
        slug: z.string().min(1),
        excerpt: z.string().min(1),
        content: z.string().min(1),
        category: z.enum(["tips", "guides", "news", "case-studies"]),
        tags: z.string().optional(),
        authorName: z.string().min(1),
        readingTime: z.number().min(1),
        imageUrl: z.string().optional(),
        published: z.number().min(0).max(1),
      }))
      .mutation(async ({ ctx, input }) => {
        // Check if user is admin
        if (ctx.user.role !== "admin") {
          throw new Error("Unauthorized: Admin access required");
        }
        
        const { createBlogPost } = await import("./db");
        return await createBlogPost(input as any);
      }),
      
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        title: z.string().min(1).optional(),
        slug: z.string().min(1).optional(),
        excerpt: z.string().min(1).optional(),
        content: z.string().min(1).optional(),
        category: z.enum(["tips", "guides", "news", "case-studies"]).optional(),
        tags: z.string().optional(),
        author: z.string().min(1).optional(),
        imageUrl: z.string().optional(),
        published: z.number().min(0).max(1).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Check if user is admin
        if (ctx.user.role !== "admin") {
          throw new Error("Unauthorized: Admin access required");
        }
        
        const { id, ...updates } = input;
        const { updateBlogPostAdmin } = await import("./db");
        await updateBlogPostAdmin(id, updates as any);
        return { success: true };
      }),
      
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        // Check if user is admin
        if (ctx.user.role !== "admin") {
          throw new Error("Unauthorized: Admin access required");
        }
        
        const { deleteBlogPostAdmin } = await import("./db");
        await deleteBlogPostAdmin(input.id);
        return { success: true };
      }),
      
    uploadImage: protectedProcedure
      .input(z.object({
        // No path separators / traversal; bounded length.
        fileName: z.string().min(1).max(128).regex(/^[A-Za-z0-9._-]+$/, "Invalid file name"),
        fileData: z.string().min(1).max(9_000_000), // ~6.5 MB of base64
        // Only real raster image types — blocks SVG/HTML content-type smuggling (stored XSS).
        contentType: z.enum(["image/png", "image/jpeg", "image/webp", "image/gif"]),
      }))
      .mutation(async ({ ctx, input }) => {
        // Check if user is admin
        if (ctx.user.role !== "admin") {
          throw new Error("Unauthorized: Admin access required");
        }

        // Generate unique file key. fileName is regex-validated above (no `/`, `\`, `..`).
        const ext = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" }[input.contentType];
        const timestamp = Date.now();
        const randomSuffix = Math.random().toString(36).substring(7);
        const fileKey = `blog-images/${timestamp}-${randomSuffix}.${ext}`;

        // Convert base64 to buffer
        const base64Data = input.fileData.split(',')[1] || input.fileData;
        const buffer = Buffer.from(base64Data, 'base64');

        // Upload to S3
        const { url } = await storagePut(fileKey, buffer, input.contentType);

        return { url, fileKey };
      }),
  }),

  // Stripe Payment Router
  stripe: router({
    createCheckoutSession: protectedProcedure
      .input(z.object({
        productKey: z.enum(["PRO_MONTHLY", "PRO_YEARLY"]),
      }))
      .mutation(async ({ ctx, input }) => {
        const { createCheckoutSession } = await import("./stripe/stripeService");
        
        const origin = ctx.req.headers.origin || process.env.PUBLIC_SITE_URL || "http://localhost:3000";
        
        const result = await createCheckoutSession({
          userId: ctx.user.id,
          userEmail: ctx.user.email || "",
          userName: ctx.user.name || undefined,
          productKey: input.productKey,
          successUrl: `${origin}/subscription/success`,
          cancelUrl: `${origin}/subscription/cancel`,
        });
        
        return result;
      }),

    getPortalUrl: protectedProcedure.mutation(async ({ ctx }) => {
      const { getUserSubscription } = await import("./db");
      const { createCustomerPortalSession } = await import("./stripe/stripeService");
      
      const subscription = await getUserSubscription(ctx.user.id);
      
      if (!subscription?.stripeCustomerId) {
        throw new Error("Ingen aktiv Stripe-konto funnet");
      }
      
      const origin = ctx.req.headers.origin || process.env.PUBLIC_SITE_URL || "http://localhost:3000";
      const url = await createCustomerPortalSession(
        subscription.stripeCustomerId,
        `${origin}/settings`
      );
      
      return { url };
    }),

    cancelSubscription: protectedProcedure.mutation(async ({ ctx }) => {
      const { getUserSubscription, updateSubscriptionStatus } = await import("./db");
      const { cancelSubscription } = await import("./stripe/stripeService");
      
      const subscription = await getUserSubscription(ctx.user.id);
      
      if (!subscription?.stripeSubscriptionId) {
        throw new Error("Ingen aktiv abonnement funnet");
      }
      
      await cancelSubscription(subscription.stripeSubscriptionId);
      await updateSubscriptionStatus(ctx.user.id, "cancelled");
      
      return { success: true, message: "Abonnementet er kansellert" };
    }),
  }),
  
  competitors: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const { getDb } = await import("./db");
      const { competitors } = await import("../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      return db.select().from(competitors).where(eq(competitors.userId, ctx.user.id));
    }),
    
    add: protectedProcedure
      .input(z.object({
        name: z.string(),
        platform: z.enum(["linkedin", "twitter", "instagram", "facebook"]),
        profileUrl: z.string().url(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { getDb, getUserSubscription } = await import("./db");
        const { competitors } = await import("../drizzle/schema");
        
        // Check Pro subscription
        const subscription = await getUserSubscription(ctx.user.id);
        if (!subscription || subscription.status !== "active") {
          throw new Error("Konkurrent-Radar krever Pro-abonnement");
        }
        
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        
        await db.insert(competitors).values({
          userId: ctx.user.id,
          name: input.name,
          platform: input.platform,
          profileUrl: input.profileUrl,
        });
        
        return { success: true };
      }),
      
    toggle: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const { getDb } = await import("./db");
        const { competitors } = await import("../drizzle/schema");
        const { eq, and } = await import("drizzle-orm");
        
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        
        const [competitor] = await db.select().from(competitors)
          .where(and(eq(competitors.id, input.id), eq(competitors.userId, ctx.user.id)));
        
        if (!competitor) throw new Error("Not found");
        
        await db.update(competitors)
          .set({ isActive: competitor.isActive ? 0 : 1 })
          .where(eq(competitors.id, input.id));
        
        return { success: true };
      }),
      
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const { getDb } = await import("./db");
        const { competitors } = await import("../drizzle/schema");
        const { eq, and } = await import("drizzle-orm");
        
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        
        await db.delete(competitors)
          .where(and(eq(competitors.id, input.id), eq(competitors.userId, ctx.user.id)));
        
        return { success: true };
      }),
  }),
  
  series: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const { getDb } = await import("./db");
      const { contentSeries } = await import("../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      return db.select().from(contentSeries).where(eq(contentSeries.userId, ctx.user.id));
    }),
    
    create: protectedProcedure
      .input(z.object({
        title: z.string(),
        description: z.string(),
        postCount: z.number().min(3).max(10),
      }))
      .mutation(async ({ ctx, input }) => {
        const { getDb, getUserSubscription } = await import("./db");
        const { contentSeries } = await import("../drizzle/schema");
        
        const subscription = await getUserSubscription(ctx.user.id);
        if (!subscription || subscription.status !== "active") {
          throw new Error("Innholds-Serier krever Pro-abonnement");
        }
        
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        
        await db.insert(contentSeries).values({
          userId: ctx.user.id,
          title: input.title,
          description: input.description,
          totalParts: input.postCount,
          status: "planning",
        });
        
        return { success: true };
      }),
      
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const { getDb } = await import("./db");
        const { contentSeries } = await import("../drizzle/schema");
        const { eq, and } = await import("drizzle-orm");
        
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        
        await db.delete(contentSeries)
          .where(and(eq(contentSeries.id, input.id), eq(contentSeries.userId, ctx.user.id)));
        
        return { success: true };
      }),
      
    generatePost: protectedProcedure
      .input(z.object({ seriesId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const { getDb } = await import("./db");
        const { contentSeries } = await import("../drizzle/schema");
        const { eq, and } = await import("drizzle-orm");
        const { invokeLLM } = await import("./_core/llm");
        
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        
        const [series] = await db.select().from(contentSeries)
          .where(and(eq(contentSeries.id, input.seriesId), eq(contentSeries.userId, ctx.user.id)));
        
        if (!series) throw new Error("Serie ikke funnet");
        // Count existing posts
        const { seriesPosts } = await import("../drizzle/schema");
        const existingPosts = await db.select().from(seriesPosts)
          .where(eq(seriesPosts.seriesId, input.seriesId));
        
        if (existingPosts.length >= series.totalParts) {
          throw new Error("Alle innlegg er allerede generert");
        }
        
        // Generate next post using LLM
        const postNumber = existingPosts.length + 1;
        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content: `Du er en ekspert på innhold. Generer innlegg nummer ${postNumber} av ${series.totalParts} i en serie.`,
            },
            {
              role: "user",
              content: `Serie: ${series.title}\n\nBeskrivelse: ${series.description}\n\nGenerer innlegg ${postNumber}/${series.totalParts}. Inkluder en kort intro som refererer til serien.`,
            },
          ],
        });
        
        const content = response.choices[0].message.content;
        
        // Create series post entry
        await db.insert(seriesPosts).values({
          seriesId: input.seriesId,
          partNumber: postNumber,
          title: `${series.title} - Del ${postNumber}`,
          status: "draft",
        });
        
        // Update series status
        const newStatus = postNumber === series.totalParts ? "completed" : "in_progress";
        await db.update(contentSeries)
          .set({ status: newStatus })
          .where(eq(contentSeries.id, input.seriesId));
        
        return { success: true, content };
      }),
  }),
  
  abtest: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const { getDb } = await import("./db");
      const { abTests } = await import("../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      return db.select().from(abTests).where(eq(abTests.userId, ctx.user.id));
    }),
    
    create: protectedProcedure
      .input(z.object({
        topic: z.string(),
        variantA: z.string(),
        variantB: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { getDb, getUserSubscription } = await import("./db");
        const { abTests } = await import("../drizzle/schema");
        
        const subscription = await getUserSubscription(ctx.user.id);
        if (!subscription || subscription.status !== "active") {
          throw new Error("A/B Testing krever Pro-abonnement");
        }
        
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        
        await db.insert(abTests).values({
          userId: ctx.user.id,
          title: input.topic,
          platform: "linkedin",
          variantA: input.variantA,
          variantB: input.variantB,
        });
        
        return { success: true };
      }),
      
    generate: protectedProcedure
      .input(z.object({ topic: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const { getUserSubscription } = await import("./db");
        const { invokeLLM } = await import("./_core/llm");
        
        const subscription = await getUserSubscription(ctx.user.id);
        if (!subscription || subscription.status !== "active") {
          throw new Error("A/B Testing krever Pro-abonnement");
        }
        
        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content: "Du er en ekspert på A/B testing for sosiale medier. Generer to forskjellige versjoner av samme innlegg.",
            },
            {
              role: "user",
              content: `Tema: ${input.topic}\n\nGenerer to varianter (A og B) av et innlegg. Variant A skal være mer formell, Variant B skal være mer casual. Svar i JSON format: {"variantA": "...", "variantB": "..."}`,
            },
          ],
        });
        
        const content = response.choices[0].message.content || "{}";
        const parsed = JSON.parse(typeof content === "string" ? content : JSON.stringify(content));
        
        return { variantA: parsed.variantA, variantB: parsed.variantB };
      }),
      
    recordResult: protectedProcedure
      .input(z.object({ testId: z.number(), winner: z.enum(["a", "b"]) }))
      .mutation(async ({ ctx, input }) => {
        const { getDb } = await import("./db");
        const { abTests } = await import("../drizzle/schema");
        const { eq, and } = await import("drizzle-orm");
        
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        
        await db.update(abTests)
          .set({ winner: input.winner, status: "completed" })
          .where(and(eq(abTests.id, input.testId), eq(abTests.userId, ctx.user.id)));
        
        return { success: true };
      }),
  }),
  

  
  calendar: router({
    getEvents: protectedProcedure
      .input(z.object({ month: z.number().min(1).max(12), year: z.number() }))
      .query(async ({ input }) => {
        // Return Norwegian + global events for the specified month
        const norwegianEvents = [
          { id: 1, title: "Nyttårsdag", description: "Feire nytt år og nye muligheter", eventDate: `${input.year}-01-01`, category: "norwegian", isRecurring: 1 },
          { id: 2, title: "Valentinsdag", description: "Kjærlighet og relasjoner", eventDate: `${input.year}-02-14`, category: "global", isRecurring: 1 },
          { id: 3, title: "Kvinnedagen", description: "Feire kvinner i arbeidslivet", eventDate: `${input.year}-03-08`, category: "global", isRecurring: 1 },
          { id: 4, title: "17. mai", description: "Norges nasjonaldag", eventDate: `${input.year}-05-17`, category: "norwegian", isRecurring: 1 },
          { id: 5, title: "Sankthansaften", description: "Midsommer feiring", eventDate: `${input.year}-06-23`, category: "norwegian", isRecurring: 1 },
          { id: 6, title: "Black Friday", description: "Salg og markedsføring", eventDate: `${input.year}-11-24`, category: "business", isRecurring: 1 },
          { id: 7, title: "Jul", description: "Julefeiring og tradisjon", eventDate: `${input.year}-12-24`, category: "norwegian", isRecurring: 1 },
        ];
        
        return norwegianEvents.filter(event => {
          const eventMonth = parseInt(event.eventDate.split('-')[1]);
          return eventMonth === input.month;
        });
      }),
      
    getUserSchedule: protectedProcedure.query(async ({ ctx }) => {
      // Return empty for now - will be implemented with schedule feature
      return [];
    }),
  }),
  
  reports: router({
    getSettings: protectedProcedure.query(async ({ ctx }) => {
      const { getDb } = await import("./db");
      const { weeklyReportSettings } = await import("../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const settings = await db.select().from(weeklyReportSettings).where(eq(weeklyReportSettings.userId, ctx.user.id)).limit(1);
      return settings[0] || null;
    }),
    
    updateSettings: protectedProcedure
      .input(z.object({ email: z.string().email(), enabled: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        const { getDb } = await import("./db");
        const { weeklyReportSettings } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const existing = await db.select().from(weeklyReportSettings).where(eq(weeklyReportSettings.userId, ctx.user.id)).limit(1);
        
        if (existing.length > 0) {
          await db.update(weeklyReportSettings)
            .set({ email: input.email, enabled: input.enabled ? 1 : 0, updatedAt: new Date() })
            .where(eq(weeklyReportSettings.userId, ctx.user.id));
        } else {
          await db.insert(weeklyReportSettings).values({
            userId: ctx.user.id,
            email: input.email,
            enabled: input.enabled ? 1 : 0,
          });
        }
        
        return { success: true };
      }),
      
    sendTestReport: protectedProcedure
      .input(z.object({ email: z.string().email() }))
      .mutation(async ({ ctx, input }) => {
        const { notifyOwner } = await import("./_core/notification");
        // In a real implementation, this would send an actual email
        // For now, we'll notify the owner
        await notifyOwner({
          title: "Test Weekly Report Sent",
          content: `Test report sent to ${input.email} for user ${ctx.user.name}`,
        });
        return { success: true };
      }),
  }),
  
  engagement: router({
    generateResponse: protectedProcedure
      .input(z.object({
        originalPost: z.string().min(1),
        responseType: z.enum(["supportive", "insightful", "question", "appreciation"]),
      }))
      .mutation(async ({ ctx, input }) => {
        const { getUserSubscription } = await import("./db");
        const { invokeLLM } = await import("./_core/llm");
        
        // Check Pro subscription
        const subscription = await getUserSubscription(ctx.user.id);
        if (!subscription || subscription.status !== "active") {
          throw new Error("Engasjement-Hjelper krever Pro-abonnement");
        }
        
        // Define response instructions
        const responseInstructions = {
          supportive: "Skriv et støttende svar som viser enighet og oppmuntring. Vær varm og positiv.",
          insightful: "Skriv et innsiktsfullt svar som legger til nytt perspektiv eller erfaring. Vær gjennomtenkt og verdifull.",
          question: "Skriv et svar med et gjennomtenkt oppfølgingsspørsmål som starter en dypere samtale.",
          appreciation: "Skriv et takknemlig svar som viser at du setter pris på innholdet. Vær oppriktig og spesifikk.",
        };
        
        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content: `Du er en ekspert på profesjonelt engasjement i sosiale medier. ${responseInstructions[input.responseType]} Hold svaret kort (2-4 setninger) og profesjonelt. Skriv på norsk.`
            },
            {
              role: "user",
              content: `Innlegg:

${input.originalPost}

Skriv et ${input.responseType} svar.`
            }
          ]
        });
        
        const generatedResponse = response.choices[0]?.message?.content;
        if (typeof generatedResponse !== 'string') {
          throw new Error("Kunne ikke generere svar");
        }
        
        return { response: generatedResponse };
      }),
  }),

  // Idé-Bank (Idea Bank) router
  ideas: router({
    list: protectedProcedure
      .input(z.object({
        status: z.enum(["new", "in_progress", "used", "archived", "all"]).optional().default("all"),
        search: z.string().optional(),
      }).optional())
      .query(async ({ ctx, input }) => {
        const { getDb } = await import("./db");
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const { ideas } = await import("../drizzle/schema");
        const { eq, and, like, desc } = await import("drizzle-orm");
        
        let query = db.select().from(ideas).where(eq(ideas.userId, ctx.user.id));
        
        const results = await db.select().from(ideas)
          .where(eq(ideas.userId, ctx.user.id))
          .orderBy(desc(ideas.createdAt));
        
        // Filter by status if not "all"
        let filtered = results;
        if (input?.status && input.status !== "all") {
          filtered = results.filter(idea => idea.status === input.status);
        }
        
        // Filter by search term
        if (input?.search) {
          const searchLower = input.search.toLowerCase();
          filtered = filtered.filter(idea => 
            idea.ideaText.toLowerCase().includes(searchLower) ||
            (idea.tags && idea.tags.toLowerCase().includes(searchLower))
          );
        }
        
        return filtered;
      }),

    create: protectedProcedure
      .input(z.object({
        ideaText: z.string().min(1),
        source: z.enum(["manual", "voice", "trend", "competitor"]).optional().default("manual"),
        tags: z.array(z.string()).optional(),
        platform: z.enum(["linkedin", "twitter", "instagram", "facebook"]).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { getDb } = await import("./db");
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const { ideas } = await import("../drizzle/schema");
        
        const result = await db.insert(ideas).values({
          userId: ctx.user.id,
          ideaText: input.ideaText,
          source: input.source,
          tags: input.tags ? JSON.stringify(input.tags) : null,
          platform: input.platform || null,
          status: "new",
        });
        
        return { success: true, id: Number((result as unknown as { insertId: number }).insertId) };
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        ideaText: z.string().min(1).optional(),
        status: z.enum(["new", "in_progress", "used", "archived"]).optional(),
        tags: z.array(z.string()).optional(),
        platform: z.enum(["linkedin", "twitter", "instagram", "facebook"]).optional().nullable(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { getDb } = await import("./db");
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const { ideas } = await import("../drizzle/schema");
        const { eq, and } = await import("drizzle-orm");
        
        const updateData: Record<string, unknown> = {};
        if (input.ideaText) updateData.ideaText = input.ideaText;
        if (input.status) updateData.status = input.status;
        if (input.tags !== undefined) updateData.tags = input.tags ? JSON.stringify(input.tags) : null;
        if (input.platform !== undefined) updateData.platform = input.platform;
        
        await db.update(ideas)
          .set(updateData)
          .where(and(eq(ideas.id, input.id), eq(ideas.userId, ctx.user.id)));
        
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const { getDb } = await import("./db");
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const { ideas } = await import("../drizzle/schema");
        const { eq, and } = await import("drizzle-orm");
        
        await db.delete(ideas)
          .where(and(eq(ideas.id, input.id), eq(ideas.userId, ctx.user.id)));
        
        return { success: true };
      }),

    convertToPost: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const { getDb } = await import("./db");
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const { ideas } = await import("../drizzle/schema");
        const { eq, and } = await import("drizzle-orm");
        
        // Get the idea
        const ideaResults = await db.select().from(ideas)
          .where(and(eq(ideas.id, input.id), eq(ideas.userId, ctx.user.id)))
          .limit(1);
        
        if (!ideaResults || ideaResults.length === 0) {
          throw new Error("Idé ikke funnet");
        }
        
        const idea = ideaResults[0];
        
        // Mark as in_progress (will be marked as used after post is created)
        await db.update(ideas)
          .set({ status: "in_progress" })
          .where(eq(ideas.id, input.id));
        
        return { 
          success: true, 
          idea: {
            id: idea.id,
            ideaText: idea.ideaText,
            platform: idea.platform,
            tags: idea.tags ? (() => { try { return JSON.parse(idea.tags!); } catch { return []; } })() : [],
          }
        };
      }),

    markAsUsed: protectedProcedure
      .input(z.object({ id: z.number(), postId: z.number().optional() }))
      .mutation(async ({ ctx, input }) => {
        const { getDb } = await import("./db");
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const { ideas } = await import("../drizzle/schema");
        const { eq, and } = await import("drizzle-orm");
        
        const updateData: any = { status: "used" };
        if (input.postId) {
          updateData.convertedPostId = input.postId;
        }
        
        await db.update(ideas)
          .set(updateData)
          .where(and(eq(ideas.id, input.id), eq(ideas.userId, ctx.user.id)));
        
        return { success: true };
      }),

    getStats: protectedProcedure.query(async ({ ctx }) => {
      const { getDb } = await import("./db");
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const { ideas } = await import("../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      
      const allIdeas = await db.select().from(ideas).where(eq(ideas.userId, ctx.user.id));
      
      return {
        total: allIdeas.length,
        new: allIdeas.filter(i => i.status === "new").length,
        inProgress: allIdeas.filter(i => i.status === "in_progress").length,
        used: allIdeas.filter(i => i.status === "used").length,
        archived: allIdeas.filter(i => i.status === "archived").length,
      };
    }),
  }),

  // Drafts - Auto-save user work in progress
  drafts: router({
    // Save or update a draft (upsert)
    save: protectedProcedure
      .input(z.object({
        pageType: z.enum(["generate", "repurpose", "series", "ab_test", "engagement"]),
        formData: z.string(), // JSON string
        title: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { getDb } = await import("./db");
        const { drafts } = await import("../drizzle/schema");
        const { eq, and } = await import("drizzle-orm");
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        
        // Check if draft exists for this user and page
        const existing = await db.select()
          .from(drafts)
          .where(and(
            eq(drafts.userId, ctx.user.id),
            eq(drafts.pageType, input.pageType)
          ))
          .limit(1);
        
        if (existing.length > 0) {
          // Update existing draft
          await db.update(drafts)
            .set({
              formData: input.formData,
              title: input.title,
            })
            .where(eq(drafts.id, existing[0].id));
          return { id: existing[0].id, updated: true };
        } else {
          // Create new draft
          const result = await db.insert(drafts).values({
            userId: ctx.user.id,
            pageType: input.pageType,
            formData: input.formData,
            title: input.title,
          });
          return { id: Number(result[0].insertId), updated: false };
        }
      }),

    // Get draft for a specific page
    get: protectedProcedure
      .input(z.object({
        pageType: z.enum(["generate", "repurpose", "series", "ab_test", "engagement"]),
      }))
      .query(async ({ ctx, input }) => {
        const { getDb } = await import("./db");
        const { drafts } = await import("../drizzle/schema");
        const { eq, and } = await import("drizzle-orm");
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        
        const draft = await db.select()
          .from(drafts)
          .where(and(
            eq(drafts.userId, ctx.user.id),
            eq(drafts.pageType, input.pageType)
          ))
          .limit(1);
        
        return draft[0] || null;
      }),

    // Delete a draft
    delete: protectedProcedure
      .input(z.object({
        pageType: z.enum(["generate", "repurpose", "series", "ab_test", "engagement"]),
      }))
      .mutation(async ({ ctx, input }) => {
        const { getDb } = await import("./db");
        const { drafts } = await import("../drizzle/schema");
        const { eq, and } = await import("drizzle-orm");
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        
        await db.delete(drafts)
          .where(and(
            eq(drafts.userId, ctx.user.id),
            eq(drafts.pageType, input.pageType)
          ));
        
        return { success: true };
      }),

    // List all drafts for user
    list: protectedProcedure.query(async ({ ctx }) => {
      const { getDb } = await import("./db");
      const { drafts } = await import("../drizzle/schema");
      const { eq, desc } = await import("drizzle-orm");
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      const userDrafts = await db.select()
        .from(drafts)
        .where(eq(drafts.userId, ctx.user.id))
        .orderBy(desc(drafts.lastSavedAt));
      
      return userDrafts;
    }),
  }),

  // Telegram Bot Integration
  telegram: router({
    // Generate link code for connecting Telegram account
    generateLinkCode: protectedProcedure.mutation(async ({ ctx }) => {
      const { getDb } = await import("./db");
      const { telegramLinks } = await import("../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Generate random 8-character code
      const linkCode = Math.random().toString(36).substring(2, 10).toUpperCase();
      const expiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      // Check if user already has a link
      const existing = await db.select()
        .from(telegramLinks)
        .where(eq(telegramLinks.userId, ctx.user.id))
        .limit(1);

      if (existing.length > 0) {
        // Update link code
        await db.update(telegramLinks)
          .set({ linkCode, linkCodeExpiry: expiry })
          .where(eq(telegramLinks.userId, ctx.user.id));
      } else {
        // Create new link entry
        await db.insert(telegramLinks).values({
          userId: ctx.user.id,
          telegramUserId: "", // Will be filled when user sends code
          linkCode,
          linkCodeExpiry: expiry,
          isActive: false,
        });
      }

      return { linkCode, expiresAt: expiry };
    }),

    // Get current Telegram connection status
    getStatus: protectedProcedure.query(async ({ ctx }) => {
      const { getDb } = await import("./db");
      const { telegramLinks } = await import("../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const link = await db.select()
        .from(telegramLinks)
        .where(eq(telegramLinks.userId, ctx.user.id))
        .limit(1);

      if (link.length === 0) {
        return { connected: false };
      }

      return {
        connected: link[0].isActive,
        telegramUsername: link[0].telegramUsername,
        telegramFirstName: link[0].telegramFirstName,
        linkedAt: link[0].linkedAt,
      };
    }),

    // Disconnect Telegram
    disconnect: protectedProcedure.mutation(async ({ ctx }) => {
      const { getDb } = await import("./db");
      const { telegramLinks } = await import("../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      await db.delete(telegramLinks)
        .where(eq(telegramLinks.userId, ctx.user.id));

      return { success: true };
    }),

    // Get recent posts generated via Telegram (last 10)
    getRecentPosts: protectedProcedure.query(async ({ ctx }) => {
      const { getDb } = await import("./db");
      const { posts } = await import("../drizzle/schema");
      const { eq, desc } = await import("drizzle-orm");
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const recentPosts = await db.select()
        .from(posts)
        .where(eq(posts.userId, ctx.user.id))
        .orderBy(desc(posts.createdAt))
        .limit(10);

      return recentPosts;
    }),

    // Generate 3 alternative versions of a post
    generateAlternatives: protectedProcedure
      .input(z.object({ postId: z.number(), rawInput: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const { invokeLLM } = await import("./_core/llm");

        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content: "Du er en ekspert på sosiale medier. Generer 3 FORSKJELLIGE versjoner av et LinkedIn-innlegg basert på brukerens idé. Hver versjon skal ha en unik vinkling: 1) Profesjonell/formell, 2) Personlig/historiefortelling, 3) Kort og engasjerende. Skriv på norsk. Svar i JSON format: {\"alt1\": \"...\", \"alt2\": \"...\", \"alt3\": \"...\"}"
            },
            {
              role: "user",
              content: `Idé: ${input.rawInput}\n\nGenerer 3 forskjellige versjoner av dette innlegget.`
            }
          ],
        });

        const content = response.choices[0].message.content;
        const parsed = JSON.parse(typeof content === "string" ? content : JSON.stringify(content));

        return {
          alternatives: [parsed.alt1, parsed.alt2, parsed.alt3]
        };
      }),

    // Save post to "Mine innlegg" (already saved, just return success)
    savePost: protectedProcedure
      .input(z.object({ postId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        // Post is already in "posts" table, so it's already saved
        // This endpoint exists for UI consistency
        return { success: true, message: "Post is already saved in Mine innlegg" };
      }),

    // Delete post
    deletePost: protectedProcedure
      .input(z.object({ postId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const { getDb } = await import("./db");
        const { posts } = await import("../drizzle/schema");
        const { eq, and } = await import("drizzle-orm");
        const db = await getDb();
        if (!db) throw new Error("Database not available");

        await db.delete(posts)
          .where(and(
            eq(posts.id, input.postId),
            eq(posts.userId, ctx.user.id)
          ));

        return { success: true };
      }),

    // Move idea to Idea Bank
    moveToIdeaBank: protectedProcedure
      .input(z.object({ postId: z.number(), rawInput: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const { getDb } = await import("./db");
        const { ideas, posts } = await import("../drizzle/schema");
        const { eq, and } = await import("drizzle-orm");
        const db = await getDb();
        if (!db) throw new Error("Database not available");

        // Add to idea bank
        await db.insert(ideas).values({
          userId: ctx.user.id,
          ideaText: input.rawInput,
          source: "manual",
          status: "new",
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        // Delete from posts
        await db.delete(posts)
          .where(and(
            eq(posts.id, input.postId),
            eq(posts.userId, ctx.user.id)
          ));

        return { success: true };
      }),

    // Bulk delete posts
    bulkDeletePosts: protectedProcedure
      .input(z.object({ postIds: z.array(z.number()) }))
      .mutation(async ({ ctx, input }) => {
        const { getDb } = await import("./db");
        const { posts } = await import("../drizzle/schema");
        const { inArray, and, eq } = await import("drizzle-orm");
        const db = await getDb();
        if (!db) throw new Error("Database not available");

        await db.delete(posts)
          .where(and(
            inArray(posts.id, input.postIds),
            eq(posts.userId, ctx.user.id)
          ));

        return { success: true, count: input.postIds.length };
      }),

    // Bulk move to idea bank
    bulkMoveToIdeaBank: protectedProcedure
      .input(z.object({ 
        items: z.array(z.object({ 
          postId: z.number(), 
          rawInput: z.string() 
        })) 
      }))
      .mutation(async ({ ctx, input }) => {
        const { getDb } = await import("./db");
        const { ideas, posts } = await import("../drizzle/schema");
        const { inArray, and, eq } = await import("drizzle-orm");
        const db = await getDb();
        if (!db) throw new Error("Database not available");

        // Add all ideas to idea bank
        const ideaValues = input.items.map(item => ({
          userId: ctx.user.id,
          ideaText: item.rawInput,
          source: "manual" as const,
          status: "new" as const,
          createdAt: new Date(),
          updatedAt: new Date(),
        }));
        
        await db.insert(ideas).values(ideaValues);

        // Delete all posts
        const postIds = input.items.map(item => item.postId);
        await db.delete(posts)
          .where(and(
            inArray(posts.id, postIds),
            eq(posts.userId, ctx.user.id)
          ));

        return { success: true, count: input.items.length };
      }),

    // Edit post content
    editPost: protectedProcedure
      .input(z.object({ 
        postId: z.number(), 
        newContent: z.string() 
      }))
      .mutation(async ({ ctx, input }) => {
        const { getDb } = await import("./db");
        const { posts } = await import("../drizzle/schema");
        const { eq, and } = await import("drizzle-orm");
        const db = await getDb();
        if (!db) throw new Error("Database not available");

        await db.update(posts)
          .set({ 
            generatedContent: input.newContent,
            updatedAt: new Date(),
          })
          .where(and(
            eq(posts.id, input.postId),
            eq(posts.userId, ctx.user.id)
          ));

        return { success: true };
      }),

    // Duplicate post (creates a new post with same content)
    duplicatePost: protectedProcedure
      .input(z.object({ postId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const { getDb } = await import("./db");
        const { posts } = await import("../drizzle/schema");
        const { eq, and } = await import("drizzle-orm");
        const db = await getDb();
        if (!db) throw new Error("Database not available");

        // Get the original post
        const [originalPost] = await db.select()
          .from(posts)
          .where(and(
            eq(posts.id, input.postId),
            eq(posts.userId, ctx.user.id)
          ))
          .limit(1);

        if (!originalPost) {
          throw new Error("Post not found");
        }

        // Create duplicate
        const [newPost] = await db.insert(posts).values({
          userId: ctx.user.id,
          platform: originalPost.platform,
          tone: originalPost.tone,
          rawInput: originalPost.rawInput,
          generatedContent: originalPost.generatedContent,
          createdAt: new Date(),
          updatedAt: new Date(),
        }).$returningId();

        return { 
          success: true, 
          newPostId: newPost.id,
          content: originalPost.generatedContent 
        };
      }),

    // Add tag to post
    addTag: protectedProcedure
      .input(z.object({ 
        postId: z.number(), 
        tag: z.string().min(1).max(50) 
      }))
      .mutation(async ({ ctx, input }) => {
        const { getDb } = await import("./db");
        const { posts } = await import("../drizzle/schema");
        const { eq, and, sql } = await import("drizzle-orm");
        const db = await getDb();
        if (!db) throw new Error("Database not available");

        // Get current post
        const [post] = await db.select()
          .from(posts)
          .where(and(
            eq(posts.id, input.postId),
            eq(posts.userId, ctx.user.id)
          ))
          .limit(1);

        if (!post) {
          throw new Error("Post not found");
        }

        // Get current tags or initialize empty array
        const currentTags: string[] = post.tags ? (Array.isArray(post.tags) ? post.tags : []) : [];
        
        // Add tag if not already present
        if (!currentTags.includes(input.tag)) {
          const newTags = [...currentTags, input.tag];
          await db.update(posts)
            .set({ 
              tags: newTags,
              updatedAt: new Date(),
            })
            .where(and(
              eq(posts.id, input.postId),
              eq(posts.userId, ctx.user.id)
            ));
        }

        return { success: true };
      }),

    // Remove tag from post
    removeTag: protectedProcedure
      .input(z.object({ 
        postId: z.number(), 
        tag: z.string() 
      }))
      .mutation(async ({ ctx, input }) => {
        const { getDb } = await import("./db");
        const { posts } = await import("../drizzle/schema");
        const { eq, and } = await import("drizzle-orm");
        const db = await getDb();
        if (!db) throw new Error("Database not available");

        // Get current post
        const [post] = await db.select()
          .from(posts)
          .where(and(
            eq(posts.id, input.postId),
            eq(posts.userId, ctx.user.id)
          ))
          .limit(1);

        if (!post) {
          throw new Error("Post not found");
        }

        // Get current tags
        const currentTags: string[] = post.tags ? (Array.isArray(post.tags) ? post.tags : []) : [];
        
        // Remove tag
        const newTags = currentTags.filter(t => t !== input.tag);
        await db.update(posts)
          .set({ 
            tags: newTags,
            updatedAt: new Date(),
          })
          .where(and(
            eq(posts.id, input.postId),
            eq(posts.userId, ctx.user.id)
          ));

        return { success: true };
      }),

    // Get all unique tags for user
    getAllTags: protectedProcedure
      .query(async ({ ctx }) => {
        const { getDb } = await import("./db");
        const { posts } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        const db = await getDb();
        if (!db) throw new Error("Database not available");

        // Get all posts for user
        const userPosts = await db.select()
          .from(posts)
          .where(eq(posts.userId, ctx.user.id));

        // Extract and deduplicate tags
        const allTags = new Set<string>();
        userPosts.forEach(post => {
          if (post.tags && Array.isArray(post.tags)) {
            post.tags.forEach((tag: string) => allTags.add(tag));
          }
        });

        return { tags: Array.from(allTags).sort() };
      }),
  }),

  // Google Trends Integration - using new trendsRouter
  trends: trendsRouter,

  linkedin: router({    // Save LinkedIn app credentials (owner only)
    saveCredentials: protectedProcedure
      .input(z.object({
        clientId: z.string().min(1),
        clientSecret: z.string().min(1),
      }))
      .mutation(async ({ ctx, input }) => {
        // Platform-wide LinkedIn OAuth credentials — admin only.
        if ((ctx.user as any)?.role !== "admin") throw new Error("Unauthorized");
        const { getDb } = await import("./db");
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const { linkedinAppCredentials } = await import("../drizzle/schema");

        // Check if credentials already exist
        const existing = await db.select().from(linkedinAppCredentials).limit(1);
        
        if (existing.length > 0) {
          // Update existing
          const { eq } = await import("drizzle-orm");
          await db.update(linkedinAppCredentials)
            .set({
              clientId: input.clientId,
              clientSecret: input.clientSecret,
            })
            .where(eq(linkedinAppCredentials.id, existing[0].id));
        } else {
          // Insert new
          await db.insert(linkedinAppCredentials).values({
            clientId: input.clientId,
            clientSecret: input.clientSecret,
          });
        }
        
        return { success: true };
      }),

    // Get LinkedIn app credentials (admin only)
    getCredentials: protectedProcedure.query(async ({ ctx }) => {
      if ((ctx.user as any)?.role !== "admin") throw new Error("Unauthorized");
      const { getDb } = await import("./db");
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const { linkedinAppCredentials } = await import("../drizzle/schema");

      const credentials = await db.select().from(linkedinAppCredentials).limit(1);
      
      if (credentials.length === 0) {
        return null;
      }
      
      // Return only clientId (hide secret)
      return {
        clientId: credentials[0].clientId,
        configured: true,
      };
    }),

    // Get LinkedIn authorization URL
    getAuthUrl: protectedProcedure.query(async ({ ctx }) => {
      const { getDb } = await import("./db");
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const { linkedinAppCredentials } = await import("../drizzle/schema");
      const { getLinkedInAuthUrl } = await import("./linkedinService");
      
      const credentials = await db.select().from(linkedinAppCredentials).limit(1);
      
      if (credentials.length === 0) {
        throw new Error("LinkedIn credentials not configured");
      }
      
      const redirectUri = `${ctx.req.headers.origin}/api/linkedin/callback`;
      const { signOAuthState } = await import("./_core/oauthState");
      const state = signOAuthState(ctx.user.id); // HMAC-signed, tamper-proof CSRF state
      
      const authUrl = getLinkedInAuthUrl(
        {
          clientId: credentials[0].clientId,
          clientSecret: credentials[0].clientSecret,
        },
        redirectUri,
        state
      );
      
      return { url: authUrl, state };
    }),

    // Get user's LinkedIn connection status
    getConnectionStatus: protectedProcedure.query(async ({ ctx }) => {
      const { getDb } = await import("./db");
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const { linkedinConnections } = await import("../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const { isTokenExpired } = await import("./linkedinService");
      
      const connection = await db.select()
        .from(linkedinConnections)
        .where(eq(linkedinConnections.userId, ctx.user.id))
        .limit(1);
      
      if (connection.length === 0) {
        return { connected: false };
      }
      
      const expired = isTokenExpired(connection[0].expiresAt);
      
      return {
        connected: !expired,
        profileName: connection[0].profileName,
        profileEmail: connection[0].profileEmail,
        expiresAt: connection[0].expiresAt,
      };
    }),

    // Disconnect LinkedIn
    disconnect: protectedProcedure.mutation(async ({ ctx }) => {
      const { getDb } = await import("./db");
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const { linkedinConnections } = await import("../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      
      await db.delete(linkedinConnections)
        .where(eq(linkedinConnections.userId, ctx.user.id));
      
      return { success: true };
    }),

    // Create LinkedIn post
    createPost: protectedProcedure
      .input(z.object({
        content: z.string().min(1).max(3000),
      }))
      .mutation(async ({ ctx, input }) => {
        const { getDb } = await import("./db");
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const { linkedinConnections } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        const { createLinkedInPost, isTokenExpired } = await import("./linkedinService");
        
        // Get user's LinkedIn connection
        const connection = await db.select()
          .from(linkedinConnections)
          .where(eq(linkedinConnections.userId, ctx.user.id))
          .limit(1);
        
        if (connection.length === 0) {
          throw new Error("LinkedIn not connected");
        }
        
        // Check if token expired
        if (isTokenExpired(connection[0].expiresAt)) {
          throw new Error("LinkedIn token expired. Please reconnect.");
        }
        
        // Create post (token is encrypted at rest)
        const { decryptSecret } = await import("./_core/tokenCrypto");
        const result = await createLinkedInPost(
          decryptSecret(connection[0].accessToken) ?? "",
          connection[0].personUrn,
          input.content
        );
        
        return result;
      }),
  }),

  scheduler: router({
    // Manually trigger scheduled posts processing (for testing)
    triggerNow: protectedProcedure.mutation(async () => {
      const { triggerScheduledPosts } = await import('./schedulerService');
      await triggerScheduledPosts();
      return { success: true, message: 'Scheduled posts processing triggered' };
    }),
  }),



  voice: voiceRouter,
  langchain: langchainRouter,
  analytics: analyticsRouter,
  scheduling: schedulingRouter,
  postManagement: postManagementRouter,
  contentEnhancement: contentEnhancementRouter,
  search: searchRouter,
  settings: settingsRouter,
  platform: platformRouter,
  faq: faqRouter,
  memberMonitoring: memberMonitoringRouter,
  hashtags: hashtagRouter,

  templates: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const { getUserSavedExamples } = await import("./db");
      return getUserSavedExamples(ctx.user.id);
    }),

    save: protectedProcedure
      .input(z.object({
        title: z.string().min(1).max(200),
        platform: z.enum(["linkedin", "twitter", "instagram", "facebook"]),
        tone: z.string().min(1),
        rawInput: z.string().min(1),
        generatedContent: z.string().min(1),
        postId: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { createSavedExample } = await import("./db");
        return createSavedExample({
          userId: ctx.user.id,
          postId: input.postId || 0,
          title: input.title,
          platform: input.platform,
          tone: input.tone,
          rawInput: input.rawInput,
          generatedContent: input.generatedContent,
        });
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const { getSavedExampleById, deleteSavedExample } = await import("./db");
        const example = await getSavedExampleById(input.id);
        if (!example || example.userId !== ctx.user.id) {
          throw new Error("Mal ikke funnet");
        }
        await deleteSavedExample(input.id);
        return { success: true };
      }),

    use: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const { getSavedExampleById, incrementExampleUsage } = await import("./db");
        const example = await getSavedExampleById(input.id);
        if (!example || example.userId !== ctx.user.id) {
          throw new Error("Mal ikke funnet");
        }
        await incrementExampleUsage(input.id);
        return example;
      }),
  }),
});

export type AppRouter = typeof appRouter;
