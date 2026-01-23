import OpenAI from "openai";
import { storage } from "./storage";
import type { Message, Product } from "@shared/schema";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Order status type
export type OrderStatus = 'pending' | 'ready' | 'delivered' | null;

// Normalize text: lowercase and remove accents
function normalize(text: string): string {
  return text.toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

// Search products by matching name or keywords against user message
function findMatchingProducts(userMessage: string, products: Product[]): Product[] {
  const normalizedMessage = normalize(userMessage);
  
  return products.filter(product => {
    // Check full product name (normalized)
    const normalizedName = normalize(product.name);
    if (normalizedMessage.includes(normalizedName)) {
      return true;
    }
    
    // Check individual words in product name (>2 chars)
    const nameWords = normalizedName.split(/\s+/).filter(w => w.length > 2);
    const nameMatch = nameWords.some(word => normalizedMessage.includes(word));
    
    // Check keywords (normalized)
    const keywordsMatch = product.keywords?.split(/[,\s]+/)
      .filter(k => k.length > 2)
      .some(keyword => normalizedMessage.includes(normalize(keyword)));
    
    return nameMatch || keywordsMatch;
  });
}

// Check if message is asking about products in general
function isProductQuery(userMessage: string): boolean {
  const generalKeywords = [
    "precio", "costo", "cuánto", "cuanto", "producto", "catálogo", "catalogo",
    "comprar", "pedir", "disponible", "tienen", "hay", "busco", "quiero",
    "necesito", "promoción", "promocion", "descuento", "oferta", "stock",
    "venden", "qué venden", "que venden", "lista", "opciones"
  ];
  const lowerMessage = userMessage.toLowerCase();
  return generalKeywords.some(keyword => lowerMessage.includes(keyword));
}

export async function generateAiResponse(
  conversationId: number,
  userMessage: string,
  recentMessages: Message[]
): Promise<{ response: string; imageUrl?: string; tokensUsed: number; orderReady?: boolean } | null> {
  try {
    const settings = await storage.getAiSettings();
    if (!settings?.enabled) {
      return null;
    }

    // Get all products
    const allProducts = await storage.getProducts();
    
    // Find products matching user's message
    const matchingProducts = findMatchingProducts(userMessage, allProducts);
    
    // Get catalog from settings (fallback for products not in database)
    const catalog = settings.catalog || "";
    
    // Build product context
    let productContext = "";
    
    if (matchingProducts.length > 0) {
      // User asked about specific product(s) - include only those
      productContext = matchingProducts.map(p => 
        `${p.name} - ${p.price || "Consultar precio"}\n${p.description || ""}\n${p.imageUrl ? `Imagen: ${p.imageUrl}` : ""}`
      ).join("\n\n");
    } else if (isProductQuery(userMessage)) {
      if (allProducts.length > 0) {
        // General product query - include compact list from database
        productContext = "PRODUCTOS DISPONIBLES:\n" + allProducts.map(p => 
          `• ${p.name} - ${p.price || "Consultar"}`
        ).join("\n");
      } else if (catalog) {
        // Fallback to catalog text if no products in database
        productContext = catalog.substring(0, 1500);
      }
    }

    // Get last 3 messages for context
    const conversationHistory = recentMessages
      .slice(-4, -1)
      .map((m) => ({
        role: m.direction === "in" ? "user" : "assistant",
        content: m.text || `[${m.type}]`,
      }));

    const instructions = settings.systemPrompt || "Eres un asistente de ventas amigable.";
    
    // Build system prompt
    const systemPrompt = `${instructions}

=== REGLAS ===
- Responde en 2-5 líneas máximo
- Máximo 2 preguntas por respuesta
- Tono humano y cálido
- Para enviar imagen usa: [IMAGEN: url]
- IMPORTANTE: Cuando el cliente confirme el pedido con TODOS los datos (producto, cantidad, dirección/ubicación), escribe [PEDIDO_LISTO] al final de tu respuesta para marcar que hay un pedido listo para entregar.
- Un pedido está listo cuando tienes: producto, cantidad, y dirección de entrega (ubicación GPS o dirección escrita)
${productContext ? `\n=== PRODUCTOS ===\n${productContext}` : ""}`;

    const messages: any[] = [
      { role: "system", content: systemPrompt },
      ...conversationHistory,
      { role: "user", content: userMessage },
    ];

    // Use settings or defaults
    const modelToUse = settings.model || "gpt-4o-mini";
    const maxTokensToUse = settings.maxTokens || 120;
    const temperatureToUse = (settings.temperature || 70) / 100; // Convert 0-100 to 0-1

    const completion = await openai.chat.completions.create({
      model: modelToUse,
      messages,
      max_tokens: maxTokensToUse,
      temperature: temperatureToUse,
    });

    const responseText = completion.choices[0]?.message?.content || "";
    const tokensUsed = completion.usage?.total_tokens || 0;

    // Extract image URL if present
    const imageMatch = responseText.match(/\[IMAGEN:\s*(https?:\/\/[^\]]+)\]/i);
    let imageUrl: string | undefined;
    let cleanResponse = responseText;
    
    if (imageMatch) {
      imageUrl = imageMatch[1];
      cleanResponse = cleanResponse.replace(imageMatch[0], "").trim();
    }

    // Check if order is ready (AI detected complete order with all data)
    const orderReady = cleanResponse.includes("[PEDIDO_LISTO]");
    if (orderReady) {
      cleanResponse = cleanResponse.replace(/\[PEDIDO_LISTO\]/gi, "").trim();
      console.log("=== ORDER READY DETECTED ===", { conversationId });
    }

    await storage.createAiLog({
      conversationId,
      userMessage,
      aiResponse: responseText,
      tokensUsed,
      success: true,
    });

    return { response: cleanResponse, imageUrl, tokensUsed, orderReady };
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
