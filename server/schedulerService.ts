import * as cron from 'node-cron';
import { posts } from '../drizzle/schema';
import { eq, and, lte } from 'drizzle-orm';
import { createLinkedInPost } from './linkedinService';
import { getDb as getDatabase } from './db';
import { notifyOwner } from './_core/notification';

/**
 * Scheduler Service for Auto-posting
 * 
 * Checks for scheduled posts every minute and publishes them automatically
 * when their scheduledFor time has passed.
 */

let schedulerTask: cron.ScheduledTask | null = null;

/**
 * Process scheduled posts that are due for publishing with retry logic
 */
async function processScheduledPosts() {
  let retries = 0;
  const maxRetries = 3;
  
  while (retries < maxRetries) {
    try {
      const db = await getDatabase();
      if (!db) {
        console.warn('[Scheduler] Database not available');
        return;
      }

      const now = new Date();
      
      // Find all LinkedIn posts that are scheduled and due for publishing
      // Only LinkedIn is supported for auto-posting currently
      const duePosts = await db
        .select()
        .from(posts)
        .where(
          and(
            eq(posts.status, 'scheduled'),
            eq(posts.platform, 'linkedin'),
            lte(posts.scheduledFor, now)
          )
        )
        .limit(10); // Process max 10 posts at a time

      if (duePosts.length === 0) {
        return; // No posts to process
      }

      console.log(`[Scheduler] Found ${duePosts.length} posts to publish`);

      for (const post of duePosts) {
        try {
          // Only auto-post to LinkedIn for now
          if (post.platform === 'linkedin') {
            // Get user's LinkedIn connection from database
            const { linkedinConnections } = await import('../drizzle/schema');
            const connection = await db
              .select()
              .from(linkedinConnections)
              .where(eq(linkedinConnections.userId, post.userId))
              .limit(1);

            if (!connection[0]) {
              throw new Error('LinkedIn not connected');
            }

            // Post to LinkedIn (token is encrypted at rest)
            const { decryptSecret } = await import("./_core/tokenCrypto");
            await createLinkedInPost(
              decryptSecret(connection[0].accessToken) ?? "",
              connection[0].personUrn,
              post.generatedContent
            );
            
            // Update post status to published
            await db
              .update(posts)
              .set({
                status: 'published',
                publishedAt: new Date(),
              })
              .where(eq(posts.id, post.id));

            console.log(`[Scheduler] Successfully published post ${post.id} to LinkedIn`);

            // Notify owner
            await notifyOwner({
              title: 'Innlegg publisert',
              content: `Innlegget ble automatisk publisert til LinkedIn.`,
            });
          } else {
            console.log(`[Scheduler] Skipping post ${post.id} - platform ${post.platform} not supported for auto-posting yet`);
          }
        } catch (error) {
          console.error(`[Scheduler] Failed to publish post ${post.id}:`, error);
          
          // Update post status to failed
          try {
            await db
              .update(posts)
              .set({
                status: 'failed',
              })
              .where(eq(posts.id, post.id));
          } catch (dbError) {
            console.error(`[Scheduler] Failed to update post status:`, dbError);
          }

          // Notify owner about failure
          try {
            await notifyOwner({
              title: 'Publisering feilet',
              content: `Kunne ikke publisere innlegget til ${post.platform}. Vennligst sjekk innstillingene.`,
            });
          } catch (notifyError) {
            console.error(`[Scheduler] Failed to notify owner:`, notifyError);
          }
        }
      }
      return; // Successfully processed, exit retry loop
    } catch (error) {
      retries++;
      if (retries < maxRetries) {
        const delay = 1000 * retries; // Exponential backoff: 1s, 2s, 3s
        console.warn(`[Scheduler] Connection error, retrying in ${delay}ms (${retries}/${maxRetries})...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        console.error('[Scheduler] Error processing scheduled posts after retries:', error);
        return;
      }
    }
  }
}

/**
 * Start the scheduler
 * Runs every minute to check for due posts
 */
export function startScheduler() {
  if (schedulerTask) {
    console.log('[Scheduler] Already running');
    return;
  }

  // Run every 5 minutes: '*/5 * * * *'
  schedulerTask = cron.schedule('*/5 * * * *', async () => {
    await processScheduledPosts();
  });

  console.log('[Scheduler] Started - checking for scheduled posts every 5 minutes');
}

/**
 * Stop the scheduler
 */
export function stopScheduler() {
  if (schedulerTask) {
    void schedulerTask.stop();
    schedulerTask = null;
    console.log('[Scheduler] Stopped');
  }
}

/**
 * Manually trigger scheduled posts processing (for testing)
 */
export async function triggerScheduledPosts() {
  console.log('[Scheduler] Manually triggered');
  await processScheduledPosts();
}
