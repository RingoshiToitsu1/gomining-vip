import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

const AW_URL = process.env.AUCTIONWRITER_API_URL || "https://api.auctionwriter.com/v1";
const AW_KEY = process.env.AUCTIONWRITER_API_KEY || "";
const GEMINI_KEY = process.env.GEMINI_API_KEY || "";

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
        // Fall through to Gemini vision
      }
    }

    // Google Gemini Vision analysis (free tier)
    if (GEMINI_KEY) {
      const genAI = new GoogleGenerativeAI(GEMINI_KEY);
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

      // Build image parts (up to 4 images)
      const imageParts: { inlineData: { mimeType: string; data: string } }[] = [];
      for (const img of images.slice(0, 4)) {
        const match = img.match(/^data:(image\/\w+);base64,(.+)$/);
        if (match) {
          imageParts.push({ inlineData: { mimeType: match[1], data: match[2] } });
        }
      }

      const prompt = `You are an expert auction appraiser. Analyze this item image and respond with ONLY a JSON object (no markdown, no code fences, no explanation):

{
  "title": "concise auction-ready title",
  "description": "detailed 2-3 sentence description including material, era/age, dimensions if apparent, notable features, and condition observations",
  "category": "one of: ${VALID_CATEGORIES.join(", ")}",
  "condition": "one of: ${VALID_CONDITIONS.join(", ")}",
  "priceLow": number (low estimate in USD),
  "priceHigh": number (high estimate in USD)
}

${additionalContext ? `Additional context from the seller: ${additionalContext}` : ""}

Be specific and accurate. Price based on current secondhand/auction market values.`;

      const result = await model.generateContent([prompt, ...imageParts]);
      const text = result.response.text();

      try {
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
      { success: false, error: "No AI service configured. Get a free Gemini API key at aistudio.google.com/apikey and add GEMINI_API_KEY to your .env file." },
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
