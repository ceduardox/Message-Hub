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
    const trainingData = await getCachedTrainingData(cacheMinutes);
    const lowerMessage = userMessage.toLowerCase();

    // Build compact product list with key info (name + price if available)
    // Let the AI (which is smart) figure out which product the user means
    const productInfo = trainingData
      .filter((d) => d.type === "text")
      .slice(0, 15)
      .map((d) => {
        // Extract price if mentioned in content
        const priceMatch = d.content.match(/(\d{2,4})\s*(bs|bolivianos|usd|\$)/i);
        const price = priceMatch ? ` - ${priceMatch[1]} ${priceMatch[2]}` : "";
        return `• ${d.title || "Producto"}${price}`;
      })
      .join("\n");

    // Build context - let AI be intelligent about matching
    let trainingContext = `CATÁLOGO DE PRODUCTOS:\n${productInfo || "No hay productos cargados"}`;
    
    // Include full product details (compact) so AI has all info to answer
    const productDetails = trainingData
      .filter((d) => d.type === "text")
      .slice(0, 10)
      .map((d) => {
        // Trim content to essential info (first 150 chars)
        const shortContent = d.content.substring(0, 150).replace(/\n/g, ' ');
        return `${d.title}: ${shortContent}`;
      })
      .join("\n");
    
    if (productDetails) {
      trainingContext += `\n\nINFO PRODUCTOS:\n${productDetails}`;
    }

    // Include image URLs compactly (just product name -> URL)
    const imageUrls = trainingData
      .filter((d) => d.type === "image_url")
      .slice(0, 8)
      .map((d) => `${d.title}: ${d.content}`)
      .join("\n");
    
    if (imageUrls) {
      trainingContext += `\n\nIMÁGENES (usa [IMAGEN: url] para enviar):\n${imageUrls}`;
    }

    // Get last 3 messages EXCLUDING the current one (reduced from 6 - saves ~150 tokens)
    const conversationHistory = recentMessages
      .slice(-4, -1) // Take 3 messages before the last one
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
${trainingContext ? `\n=== PRODUCTOS ===\n${trainingContext}` : ""}`;

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
