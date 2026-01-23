import OpenAI from "openai";
import { storage } from "./storage";
import type { Message } from "@shared/schema";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Keywords that indicate product/purchase intent (Spanish)
const CATALOG_KEYWORDS = [
  "precio", "costo", "cuánto", "cuanto", "producto", "catálogo", "catalogo",
  "comprar", "pedir", "envío", "envio", "entrega", "disponible", "tienen",
  "hay", "busco", "quiero", "necesito", "promoción", "promocion", "descuento",
  "oferta", "stock", "venden", "modelo", "talla", "color", "pago", "contraentrega",
  "berberina", "magnesio", "vitamina", "suplemento", "cápsula", "capsula"
];

function shouldAttachCatalog(userMessage: string): boolean {
  const lowerMessage = userMessage.toLowerCase();
  return CATALOG_KEYWORDS.some(keyword => lowerMessage.includes(keyword));
}

export async function generateAiResponse(
  conversationId: number,
  userMessage: string,
  recentMessages: Message[]
): Promise<{ response: string; imageUrl?: string; tokensUsed: number } | null> {
  try {
    const settings = await storage.getAiSettings();
    if (!settings?.enabled) {
      return null;
    }

    // Get last 3 messages for context (excluding current)
    const conversationHistory = recentMessages
      .slice(-4, -1)
      .map((m) => ({
        role: m.direction === "in" ? "user" : "assistant",
        content: m.text || `[${m.type}]`,
      }));

    const instructions = settings.systemPrompt || "Eres un asistente de ventas amigable.";
    const catalog = settings.catalog || "";
    
    // Only include catalog when user asks about products (saves ~1500+ tokens)
    const includeCatalog = shouldAttachCatalog(userMessage);
    
    // Truncate catalog to max 2000 chars to control token usage
    const truncatedCatalog = catalog.length > 2000 
      ? catalog.substring(0, 2000) + "\n...(más productos disponibles)"
      : catalog;
    
    // Build system prompt
    const systemPrompt = `${instructions}

=== REGLAS ===
- Responde en 2-5 líneas máximo
- Máximo 2 preguntas por respuesta
- Tono humano y cálido
- Para enviar imagen usa: [IMAGEN: url]
${includeCatalog && truncatedCatalog ? `\n=== CATÁLOGO ===\n${truncatedCatalog}` : ""}`;

    const messages: any[] = [
      { role: "system", content: systemPrompt },
      ...conversationHistory,
      { role: "user", content: userMessage },
    ];

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      max_tokens: 120,
      temperature: 0.7,
    });

    const responseText = completion.choices[0]?.message?.content || "";
    const tokensUsed = completion.usage?.total_tokens || 0;

    // Extract image URL if present
    const imageMatch = responseText.match(/\[IMAGEN:\s*(https?:\/\/[^\]]+)\]/i);
    let imageUrl: string | undefined;
    let cleanResponse = responseText;
    
    if (imageMatch) {
      imageUrl = imageMatch[1];
      cleanResponse = responseText.replace(imageMatch[0], "").trim();
    }

    await storage.createAiLog({
      conversationId,
      userMessage,
      aiResponse: responseText,
      tokensUsed,
      success: true,
    });

    return { response: cleanResponse, imageUrl, tokensUsed };
  } catch (error: any) {
    console.error("AI Error:", error);
    
    await storage.createAiLog({
      conversationId,
      userMessage,
      aiResponse: null,
      tokensUsed: 0,
      success: false,
      error: error.message,
    });

    return null;
  }
}
