import { storage } from "./storage";
import { db } from "./db";
import { conversations } from "@shared/schema";
import { eq, desc, and, isNull, lte, gte, sql } from "drizzle-orm";
import { generateAiResponse } from "./ai-service";

let sendAiResponseFn: ((to: string, responseText: string) => Promise<any>) | null = null;

export function initFollowUp(
  _sendToWhatsApp: (to: string, type: "text" | "image" | "interactive", content: any) => Promise<any>,
  sendAiResponse: (to: string, responseText: string) => Promise<any>,
) {
  sendAiResponseFn = sendAiResponse;

  setInterval(async () => {
    try {
      await checkAndSendFollowUps();
    } catch (err) {
      console.error("[FollowUp] Error:", err);
    }
  }, 5 * 60 * 1000);

  console.log("[FollowUp] Scheduler started (every 5 min)");
}

async function checkAndSendFollowUps() {
  const settings = await storage.getAiSettings();
  if (!settings?.followUpEnabled || !settings?.enabled) return;

  const now = Date.now();
  const waitMinutes = settings.followUpMinutes || 20;
  const cutoff = new Date(now - waitMinutes * 60 * 1000);
  const window24hStart = new Date(now - 24 * 60 * 60 * 1000);

  const candidates = await db
    .select()
    .from(conversations)
    .where(
      and(
        isNull(conversations.lastFollowUpAt),
        eq(conversations.aiDisabled, false),
        gte(conversations.lastMessageTimestamp, window24hStart),
        lte(conversations.lastMessageTimestamp, cutoff),
        sql`${conversations.orderStatus} IS DISTINCT FROM 'delivered'`,
      ),
    )
    .orderBy(desc(conversations.lastMessageTimestamp))
    .limit(10);

  if (candidates.length === 0) return;

  for (const conv of candidates) {
    try {
      const msgs = await storage.getMessages(conv.id);
      if (msgs.length === 0) continue;

      const lastMsg = msgs[msgs.length - 1];
      if (lastMsg.direction !== "out") continue;

      // Enforce 24h window from the last inbound customer message.
      const lastInbound = [...msgs].reverse().find((m) => m.direction === "in");
      if (!lastInbound?.createdAt) continue;
      if (new Date(lastInbound.createdAt).getTime() < window24hStart.getTime()) continue;

      const recentMessages = msgs.slice(-10);
      const result = await generateAiResponse(
        conv.id,
        `[SISTEMA: Seguimiento automatico dentro de ventana de 24 horas. El cliente no respondio en ${waitMinutes} minutos. Genera UN mensaje corto de reenganche, natural y no invasivo. No saludes de nuevo.]`,
        recentMessages,
      );

      if (!result?.response) continue;
      if (!sendAiResponseFn) continue;

      try {
        await sendAiResponseFn(conv.waId, result.response);
      } catch (sendErr) {
        console.error(`[FollowUp] Send failed for conv ${conv.id}:`, sendErr);
        continue;
      }

      await storage.createMessage({
        conversationId: conv.id,
        waMessageId: `followup_${Date.now()}_${conv.id}`,
        direction: "out",
        type: "text",
        text: result.response,
        timestamp: Math.floor(Date.now() / 1000).toString(),
        status: "sent",
      });

      await storage.updateConversation(conv.id, {
        lastMessage: result.response,
        lastMessageTimestamp: new Date(),
        lastFollowUpAt: new Date(),
      });

      console.log(`[FollowUp] Sent to ${conv.contactName || conv.waId}`);
    } catch (err) {
      console.error(`[FollowUp] Error conv ${conv.id}:`, err);
    }
  }
}

