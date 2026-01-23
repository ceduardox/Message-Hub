import OpenAI from "openai";
import { storage } from "./storage";
import type { Message } from "@shared/schema";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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

    const trainingData = await storage.getAiTrainingData();
    
    const trainingContext = trainingData
      .map((d) => {
        if (d.type === "text") {
          return `[INFO] ${d.title || "Información"}: ${d.content}`;
        } else if (d.type === "url") {
          return `[URL] ${d.title || "Recurso"}: ${d.content}`;
        } else if (d.type === "image_url") {
          return `[IMAGEN DISPONIBLE] ${d.title || "Imagen"}: ${d.content}`;
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");

    const conversationHistory = recentMessages
      .slice(-10)
      .map((m) => ({
        role: m.direction === "in" ? "user" : "assistant",
        content: m.text || `[${m.type}]`,
      }));

    const systemPrompt = settings.systemPrompt || `Eres un asistente de ventas amigable y profesional. 
Tu objetivo es ayudar a los clientes con información sobre productos, precios y promociones.
Responde de forma concisa y útil. Si no tienes la información, ofrece alternativas.
Puedes usar las URLs de imágenes proporcionadas para enviar fotos de productos cuando sea relevante.
Cuando quieras enviar una imagen, incluye la URL en tu respuesta con el formato: [IMAGEN: url_aqui]`;

    const messages: any[] = [
      {
        role: "system",
        content: `${systemPrompt}\n\n=== INFORMACIÓN DE PRODUCTOS Y SERVICIOS ===\n${trainingContext || "No hay información de entrenamiento aún."}\n\n=== CONTEXTO ===\nEsta es una conversación por WhatsApp. El cliente puede haber conversado antes.`,
      },
      ...conversationHistory,
      { role: "user", content: userMessage },
    ];

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      max_tokens: 500,
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
