import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { image } = body;

    if (!image || typeof image !== "string") {
      return NextResponse.json(
        { success: false, error: "An image is required" },
        { status: 400 }
      );
    }

    const apiKey = process.env.ANTHROPIC_API_KEY || "";
    if (!apiKey) {
      console.error("ANTHROPIC_API_KEY is not set in environment");
      return NextResponse.json(
        { success: false, error: "Appraisal service unavailable" },
        { status: 503 }
      );
    }

    const match = image.match(/^data:(image\/[\w+.-]+);base64,(.+)/);
    if (!match) {
      return NextResponse.json(
        { success: false, error: "Invalid image format" },
        { status: 400 }
      );
    }

    const client = new Anthropic({ apiKey });

    const message = await client.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: match[1] as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
                data: match[2],
              },
            },
            {
              type: "text",
              text: `You are a seasoned professional estate auctioneer with 30+ years of experience appraising items at estate sales, auctions, and antique shows across the United States. You have deep knowledge of current market values, collector demand, and pricing trends.

Analyze this item and provide a professional appraisal. Respond with ONLY a JSON object (no markdown, no code fences):

{
  "title": "concise item identification",
  "lowEstimate": number (conservative low estimate in USD),
  "highEstimate": number (optimistic high estimate in USD),
  "reasoning": "2-4 sentences of professional auctioneer reasoning explaining the price range. Mention specific factors: age/era, material, condition observations, maker/brand if identifiable, current market demand, comparable recent sales, and what would push it toward the high or low end. Write in first person as an auctioneer would speak to a client.",
  "category": "one of: FURNITURE, ELECTRONICS, JEWELRY, ART, COLLECTIBLES, ANTIQUES, TOOLS, WATCHES, HOME_DECOR, OTHER",
  "condition": "one of: NEW, LIKE_NEW, EXCELLENT, GOOD, FAIR, POOR",
  "era": "approximate era or decade if identifiable, e.g. '1960s', 'Victorian', 'Mid-Century Modern'",
  "demandLevel": "one of: HIGH, MODERATE, LOW"
}

Be honest and realistic with pricing. Base values on actual secondhand/auction market — not retail replacement cost.`,
            },
          ],
        },
      ],
    });

    const text = message.content[0].type === "text" ? message.content[0].text : "";

    try {
      const cleaned = text.replace(/```json?\s*/g, "").replace(/```\s*/g, "").trim();
      const parsed = JSON.parse(cleaned);
      return NextResponse.json({ success: true, data: parsed });
    } catch {
      return NextResponse.json(
        { success: false, error: "Could not parse appraisal response" },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("POST /api/appraise error:", error);
    return NextResponse.json(
      { success: false, error: "Appraisal failed. Please try again." },
      { status: 500 }
    );
  }
}
