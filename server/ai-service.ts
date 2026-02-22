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
): Promise<{ response: string; imageUrl?: string; tokensUsed: number; orderReady?: boolean; needsHuman?: boolean; shouldCall?: boolean } | null> {
  try {
    const [settings, allProducts, learnedRules] = await Promise.all([
      storage.getAiSettings(),
      storage.getProducts(),
      storage.getActiveLearnedRules(),
    ]);
    
    if (!settings?.enabled) {
      return null;
    }
    
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
    
    const learnedRulesContext = learnedRules.length > 0 
      ? "\n=== REGLAS APRENDIDAS ===\n" + learnedRules.map(r => `- ${r.rule}`).join("\n")
      : "";
    
    // Build system prompt (compact to reduce tokens and latency)
    const systemPrompt = `${instructions}
REGLAS: Responde 2-5 líneas. Máx 2 preguntas. Tono humano.
FORMATOS: Imagen:[IMAGEN:url] | Botones(máx 3,20chars):[BOTONES:op1,op2,op3] | Lista(máx 10):[LISTA:título|op1,op2,op3]
SIEMPRE usa [BOTONES:] o [LISTA:] para opciones, NUNCA texto plano con viñetas.
Pedido completo (producto+cantidad+dirección)→agrega [PEDIDO_LISTO]
No puedes responder→[NECESITO_HUMANO] | Llamar→[LLAMAR] (ya tienes su WhatsApp, NO pidas número)${learnedRulesContext}${productContext ? `\nPRODUCTOS:\n${productContext}` : ""}`;

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

    // Check if order is ready (AI detected complete order with all data)
    const orderReady = cleanResponse.includes("[PEDIDO_LISTO]");
    if (orderReady) {
      cleanResponse = cleanResponse.replace(/\[PEDIDO_LISTO\]/gi, "").trim();
      console.log("=== ORDER READY DETECTED ===", { conversationId });
    }

    // Check if AI needs human help
    const needsHuman = cleanResponse.includes("[NECESITO_HUMANO]");
    if (needsHuman) {
      cleanResponse = cleanResponse.replace(/\[NECESITO_HUMANO\]/gi, "").trim();
      console.log("=== NEEDS HUMAN ATTENTION ===", { conversationId });
    }

    // Check if should call (NEUROVENTA or explicit request)
    const shouldCall = cleanResponse.includes("[LLAMAR]");
    if (shouldCall) {
      cleanResponse = cleanResponse.replace(/\[LLAMAR\]/gi, "").trim();
      console.log("=== SHOULD CALL DETECTED ===", { conversationId });
    }

    storage.createAiLog({
      conversationId,
      userMessage,
      aiResponse: responseText,
      tokensUsed,
      success: true,
    }).catch(err => console.error("AI log error:", err));

    return { response: needsHuman ? "" : cleanResponse, imageUrl: needsHuman ? undefined : imageUrl, tokensUsed, orderReady, needsHuman, shouldCall };
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
