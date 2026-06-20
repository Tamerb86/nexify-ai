// Extracted from server/routers.ts (app-layer feature router).
import { protectedProcedure, router } from "../_core/trpc";

export const schedulerRouter = router({
    // Manually trigger scheduled posts processing (for testing)
    triggerNow: protectedProcedure.mutation(async () => {
      const { triggerScheduledPosts } = await import('../schedulerService');
      await triggerScheduledPosts();
      return { success: true, message: 'Scheduled posts processing triggered' };
    }),
  });
