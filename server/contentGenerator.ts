/**
 * Content Generation Service using OpenAI GPT-4
 * This service generates social media content based on user input
 */

interface GenerateContentParams {
  rawInput: string;
  platform: "linkedin" | "twitter" | "instagram" | "facebook";
  tone: "professional" | "friendly" | "motivational" | "educational";
  voiceSamples?: string[]; // User's writing samples for personalization
  language?: "no" | "en";
}

interface GenerateContentResult {
  content: string;
  platform: string;
  tone: string;
}

/**
 * Platform-specific content guidelines
 */
const PLATFORM_GUIDELINES = {
  linkedin: {
    maxLength: 3000,
    style: "Professional, structured with paragraphs, use relevant hashtags (3-5)",
    format: "Start with a hook, add value, end with engagement question",
  },
  twitter: {
    maxLength: 280,
    style: "Concise, impactful, use 1-2 relevant hashtags",
    format: "Direct and punchy, one main idea",
  },
  instagram: {
    maxLength: 2200,
    style: "Engaging, visual-friendly, use emojis and 5-10 hashtags",
    format: "Storytelling approach, relatable and authentic",
  },
  facebook: {
    maxLength: 63206,
    style: "Conversational, friendly, community-focused",
    format: "Personal touch, encourage discussion",
  },
};

/**
 * Tone-specific instructions
 */
const TONE_INSTRUCTIONS = {
  professional: "Maintain a professional, authoritative tone. Use industry terminology appropriately.",
  friendly: "Use a warm, approachable tone. Be conversational and relatable.",
  motivational: "Be inspiring and encouraging. Use positive language and call-to-action.",
  educational: "Be informative and clear. Explain concepts in an accessible way.",
};

/**
 * Build the system prompt for OpenAI
 */
function buildSystemPrompt(
  platform: string,
  tone: string,
  voiceSamples: string[],
  language: "no" | "en"
): string {
  const guidelines = PLATFORM_GUIDELINES[platform as keyof typeof PLATFORM_GUIDELINES];
  const toneInstruction = TONE_INSTRUCTIONS[tone as keyof typeof TONE_INSTRUCTIONS];
  
  const languageInstruction = language === "no" 
    ? "Write in Norwegian Bokmål. Use proper Norwegian grammar and vocabulary."
    : "Write in English. Use proper English grammar and vocabulary.";
  
  let prompt = `You are an expert social media content creator specializing in ${platform}.

${languageInstruction}

Platform Guidelines:
- Maximum length: ${guidelines.maxLength} characters
- Style: ${guidelines.style}
- Format: ${guidelines.format}

Tone: ${toneInstruction}

`;

  if (voiceSamples && voiceSamples.length > 0) {
    prompt += `\nPersonalization: The user has provided writing samples. Analyze their writing style and mimic it:\n\n`;
    voiceSamples.forEach((sample, index) => {
      prompt += `Sample ${index + 1}:\n${sample}\n\n`;
    });
    prompt += `Match the user's writing style, vocabulary choices, sentence structure, and personality.\n\n`;
  }

  prompt += `Task: Transform the user's raw idea into a polished, ready-to-publish ${platform} post that follows all guidelines above.`;

  return prompt;
}

/**
 * Generate content using OpenAI API
 */
export async function generateContent(
  params: GenerateContentParams
): Promise<GenerateContentResult> {
  const {
    rawInput,
    platform,
    tone,
    voiceSamples = [],
    language = "no",
  } = params;

  const forgeApiUrl = process.env.BUILT_IN_FORGE_API_URL || "https://api.openai.com";
  const apiKey = process.env.BUILT_IN_FORGE_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("API key is not configured");
  }

  const systemPrompt = buildSystemPrompt(platform, tone, voiceSamples, language);

  try {
    const response = await fetch(`${forgeApiUrl.replace(/\/$/, "")}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content: rawInput,
          },
        ],
        temperature: 0.7,
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`OpenAI API error: ${error.error?.message || response.statusText}`);
    }

    const data = await response.json();
    const generatedContent = data.choices[0]?.message?.content?.trim();

    if (!generatedContent) {
      throw new Error("No content generated from OpenAI");
    }

    return {
      content: generatedContent,
      platform,
      tone,
    };
  } catch (error) {
    console.error("Content generation error:", error);
    throw error;
  }
}

/**
 * Validate content length for platform
 */
export function validateContentLength(content: string, platform: string): boolean {
  const guidelines = PLATFORM_GUIDELINES[platform as keyof typeof PLATFORM_GUIDELINES];
  return content.length <= guidelines.maxLength;
}
