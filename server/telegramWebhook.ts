/**
 * Telegram Webhook Handler
 * Processes incoming messages from Telegram Bot
 */

import type { Request, Response } from "express";
import { sendTelegramMessage } from "./telegramService";

export async function handleTelegramWebhook(req: Request, res: Response) {
  try {
    const update = req.body;
    
    // Ignore non-message updates
    if (!update.message || !update.message.text) {
      return res.json({ ok: true });
    }

    const message = update.message;
    const chatId = message.chat.id;
    const text = message.text.trim();
    const telegramUserId = message.from.id.toString();
    const telegramUsername = message.from.username;
    const telegramFirstName = message.from.first_name;

    // Import database helpers
    const { getDb } = await import("./db");
    const { telegramLinks, posts } = await import("../drizzle/schema");
    const { eq, and, gt } = await import("drizzle-orm");
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Check if user is linked
    const link = await db.select()
      .from(telegramLinks)
      .where(eq(telegramLinks.telegramUserId, telegramUserId))
      .limit(1);

    // Handle /start command
    if (text.startsWith("/start")) {
      if (link.length > 0 && link[0].isActive) {
        await sendTelegramMessage(chatId, 
          `Velkommen tilbake, ${telegramFirstName}! 👋\n\n` +
          `Send meg en idé, og jeg lager et innlegg for deg.`
        );
      } else {
        await sendTelegramMessage(chatId,
          `Velkommen til Innlegg! 🎉\n\n` +
          `For å koble kontoen din:\n` +
          `1. Logg inn på innlegg.no\n` +
          `2. Gå til Telegram Bot-siden\n` +
          `3. Klikk "Generer koblingskode"\n` +
          `4. Send koden hit\n\n` +
          `Koden ser slik ut: ABC12345`
        );
      }
      return res.json({ ok: true });
    }

    // Handle linking code (8 characters, uppercase)
    if (text.length === 8 && /^[A-Z0-9]+$/.test(text)) {
      // Find link code in database
      const linkEntry = await db.select()
        .from(telegramLinks)
        .where(and(
          eq(telegramLinks.linkCode, text),
          gt(telegramLinks.linkCodeExpiry, new Date())
        ))
        .limit(1);

      if (linkEntry.length === 0) {
        await sendTelegramMessage(chatId,
          `❌ Ugyldig eller utløpt kode.\n\n` +
          `Generer en ny kode på innlegg.no`
        );
        return res.json({ ok: true });
      }

      // Link the account
      await db.update(telegramLinks)
        .set({
          telegramUserId,
          telegramUsername,
          telegramFirstName,
          isActive: true,
          linkCode: null,
          linkCodeExpiry: null,
        })
        .where(eq(telegramLinks.id, linkEntry[0].id));

      await sendTelegramMessage(chatId,
        `✅ Kontoen din er koblet!\n\n` +
        `Send meg en idé, og jeg lager et innlegg for deg.`
      );
      return res.json({ ok: true });
    }

    // Handle idea submission (user must be linked)
    if (link.length === 0 || !link[0].isActive) {
      await sendTelegramMessage(chatId,
        `❌ Du må koble kontoen din først.\n\n` +
        `Send /start for instruksjoner.`
      );
      return res.json({ ok: true });
    }

    // Generate post from idea
    await sendTelegramMessage(chatId, `⏳ Genererer innlegg...`);

    try {
      // Use OpenAI to generate post (NOT Manus LLM - commercial project)
      const { invokeLLM } = await import("./_core/llm");
      
      const response = await invokeLLM({
        messages: [
          {
            role: "system",
            content: "Du er en ekspert på sosiale medier. Lag ETT ENKELT, KORT og engasjerende LinkedIn-innlegg basert på brukerens idé. Skriv på norsk. IKKE lag flere forslag - bare ett innlegg klart til bruk. Maks 200 ord. Inkluder relevante hashtags på slutten."
          },
          {
            role: "user",
            content: `Lag et LinkedIn-innlegg basert på denne idéen:\n\n${text}`
          }
        ],
      });

      const content = response.choices[0].message.content;
      const generatedContent = typeof content === 'string' ? content : '';

      // Save to database
      const result = await db.insert(posts).values({
        userId: link[0].userId,
        platform: "linkedin" as const,
        tone: "professional",
        rawInput: text,
        generatedContent,
      });

      // Send result to user with link to dashboard
      const dashboardUrl = process.env.VITE_FRONTEND_FORGE_API_URL?.replace('/api', '') || 'https://innlegg.no';
      await sendTelegramMessage(chatId,
        `✅ Innlegget ditt er klart!\n\n` +
        `${generatedContent}\n\n` +
        `💡 Vil du ha flere alternativer?\n` +
        `👉 Åpne dashbordet: ${dashboardUrl}/dashboard`
      );
    } catch (error) {
      console.error("[Telegram] Error generating post:", error);
      await sendTelegramMessage(chatId,
        `❌ Kunne ikke generere innlegg. Prøv igjen senere.`
      );
    }

    return res.json({ ok: true });
  } catch (error) {
    console.error("[Telegram] Webhook error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
