import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 30;

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || "";

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

    if (!ANTHROPIC_KEY) {
      return NextResponse.json(
        { success: false, error: "No AI service configured" },
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

    const client = new Anthropic({ apiKey: ANTHROPIC_KEY });

    const message = await client.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 100,
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
              text: "You are helping someone search for this item on estate sale and auction websites. Respond with ONLY a short search query (2-5 words) that would find this item or similar items. No quotes, no explanation, just the search terms. Examples: 'brass table lamp', 'vintage oak dresser', 'sterling silver bracelet'.",
            },
          ],
        },
      ],
    });

    const query = message.content[0].type === "text"
      ? message.content[0].text.trim().replace(/^["']|["']$/g, "")
      : "";

    if (!query) {
      return NextResponse.json(
        { success: false, error: "Could not identify the item" },
        { status: 422 }
      );
    }

    return NextResponse.json({ success: true, query });
  } catch (error) {
    console.error("POST /api/search-by-image error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to analyze image" },
      { status: 500 }
    );
  }
}
