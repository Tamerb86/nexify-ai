import OpenAI from "openai";

const forgeApiUrl = process.env.BUILT_IN_FORGE_API_URL || "https://api.openai.com";
const forgeApiKey = process.env.BUILT_IN_FORGE_API_KEY || process.env.OPENAI_API_KEY || "";

const openai = new OpenAI({
  apiKey: forgeApiKey,
  baseURL: `${forgeApiUrl.replace(/\/$/, "")}/v1`,
});

export type Platform = "linkedin" | "twitter" | "instagram" | "facebook";

export type ContentTone = "professional" | "casual" | "friendly" | "formal" | "humorous";

export interface GenerateContentParams {
  platform: Platform;
  topic: string;
  tone?: ContentTone;
  length?: "short" | "medium" | "long";
  keywords?: string[];
}

const platformInstructions = {
  linkedin: {
    maxLength: 3000,
    style: "Professional networking content with insights and value. Use line breaks for readability. Include relevant hashtags (3-5).",
    format: "Start with a hook, provide value, end with a call-to-action or question.",
  },
  twitter: {
    maxLength: 280,
    style: "Concise, engaging, and punchy. Use 1-2 relevant hashtags.",
    format: "Hook + value in under 280 characters. Make every word count.",
  },
  instagram: {
    maxLength: 2200,
    style: "Visual storytelling with emojis and line breaks. Include 10-15 relevant hashtags at the end.",
    format: "Engaging caption that complements visual content. Use emojis strategically.",
  },
  facebook: {
    maxLength: 63206,
    style: "Conversational and engaging. Encourage comments and shares.",
    format: "Start with attention-grabbing hook, tell a story, end with engagement prompt.",
  },
};

export async function generateContent(params: GenerateContentParams): Promise<string> {
  const { platform, topic, tone = "professional", length = "medium", keywords = [] } = params;
  
  const platformInfo = platformInstructions[platform];
  
  const lengthGuidelines = {
    short: "Keep it brief and impactful",
    medium: "Provide good detail and value",
    long: "Create comprehensive, in-depth content",
  };

  const systemPrompt = `You are an expert social media content creator specializing in ${platform} content.
Your task is to create engaging, high-quality content that drives engagement and provides value.

Platform: ${platform}
Style Guidelines: ${platformInfo.style}
Format: ${platformInfo.format}
Max Length: ${platformInfo.maxLength} characters
Tone: ${tone}
Length Preference: ${lengthGuidelines[length]}

IMPORTANT:
- Write ONLY the final content, no meta-commentary
- Do NOT include phrases like "Here's a post" or "This content"
- Start directly with the content itself
- Follow ${platform} best practices
- Make it authentic and valuable
${keywords.length > 0 ? `- Naturally incorporate these keywords: ${keywords.join(", ")}` : ""}`;

  const userPrompt = `Create a ${platform} post about: ${topic}`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.8,
      max_tokens: platform === "twitter" ? 100 : 1000,
    });

    const content = completion.choices[0]?.message?.content || "";
    
    // Ensure content doesn't exceed platform limits
    if (content.length > platformInfo.maxLength) {
      return content.substring(0, platformInfo.maxLength - 3) + "...";
    }
    
    return content.trim();
  } catch (error) {
    console.error("Error generating content with OpenAI:", error);
    throw new Error("Failed to generate content. Please try again.");
  }
}

export async function improveContent(
  originalContent: string,
  platform: Platform,
  improvementType: "grammar" | "engagement" | "clarity" | "tone"
): Promise<string> {
  const improvementPrompts = {
    grammar: "Fix any grammar, spelling, or punctuation errors while preserving the original meaning and style.",
    engagement: "Rewrite to be more engaging and likely to generate likes, comments, and shares. Keep the core message.",
    clarity: "Improve clarity and readability while maintaining the original message. Make it easier to understand.",
    tone: "Adjust the tone to be more professional and appropriate for the platform while keeping the content.",
  };

  const platformInfo = platformInstructions[platform];

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are an expert ${platform} content editor. ${improvementPrompts[improvementType]}
          
Platform: ${platform}
Style Guidelines: ${platformInfo.style}
Max Length: ${platformInfo.maxLength} characters

Return ONLY the improved content, no explanations or meta-commentary.`,
        },
        {
          role: "user",
          content: originalContent,
        },
      ],
      temperature: 0.7,
      max_tokens: 1000,
    });

    return completion.choices[0]?.message?.content?.trim() || originalContent;
  } catch (error) {
    console.error("Error improving content with OpenAI:", error);
    throw new Error("Failed to improve content. Please try again.");
  }
}

/**
 * Generate image using DALL-E 3
 * @param prompt - Detailed image generation prompt
 * @returns URL of the generated image stored in S3
 */
export async function generateImageWithDallE(prompt: string): Promise<string> {
  try {
    const response = await openai.images.generate({
      model: "dall-e-3",
      prompt: prompt,
      n: 1,
      size: "1024x1024",
      quality: "standard", // or "hd" for higher quality (costs more)
      response_format: "url",
    });

    if (!response.data || response.data.length === 0) {
      throw new Error("No image data returned from DALL-E 3");
    }
    
    const imageUrl = response.data[0]?.url;
    if (!imageUrl) {
      throw new Error("No image URL returned from DALL-E 3");
    }

    // Download the image and upload to S3
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error(`Failed to download image from DALL-E: ${imageResponse.statusText}`);
    }

    const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
    
    // Upload to S3
    const { storagePut } = await import("./storage");
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(7);
    const { url } = await storagePut(
      `generated/dalle-${timestamp}-${randomSuffix}.png`,
      imageBuffer,
      "image/png"
    );

    return url;
  } catch (error) {
    console.error("Error generating image with DALL-E 3:", error);
    throw new Error(`Failed to generate image with DALL-E 3: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}
