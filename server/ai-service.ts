import OpenAI from "openai";
import { storage } from "./storage";
import type { Message, Product } from "@shared/schema";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Search products by matching name or keywords against user message
function findMatchingProducts(userMessage: string, products: Product[]): Product[] {
  const lowerMessage = userMessage.toLowerCase();
  
  return products.filter(product => {
    // Check product name
    const nameMatch = product.name.toLowerCase().split(/\s+/).some(word => 
      word.length > 2 && lowerMessage.includes(word)
    );
    
    // Check keywords
    const keywordsMatch = product.keywords?.toLowerCase().split(/[,\s]+/).some(keyword => 
      keyword.length > 2 && lowerMessage.includes(keyword)
    );
    
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
): Promise<{ response: string; imageUrl?: string; tokensUsed: number } | null> {
  try {
    const settings = await storage.getAiSettings();
    if (!settings?.enabled) {
      return null;
    }

    // Get all products
    const allProducts = await storage.getProducts();
    
    // Find products matching user's message
    const matchingProducts = findMatchingProducts(userMessage, allProducts);
    
    // Build product context
    let productContext = "";
    
    if (matchingProducts.length > 0) {
      // User asked about specific product(s) - include only those
      productContext = matchingProducts.map(p => 
        `${p.name} - ${p.price || "Consultar precio"}\n${p.description || ""}\n${p.imageUrl ? `Imagen: ${p.imageUrl}` : ""}`
      ).join("\n\n");
    } else if (isProductQuery(userMessage) && allProducts.length > 0) {
      // General product query - include compact list
      productContext = "PRODUCTOS DISPONIBLES:\n" + allProducts.map(p => 
        `• ${p.name} - ${p.price || "Consultar"}`
      ).join("\n");
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
${productContext ? `\n=== PRODUCTOS ===\n${productContext}` : ""}`;

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
