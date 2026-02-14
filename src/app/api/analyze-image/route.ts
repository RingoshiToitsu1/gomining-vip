import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const AW_URL = process.env.AUCTIONWRITER_API_URL || "https://api.auctionwriter.com/v1";
const AW_KEY = process.env.AUCTIONWRITER_API_KEY || "";
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || "";

const VALID_CATEGORIES = [
  "FURNITURE","ELECTRONICS","JEWELRY","ART","COLLECTIBLES","ANTIQUES",
  "TOOLS","WATCHES","HOME_DECOR","OTHER",
];
const VALID_CONDITIONS = ["NEW","LIKE_NEW","EXCELLENT","GOOD","FAIR","POOR"];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { images, additionalContext } = body;

    if (!images || !Array.isArray(images) || images.length === 0) {
      return NextResponse.json(
        { success: false, error: "At least one image is required" },
        { status: 400 }
      );
    }

    // Try AuctionWriter API first
    if (AW_KEY) {
      try {
        const awRes = await fetch(`${AW_URL}/appraise`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${AW_KEY}`,
          },
          body: JSON.stringify({ images, additional_context: additionalContext }),
          signal: AbortSignal.timeout(15000),
        });

        if (awRes.ok) {
          const data = await awRes.json();
          return NextResponse.json({
            success: true,
            data: {
              title: data.title || data.name || "",
              description: data.description || data.listing_description || "",
              category: data.category || "OTHER",
              condition: data.condition || "GOOD",
              priceLow: data.price_range?.low || data.estimated_low || 0,
              priceHigh: data.price_range?.high || data.estimated_high || 0,
              tags: data.tags || data.keywords || [],
            },
          });
        }
      } catch {
        // Fall through to Claude vision
      }
    }

    // Claude Vision analysis
    if (ANTHROPIC_KEY) {
      const client = new Anthropic({ apiKey: ANTHROPIC_KEY });

      // Build image content blocks (up to 4 images to keep token cost low)
      const imageBlocks: Anthropic.ImageBlockParam[] = images.slice(0, 4).map((img: string) => {
        // img is a data URL like "data:image/jpeg;base64,..."
        const match = img.match(/^data:(image\/\w+);base64,(.+)$/);
        if (match) {
          return {
            type: "image" as const,
            source: {
              type: "base64" as const,
              media_type: match[1] as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
              data: match[2],
            },
          };
        }
        // If it's a URL, use URL source
        return {
          type: "image" as const,
          source: { type: "url" as const, url: img },
        };
      });

      const message = await client.messages.create({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: [
              ...imageBlocks,
              {
                type: "text",
                text: `You are an expert auction appraiser. Analyze this item image and respond with ONLY a JSON object (no markdown, no code fences):

{
  "title": "concise auction-ready title",
  "description": "detailed 2-3 sentence description including material, era/age, dimensions if apparent, notable features, and condition observations",
  "category": "one of: ${VALID_CATEGORIES.join(", ")}",
  "condition": "one of: ${VALID_CONDITIONS.join(", ")}",
  "priceLow": number (low estimate in USD),
  "priceHigh": number (high estimate in USD)
}

${additionalContext ? `Additional context from the seller: ${additionalContext}` : ""}

Be specific and accurate. Price based on current secondhand/auction market values.`,
              },
            ],
          },
        ],
      });

      const text = message.content[0].type === "text" ? message.content[0].text : "";

      try {
        // Try to parse the JSON response, stripping any markdown fences
        const cleaned = text.replace(/```json?\s*/g, "").replace(/```\s*/g, "").trim();
        const parsed = JSON.parse(cleaned);

        return NextResponse.json({
          success: true,
          data: {
            title: parsed.title || "Untitled Item",
            description: parsed.description || "",
            category: VALID_CATEGORIES.includes(parsed.category) ? parsed.category : "OTHER",
            condition: VALID_CONDITIONS.includes(parsed.condition) ? parsed.condition : "GOOD",
            priceLow: Number(parsed.priceLow) || 0,
            priceHigh: Number(parsed.priceHigh) || 0,
            tags: [],
          },
        });
      } catch {
        // Claude responded but not valid JSON - extract what we can
        return NextResponse.json({
          success: true,
          data: {
            title: "Uploaded Item",
            description: text.slice(0, 500),
            category: "OTHER",
            condition: "GOOD",
            priceLow: 0,
            priceHigh: 0,
            tags: [],
          },
        });
      }
    }

    // No AI keys configured
    return NextResponse.json(
      { success: false, error: "No AI service configured. Add ANTHROPIC_API_KEY to your .env file." },
      { status: 503 }
    );
  } catch (error) {
    console.error("POST /api/analyze-image error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to analyze image" },
      { status: 500 }
    );
  }
}
