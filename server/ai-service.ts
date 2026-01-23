import OpenAI from "openai";
import { storage } from "./storage";
import type { Message } from "@shared/schema";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Keywords that indicate product/purchase intent (Spanish)
const CATALOG_KEYWORDS = [
  "precio", "costo", "cuánto", "cuanto", "producto", "catálogo", "catalogo",
  "comprar", "pedir", "envío", "envio", "entrega", "ubicación", "ubicacion",
  "dirección", "direccion", "disponible", "tienen", "hay", "busco", "quiero",
  "necesito", "promoción", "promocion", "descuento", "oferta", "stock",
  "venden", "modelo", "talla", "color", "pago", "contraentrega"
];

function shouldAttachCatalog(userMessage: string): boolean {
  const lowerMessage = userMessage.toLowerCase();
  return CATALOG_KEYWORDS.some(keyword => lowerMessage.includes(keyword));
}

// === TRAINING DATA CACHE ===
interface TrainingCache {
  data: any[];
  timestamp: number;
  refreshMinutes: number;
}

let trainingCache: TrainingCache | null = null;

export function getTrainingCacheInfo(): { lastUpdated: number | null; refreshMinutes: number } {
  return {
    lastUpdated: trainingCache?.timestamp || null,
    refreshMinutes: trainingCache?.refreshMinutes || 5,
  };
}

export function clearTrainingCache(): void {
  trainingCache = null;
}

async function getCachedTrainingData(refreshMinutes: number): Promise<any[]> {
  const now = Date.now();
  const maxAge = refreshMinutes * 60 * 1000;

  if (trainingCache && (now - trainingCache.timestamp) < maxAge) {
    return trainingCache.data;
  }

  const data = await storage.getAiTrainingData();
  trainingCache = { data, timestamp: now, refreshMinutes };
  return data;
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

    // Get cache refresh setting
    const cacheMinutes = settings.cacheRefreshMinutes || 5;

    // Only load training data if message shows purchase intent
    let trainingContextShort = "";
    if (shouldAttachCatalog(userMessage)) {
      const trainingData = await getCachedTrainingData(cacheMinutes);
      trainingContextShort = trainingData
        .slice(0, 10) // Limit to 10 items max
        .map((d) => {
          if (d.type === "text") {
            // Truncate long content
            const content = d.content.length > 200 ? d.content.substring(0, 200) + "..." : d.content;
            return `• ${d.title || "Info"}: ${content}`;
          } else if (d.type === "image_url") {
            return `• [IMG] ${d.title || "Imagen"}: ${d.content}`;
          }
          return "";
        })
        .filter(Boolean)
        .join("\n");
    }

    // Get last 6 messages EXCLUDING the current one (which is already in recentMessages)
    const conversationHistory = recentMessages
      .slice(-7, -1) // Take 6 messages before the last one
      .map((m) => ({
        role: m.direction === "in" ? "user" : "assistant",
        content: m.text || `[${m.type}]`,
      }));

    const basePrompt = settings.systemPrompt || `Eres Isabella, asistente de ventas.`;
    
    const systemPrompt = `${basePrompt}

=== REGLAS ESTRICTAS ===
- Responde en 2-5 líneas máximo
- Máximo 2 preguntas por respuesta
- No uses listas largas
- Tono humano y cálido
- Si el cliente quiere comprar: pide ubicación para envío
- Menciona contraentrega si aplica
- Para enviar imagen usa: [IMAGEN: url]
${trainingContextShort ? `\n=== PRODUCTOS ===\n${trainingContextShort}` : ""}`;

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
