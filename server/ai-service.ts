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

// Search for product context in conversation history
function findProductInHistory(recentMessages: Message[], products: Product[]): Product | null {
  // Look through recent messages for product mentions
  for (let i = recentMessages.length - 1; i >= 0; i--) {
    const msg = recentMessages[i];
    if (msg.text) {
      const matches = findMatchingProducts(msg.text, products);
      if (matches.length === 1) {
        return matches[0]; // Found a specific product in history
      }
    }
  }
  return null;
}

export async function generateAiResponse(
  conversationId: number,
  userMessage: string,
  recentMessages: Message[],
  imageBase64?: string // Optional: base64 encoded image for vision analysis
): Promise<{ response: string; imageUrl?: string; tokensUsed: number; orderReady?: boolean; needsHuman?: boolean; shouldCall?: boolean; delivered?: boolean } | null> {
  try {
    const settings = await storage.getAiSettings();
    if (!settings?.enabled) {
      return null;
    }

    // Get all products
    const allProducts = await storage.getProducts();
    
    // Find products matching user's current message
    const matchingProducts = findMatchingProducts(userMessage, allProducts);
    
    // Get catalog from settings (fallback for products not in database)
    const catalog = settings.catalog || "";
    
    // SMART PRODUCT SEARCH LOGIC:
    // 1. First, AI uses instructions/system prompt
    // 2. If user mentions a product name, load that product info
    // 3. If asking specific question (like dosage) and no product in current message,
    //    look in conversation history for which product they're asking about
    
    let productContext = "";
    let productInContext: Product | null = null;
    
    if (matchingProducts.length > 0) {
      // User mentioned specific product(s) - include only those
      productContext = matchingProducts.map(p => 
        `${p.name} - ${p.price || "Consultar precio"}\n${p.description || ""}\n${p.imageUrl ? `Imagen: ${p.imageUrl}` : ""}`
      ).join("\n\n");
      productInContext = matchingProducts[0];
    } else {
      // Check if it's a follow-up question about a product mentioned earlier
      const historyProduct = findProductInHistory(recentMessages, allProducts);
      if (historyProduct) {
        productContext = `${historyProduct.name} - ${historyProduct.price || "Consultar precio"}\n${historyProduct.description || ""}\n${historyProduct.imageUrl ? `Imagen: ${historyProduct.imageUrl}` : ""}`;
        productInContext = historyProduct;
      } else if (isProductQuery(userMessage)) {
        // General product query without specific product - show list
        if (allProducts.length > 0) {
          productContext = "PRODUCTOS DISPONIBLES:\n" + allProducts.map(p => 
            `• ${p.name} - ${p.price || "Consultar"}`
          ).join("\n");
        } else if (catalog) {
          productContext = catalog.substring(0, 1500);
        }
      }
    }

    // Get previous messages for context (configurable, default 3)
    const historyCount = settings.conversationHistory || 3;
    const conversationHistory = recentMessages
      .slice(-(historyCount + 1), -1)
      .map((m) => ({
        role: m.direction === "in" ? "user" : "assistant",
        content: m.text || `[${m.type}]`,
      }));

    const instructions = settings.systemPrompt || "Eres un asistente de ventas amigable.";
    
    // Build system prompt with CRITICAL markers at the top
    const systemPrompt = `=== CONTEXTO ===
Estás respondiendo por WhatsApp. YA TIENES el número del cliente (es el chat de WhatsApp).
NUNCA pidas número de teléfono - ya lo tienes.

=== MARCADORES CRM (OBLIGATORIO) ===
Escribe estos marcadores AL FINAL de tu respuesta. El cliente NO los verá.
Interpreta la INTENCIÓN del cliente, no busques frases exactas.

[LLAMAR] - INTENCIÓN: El cliente quiere comunicación por voz/llamada telefónica.
  Ejemplos de intención (pueden expresarlo de mil formas):
  - Quiere hablar con alguien / prefiere teléfono / pide que lo llamen
  - Está confundido después de varios mensajes y necesita atención directa
  - Tiene objeciones repetidas que requieren conversación personal
  RESPUESTA: Confirma que lo llamarán pronto. NO pidas número (ya lo tienes por WhatsApp).

[PEDIDO_LISTO] - INTENCIÓN: Cliente confirmó compra con datos completos.
  Requisitos: Producto + Cantidad + Dirección (GPS, maps, o escrita)
  RESPUESTA: Resume el pedido y confirma. Agrega el marcador.

[ENTREGADO] - INTENCIÓN: Cliente confirma que ya recibió su pedido.
  Cualquier forma de decir que ya tiene el producto en sus manos.
  RESPUESTA: Agradece y cierra amablemente.

[NECESITO_HUMANO] - INTENCIÓN: Situación que requiere intervención humana.
  Reclamos fuertes, problemas con entregas, quejas, situaciones médicas delicadas.
  RESPUESTA: Indica que un humano lo atenderá pronto.

=== TUS INSTRUCCIONES ===
${instructions}

=== REGLAS ===
- Responde en 2-5 líneas máximo
- Máximo 2 preguntas por respuesta  
- Tono humano y cálido
- Para enviar imagen: [IMAGEN: url]
- NUNCA pidas número de teléfono
${productContext ? `\n=== PRODUCTOS ===\n${productContext}` : ""}

RECORDATORIO: Si aplica algún marcador, escríbelo AL FINAL de tu respuesta.`;

    // Build user message content - with or without image
    let userContent: any = userMessage;
    if (imageBase64) {
      // Vision format: array with text and image
      userContent = [
        { type: "text", text: userMessage || "El cliente envió esta imagen. Analízala y responde." },
        { 
          type: "image_url", 
          image_url: { 
            url: `data:image/jpeg;base64,${imageBase64}`,
            detail: "low" // Use low detail to save tokens
          } 
        }
      ];
    }

    const messages: any[] = [
      { role: "system", content: systemPrompt },
      ...conversationHistory,
      { role: "user", content: userContent },
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

    // === DETECT ALL CRM MARKERS ===
    const markers: string[] = [];
    
    // Check for [PEDIDO_LISTO]
    const orderReady = cleanResponse.includes("[PEDIDO_LISTO]");
    if (orderReady) markers.push("PEDIDO_LISTO");
    
    // Check for [NECESITO_HUMANO]
    const needsHuman = cleanResponse.includes("[NECESITO_HUMANO]");
    if (needsHuman) markers.push("NECESITO_HUMANO");
    
    // Check for [LLAMAR]
    const shouldCall = cleanResponse.includes("[LLAMAR]");
    if (shouldCall) markers.push("LLAMAR");
    
    // Check for [ENTREGADO]
    const delivered = cleanResponse.includes("[ENTREGADO]");
    if (delivered) markers.push("ENTREGADO");
    
    // Log detected markers
    if (markers.length > 0) {
      console.log("=== CRM MARKERS DETECTED ===", { conversationId, markers: markers.join(", ") });
    }
    
    // === REMOVE ALL MARKERS FROM RESPONSE (client won't see them) ===
    cleanResponse = cleanResponse
      .replace(/\[PEDIDO_LISTO\]/gi, "")
      .replace(/\[NECESITO_HUMANO\]/gi, "")
      .replace(/\[LLAMAR\]/gi, "")
      .replace(/\[ENTREGADO\]/gi, "")
      .trim();

    await storage.createAiLog({
      conversationId,
      userMessage,
      aiResponse: responseText,
      tokensUsed,
      markersDetected: markers.length > 0 ? markers.join(",") : null,
      success: true,
    });

    return { response: needsHuman ? "" : cleanResponse, imageUrl: needsHuman ? undefined : imageUrl, tokensUsed, orderReady, needsHuman, shouldCall, delivered };
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
