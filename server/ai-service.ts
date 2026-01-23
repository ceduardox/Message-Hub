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

    // Always include compact product list
    const compactList = trainingData
      .filter((d) => d.type === "text")
      .slice(0, 15)
      .map((d) => {
        // Extract just title or first 50 chars
        const shortContent = d.content.substring(0, 50).split('\n')[0];
        return `• ${d.title || shortContent}`;
      })
      .join("\n");

    // Check if user mentions a specific product name from training data
    const mentionedProduct = trainingData.find((d) => {
      if (!d.title) return false;
      const productName = d.title.toLowerCase();
      return lowerMessage.includes(productName) || productName.includes(lowerMessage.replace(/[?¿!¡]/g, '').trim());
    });

    // Build context: compact list always + full details if product mentioned
    let trainingContextShort = `PRODUCTOS DISPONIBLES:\n${compactList || "No hay productos cargados"}`;
    
    if (mentionedProduct) {
      const content = mentionedProduct.content.length > 300 
        ? mentionedProduct.content.substring(0, 300) + "..." 
        : mentionedProduct.content;
      trainingContextShort += `\n\nDETALLE ${mentionedProduct.title?.toUpperCase()}:\n${content}`;
      
      // Find related image
      const relatedImage = trainingData.find(
        (d) => d.type === "image_url" && d.title?.toLowerCase().includes(mentionedProduct.title?.toLowerCase() || "")
      );
      if (relatedImage) {
        trainingContextShort += `\n[IMAGEN DISPONIBLE]: ${relatedImage.content}`;
      }
    }

    // Also include images list
    const imagesList = trainingData
      .filter((d) => d.type === "image_url")
      .slice(0, 8)
      .map((d) => `• ${d.title}: ${d.content}`)
      .join("\n");
    
    if (imagesList) {
      trainingContextShort += `\n\nIMÁGENES DISPONIBLES:\n${imagesList}`;
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
