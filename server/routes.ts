import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import session from "express-session";
import MemoryStore from "memorystore";
import axios from "axios";
import { generateAiResponse } from "./ai-service";
import { initFollowUp } from "./follow-up";
import { insertProductSchema, updateOrderStatusSchema, type Message as StoredMessage } from "@shared/schema";
import { db } from "./db";
import OpenAI from "openai";
import fs from "fs";
import path from "path";
import os from "os";
import multer from "multer";
import { sql } from "drizzle-orm";
import { spawn } from "child_process";
import ffmpegStatic from "ffmpeg-static";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const uploadAudio = multer({ storage: multer.memoryStorage(), limits: { fileSize: 16 * 1024 * 1024 } });
const uploadDocument = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const AI_DEBOUNCE_MS = 3000;
const INCOMING_PUSH_COOLDOWN_MS = 60000;
const FIRST_CONTACT_PROBLEM_MENU_RESPONSE = `Hola, soy Isabella de RYZTOR.
Con gusto le ayudo. Que le interesa mejorar hoy?
[BOTONES: Diabetes, Diabetes y peso, Dolor muscular]`;
const PROMPT_PROFILE_PRIMARY_TITLE = "__SYSTEM_PROMPT_PRIMARY__";
const PROMPT_PROFILE_SECONDARY_TITLE = "__SYSTEM_PROMPT_SECONDARY__";
const PROMPT_PROFILE_ACTIVE_TITLE = "__SYSTEM_PROMPT_ACTIVE__";
const HIDDEN_PROMPT_PROFILE_TITLES = new Set([
  PROMPT_PROFILE_PRIMARY_TITLE,
  PROMPT_PROFILE_SECONDARY_TITLE,
  PROMPT_PROFILE_ACTIVE_TITLE,
]);
const BERBERINA_IMAGE_URL = "https://i.ibb.co/vC27GxKC/BERBERINA-BANNER.jpg";
const BITTER_IMAGE_URL = "https://i.ibb.co/whdDDLLC/image-Pippit-202602222317.jpg";
const CITRATO_IMAGE_URL = "https://i.ibb.co/Q7TYCb0F/citrato.jpg";
const FIRST_CONTACT_ROUTE_RESPONSES = {
  diabetes: {
    productName: "Berberina RYZTOR",
    imageUrl: BERBERINA_IMAGE_URL,
    listText: "[LISTA: Opciones Berberina | Beneficios, Indicaciones, Precio y envio, Hacer pedido, Tengo otra consulta]",
    responseText: `🔥 *Berberina RYZTOR*
🌟 Indicada para diabetes tipo 2 y prediabetes.
⛔ Ayuda con control de glucosa y picos de azucar.
⚖️ Apoya metabolismo y control de antojos.
🫀 Contribuye al equilibrio de colesterol y trigliceridos.
🇺🇸 Producto americano de alta calidad.
*280 Bs* | Envio segun ciudad.
[LISTA: Opciones Berberina | Beneficios, Indicaciones, Precio y envio, Hacer pedido, Tengo otra consulta]`,
    benefitsText: `✨ *Beneficios Berberina*
⛔ Apoya control de glucosa y picos de azucar.
⚖️ Ayuda con metabolismo y control de antojos.
🫀 Tambien contribuye al equilibrio de colesterol y trigliceridos.
[LISTA: Opciones Berberina | Beneficios, Indicaciones, Precio y envio, Hacer pedido, Tengo otra consulta]`,
    indicationsText: `📌 *Indicaciones Berberina*
Adultos: 2 capsulas al dia.
Preferiblemente con comida.
Rendimiento referencial: aprox 30 dias por frasco.
[LISTA: Opciones Berberina | Beneficios, Indicaciones, Precio y envio, Hacer pedido, Tengo otra consulta]`,
  },
  diabetes_y_peso: {
    productName: "Berberina + Bitter Melon RYZTOR",
    imageUrl: BITTER_IMAGE_URL,
    listText: "[LISTA: Opciones Berberina + Bitter | Beneficios, Indicaciones, Precio y envio, Hacer pedido, Tengo otra consulta]",
    responseText: `🔥 *Berberina + Bitter Melon RYZTOR*
🌟 Ideal para personas con diabetes que tambien buscan bajar de peso.
⛔ Ayuda con control de azucar y picos de glucosa.
⚖️ Apoya control de antojos, metabolismo y peso.
🙂 Excelente apoyo para plan de diabetes y control de peso.
🇺🇸 Producto americano de alta calidad.
*300 Bs* | Envio segun ciudad.
[LISTA: Opciones Berberina + Bitter | Beneficios, Indicaciones, Precio y envio, Hacer pedido, Tengo otra consulta]`,
    benefitsText: `✨ *Beneficios Berberina + Bitter*
⛔ Apoya control de azucar y picos de glucosa.
⚖️ Ayuda con control de antojos, metabolismo y peso.
🙂 Es una opcion enfocada en diabetes y control de peso.
[LISTA: Opciones Berberina + Bitter | Beneficios, Indicaciones, Precio y envio, Hacer pedido, Tengo otra consulta]`,
    indicationsText: `📌 *Indicaciones Berberina + Bitter*
Adultos: 2 capsulas al dia.
Tomarlas con comida y agua.
Si preguntan horario, responder: preferiblemente con comida.
[LISTA: Opciones Berberina + Bitter | Beneficios, Indicaciones, Precio y envio, Hacer pedido, Tengo otra consulta]`,
  },
  dolor_muscular: {
    productName: "Citrato de Magnesio RYZTOR",
    imageUrl: CITRATO_IMAGE_URL,
    listText: "[LISTA: Opciones Citrato | Beneficios, Indicaciones, Precio y envio, Hacer pedido, Tengo otra consulta]",
    responseText: `💪 *Citrato de Magnesio RYZTOR*
🌟 Ideal para dolor muscular, calambres y tension.
😌 Favorece relajacion, descanso y bienestar muscular.
🦵 Apoya alivio de calambres y recuperacion muscular.
🇺🇸 Producto americano de alta calidad.
*300 Bs* | Envio segun ciudad.
[LISTA: Opciones Citrato | Beneficios, Indicaciones, Precio y envio, Hacer pedido, Tengo otra consulta]`,
    benefitsText: `✨ *Beneficios Citrato*
💪 Apoya alivio de dolor muscular, calambres y tension.
😌 Favorece relajacion, descanso y bienestar muscular.
🦵 Puede apoyar recuperacion muscular y confort muscular.
[LISTA: Opciones Citrato | Beneficios, Indicaciones, Precio y envio, Hacer pedido, Tengo otra consulta]`,
    indicationsText: `📌 *Indicaciones Citrato*
Adultos: 2 capsulas al dia.
Preferiblemente con comida.
Si preguntan horario, responder: preferiblemente con una comida del dia.
[LISTA: Opciones Citrato | Beneficios, Indicaciones, Precio y envio, Hacer pedido, Tengo otra consulta]`,
  },
} as const;
interface BufferedMessage {
  messageForAi: string;
  imageBase64ForAi?: string;
  wasAudioMessage: boolean;
  conversationId: number;
  from: string;
  name: string;
}
const messageBuffers = new Map<string, { messages: BufferedMessage[]; timer: ReturnType<typeof setTimeout> }>();
interface IncomingPushState {
  lastSentAt: number;
  pendingCount: number;
  latestPreview: string;
  senderName: string;
  targetExternalIds?: string[];
  timer: ReturnType<typeof setTimeout> | null;
}
const incomingPushStateByConversation = new Map<number, IncomingPushState>();
interface PushNotificationPreferences {
  notifyNewMessages: boolean;
  notifyPending: boolean;
}
let pushSettingsCache: { settings: PushNotificationPreferences; loadedAt: number } | null = null;
let agentAiColumnEnsured = false;
const PUSH_SETTINGS_CACHE_TTL_MS = 15000;

function normalizeInboundText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getAgentPushExternalId(agentId?: number | null) {
  return typeof agentId === "number" ? `agent:${agentId}` : null;
}

function getAdminPushExternalId() {
  return "admin:global";
}

function getPushRecipientExternalIds(assignedAgentId?: number | null) {
  const recipients = [getAdminPushExternalId()];
  const agentExternalId = getAgentPushExternalId(assignedAgentId);
  if (agentExternalId) {
    recipients.push(agentExternalId);
  }
  return Array.from(new Set(recipients));
}

function getConversationPushOptions(conversation?: { assignedAgentId?: number | null } | null) {
  return { targetExternalIds: getPushRecipientExternalIds(conversation?.assignedAgentId) };
}

function getPushTargetUrl(data?: Record<string, string>) {
  const conversationId = data?.conversationId;
  if (conversationId && /^\d+$/.test(conversationId)) {
    return `/?conversationId=${conversationId}`;
  }
  return "/";
}

function isGenericFirstContactTrigger(text: string): boolean {
  const normalized = normalizeInboundText(text);
  if (!normalized) return false;

  const tokens = normalized.split(" ").filter(Boolean);
  if (tokens.length === 0 || tokens.length > 4) return false;

  const allowedTokens = new Set([
    "hola",
    "ola",
    "buenas",
    "buenos",
    "dias",
    "dia",
    "tardes",
    "noches",
    "precio",
    "info",
    "informacion",
    "mas",
    "esto",
    "por",
    "favor",
    "consulta",
  ]);

  const coreTokens = new Set([
    "hola",
    "ola",
    "buenas",
    "precio",
    "info",
    "informacion",
    "esto",
    "consulta",
  ]);

  return tokens.every(token => allowedTokens.has(token)) && tokens.some(token => coreTokens.has(token));
}

function shouldForceFirstContactProblemMenu(
  messageForAi: string,
  recentMessages: StoredMessage[],
  imageBase64ForAi?: string,
  wasAudioMessage?: boolean,
): boolean {
  if (!messageForAi || imageBase64ForAi || wasAudioMessage) return false;

  const lastTenMessages = recentMessages.slice(-10);
  const hasOutboundHistory = lastTenMessages.some(message => message.direction === "out");
  if (hasOutboundHistory) return false;

  return isGenericFirstContactTrigger(messageForAi);
}

function getForcedFirstContactRouteResponse(
  messageForAi: string,
  recentMessages: StoredMessage[],
) {
  const latestOutbound = [...recentMessages].reverse().find(message => message.direction === "out");
  if (!latestOutbound?.text || !latestOutbound.text.includes("[BOTONES: Diabetes, Diabetes y peso, Dolor muscular]")) {
    return null;
  }

  const normalized = normalizeInboundText(messageForAi);
  if (normalized === "diabetes") return FIRST_CONTACT_ROUTE_RESPONSES.diabetes;
  if (normalized === "diabetes y peso") return FIRST_CONTACT_ROUTE_RESPONSES.diabetes_y_peso;
  if (normalized === "dolor muscular") return FIRST_CONTACT_ROUTE_RESPONSES.dolor_muscular;

  return null;
}

function getCurrentProductContext(recentMessages: StoredMessage[]) {
  const latestOutbound = [...recentMessages].reverse().find(message => message.direction === "out" && typeof message.text === "string");
  if (!latestOutbound?.text) return null;

  const outboundText = latestOutbound.text;
  return Object.values(FIRST_CONTACT_ROUTE_RESPONSES).find(product =>
    outboundText.includes(product.productName) || outboundText.includes(product.listText)
  ) || null;
}

function shouldSendImageForProduct(
  recentMessages: StoredMessage[],
  productName: string,
  imageUrl: string,
): boolean {
  const lastTenMessages = recentMessages.slice(-10);

  return !lastTenMessages.some(message => {
    if (message.direction !== "out" || typeof message.text !== "string") return false;
    return message.text.includes(imageUrl) || message.text.includes(productName);
  });
}

async function ensurePushSettingsTable() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS push_notification_settings (
      id INTEGER PRIMARY KEY,
      notify_new_messages BOOLEAN NOT NULL DEFAULT true,
      notify_pending BOOLEAN NOT NULL DEFAULT true,
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT push_notification_settings_singleton CHECK (id = 1)
    )
  `);
  await db.execute(sql`
    INSERT INTO push_notification_settings (id)
    VALUES (1)
    ON CONFLICT (id) DO NOTHING
  `);
}

async function getPushNotificationPreferences(force = false): Promise<PushNotificationPreferences> {
  const now = Date.now();
  if (!force && pushSettingsCache && now - pushSettingsCache.loadedAt < PUSH_SETTINGS_CACHE_TTL_MS) {
    return pushSettingsCache.settings;
  }

  await ensurePushSettingsTable();
  const result: any = await db.execute(sql`
    SELECT notify_new_messages, notify_pending
    FROM push_notification_settings
    WHERE id = 1
    LIMIT 1
  `);
  const rows = result?.rows ?? [];
  const row = rows[0];

  const settings: PushNotificationPreferences = {
    notifyNewMessages: row ? Boolean(row.notify_new_messages) : true,
    notifyPending: row ? Boolean(row.notify_pending) : true,
  };
  pushSettingsCache = { settings, loadedAt: now };
  return settings;
}

async function updatePushNotificationPreferences(next: PushNotificationPreferences): Promise<PushNotificationPreferences> {
  await ensurePushSettingsTable();
  await db.execute(sql`
    UPDATE push_notification_settings
    SET
      notify_new_messages = ${next.notifyNewMessages},
      notify_pending = ${next.notifyPending},
      updated_at = NOW()
    WHERE id = 1
  `);
  pushSettingsCache = { settings: next, loadedAt: Date.now() };
  return next;
}

async function ensureAgentAiColumnExists() {
  if (agentAiColumnEnsured) return;
  await db.execute(sql`
    ALTER TABLE agents
    ADD COLUMN IF NOT EXISTS is_ai_auto_reply_enabled BOOLEAN NOT NULL DEFAULT true
  `);
  agentAiColumnEnsured = true;
}

async function getPromptProfiles() {
  const [settings, trainingData] = await Promise.all([
    storage.getAiSettings(),
    storage.getAiTrainingData(),
  ]);

  const byTitle = new Map(trainingData.map(item => [item.title || "", item]));
  const primaryPrompt = byTitle.get(PROMPT_PROFILE_PRIMARY_TITLE)?.content || settings?.systemPrompt || "";
  const secondaryPrompt = byTitle.get(PROMPT_PROFILE_SECONDARY_TITLE)?.content || "";
  const rawActive = byTitle.get(PROMPT_PROFILE_ACTIVE_TITLE)?.content || "primary";
  const activeSlot = rawActive === "secondary" ? "secondary" : "primary";

  return { primaryPrompt, secondaryPrompt, activeSlot };
}

async function upsertPromptProfile(title: string, content: string) {
  const trainingData = await storage.getAiTrainingData();
  const existing = trainingData.find(item => item.title === title);
  if (existing) {
    return storage.updateAiTrainingData(existing.id, { content, title, type: "text" });
  }
  return storage.createAiTrainingData({ type: "text", title, content });
}

function isHiddenPromptProfileTitle(title?: string | null) {
  return HIDDEN_PROMPT_PROFILE_TITLES.has(title || "");
}

function flushMessageBuffer(waId: string) {
  const buffer = messageBuffers.get(waId);
  if (!buffer || buffer.messages.length === 0) return;
  messageBuffers.delete(waId);

  const msgs = buffer.messages;
  const combined: BufferedMessage = {
    messageForAi: msgs.map(m => m.messageForAi).join("\n"),
    imageBase64ForAi: msgs.find(m => m.imageBase64ForAi)?.imageBase64ForAi,
    wasAudioMessage: msgs.some(m => m.wasAudioMessage),
    conversationId: msgs[msgs.length - 1].conversationId,
    from: msgs[0].from,
    name: msgs[0].name,
  };

  processAiResponse(combined).catch(err => console.error("Buffered AI error:", err));
}

async function processAiResponse(data: BufferedMessage) {
  const { conversationId, messageForAi, from, name, imageBase64ForAi, wasAudioMessage } = data;
  const conversation = await storage.getConversation(conversationId);
  if (!conversation || conversation.aiDisabled) return;
  if (conversation.assignedAgentId) {
    const assignedAgent = await storage.getAgent(conversation.assignedAgentId);
    if (assignedAgent && assignedAgent.isAiAutoReplyEnabled === false) return;
  }

  try {
    const aiSettings = await storage.getAiSettings();
    const fixedCommerceFlowEnabled = aiSettings?.learningMode !== true;
    const recentMessages = await storage.getMessages(conversationId);

    if (fixedCommerceFlowEnabled && shouldForceFirstContactProblemMenu(messageForAi, recentMessages, imageBase64ForAi, wasAudioMessage)) {
      const waResponse = await sendAiResponseToWhatsApp(from, FIRST_CONTACT_PROBLEM_MENU_RESPONSE);
      const waMessageId = waResponse.messages[0].id;

      await storage.createMessage({
        conversationId,
        waMessageId,
        direction: "out",
        type: "text",
        text: FIRST_CONTACT_PROBLEM_MENU_RESPONSE,
        timestamp: Math.floor(Date.now() / 1000).toString(),
        status: "sent",
        rawJson: waResponse,
      });

      await storage.updateConversation(conversationId, {
        needsHumanAttention: false,
        lastMessage: FIRST_CONTACT_PROBLEM_MENU_RESPONSE,
        lastMessageTimestamp: new Date(),
      });

      return;
    }

    const forcedRouteResponse = fixedCommerceFlowEnabled
      ? getForcedFirstContactRouteResponse(messageForAi, recentMessages)
      : null;
    if (forcedRouteResponse && !imageBase64ForAi && !wasAudioMessage) {
      if (shouldSendImageForProduct(recentMessages, forcedRouteResponse.productName, forcedRouteResponse.imageUrl)) {
        const imgResponse = await sendToWhatsApp(from, "image", { imageUrl: forcedRouteResponse.imageUrl });
        await storage.createMessage({
          conversationId,
          waMessageId: imgResponse.messages[0].id,
          direction: "out",
          type: "image",
          text: forcedRouteResponse.imageUrl,
          mediaId: null,
          mimeType: null,
          timestamp: Math.floor(Date.now() / 1000).toString(),
          status: "sent",
          rawJson: imgResponse,
        });
      }

      const waResponse = await sendAiResponseToWhatsApp(from, forcedRouteResponse.responseText);
      const waMessageId = waResponse.messages[0].id;

      await storage.createMessage({
        conversationId,
        waMessageId,
        direction: "out",
        type: "text",
        text: forcedRouteResponse.responseText,
        timestamp: Math.floor(Date.now() / 1000).toString(),
        status: "sent",
        rawJson: waResponse,
      });

      await storage.updateConversation(conversationId, {
        needsHumanAttention: false,
        lastMessage: forcedRouteResponse.responseText,
        lastMessageTimestamp: new Date(),
      });

      return;
    }

    const currentProductContext = fixedCommerceFlowEnabled ? getCurrentProductContext(recentMessages) : null;
    const normalizedMessage = normalizeInboundText(messageForAi);
    if (currentProductContext && !imageBase64ForAi && !wasAudioMessage) {
      const submenuResponse =
        normalizedMessage === "beneficios" || normalizedMessage === "beneficio"
          ? currentProductContext.benefitsText
          : normalizedMessage === "indicaciones" || normalizedMessage === "indicacion"
            ? currentProductContext.indicationsText
            : null;

      if (submenuResponse) {
        const waResponse = await sendAiResponseToWhatsApp(from, submenuResponse);
        const waMessageId = waResponse.messages[0].id;

        await storage.createMessage({
          conversationId,
          waMessageId,
          direction: "out",
          type: "text",
          text: submenuResponse,
          timestamp: Math.floor(Date.now() / 1000).toString(),
          status: "sent",
          rawJson: waResponse,
        });

        await storage.updateConversation(conversationId, {
          needsHumanAttention: false,
          lastMessage: submenuResponse,
          lastMessageTimestamp: new Date(),
        });

        return;
      }
    }

    const aiResult = await generateAiResponse(conversationId, messageForAi, recentMessages, imageBase64ForAi);

    if (aiResult && aiResult.needsHuman) {
      await storage.updateConversation(conversationId, { needsHumanAttention: true });
      console.log("=== AI NEEDS HUMAN - MARKED FOR ATTENTION ===", conversationId);
      sendPushNotification(
        "Atención Humana Requerida",
        `${name}: El cliente necesita hablar con un humano`,
        { conversationId: conversationId.toString(), waId: from, event: "human_attention" },
        getConversationPushOptions(conversation)
      );
    } else if (aiResult && aiResult.response) {
      await storage.updateConversation(conversationId, { needsHumanAttention: false });

      const shouldSendAudio = wasAudioMessage && aiSettings?.audioResponseEnabled;

      let waResponse: any;
      let waMessageId: string;

      if (shouldSendAudio) {
        const ttsProvider = aiSettings?.ttsProvider || "openai";
        const selectedVoice = aiSettings?.audioVoice || "nova";
        const elevenlabsVoiceId = aiSettings?.elevenlabsVoiceId || "JBFqnCBsd6RMkjVDRZzb";
        const ttsSpeed = aiSettings?.ttsSpeed ? aiSettings.ttsSpeed / 100 : 1.0;
        const ttsInstructions = aiSettings?.ttsInstructions || null;
        console.log("=== SENDING AUDIO ===", ttsProvider, selectedVoice, ttsSpeed);

        const audioSent = await sendAudioResponse(from, aiResult.response, selectedVoice, { speed: ttsSpeed, instructions: ttsInstructions, provider: ttsProvider, elevenlabsVoiceId });
        if (audioSent) {
          waMessageId = `audio_${Date.now()}`;
          waResponse = { messages: [{ id: waMessageId }] };
        } else {
          console.log("=== AUDIO FAILED, TEXT FALLBACK ===");
          waResponse = await sendAiResponseToWhatsApp(from, aiResult.response);
          waMessageId = waResponse.messages[0].id;
        }
      } else {
        waResponse = await sendAiResponseToWhatsApp(from, aiResult.response);
        waMessageId = waResponse.messages[0].id;
      }

      await storage.createMessage({
        conversationId,
        waMessageId,
        direction: "out",
        type: "text",
        text: aiResult.response,
        timestamp: Math.floor(Date.now() / 1000).toString(),
        status: "sent",
        rawJson: waResponse,
      });

      const updateData: any = {
        lastMessage: aiResult.response,
        lastMessageTimestamp: new Date(),
      };

      if (aiResult.orderReady) {
        updateData.orderStatus = 'ready';
        console.log("=== MARKING ORDER AS READY ===", conversationId);
        sendPushNotification(
          "Pedido Listo para Enviar",
          `${name}: Pedido completo, listo para despachar`,
          { conversationId: conversationId.toString(), waId: from, event: "order_ready" },
          getConversationPushOptions(conversation)
        );
      }

      if (aiResult.shouldCall) {
        updateData.shouldCall = true;
        console.log("=== MARKING FOR CALL (NEUROVENTA) ===", conversationId);
        sendPushNotification(
          "Llamar al Cliente",
          `${name}: Alta probabilidad de compra - llamar ahora`,
          { conversationId: conversationId.toString(), waId: from, event: "should_call" },
          getConversationPushOptions(conversation)
        );
      }

      await storage.updateConversation(conversationId, updateData);

      if (aiResult.imageUrl) {
        const imgResponse = await sendToWhatsApp(from, 'image', { imageUrl: aiResult.imageUrl });
        await storage.createMessage({
          conversationId,
          waMessageId: imgResponse.messages[0].id,
          direction: "out",
          type: "image",
          // Keep the source URL so the UI can render outbound AI images even without mediaId.
          text: aiResult.imageUrl,
          mediaId: null,
          mimeType: null,
          timestamp: Math.floor(Date.now() / 1000).toString(),
          status: "sent",
          rawJson: imgResponse,
        });
      }

      console.log("=== AI RESPONSE SENT (BUFFERED) ===");
      console.log("Response:", aiResult.response);
      console.log("Tokens:", aiResult.tokensUsed);
    }
  } catch (aiError) {
    console.error("AI Response Error (buffered):", aiError);
  }
}

// Debug log storage for production troubleshooting
const audioDebugLogs: Array<{ timestamp: string; step: string; data: any }> = [];
function logAudioDebug(step: string, data: any) {
  const entry = { timestamp: new Date().toISOString(), step, data };
  audioDebugLogs.push(entry);
  if (audioDebugLogs.length > 50) audioDebugLogs.shift(); // Keep last 50 entries
  console.log(`[Audio] ${step}:`, JSON.stringify(data));
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function parseMetaAttributes(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrRegex = /([a-zA-Z_:.-]+)\s*=\s*(['"])(.*?)\2/g;
  let match: RegExpExecArray | null;
  while ((match = attrRegex.exec(tag)) !== null) {
    attrs[match[1].toLowerCase()] = match[3];
  }
  return attrs;
}

function extractOgImageFromHtml(html: string, pageUrl: string): string | null {
  const metaTagRegex = /<meta\s+[^>]*>/gi;
  let tagMatch: RegExpExecArray | null;
  while ((tagMatch = metaTagRegex.exec(html)) !== null) {
    const attrs = parseMetaAttributes(tagMatch[0]);
    const property = (attrs.property || attrs.name || "").toLowerCase().trim();
    if (!["og:image", "og:image:url", "twitter:image", "twitter:image:src"].includes(property)) continue;
    const content = decodeHtmlEntities((attrs.content || "").trim());
    if (!content) continue;
    try {
      return new URL(content, pageUrl).toString();
    } catch {
      continue;
    }
  }
  return null;
}

async function fetchOgImageFromProvider(targetUrl: string): Promise<string | null> {
  try {
    const providerResponse = await axios.get("https://api.microlink.io/", {
      timeout: 9000,
      params: {
        url: targetUrl,
        screenshot: false,
        video: false,
        audio: false,
      },
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; RyzappLinkPreview/1.0)",
        Accept: "application/json",
      },
    });
    const candidate =
      providerResponse.data?.data?.image?.url ||
      providerResponse.data?.data?.logo?.url ||
      "";
    if (!candidate) return null;
    return new URL(String(candidate), targetUrl).toString();
  } catch {
    return null;
  }
}

function inferAudioMimeType(rawMimeType: string, filename: string): string {
  const normalized = String(rawMimeType || "").toLowerCase().split(";")[0].trim();
  if (normalized && normalized !== "application/octet-stream") return normalized;

  const ext = path.extname(filename || "").toLowerCase();
  if (ext === ".mp3") return "audio/mpeg";
  if (ext === ".m4a" || ext === ".mp4") return "audio/mp4";
  if (ext === ".ogg" || ext === ".oga" || ext === ".opus") return "audio/ogg";
  if (ext === ".aac") return "audio/aac";
  if (ext === ".amr") return "audio/amr";
  if (ext === ".wav") return "audio/wav";
  if (ext === ".webm") return "audio/webm";
  if (ext === ".3gp" || ext === ".3gpp") return "audio/3gpp";
  return normalized;
}

async function transcodeToWhatsAppAudio(input: Buffer): Promise<Buffer> {
  const ffmpegPath = ffmpegStatic || process.env.FFMPEG_PATH || "ffmpeg";

  return await new Promise<Buffer>((resolve, reject) => {
    const args = [
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      "pipe:0",
      "-vn",
      "-ac",
      "1",
      "-ar",
      "16000",
      "-c:a",
      "libopus",
      "-b:a",
      "32k",
      "-f",
      "ogg",
      "pipe:1",
    ];
    const ffmpeg = spawn(ffmpegPath, args, { stdio: ["pipe", "pipe", "pipe"] });
    const outChunks: Buffer[] = [];
    const errChunks: Buffer[] = [];

    ffmpeg.stdout.on("data", (chunk: Buffer) => outChunks.push(chunk));
    ffmpeg.stderr.on("data", (chunk: Buffer) => errChunks.push(chunk));
    ffmpeg.on("error", (err) => reject(new Error(`FFmpeg spawn error: ${err.message}`)));
    ffmpeg.on("close", (code) => {
      if (code !== 0) {
        const stderr = Buffer.concat(errChunks).toString("utf8").trim();
        return reject(new Error(stderr || `FFmpeg exited with code ${code}`));
      }
      const output = Buffer.concat(outChunks);
      if (!output.length) return reject(new Error("FFmpeg output is empty"));
      resolve(output);
    });

    ffmpeg.stdin.on("error", () => {
      // ignore EPIPE when ffmpeg exits early on invalid input
    });
    ffmpeg.stdin.end(input);
  });
}

// Download audio from WhatsApp and transcribe with Whisper
async function transcribeWhatsAppAudio(mediaId: string, mimeType?: string): Promise<string | null> {
  const token = process.env.META_ACCESS_TOKEN;
  const openaiKey = process.env.OPENAI_API_KEY;
  
  logAudioDebug("START", { mediaId, mimeType, hasToken: !!token, hasOpenAI: !!openaiKey });
  
  if (!token) {
    logAudioDebug("ERROR", { reason: "Missing META_ACCESS_TOKEN" });
    return null;
  }
  
  if (!openaiKey) {
    logAudioDebug("ERROR", { reason: "Missing OPENAI_API_KEY" });
    return null;
  }
  
  // Create OpenAI client with current API key
  const openai = new OpenAI({ apiKey: openaiKey });

  // Determine file extension from mime type
  // Note: OpenAI Whisper accepts: flac, m4a, mp3, mp4, mpeg, mpga, oga, ogg, wav, webm
  // WhatsApp sends "audio/ogg; codecs=opus" - must use .ogg extension (not .opus)
  let extension = ".ogg";
  if (mimeType) {
    if (mimeType.includes("ogg") || mimeType.includes("opus")) extension = ".ogg";
    else if (mimeType.includes("mp3") || mimeType.includes("mpeg")) extension = ".mp3";
    else if (mimeType.includes("mp4") || mimeType.includes("m4a")) extension = ".m4a";
    else if (mimeType.includes("wav")) extension = ".wav";
    else if (mimeType.includes("webm")) extension = ".webm";
    else if (mimeType.includes("flac")) extension = ".flac";
  }

  let tempPath: string | null = null;

  try {
    // Step 1: Get media URL from WhatsApp
    logAudioDebug("STEP1_GET_URL", { mediaId });
    const mediaResponse = await axios.get(
      `https://graph.facebook.com/v24.0/${mediaId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    
    const mediaUrl = mediaResponse.data.url;
    const mediaMimeType = mediaResponse.data.mime_type || mimeType;
    logAudioDebug("STEP1_SUCCESS", { hasUrl: !!mediaUrl, mime: mediaMimeType });

    // Step 2: Download the audio file
    logAudioDebug("STEP2_DOWNLOAD", { urlPrefix: mediaUrl?.substring(0, 50) });
    const audioResponse = await axios.get(mediaUrl, {
      headers: { Authorization: `Bearer ${token}` },
      responseType: 'arraybuffer'
    });

    const audioSize = audioResponse.data.byteLength;
    logAudioDebug("STEP2_SUCCESS", { size: audioSize });

    if (audioSize < 100) {
      logAudioDebug("ERROR", { reason: "File too small", size: audioSize });
      return null;
    }

    // Step 3: Save to temp file
    tempPath = path.join(os.tmpdir(), `wa_audio_${mediaId}${extension}`);
    fs.writeFileSync(tempPath, Buffer.from(audioResponse.data));
    logAudioDebug("STEP3_SAVED", { path: tempPath, extension });

    // Step 4: Transcribe with OpenAI Whisper
    logAudioDebug("STEP4_TRANSCRIBE", { model: "whisper-1" });
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(tempPath),
      model: "whisper-1",
      language: "es"
    });
    
    logAudioDebug("STEP4_SUCCESS", { text: transcription.text });
    return transcription.text || null;

  } catch (error: any) {
    logAudioDebug("ERROR", { 
      message: error.message, 
      status: error.response?.status,
      data: error.response?.data 
    });
    return null;
  } finally {
    if (tempPath && fs.existsSync(tempPath)) {
      try {
        fs.unlinkSync(tempPath);
        logAudioDebug("CLEANUP", { deleted: tempPath });
      } catch (e: any) {
        logAudioDebug("CLEANUP_ERROR", { error: e.message });
      }
    }
  }
}

// TTS options interface
interface TtsOptions {
  speed?: number; // 0.25 - 4.0, default 1.0
  instructions?: string | null; // Only for realistic voices
  provider?: string; // "openai" or "elevenlabs"
  elevenlabsVoiceId?: string; // ElevenLabs voice ID
}

// Get ElevenLabs API key via Replit connector
async function getElevenLabsApiKey(): Promise<string> {
  const directApiKey = process.env.ELEVENLABS_API_KEY;
  if (directApiKey && directApiKey.trim().length > 0) {
    return directApiKey.trim();
  }

  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? 'repl ' + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? 'depl ' + process.env.WEB_REPL_RENEWAL
    : null;

  if (!xReplitToken) {
    throw new Error('ElevenLabs connector token not found');
  }

  const res = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=elevenlabs',
    { headers: { 'Accept': 'application/json', 'X_REPLIT_TOKEN': xReplitToken } }
  );
  const data = await res.json();
  const conn = data.items?.[0];
  if (!conn || !conn.settings?.api_key) {
    throw new Error('ElevenLabs not connected');
  }
  return conn.settings.api_key;
}

function getElevenLabsErrorMessage(error: any): string {
  const data = error?.response?.data;
  if (!data) return error?.message || "Unknown ElevenLabs error";
  if (Buffer.isBuffer(data)) {
    try {
      return JSON.parse(data.toString("utf8")).detail?.message || data.toString("utf8");
    } catch {
      return data.toString("utf8");
    }
  }
  if (typeof data === "string") return data;
  return data?.detail?.message || data?.detail || data?.message || JSON.stringify(data);
}

// Generate audio buffer using ElevenLabs TTS with model fallback for account compatibility
async function generateElevenLabsAudio(text: string, voiceId: string): Promise<Buffer> {
  const apiKey = await getElevenLabsApiKey();
  const modelsToTry = ["eleven_flash_v2_5", "eleven_turbo_v2_5", "eleven_multilingual_v2"];
  const attemptErrors: string[] = [];

  for (const modelId of modelsToTry) {
    try {
      const response = await axios.post(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128&optimize_streaming_latency=4`,
        {
          text,
          model_id: modelId,
          language_code: "es",
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            use_speaker_boost: false,
          },
        },
        {
          headers: {
            "xi-api-key": apiKey,
            "Content-Type": "application/json",
            Accept: "audio/mpeg",
          },
          responseType: "arraybuffer",
        }
      );
      console.log("[ElevenLabs] TTS success", { voiceId, modelId, size: response.data?.byteLength || 0 });
      return Buffer.from(response.data);
    } catch (error: any) {
      const message = getElevenLabsErrorMessage(error);
      attemptErrors.push(`${modelId}: ${message}`);
      console.error("[ElevenLabs] TTS attempt failed", { voiceId, modelId, message });
    }
  }

  throw new Error(`ElevenLabs TTS failed. ${attemptErrors.join(" | ")}`);
}

async function generateTtsAudioBuffer(
  text: string,
  voice: string = "nova",
  options: TtsOptions = {},
  output: "whatsapp" | "preview" = "whatsapp",
): Promise<{ audioBuffer: Buffer; fileExt: "mp3" | "opus"; contentType: string }> {
  const provider = options.provider || "openai";
  const isElevenLabs = provider === "elevenlabs";
  const openaiKey = process.env.OPENAI_API_KEY;

  if (isElevenLabs) {
    const elVoiceId = options.elevenlabsVoiceId || "JBFqnCBsd6RMkjVDRZzb";
    const audioBuffer = await generateElevenLabsAudio(text, elVoiceId);
    return {
      audioBuffer,
      fileExt: "mp3",
      contentType: "audio/mpeg",
    };
  }

  if (!openaiKey) {
    throw new Error("Missing OpenAI API key");
  }

  const openai = new OpenAI({ apiKey: openaiKey });
  const realisticVoices = ["ash", "ballad", "sage", "verse", "marin", "cedar"];
  const isRealisticVoice = realisticVoices.includes(voice.toLowerCase());
  const ttsModel = isRealisticVoice ? "gpt-4o-mini-tts" : "tts-1";
  const speed = options.speed ? Math.max(0.25, Math.min(4.0, options.speed)) : 1.0;
  const responseFormat = output === "preview" ? "mp3" : "opus";

  const ttsRequest: any = {
    model: ttsModel,
    voice: voice as any,
    input: text,
    response_format: responseFormat,
    speed,
  };

  if (isRealisticVoice && options.instructions) {
    ttsRequest.instructions = options.instructions;
  }

  const audioResponse = await openai.audio.speech.create(ttsRequest);
  const audioBuffer = Buffer.from(await audioResponse.arrayBuffer());
  if (output === "preview") {
    return {
      audioBuffer,
      fileExt: "mp3",
      contentType: "audio/mpeg",
    };
  }

  return {
    audioBuffer,
    fileExt: "opus",
    contentType: "audio/ogg; codecs=opus",
  };
}

// Generate audio response and send via WhatsApp
async function sendAudioResponse(phoneNumber: string, text: string, voice: string = "nova", options: TtsOptions = {}): Promise<boolean> {
  const token = process.env.META_ACCESS_TOKEN;
  const phoneNumberId = process.env.WA_PHONE_NUMBER_ID;
  
  if (!token || !phoneNumberId) {
    console.log("[TTS] Missing WhatsApp credentials");
    return false;
  }
  
  const provider = options.provider || "openai";
  
  let tempPath: string | null = null;
  
  try {
    const generated = await generateTtsAudioBuffer(text, voice, options, "whatsapp");
    const audioBuffer = generated.audioBuffer;
    const fileExt = generated.fileExt;
    const contentType = generated.contentType;
    console.log("[TTS] Audio generated:", audioBuffer.length, "bytes", { provider, fileExt });
    
    tempPath = path.join(os.tmpdir(), `tts_${Date.now()}.${fileExt}`);
    fs.writeFileSync(tempPath, audioBuffer);
    
    // Step 3: Upload to WhatsApp Media
    const FormData = (await import('form-data')).default;
    const formData = new FormData();
    formData.append('file', fs.createReadStream(tempPath), {
      filename: `audio.${fileExt}`,
      contentType: contentType
    });
    formData.append('messaging_product', 'whatsapp');
    formData.append('type', contentType);
    
    const uploadResponse = await axios.post(
      `https://graph.facebook.com/v24.0/${phoneNumberId}/media`,
      formData,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          ...formData.getHeaders()
        }
      }
    );
    
    const mediaId = uploadResponse.data.id;
    console.log("[TTS] Media uploaded, ID:", mediaId);
    
    // Step 4: Send audio message
    const formattedPhone = phoneNumber.startsWith('+') ? phoneNumber.slice(1) : phoneNumber;
    await axios.post(
      `https://graph.facebook.com/v24.0/${phoneNumberId}/messages`,
      {
        messaging_product: "whatsapp",
        to: formattedPhone,
        type: "audio",
        audio: { id: mediaId }
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      }
    );
    
    console.log("[TTS] Audio message sent successfully");
    return true;
    
  } catch (error: any) {
    console.error("[TTS] Error:", error.message);
    if (error.response?.data) {
      console.error("[TTS] Details:", JSON.stringify(error.response.data));
    }
    return false;
  } finally {
    if (tempPath && fs.existsSync(tempPath)) {
      try { fs.unlinkSync(tempPath); } catch (e) {}
    }
  }
}

// Push notification logs (in-memory, max 50)
const pushLogs: Array<{timestamp: string, title: string, message: string, event: string, success: boolean, error?: string}> = [];
const waStatusLogs: Array<{
  timestamp: string;
  messageId?: string;
  recipientId?: string;
  status?: string;
  conversationId?: string;
  errors?: any;
}> = [];

// Send push notification via OneSignal
async function sendPushNotification(
  title: string,
  message: string,
  data?: Record<string, string>,
  options?: { targetExternalIds?: string[] },
) {
  const apiKey = process.env.ONESIGNAL_REST_API_KEY;
  const appId = process.env.ONESIGNAL_APP_ID;
  const configuredSegmentsRaw = process.env.ONESIGNAL_SEGMENTS || process.env.ONESIGNAL_SEGMENT || "Subscribed Users";
  const configuredSegments = configuredSegmentsRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const timestamp = new Date().toISOString();
  const event = data?.event || "unknown";
  const uniqueTopic = `${event}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const targetExternalIds = options?.targetExternalIds?.filter(Boolean) || [];
  const targetUrl = getPushTargetUrl(data);

  console.log("[OneSignal] Attempting to send notification:", { title, message });
  console.log("[OneSignal] API Key configured:", !!apiKey);

  if (!apiKey) {
    console.log("[OneSignal] ERROR: API key not configured, skipping push notification");
    pushLogs.unshift({ timestamp, title, message, event, success: false, error: "API key not configured" });
    if (pushLogs.length > 50) pushLogs.pop();
    return;
  }

  if (!appId) {
    console.log("[OneSignal] ERROR: App ID not configured, skipping push notification");
    pushLogs.unshift({ timestamp, title, message, event, success: false, error: "App ID not configured" });
    if (pushLogs.length > 50) pushLogs.pop();
    return;
  }

  try {
    const payload: Record<string, any> = {
      app_id: appId,
      headings: { en: title },
      contents: { en: message },
      data: data || {},
      url: targetUrl,
      chrome_web_icon: "https://ryzapp.org/icon-512.png",
      web_push_topic: uniqueTopic,
      ttl: 60,
    };

    if (targetExternalIds.length > 0) {
      payload.include_aliases = { external_id: targetExternalIds };
      payload.target_channel = "push";
    } else {
      payload.included_segments = configuredSegments;
    }
    
    console.log("[OneSignal] Sending payload:", JSON.stringify(payload, null, 2));
    
    const response = await axios.post(
      "https://onesignal.com/api/v1/notifications",
      payload,
      {
        headers: {
          Authorization: `Basic ${apiKey}`,
          "Content-Type": "application/json",
        },
      }
    );
    console.log("[OneSignal] SUCCESS - Response:", JSON.stringify(response.data, null, 2));
    pushLogs.unshift({ timestamp, title, message, event, success: true });
    if (pushLogs.length > 50) pushLogs.pop();
  } catch (error: any) {
    console.error("[OneSignal] FAILED - Error:", error.response?.data || error.message);
    const errorMsg = JSON.stringify(error.response?.data) || error.message;
    
    // If configured segment fails, try "All" segment as fallback
    if (
      targetExternalIds.length === 0 &&
      error.response?.data?.errors?.some?.((e: string) => typeof e === "string" && e.includes("Segment") && e.includes("was not found"))
    ) {
      console.log("[OneSignal] Retrying with 'All' segment...");
      try {
        const fallbackResponse = await axios.post(
          "https://onesignal.com/api/v1/notifications",
          {
            app_id: appId,
            included_segments: ["All"],
            headings: { en: title },
            contents: { en: message },
            data: data || {},
            url: targetUrl,
            chrome_web_icon: "https://ryzapp.org/icon-512.png",
            web_push_topic: uniqueTopic,
            ttl: 60,
          },
          {
            headers: {
              Authorization: `Basic ${apiKey}`,
              "Content-Type": "application/json",
            },
          }
        );
        console.log("[OneSignal] Fallback SUCCESS:", JSON.stringify(fallbackResponse.data, null, 2));
        pushLogs.unshift({ timestamp, title, message, event, success: true });
        if (pushLogs.length > 50) pushLogs.pop();
      } catch (fallbackError: any) {
        console.error("[OneSignal] Fallback FAILED:", fallbackError.response?.data || fallbackError.message);
        pushLogs.unshift({ timestamp, title, message, event, success: false, error: errorMsg });
        if (pushLogs.length > 50) pushLogs.pop();
      }
    } else {
      pushLogs.unshift({ timestamp, title, message, event, success: false, error: errorMsg });
      if (pushLogs.length > 50) pushLogs.pop();
    }
  }
}

async function flushIncomingPushSummary(conversationId: number) {
  const state = incomingPushStateByConversation.get(conversationId);
  if (!state) return;

  state.timer = null;
  if (state.pendingCount <= 0) return;
  const prefs = await getPushNotificationPreferences();
  if (!prefs.notifyNewMessages) {
    state.pendingCount = 0;
    return;
  }

  const count = state.pendingCount;
  const summaryTitle = count === 1 ? "Nuevo mensaje" : "Nuevos mensajes";
  const summaryMessage =
    count === 1
      ? `${state.senderName}: ${state.latestPreview}`
      : `${state.senderName}: ${count} mensajes nuevos`;

  sendPushNotification(summaryTitle, summaryMessage, {
    conversationId: conversationId.toString(),
    event: "incoming_message_batch",
    count: count.toString(),
  }, {
    targetExternalIds: state.targetExternalIds,
  });

  state.pendingCount = 0;
  state.lastSentAt = Date.now();
}

async function queueIncomingMessagePush(
  conversationId: number,
  senderName: string,
  previewRaw: string | null | undefined,
  waId: string,
  assignedAgentId?: number | null,
) {
  const prefs = await getPushNotificationPreferences();
  if (!prefs.notifyNewMessages) return;
  const preview = (previewRaw || "[Mensaje]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  const safeSender = senderName || waId;
  const now = Date.now();
  const targetExternalIds = getPushRecipientExternalIds(assignedAgentId);

  let state = incomingPushStateByConversation.get(conversationId);
  if (!state) {
    sendPushNotification("Nuevo mensaje", `${safeSender}: ${preview}`, {
      conversationId: conversationId.toString(),
      waId,
      event: "incoming_message",
    }, {
      targetExternalIds,
    });
    incomingPushStateByConversation.set(conversationId, {
      lastSentAt: now,
      pendingCount: 0,
      latestPreview: preview,
      senderName: safeSender,
      targetExternalIds,
      timer: null,
    });
    return;
  }

  state.pendingCount += 1;
  state.latestPreview = preview;
  state.senderName = safeSender;
  state.targetExternalIds = targetExternalIds;

  if (!state.timer) {
    const elapsed = now - state.lastSentAt;
    const delay = Math.max(0, INCOMING_PUSH_COOLDOWN_MS - elapsed);
    state.timer = setTimeout(() => {
      void flushIncomingPushSummary(conversationId);
    }, delay);
  }
}

// Endpoint to get push logs
export function getPushLogs() {
  return pushLogs;
}

// Parse interactive elements from AI response text
function parseInteractiveElements(text: string): { cleanText: string; buttons?: string[]; list?: { title: string; options: string[] } } {
  // Check for buttons: [BOTONES: opt1, opt2, opt3]
  const buttonMatch = text.match(/\[BOTONES:\s*(.+?)\]/i);
  if (buttonMatch) {
    const buttons = buttonMatch[1].split(',').map(b => b.trim()).filter(Boolean).slice(0, 3);
    const cleanText = text.replace(/\[BOTONES:\s*.+?\]/i, '').trim();
    if (buttons.length > 0) return { cleanText, buttons };
  }

  // Check for list: [LISTA: title | opt1, opt2, ..., opt10]
  const listMatch = text.match(/\[LISTA:\s*(.+?)\s*\|\s*(.+?)\]/i);
  if (listMatch) {
    const title = listMatch[1].trim();
    const options = listMatch[2].split(',').map(o => o.trim()).filter(Boolean).slice(0, 10);
    const cleanText = text.replace(/\[LISTA:\s*.+?\]/i, '').trim();
    if (options.length > 0) return { cleanText, list: { title, options } };
  }

  return { cleanText: text };
}

// Helper to send messages via Graph API
async function sendToWhatsApp(to: string, type: 'text' | 'image' | 'interactive', content: any) {
  const token = process.env.META_ACCESS_TOKEN;
  const phoneId = process.env.WA_PHONE_NUMBER_ID;

  console.log("=== SENDING MESSAGE ===");
  console.log("To:", to);
  console.log("Type:", type);
  console.log("PhoneId:", phoneId);
  console.log("Token exists:", !!token);

  if (!token || !phoneId) {
    throw new Error("Missing Meta configuration (token or phone ID)");
  }

  const url = `https://graph.facebook.com/v24.0/${phoneId}/messages`;
  
  const formattedTo = to.startsWith('+') ? to : `+${to}`;
  
  const payload: any = {
    messaging_product: "whatsapp",
    to: formattedTo,
    type: type,
  };

  if (type === 'text') {
    payload.text = { body: content.text };
  } else if (type === 'image') {
    payload.image = { link: content.imageUrl };
    if (content.caption) {
      payload.image.caption = content.caption;
    }
  } else if (type === 'interactive') {
    payload.interactive = content.interactive;
  }

  console.log("URL:", url);
  console.log("Payload:", JSON.stringify(payload, null, 2));

  try {
    const response = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
    console.log("WhatsApp Response:", JSON.stringify(response.data, null, 2));
    return response.data;
  } catch (error: any) {
    console.error("=== WHATSAPP API ERROR ===");
    console.error("Status:", error.response?.status);
    console.error("Error Data:", JSON.stringify(error.response?.data, null, 2));
    throw error;
  }
}

// Send AI response with interactive elements if detected
async function sendAiResponseToWhatsApp(to: string, responseText: string) {
  const parsed = parseInteractiveElements(responseText);

  if (parsed.buttons && parsed.buttons.length > 0) {
    const interactive = {
      type: "button",
      body: { text: parsed.cleanText || "Elige una opción:" },
      action: {
        buttons: parsed.buttons.map((btn, i) => ({
          type: "reply",
          reply: { id: `btn_${i}_${Date.now()}`, title: btn.substring(0, 20) },
        })),
      },
    };
    return sendToWhatsApp(to, 'interactive', { interactive });
  }

  if (parsed.list && parsed.list.options.length > 0) {
    const interactive = {
      type: "list",
      body: { text: parsed.cleanText || "Elige una opción:" },
      action: {
        button: parsed.list.title.substring(0, 20),
        sections: [{
          title: parsed.list.title.substring(0, 24),
          rows: parsed.list.options.map((opt, i) => ({
            id: `list_${i}_${Date.now()}`,
            title: opt.substring(0, 24),
          })),
        }],
      },
    };
    return sendToWhatsApp(to, 'interactive', { interactive });
  }

  return sendToWhatsApp(to, 'text', { text: responseText });
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // === SESSION SETUP ===
  const SessionStore = MemoryStore(session);
  app.use(
    session({
      secret: process.env.SESSION_SECRET || "default_secret",
      resave: false,
      saveUninitialized: false,
      cookie: { maxAge: 2592000000 }, // 30 days
      store: new SessionStore({
        checkPeriod: 86400000,
      }),
    })
  );

  // === DIAGNOSTIC ENDPOINTS (Public) ===
  app.get("/api/public-config", (_req, res) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.json({
      oneSignalAppId: process.env.ONESIGNAL_APP_ID || process.env.VITE_ONESIGNAL_APP_ID || null,
    });
  });

  app.get("/api/audio-logs", (req, res) => {
    res.json({ logs: audioDebugLogs, count: audioDebugLogs.length });
  });

  app.get("/api/test-whisper", async (req, res) => {
    try {
      const openaiKey = process.env.OPENAI_API_KEY;
      if (!openaiKey) {
        return res.json({ error: "OPENAI_API_KEY not configured", keyAvailable: false });
      }
      
      const openai = new OpenAI({ apiKey: openaiKey });
      
      // Try to list models to verify the key works
      const models = await openai.models.list();
      const audioModels = models.data.filter(m => 
        m.id.includes('whisper') || m.id.includes('transcribe') || m.id.includes('tts')
      );
      
      return res.json({
        keyAvailable: true,
        keyPrefix: openaiKey.substring(0, 12) + "...",
        audioModelsAvailable: audioModels.map(m => m.id),
        totalModels: models.data.length,
        hasWhisper: audioModels.some(m => m.id.includes('whisper')),
        hasTranscribe: audioModels.some(m => m.id.includes('transcribe'))
      });
    } catch (error: any) {
      return res.json({ error: error.message, keyAvailable: !!process.env.OPENAI_API_KEY });
    }
  });

  // === WEBHOOK DEBUG (Temporary) ===
  const webhookDebugLog: Array<{ timestamp: string; hasBody: boolean; object: string; entryCount: number; raw: string }> = [];
  
  app.get("/webhook-debug", (req, res) => {
    res.json({ count: webhookDebugLog.length, logs: webhookDebugLog });
  });

  // === WEBHOOK (Public) ===
  
  // Verification
  app.get("/webhook", (req, res) => {
    const verifyToken = process.env.WA_VERIFY_TOKEN;
    
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode && token) {
      if (mode === "subscribe" && token === verifyToken) {
        console.log("WEBHOOK_VERIFIED");
        res.status(200).send(challenge);
      } else {
        res.sendStatus(403);
      }
    } else {
      res.sendStatus(400);
    }
  });

  // Receiving messages
  app.post("/webhook", async (req, res) => {
    console.log("=== WEBHOOK RECEIVED ===");
    console.log("Body:", JSON.stringify(req.body, null, 2));
    
    webhookDebugLog.push({
      timestamp: new Date().toISOString(),
      hasBody: !!req.body,
      object: req.body?.object || "none",
      entryCount: req.body?.entry?.length || 0,
      raw: JSON.stringify(req.body).substring(0, 500),
    });
    if (webhookDebugLog.length > 20) webhookDebugLog.shift();
    
    // Always return 200 OK to Meta immediately
    res.sendStatus(200);

    try {
      const body = req.body;
      
      // Basic validation of the payload structure
      if (!body.object) {
        console.log("No body.object found, skipping");
        return;
      }

      if (body.object === "whatsapp_business_account") {
        for (const entry of body.entry || []) {
          for (const change of entry.changes || []) {
            const value = change.value;
            
            if (!value) continue;

            // Handle Messages (iterate ALL messages in payload)
            if (value.messages && value.messages.length > 0) {
              for (const msg of value.messages) {
              console.log("=== MESSAGE RECEIVED ===");
              console.log("Message ID:", msg.id);
              console.log("From:", msg.from);
              console.log("Type:", msg.type);
              const from = msg.from; // wa_id
              const name = value.contacts?.[0]?.profile?.name || from;
              
              let messageText: string | null = null;
              let messageForAi: string | null = null;
              let wasAudioMessage = false;
              let imageBase64ForAi: string | undefined = undefined;
              
              if (msg.type === 'text') {
                messageText = msg.text.body;
                messageForAi = msg.text.body;
              } else if (msg.type === 'location') {
                // Handle location/GPS/Maps messages
                const loc = msg.location;
                const lat = loc?.latitude;
                const lon = loc?.longitude;
                const locName = loc?.name || '';
                const locAddress = loc?.address || '';
                
                messageText = locName 
                  ? `[Ubicación: ${locName}${locAddress ? ' - ' + locAddress : ''}]`
                  : `[Ubicación GPS: ${lat}, ${lon}]`;
                
                // Tell AI they received a location/address
                messageForAi = `[El cliente envió su UBICACIÓN/DIRECCIÓN DE ENTREGA: ${locName || 'Ubicación GPS'}${locAddress ? ', ' + locAddress : ''}. Coordenadas: ${lat}, ${lon}. Esto significa que está compartiendo su dirección para un pedido.]`;
                
                console.log("=== LOCATION RECEIVED ===", { lat, lon, locName, locAddress });
              } else if (msg.type === 'image') {
                messageText = '[Imagen]';
                const imageId = msg.image?.id;
                
                if (imageId) {
                  try {
                    // Download image from WhatsApp and convert to base64 for vision
                    const token = process.env.META_ACCESS_TOKEN;
                    const mediaResponse = await axios.get(
                      `https://graph.facebook.com/v24.0/${imageId}`,
                      { headers: { Authorization: `Bearer ${token}` } }
                    );
                    const mediaUrl = mediaResponse.data.url;
                    
                    const imageResponse = await axios.get(mediaUrl, {
                      headers: { Authorization: `Bearer ${token}` },
                      responseType: 'arraybuffer'
                    });
                    
                    imageBase64ForAi = Buffer.from(imageResponse.data).toString('base64');
                    messageForAi = 'El cliente envió esta imagen. Analiza qué producto muestra y responde.';
                    console.log("=== IMAGE DOWNLOADED FOR VISION ===", { imageId, size: imageResponse.data.byteLength });
                  } catch (imgError) {
                    console.error("Error downloading image for vision:", imgError);
                    messageForAi = '[El cliente envió una imagen que no se pudo analizar]';
                  }
                } else {
                  messageForAi = '[El cliente envió una imagen]';
                }
              } else if (msg.type === 'sticker') {
                messageText = '[Sticker]';
                messageForAi = '[El cliente envió un sticker]';
              } else if (msg.type === 'audio') {
                // Handle voice notes and audio messages
                wasAudioMessage = true;
                const audioId = msg.audio?.id;
                const audioMimeType = msg.audio?.mime_type;
                console.log("=== AUDIO MESSAGE RECEIVED ===", { audioId, mimeType: audioMimeType });
                
                if (audioId) {
                  // Transcribe the audio with Whisper
                  const transcription = await transcribeWhatsAppAudio(audioId, audioMimeType);
                  
                  if (transcription) {
                    messageText = `[Audio]: "${transcription}"`;
                    messageForAi = transcription; // Pass transcription directly to AI
                    console.log("=== AUDIO TRANSCRIBED ===", transcription);
                  } else {
                    messageText = '[Audio - no se pudo transcribir]';
                    messageForAi = '[El cliente envió un audio que no se pudo transcribir]';
                  }
                } else {
                  messageText = '[Audio]';
                  messageForAi = '[El cliente envió un audio]';
                }
              } else if (msg.type === 'interactive') {
                // Handle button or list replies
                const interactiveReply = msg.interactive;
                if (interactiveReply?.type === 'button_reply') {
                  messageText = interactiveReply.button_reply.title;
                  messageForAi = interactiveReply.button_reply.title;
                } else if (interactiveReply?.type === 'list_reply') {
                  messageText = interactiveReply.list_reply.title;
                  messageForAi = interactiveReply.list_reply.title;
                } else {
                  messageText = `[Respuesta interactiva]`;
                  messageForAi = `[El cliente seleccionó una opción interactiva]`;
                }
                console.log("=== INTERACTIVE REPLY ===", messageText);
              } else {
                messageText = `[${msg.type}]`;
                messageForAi = `[El cliente envió un mensaje de tipo: ${msg.type}]`;
              }

              // 2. Ensure Conversation Exists (now using correct messageText)
              let conversation = await storage.getConversationByWaId(from);
              if (!conversation) {
                const nextAgent = await storage.getNextAgentForAssignment();
                conversation = await storage.createConversation({
                  waId: from,
                  contactName: name,
                  lastMessage: messageText || `[${msg.type}]`,
                  lastMessageTimestamp: new Date(parseInt(msg.timestamp) * 1000),
                  assignedAgentId: nextAgent?.id || null,
                });
                if (nextAgent) {
                  console.log(`[Auto-Assign] New conversation assigned to agent: ${nextAgent.name} (id: ${nextAgent.id})`);
                }
              } else {
                await storage.updateConversation(conversation.id, {
                  contactName: name,
                  lastMessage: messageText || `[${msg.type}]`,
                  lastMessageTimestamp: new Date(parseInt(msg.timestamp) * 1000),
                  lastFollowUpAt: null,
                });
              }

              // 3. Prevent Duplicate Messages
              const existing = await storage.getMessageByWaId(msg.id);
              if (existing) continue;

              // 4. Save Message (include mediaId for images, stickers and audio)
              const mediaId = msg.image?.id || msg.sticker?.id || msg.audio?.id || null;
              const mimeType = msg.image?.mime_type || msg.sticker?.mime_type || msg.audio?.mime_type || null;
              
              await storage.createMessage({
                conversationId: conversation.id,
                waMessageId: msg.id,
                direction: "in",
                type: msg.type,
                text: messageText,
                mediaId: mediaId,
                mimeType: mimeType,
                timestamp: msg.timestamp,
                status: "received",
                rawJson: msg,
              });

              await queueIncomingMessagePush(
                conversation.id,
                conversation.contactName || name || from,
                messageText,
                from,
                conversation.assignedAgentId,
              );

              // 5. AI Auto-Response with debounce buffer (groups rapid messages)
              let agentAllowsAi = true;
              if (conversation.assignedAgentId) {
                const assignedAgent = await storage.getAgent(conversation.assignedAgentId);
                if (assignedAgent && assignedAgent.isAiAutoReplyEnabled === false) {
                  agentAllowsAi = false;
                }
              }
              if (messageForAi && !conversation.aiDisabled && agentAllowsAi) {
                const bufferedMsg: BufferedMessage = {
                  messageForAi,
                  imageBase64ForAi,
                  wasAudioMessage,
                  conversationId: conversation.id,
                  from,
                  name,
                };

                const existing = messageBuffers.get(from);
                if (existing) {
                  clearTimeout(existing.timer);
                  existing.messages.push(bufferedMsg);
                  if (existing.messages.length >= 10) {
                    flushMessageBuffer(from);
                    console.log(`=== BUFFER FULL, FLUSHING for ${from} ===`);
                  } else {
                    existing.timer = setTimeout(() => flushMessageBuffer(from), AI_DEBOUNCE_MS);
                    console.log(`=== BUFFERED MESSAGE ${existing.messages.length} for ${from} ===`);
                  }
                } else {
                  const timer = setTimeout(() => flushMessageBuffer(from), AI_DEBOUNCE_MS);
                  messageBuffers.set(from, { messages: [bufferedMsg], timer });
                  console.log(`=== BUFFER STARTED for ${from} (${AI_DEBOUNCE_MS}ms) ===`);
                }
              }
              } // end for (const msg of value.messages)
            }

            // Handle Statuses (delivered, read)
            if (value.statuses && value.statuses.length > 0) {
              for (const status of value.statuses) {
                await storage.updateMessageStatus(status.id, status.status);
                const statusEntry = {
                  timestamp: new Date().toISOString(),
                  messageId: status.id,
                  recipientId: status.recipient_id,
                  status: status.status,
                  conversationId: status.conversation?.id,
                  errors: status.errors || null,
                };
                waStatusLogs.unshift(statusEntry);
                if (waStatusLogs.length > 100) waStatusLogs.pop();
                if (status.status === "failed") {
                  console.error("[WA STATUS FAILED]", JSON.stringify(statusEntry, null, 2));
                } else {
                  console.log("[WA STATUS]", status.id, status.status, status.recipient_id || "");
                }
              }
            }
          }
        }
      }
    } catch (error) {
      console.error("Error processing webhook:", error);
    }
  });


  // === AUTH MIDDLEWARE ===
  const requireAuth = (req: any, res: any, next: any) => {
    if (req.session && req.session.authenticated) {
      next();
    } else {
      res.status(401).json({ message: "Unauthorized" });
    }
  };

  // === API ROUTES ===

  // Auth
  app.post(api.auth.login.path, async (req, res) => {
    const { username, password } = api.auth.login.input.parse(req.body);
    if (await storage.validateAdmin(username, password)) {
      (req.session as any).authenticated = true;
      (req.session as any).username = username;
      (req.session as any).role = "admin";
      res.json({ success: true });
    } else {
      const agent = await storage.getAgentByUsername(username);
      if (agent && agent.password === password) {
        (req.session as any).authenticated = true;
        (req.session as any).username = agent.name;
        (req.session as any).role = "agent";
        (req.session as any).agentId = agent.id;
        res.json({ success: true });
      } else {
        res.status(401).json({ message: "Invalid credentials" });
      }
    }
  });

  app.post(api.auth.logout.path, (req, res) => {
    req.session.destroy(() => {
      res.json({ success: true });
    });
  });

  app.get(api.auth.me.path, (req, res) => {
    if ((req.session as any).authenticated) {
      res.json({ 
        authenticated: true, 
        username: (req.session as any).username,
        role: (req.session as any).role || "admin",
        agentId: (req.session as any).agentId,
      });
    } else {
      res.json({ authenticated: false });
    }
  });

  const requireAdmin = (req: any, res: any, next: any) => {
    if (req.session && req.session.authenticated && req.session.role === "admin") {
      next();
    } else {
      res.status(403).json({ message: "Admin access required" });
    }
  };

  // Conversations
  app.get(api.conversations.list.path, requireAuth, async (req, res) => {
    const limitRaw = typeof req.query.limit === "string" ? req.query.limit : undefined;
    const parsedLimit = limitRaw ? Number.parseInt(limitRaw, 10) : undefined;
    const limit = typeof parsedLimit === "number" && Number.isFinite(parsedLimit)
      ? parsedLimit
      : undefined;

    const beforeRaw = typeof req.query.before === "string" ? req.query.before : undefined;
    const parsedBefore = beforeRaw ? new Date(beforeRaw) : undefined;
    const before = parsedBefore && !Number.isNaN(parsedBefore.getTime()) ? parsedBefore : undefined;

    const assignedAgentId = (req.session as any).role === "agent"
      ? Number((req.session as any).agentId)
      : undefined;

    const page = await storage.getConversationsPage({
      limit,
      before,
      assignedAgentId,
    });
    res.json(page);
  });

  app.get(api.conversations.get.path, requireAuth, async (req, res) => {
    const id = parseInt(req.params.id as string);
    const conversation = await storage.getConversation(id);
    if (!conversation) return res.status(404).json({ message: "Conversation not found" });
    if ((req.session as any).role === "agent" && conversation.assignedAgentId !== (req.session as any).agentId) {
      return res.status(403).json({ message: "Access denied" });
    }
    const messages = await storage.getMessages(id);
    res.json({ conversation, messages });
  });

  app.delete("/api/conversations/:id", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id as string);
      await storage.deleteConversation(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting conversation:", error);
      res.status(500).json({ message: "Error deleting conversation" });
    }
  });

  // Sending
  app.post(api.messages.send.path, requireAuth, async (req, res) => {
    try {
      const { to, type, text, imageUrl, caption } = api.messages.send.input.parse(req.body);
      
      // 1. Send to WhatsApp
      const waResponse = await sendToWhatsApp(to, type, { text, imageUrl, caption });
      const waMessageId = waResponse.messages[0].id;

      // 2. Find conversation
      let conversation = await storage.getConversationByWaId(to);
      if (!conversation) {
        // Should ideally exist if we are replying, but create if new outbound
        conversation = await storage.createConversation({
          waId: to,
          contactName: to, // No name known yet
          lastMessage: type === 'text' ? text : '[image]',
          lastMessageTimestamp: new Date(),
        });
      } else {
         await storage.updateConversation(conversation.id, {
            lastMessage: type === 'text' ? text : '[image]',
            lastMessageTimestamp: new Date(),
         });
      }

      // 3. Save Message
      await storage.createMessage({
        conversationId: conversation.id,
        waMessageId: waMessageId,
        direction: "out",
        type: type,
        text: type === 'image' ? imageUrl : text,
        mediaId: null, // We sent a URL, no media ID usually unless uploaded
        mimeType: null,
        timestamp: Math.floor(Date.now() / 1000).toString(),
        status: "sent",
        rawJson: waResponse,
      });

      res.json({ success: true, messageId: waMessageId });

    } catch (error: any) {
      console.error("Send error:", error.response?.data || error.message);
      const errorData = error.response?.data?.error || {};
      res.status(500).json({ 
        message: "Failed to send message",
        error: {
          code: errorData.code || error.response?.status || "unknown",
          type: errorData.type || "api_error",
          details: errorData.message || error.message || "Unknown error"
        }
      });
    }
  });

  app.post("/api/send-image", requireAuth, upload.single("image"), async (req, res) => {
    try {
      const file = req.file;
      const to = req.body.to;
      const caption = req.body.caption || undefined;
      
      if (!file || !to) {
        return res.status(400).json({ message: "Missing image or recipient" });
      }

      const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
      if (!allowedTypes.includes(file.mimetype)) {
        return res.status(400).json({ message: "Formato no soportado. Usa JPG, PNG o WebP." });
      }

      const token = process.env.META_ACCESS_TOKEN;
      const phoneId = process.env.WA_PHONE_NUMBER_ID;
      if (!token || !phoneId) {
        return res.status(500).json({ message: "Missing Meta configuration" });
      }

      const FormData = (await import("form-data")).default;
      const formData = new FormData();
      formData.append("file", file.buffer, { filename: file.originalname, contentType: file.mimetype });
      formData.append("messaging_product", "whatsapp");
      formData.append("type", file.mimetype);

      const uploadRes = await axios.post(
        `https://graph.facebook.com/v24.0/${phoneId}/media`,
        formData,
        { headers: { Authorization: `Bearer ${token}`, ...formData.getHeaders() } }
      );
      const mediaId = uploadRes.data.id;

      const formattedTo = to.startsWith('+') ? to : `+${to}`;
      const payload: any = {
        messaging_product: "whatsapp",
        to: formattedTo,
        type: "image",
        image: { id: mediaId },
      };
      if (caption) payload.image.caption = caption;

      const waResponse = await axios.post(
        `https://graph.facebook.com/v24.0/${phoneId}/messages`,
        payload,
        { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } }
      );
      const waMessageId = waResponse.data.messages[0].id;

      const normalizedTo = to.replace(/^\+/, "");
      let conversation = await storage.getConversationByWaId(normalizedTo);
      if (!conversation) {
        conversation = await storage.createConversation({
          waId: normalizedTo, contactName: normalizedTo,
          lastMessage: "[imagen]", lastMessageTimestamp: new Date(),
        });
      } else {
        await storage.updateConversation(conversation.id, {
          lastMessage: "[imagen]", lastMessageTimestamp: new Date(),
        });
      }

      await storage.createMessage({
        conversationId: conversation.id, waMessageId,
        direction: "out", type: "image",
        text: caption || "[imagen]",
        mediaId, mimeType: file.mimetype,
        timestamp: Math.floor(Date.now() / 1000).toString(),
        status: "sent", rawJson: waResponse.data,
      });

      res.json({ success: true, messageId: waMessageId });
    } catch (error: any) {
      console.error("Image upload error:", error.response?.data || error.message);
      res.status(500).json({ message: "Failed to send image", error: error.message });
    }
  });

  // Labels
  app.get("/api/labels", requireAuth, async (req, res) => {
    const allLabels = await storage.getLabels();
    const session = req.session as any;
    if (session.role === "agent" && session.agentId) {
      // Return own + shared/admin labels so existing conversation labels always render.
      return res.json(allLabels.filter((l) => l.agentId === session.agentId || !l.agentId));
    }
    // Admin receives all labels so assigned labels from agents render in kanban/chat.
    return res.json(allLabels);
  });

  app.post("/api/labels", requireAuth, async (req, res) => {
    try {
      const parsed = api.labels.create.input.parse(req.body);
      const session = req.session as any;
      const agentId = session.role === "agent" ? (session.agentId || null) : null;
      const label = await storage.createLabel({ ...parsed, agentId });
      res.json(label);
    } catch (error) {
      res.status(400).json({ message: "Invalid label data" });
    }
  });

  app.patch("/api/labels/:id", requireAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ message: "Invalid label id" });
    }

    const parsed = z.object({
      name: z.string().min(1).max(50).optional(),
      color: z.string().min(1).max(20).optional(),
    }).safeParse(req.body);

    if (!parsed.success || (!parsed.data.name && !parsed.data.color)) {
      return res.status(400).json({ message: "Invalid label payload" });
    }

    const session = req.session as any;
    const label = await storage.getLabel(id);
    if (!label) {
      return res.status(404).json({ message: "Label not found" });
    }

    const isOwner = session.role === "agent"
      ? label.agentId === session.agentId
      : !label.agentId;
    if (!isOwner) {
      return res.status(403).json({ message: "Forbidden label access" });
    }

    const updates: { name?: string; color?: string } = {};
    if (parsed.data.name) {
      const trimmedName = parsed.data.name.trim();
      if (!trimmedName) {
        return res.status(400).json({ message: "Label name is required" });
      }
      updates.name = trimmedName;
    }
    if (parsed.data.color) updates.color = parsed.data.color;

    const updated = await storage.updateLabel(id, updates);
    return res.json(updated);
  });

  app.delete("/api/labels/:id", requireAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ message: "Invalid label id" });
    }

    const session = req.session as any;
    const label = await storage.getLabel(id);
    if (!label) {
      return res.status(404).json({ message: "Label not found" });
    }

    const isOwner = session.role === "agent"
      ? label.agentId === session.agentId
      : !label.agentId;
    if (!isOwner) {
      return res.status(403).json({ message: "Forbidden label access" });
    }

    await storage.clearLabelFromConversations(id);
    await storage.deleteLabel(id);
    return res.json({ success: true });
  });

  // Quick Messages
  app.get("/api/quick-messages", requireAuth, async (req, res) => {
    const qms = await storage.getQuickMessages();
    res.json(qms);
  });

  app.post("/api/quick-messages", requireAuth, async (req, res) => {
    try {
      const parsed = api.quickMessages.create.input.parse(req.body);
      const qm = await storage.createQuickMessage(parsed);
      res.json(qm);
    } catch (error) {
      res.status(400).json({ message: "Invalid quick message data" });
    }
  });

  app.delete("/api/quick-messages/:id", requireAuth, async (req, res) => {
    await storage.deleteQuickMessage(parseInt(req.params.id));
    res.json({ success: true });
  });

  // Agent message stats
  app.get("/api/agent-stats", requireAuth, async (req, res) => {
    try {
      const { sql } = await import("drizzle-orm");
      const rows = await db.execute(sql`
        SELECT 
          a.id as agent_id, a.name as agent_name,
          DATE(m.created_at) as date,
          COUNT(*) FILTER (WHERE m.direction IN ('in', 'incoming')) as incoming,
          COUNT(*) FILTER (WHERE m.direction IN ('out', 'outgoing')) as outgoing
        FROM messages m
        JOIN conversations c ON m.conversation_id = c.id
        JOIN agents a ON c.assigned_agent_id = a.id
        WHERE m.created_at >= NOW() - INTERVAL '30 days'
        GROUP BY a.id, a.name, DATE(m.created_at)
        ORDER BY DATE(m.created_at) DESC, a.name
      `);
      const result = (rows as unknown as any[]);
      const agentId = (req.session as any).agentId;
      if (agentId) {
        res.json(result.filter((r: any) => r.agent_id === agentId));
      } else {
        res.json(result);
      }
    } catch (error) {
      console.error("Agent stats error:", error);
      // Safe fallback: avoid breaking user UI due analytics errors
      res.json([]);
    }
  });

  app.post("/api/send-audio", requireAuth, uploadAudio.single("audio"), async (req, res) => {
    try {
      const file = req.file;
      const to = req.body.to;

      if (!file || !to) {
        return res.status(400).json({ message: "Missing audio or recipient" });
      }

      const normalizedMimeType = String(file.mimetype || "").toLowerCase();
      const inferredMimeType = inferAudioMimeType(normalizedMimeType, file.originalname);
      const allowedInputAudioPrefixes = [
        "audio/aac",
        "audio/amr",
        "audio/ogg",
        "audio/mpeg",
        "audio/mp3",
        "audio/mp4",
        "audio/x-m4a",
        "audio/wav",
        "audio/x-wav",
        "audio/webm",
        "audio/3gpp",
      ];
      const hasSupportedMime = allowedInputAudioPrefixes.some((prefix) => inferredMimeType.startsWith(prefix));
      if (!hasSupportedMime) {
        return res.status(400).json({
          message: "Formato no soportado. Usa MP3, M4A, OGG, AAC, AMR o WEBM.",
          error: `MIME detectado: ${inferredMimeType || normalizedMimeType || "desconocido"}`,
        });
      }

      const token = process.env.META_ACCESS_TOKEN;
      const phoneId = process.env.WA_PHONE_NUMBER_ID;
      if (!token || !phoneId) {
        return res.status(500).json({ message: "Missing Meta configuration" });
      }

      let transcodedBuffer: Buffer;
      try {
        transcodedBuffer = await transcodeToWhatsAppAudio(file.buffer);
      } catch (transcodeError: any) {
        console.error("Audio transcode error:", transcodeError?.message || transcodeError);
        return res.status(400).json({
          message: "No se pudo procesar el audio",
          error: transcodeError?.message || "Transcode failed",
        });
      }
      const mimeTypeForMeta = "audio/ogg";
      const uploadFilename = `audio-${Date.now()}.ogg`;

      const FormData = (await import("form-data")).default;
      const formData = new FormData();
      formData.append("file", transcodedBuffer, { filename: uploadFilename, contentType: mimeTypeForMeta });
      formData.append("messaging_product", "whatsapp");
      formData.append("type", mimeTypeForMeta);

      const uploadRes = await axios.post(
        `https://graph.facebook.com/v24.0/${phoneId}/media`,
        formData,
        { headers: { Authorization: `Bearer ${token}`, ...formData.getHeaders() } }
      );
      const mediaId = uploadRes.data.id;

      const formattedTo = to.startsWith('+') ? to : `+${to}`;
      const payload: any = {
        messaging_product: "whatsapp",
        to: formattedTo,
        type: "audio",
        audio: { id: mediaId },
      };

      const waResponse = await axios.post(
        `https://graph.facebook.com/v24.0/${phoneId}/messages`,
        payload,
        { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } }
      );
      const waMessageId = waResponse.data.messages[0].id;
      const waMessageStatus = waResponse.data.messages[0]?.message_status || null;

      const normalizedTo = to.replace(/^\+/, "");
      let conversation = await storage.getConversationByWaId(normalizedTo);
      if (!conversation) {
        conversation = await storage.createConversation({
          waId: normalizedTo, contactName: normalizedTo,
          lastMessage: "[audio]", lastMessageTimestamp: new Date(),
        });
      } else {
        await storage.updateConversation(conversation.id, {
          lastMessage: "[audio]", lastMessageTimestamp: new Date(),
        });
      }

      await storage.createMessage({
        conversationId: conversation.id, waMessageId,
        direction: "out", type: "audio",
        text: "[audio]",
        mediaId, mimeType: mimeTypeForMeta,
        timestamp: Math.floor(Date.now() / 1000).toString(),
        status: "sent", rawJson: waResponse.data,
      });

      res.json({ success: true, messageId: waMessageId, messageStatus: waMessageStatus });
    } catch (error: any) {
      const details = error.response?.data?.error?.message || error.response?.data?.message || error.message;
      console.error("Audio upload error:", error.response?.data || error.message);
      res.status(500).json({ message: "Failed to send audio", error: details });
    }
  });

  app.post("/api/send-document", requireAuth, uploadDocument.single("document"), async (req, res) => {
    try {
      const file = req.file;
      const to = req.body.to;
      const caption = req.body.caption || undefined;

      if (!file || !to) {
        return res.status(400).json({ message: "Missing document or recipient" });
      }

      const normalizedMimeType = String(file.mimetype || "").toLowerCase();
      const normalizedFileName = String(file.originalname || "").toLowerCase();
      const isPdf = normalizedMimeType === "application/pdf" || normalizedFileName.endsWith(".pdf");
      if (!isPdf) {
        return res.status(400).json({ message: "Formato no soportado. Solo PDF." });
      }

      const token = process.env.META_ACCESS_TOKEN;
      const phoneId = process.env.WA_PHONE_NUMBER_ID;
      if (!token || !phoneId) {
        return res.status(500).json({ message: "Missing Meta configuration" });
      }

      const safeFileName = file.originalname?.trim() || `documento-${Date.now()}.pdf`;
      const FormData = (await import("form-data")).default;
      const formData = new FormData();
      formData.append("file", file.buffer, { filename: safeFileName, contentType: "application/pdf" });
      formData.append("messaging_product", "whatsapp");
      formData.append("type", "application/pdf");

      const uploadRes = await axios.post(
        `https://graph.facebook.com/v24.0/${phoneId}/media`,
        formData,
        { headers: { Authorization: `Bearer ${token}`, ...formData.getHeaders() } }
      );
      const mediaId = uploadRes.data.id;

      const formattedTo = to.startsWith('+') ? to : `+${to}`;
      const payload: any = {
        messaging_product: "whatsapp",
        to: formattedTo,
        type: "document",
        document: { id: mediaId, filename: safeFileName },
      };
      if (caption) payload.document.caption = caption;

      const waResponse = await axios.post(
        `https://graph.facebook.com/v24.0/${phoneId}/messages`,
        payload,
        { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } }
      );
      const waMessageId = waResponse.data.messages[0].id;
      const waMessageStatus = waResponse.data.messages[0]?.message_status || null;

      const normalizedTo = to.replace(/^\+/, "");
      let conversation = await storage.getConversationByWaId(normalizedTo);
      const lastMessageText = `[pdf] ${safeFileName}`;
      if (!conversation) {
        conversation = await storage.createConversation({
          waId: normalizedTo, contactName: normalizedTo,
          lastMessage: lastMessageText, lastMessageTimestamp: new Date(),
        });
      } else {
        await storage.updateConversation(conversation.id, {
          lastMessage: lastMessageText, lastMessageTimestamp: new Date(),
        });
      }

      await storage.createMessage({
        conversationId: conversation.id, waMessageId,
        direction: "out", type: "document",
        text: lastMessageText,
        mediaId, mimeType: "application/pdf",
        timestamp: Math.floor(Date.now() / 1000).toString(),
        status: "sent", rawJson: waResponse.data,
      });

      res.json({ success: true, messageId: waMessageId, messageStatus: waMessageStatus });
    } catch (error: any) {
      const details = error.response?.data?.error?.message || error.response?.data?.message || error.message;
      console.error("Document upload error:", error.response?.data || error.message);
      res.status(500).json({ message: "Failed to send document", error: details });
    }
  });

  // Agent self settings (global AI auto-reply toggle)
  app.get("/api/agents/me/settings", requireAuth, async (req, res) => {
    const session = req.session as any;
    if (session.role !== "agent" || !session.agentId) {
      return res.status(403).json({ message: "Agent access required" });
    }
    const agent = await storage.getAgent(session.agentId);
    if (!agent) return res.status(404).json({ message: "Agent not found" });
    res.json({ isAiAutoReplyEnabled: agent.isAiAutoReplyEnabled !== false });
  });

  app.patch("/api/agents/me/settings", requireAuth, async (req, res) => {
    const session = req.session as any;
    if (session.role !== "agent" || !session.agentId) {
      return res.status(403).json({ message: "Agent access required" });
    }
    const parsed = z.object({ isAiAutoReplyEnabled: z.boolean() }).safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid settings payload" });
    }
    const updated = await storage.updateAgent(session.agentId, {
      isAiAutoReplyEnabled: parsed.data.isAiAutoReplyEnabled,
    });
    res.json({ isAiAutoReplyEnabled: updated.isAiAutoReplyEnabled !== false });
  });

  // Reassign conversation to agent
  app.patch("/api/conversations/:id/assign", requireAdmin, async (req, res) => {
    const id = parseInt(req.params.id);
    const { agentId } = req.body;
    if (agentId) {
      await storage.assignConversationToAgent(id, agentId);
    } else {
      const updated = await storage.updateConversation(id, { assignedAgentId: null });
      res.json(updated);
      return;
    }
    const updated = await storage.getConversation(id);
    res.json(updated);
  });

  // Set conversation label
  app.patch("/api/conversations/:id/label", requireAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    const { labelId } = req.body;
    const nextLabelId = labelId ? Number(labelId) : null;

    if (nextLabelId !== null && !Number.isInteger(nextLabelId)) {
      return res.status(400).json({ message: "Invalid label id" });
    }

    if (nextLabelId !== null) {
      const label = await storage.getLabel(nextLabelId);
      if (!label) {
        return res.status(404).json({ message: "Label not found" });
      }
      const session = req.session as any;
      const isOwner = session.role === "agent"
        ? label.agentId === session.agentId
        : !label.agentId;
      if (!isOwner) {
        return res.status(403).json({ message: "Forbidden label access" });
      }
    }

    const updated = await storage.updateConversation(id, { labelId: nextLabelId });
    res.json(updated);
  });

  // Create or update reminder on conversation
  app.patch("/api/conversations/:id/reminder", requireAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    const parsed = z.object({
      reminderAt: z.string().datetime().nullable(),
      reminderNote: z.string().max(300).optional().nullable(),
    }).safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid reminder payload", details: parsed.error.errors });
    }

    const reminderAt = parsed.data.reminderAt ? new Date(parsed.data.reminderAt) : null;
    const reminderNote = parsed.data.reminderNote?.trim() || null;

    if (reminderAt && Number.isNaN(reminderAt.getTime())) {
      return res.status(400).json({ message: "Invalid reminder date" });
    }

    const updated = await storage.updateConversation(id, {
      reminderAt,
      reminderNote,
      reminderUpdatedAt: reminderAt ? new Date() : null,
    });
    res.json(updated);
  });

  // Delete reminder from conversation
  app.delete("/api/conversations/:id/reminder", requireAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    const updated = await storage.updateConversation(id, {
      reminderAt: null,
      reminderNote: null,
      reminderUpdatedAt: null,
    });
    res.json(updated);
  });

  // Toggle pin
  app.patch("/api/conversations/:id/pin", requireAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    const { isPinned } = req.body;
    const updated = await storage.updateConversation(id, { isPinned });
    res.json(updated);
  });

  // Update order status with Zod validation
  app.patch("/api/conversations/:id/order-status", requireAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    
    // Validate with Zod schema
    const parsed = updateOrderStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid order status. Must be null, 'pending', 'ready', or 'delivered'", details: parsed.error.errors });
    }
    
    const updated = await storage.updateConversation(id, { orderStatus: parsed.data.orderStatus });
    if (parsed.data.orderStatus === "pending") {
      const prefs = await getPushNotificationPreferences();
      if (prefs.notifyPending) {
        sendPushNotification(
          "Pedido en Proceso",
          `${updated.contactName || updated.waId}: Pedido marcado en proceso`,
          { conversationId: id.toString(), waId: updated.waId, event: "order_pending" },
          getConversationPushOptions(updated),
        );
      }
    } else if (parsed.data.orderStatus === "ready") {
      sendPushNotification(
        "Pedido Listo para Enviar",
        `${updated.contactName || updated.waId}: Pedido listo para despacho`,
        { conversationId: id.toString(), waId: updated.waId, event: "order_ready" },
        getConversationPushOptions(updated),
      );
    } else if (parsed.data.orderStatus === "delivered") {
      sendPushNotification(
        "Pedido Entregado",
        `${updated.contactName || updated.waId}: Pedido marcado como entregado`,
        { conversationId: id.toString(), waId: updated.waId, event: "order_delivered" },
        getConversationPushOptions(updated),
      );
    }
    res.json(updated);
  });

  // Toggle AI for a specific conversation
  app.patch("/api/conversations/:id/ai-toggle", requireAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    const { aiDisabled } = req.body;
    
    if (typeof aiDisabled !== 'boolean') {
      return res.status(400).json({ error: "aiDisabled must be a boolean" });
    }
    
    const updated = await storage.updateConversation(id, { aiDisabled });
    res.json(updated);
  });

  // Clear human attention flag
  app.patch("/api/conversations/:id/clear-attention", requireAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    const updated = await storage.updateConversation(id, { needsHumanAttention: false });
    res.json(updated);
  });

  // Set kanban column status in one operation (used by drag & drop)
  app.patch("/api/conversations/:id/kanban-status", requireAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    const parsed = z.object({
      column: z.enum(["humano", "nuevo", "llamar", "proceso", "listo", "entregado"]),
    }).safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid column" });
    }

    const { column } = parsed.data;
    let updates: Record<string, any>;

    if (column === "humano") {
      updates = { needsHumanAttention: true, shouldCall: false, orderStatus: null };
    } else if (column === "nuevo") {
      updates = { needsHumanAttention: false, shouldCall: false, orderStatus: null };
    } else if (column === "llamar") {
      updates = { needsHumanAttention: false, shouldCall: true, orderStatus: null };
    } else if (column === "proceso") {
      updates = { needsHumanAttention: false, shouldCall: false, orderStatus: "pending" };
    } else if (column === "listo") {
      updates = { needsHumanAttention: false, shouldCall: false, orderStatus: "ready" };
    } else {
      updates = { needsHumanAttention: false, shouldCall: false, orderStatus: "delivered" };
    }

    const updated = await storage.updateConversation(id, updates);
    if (column === "humano") {
      sendPushNotification(
        "Atención Humana Requerida",
        `${updated.contactName || updated.waId}: El cliente necesita hablar con un humano`,
        { conversationId: id.toString(), waId: updated.waId, event: "human_attention" },
        getConversationPushOptions(updated),
      );
    } else if (column === "llamar") {
      sendPushNotification(
        "Llamar al Cliente",
        `${updated.contactName || updated.waId}: Marcado para llamada`,
        { conversationId: id.toString(), waId: updated.waId, event: "should_call" },
        getConversationPushOptions(updated),
      );
    } else if (column === "proceso") {
      const prefs = await getPushNotificationPreferences();
      if (prefs.notifyPending) {
        sendPushNotification(
          "Pedido en Proceso",
          `${updated.contactName || updated.waId}: Pedido marcado en proceso`,
          { conversationId: id.toString(), waId: updated.waId, event: "order_pending" },
          getConversationPushOptions(updated),
        );
      }
    } else if (column === "listo") {
      sendPushNotification(
        "Pedido Listo para Enviar",
        `${updated.contactName || updated.waId}: Pedido listo para despacho`,
        { conversationId: id.toString(), waId: updated.waId, event: "order_ready" },
        getConversationPushOptions(updated),
      );
    } else if (column === "entregado") {
      sendPushNotification(
        "Pedido Entregado",
        `${updated.contactName || updated.waId}: Pedido marcado como entregado`,
        { conversationId: id.toString(), waId: updated.waId, event: "order_delivered" },
        getConversationPushOptions(updated),
      );
    }
    res.json(updated);
  });

  // Toggle should call (purchase probability indicator)
  app.patch("/api/conversations/:id/should-call", requireAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    const { shouldCall } = req.body;
    const updated = await storage.updateConversation(id, { shouldCall: !!shouldCall });
    res.json(updated);
  });

  // Get follow-up conversations (those where we sent last message and customer didn't respond)
  app.get("/api/follow-up", requireAuth, async (req, res) => {
    const { timeFilter } = req.query; // 'today', 'yesterday', 'before_yesterday'
    
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    const beforeYesterday = new Date(today.getTime() - 48 * 60 * 60 * 1000);

    const normalizedFilter = typeof timeFilter === "string" ? timeFilter : "";
    let rangeStart: Date | null = null;
    let rangeEnd: Date | null = null;

    if (normalizedFilter === "today") {
      rangeStart = today;
    } else if (normalizedFilter === "yesterday") {
      rangeStart = yesterday;
      rangeEnd = today;
    } else if (normalizedFilter === "before_yesterday") {
      rangeStart = beforeYesterday;
      rangeEnd = yesterday;
    }

    const startClause = rangeStart ? sql`AND rm.created_at >= ${rangeStart}` : sql``;
    const endClause = rangeEnd ? sql`AND rm.created_at < ${rangeEnd}` : sql``;

    const result = await db.execute(sql`
      WITH ranked_messages AS (
        SELECT
          m.id,
          m.conversation_id,
          m.body,
          m.created_at,
          m.direction,
          COUNT(*) OVER (PARTITION BY m.conversation_id) AS message_count,
          ROW_NUMBER() OVER (
            PARTITION BY m.conversation_id
            ORDER BY m.created_at DESC, m.id DESC
          ) AS rn
        FROM messages m
      )
      SELECT
        c.id,
        c.wa_id AS "waId",
        c.contact_name AS "contactName",
        c.label_id AS "labelId",
        c.is_pinned AS "isPinned",
        c.order_status AS "orderStatus",
        c.ai_disabled AS "aiDisabled",
        c.needs_human_attention AS "needsHumanAttention",
        c.should_call AS "shouldCall",
        c.last_follow_up_at AS "lastFollowUpAt",
        c.assigned_agent_id AS "assignedAgentId",
        c.last_message AS "lastMessage",
        c.last_message_timestamp AS "lastMessageTimestamp",
        c.updated_at AS "updatedAt",
        rm.message_count AS "messageCount",
        json_build_object(
          'text', rm.body,
          'createdAt', rm.created_at
        ) AS "lastOutboundMessage"
      FROM conversations c
      JOIN ranked_messages rm ON rm.conversation_id = c.id
      WHERE rm.rn = 1
        AND rm.direction = 'out'
        ${startClause}
        ${endClause}
      ORDER BY rm.created_at DESC
    `);

    res.json(result.rows);
  });

  // Analyze purchase probability for a conversation
  app.post("/api/conversations/:id/analyze-purchase", requireAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    const conversation = await storage.getConversation(id);
    if (!conversation) {
      return res.status(404).json({ error: "Conversation not found" });
    }
    
    const messages = await storage.getMessages(id);
    const settings = await storage.getAiSettings();
    
    if (!settings?.enabled || !process.env.OPENAI_API_KEY) {
      return res.json({ probability: 'unknown', reason: 'AI not configured' });
    }
    
    // Build conversation context for analysis
    const recentMessages = messages.slice(-10).map(m => 
      `${m.direction === 'in' ? 'Cliente' : 'Tú'}: ${m.text || '[media]'}`
    ).join('\n');
    
    try {
      const { OpenAI } = await import('openai');
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        max_tokens: 100,
        messages: [
          {
            role: 'system',
            content: `Analiza esta conversación y responde SOLO con uno de estos: ALTA, MEDIA, BAJA.
ALTA = cliente mostró interés claro en comprar, pidió precios, preguntó por disponibilidad
MEDIA = cliente tiene interés pero no ha decidido, hizo preguntas generales
BAJA = solo preguntas informativas, sin intención clara de compra
Responde en formato: PROBABILIDAD|razón breve (max 20 palabras)`
          },
          {
            role: 'user',
            content: recentMessages
          }
        ]
      });
      
      const result = response.choices[0]?.message?.content || 'BAJA|Sin información suficiente';
      const [probability, reason] = result.split('|');
      
      const prob = probability?.trim() || 'BAJA';
      const reasoning = reason?.trim() || 'Sin información';
      
      // If high probability, mark for calling
      if (prob === 'ALTA') {
        await storage.updateConversation(id, { shouldCall: true });
      }
      
      // Save analysis to history
      await storage.createPurchaseAnalysis({
        conversationId: id,
        probability: prob,
        reasoning: reasoning,
      });
      
      res.json({ 
        probability: prob, 
        reason: reasoning,
        shouldCall: prob === 'ALTA'
      });
    } catch (error: any) {
      console.error('Error analyzing purchase probability:', error);
      res.json({ probability: 'unknown', reason: error.message });
    }
  });

  // Get purchase analysis history for a conversation
  app.get("/api/conversations/:id/purchase-history", requireAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    const history = await storage.getPurchaseAnalyses(id);
    res.json(history);
  });

  // Generate follow-up message for a conversation
  app.post("/api/conversations/:id/generate-followup", requireAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    const conversation = await storage.getConversation(id);
    if (!conversation) {
      return res.status(404).json({ error: "Conversation not found" });
    }
    
    const messages = await storage.getMessages(id);
    const settings = await storage.getAiSettings();
    
    if (!settings?.enabled || !process.env.OPENAI_API_KEY) {
      return res.json({ message: '¡Hola! ¿Cómo estás? Me gustaría saber si tienes alguna pregunta.' });
    }
    
    const recentMessages = messages.slice(-6).map(m => 
      `${m.direction === 'in' ? 'Cliente' : 'Tú'}: ${m.text || '[media]'}`
    ).join('\n');
    
    try {
      const { OpenAI } = await import('openai');
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        max_tokens: 80,
        messages: [
          {
            role: 'system',
            content: `Genera un mensaje de seguimiento amigable y corto (máximo 2 líneas) para retomar contacto con este cliente. 
El mensaje debe ser natural, no invasivo, y relacionado con la conversación anterior.
NO uses saludos formales. Sé directo y amigable.`
          },
          {
            role: 'user',
            content: `Conversación:\n${recentMessages}\n\nGenera un mensaje de seguimiento:`
          }
        ]
      });
      
      const message = response.choices[0]?.message?.content || '¡Hola! ¿Tienes alguna pregunta?';
      res.json({ message: message.trim() });
    } catch (error: any) {
      console.error('Error generating follow-up:', error);
      res.json({ message: '¡Hola! ¿Cómo estás? Me gustaría saber si tienes alguna pregunta.' });
    }
  });

  // Debug endpoint - check configuration
  app.get("/api/debug", requireAuth, async (req, res) => {
    const config = {
      hasMetaToken: !!process.env.META_ACCESS_TOKEN,
      hasPhoneId: !!process.env.WA_PHONE_NUMBER_ID,
      phoneId: process.env.WA_PHONE_NUMBER_ID || "NOT SET",
      hasVerifyToken: !!process.env.WA_VERIFY_TOKEN,
      hasAdminUser: !!process.env.ADMIN_USER,
      hasAdminPass: !!process.env.ADMIN_PASS,
      conversationCount: (await storage.getConversations()).length,
      timestamp: new Date().toISOString(),
    };
    res.json(config);
  });

  app.get("/api/link-preview", requireAuth, async (req, res) => {
    try {
      const rawUrl = String(req.query.url || "").trim();
      if (!rawUrl) {
        return res.status(400).json({ message: "Missing url" });
      }

      let targetUrl: URL;
      try {
        targetUrl = new URL(rawUrl);
      } catch {
        return res.status(400).json({ message: "Invalid url" });
      }

      if (!["http:", "https:"].includes(targetUrl.protocol)) {
        return res.status(400).json({ message: "Invalid protocol" });
      }

      const hostname = (targetUrl.hostname || "").toLowerCase();
      if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname.endsWith(".local")) {
        return res.status(400).json({ message: "Blocked hostname" });
      }

      try {
        const htmlResponse = await axios.get(targetUrl.toString(), {
          responseType: "text",
          timeout: 8000,
          maxRedirects: 5,
          maxContentLength: 1024 * 1024,
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; RyzappLinkPreview/1.0)",
            Accept: "text/html,application/xhtml+xml",
          },
        });

        const html = String(htmlResponse.data || "");
        const imageFromPage = extractOgImageFromHtml(html, targetUrl.toString());
        if (imageFromPage) {
          return res.json({ imageUrl: imageFromPage, source: "page-og" });
        }
      } catch {
        // ignore and try provider fallback
      }

      const imageFromProvider = await fetchOgImageFromProvider(targetUrl.toString());
      if (imageFromProvider) {
        return res.json({ imageUrl: imageFromProvider, source: "provider-og" });
      }

      res.json({ imageUrl: null });
    } catch (error: any) {
      console.error("Link preview error:", error?.message || error);
      res.json({ imageUrl: null });
    }
  });

  // Media Proxy
  app.get("/api/media/:mediaId", requireAuth, async (req, res) => {
    try {
      const mediaId = req.params.mediaId;
      const token = process.env.META_ACCESS_TOKEN;
      
      if (!token) return res.status(500).send("Meta Token missing");

      // 1. Get Media URL
      const urlResponse = await axios.get(`https://graph.facebook.com/v24.0/${mediaId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      const mediaUrl = urlResponse.data.url;

      // 2. Stream the media
      const mediaStream = await axios({
        url: mediaUrl,
        method: 'GET',
        responseType: 'stream',
        headers: { Authorization: `Bearer ${token}` }
      });

      // Forward content type
      res.setHeader('Content-Type', mediaStream.headers['content-type']);
      mediaStream.data.pipe(res);

    } catch (error) {
      console.error("Media fetch error:", error);
      res.status(404).send("Media not found");
    }
  });

  // === AI AGENT ROUTES ===

  // Validation schemas for AI routes
  const aiSettingsUpdateSchema = z.object({
    enabled: z.boolean().optional(),
    systemPrompt: z.string().nullable().optional(),
    catalog: z.string().nullable().optional(),
    maxTokens: z.number().min(50).max(500).optional(),
    temperature: z.number().min(0).max(100).optional(),
    model: z.string().optional(),
    maxPromptChars: z.number().min(500).max(20000).optional(),
    conversationHistory: z.number().min(1).max(20).optional(),
    audioResponseEnabled: z.boolean().optional(),
    audioVoice: z.string().optional(),
    ttsProvider: z.enum(["openai", "elevenlabs"]).optional(),
    elevenlabsVoiceId: z.string().optional(),
    ttsSpeed: z.number().min(25).max(400).optional(),
    ttsInstructions: z.string().nullable().optional(),
    learningMode: z.boolean().optional(),
    followUpEnabled: z.boolean().optional(),
    followUpMinutes: z.number().min(5).max(60).optional(),
  });

  const promptProfilesUpdateSchema = z.object({
    primaryPrompt: z.string().max(20000),
    secondaryPrompt: z.string().max(20000),
    activeSlot: z.enum(["primary", "secondary"]),
  });

  const aiTrainingCreateSchema = z.object({
    type: z.enum(["text", "url", "image_url"]),
    title: z.string().max(200).nullable().optional(),
    content: z.string().min(1),
  });
  const ttsPreviewSchema = z.object({
    provider: z.enum(["openai", "elevenlabs"]),
    voice: z.string().optional(),
    elevenlabsVoiceId: z.string().optional(),
    speed: z.number().min(25).max(400).optional(),
    instructions: z.string().nullable().optional(),
    text: z.string().min(1).max(300).optional(),
  });

  // Get ElevenLabs available voices (user's own + shared Latin American female voices)
  app.get("/api/elevenlabs/voices", requireAuth, async (req, res) => {
    try {
      const apiKey = await getElevenLabsApiKey();
      
      const [userVoicesRes, sharedPopular, sharedTrending, sharedConversational, sharedAndrea] = await Promise.all([
        axios.get("https://api.elevenlabs.io/v1/voices", {
          headers: { "xi-api-key": apiKey }
        }),
        axios.get("https://api.elevenlabs.io/v1/shared-voices", {
          headers: { "xi-api-key": apiKey },
          params: { gender: "female", language: "es", page_size: 100, sort: "usage_character_count_7d" }
        }).catch(() => ({ data: { voices: [] } })),
        axios.get("https://api.elevenlabs.io/v1/shared-voices", {
          headers: { "xi-api-key": apiKey },
          params: { gender: "female", language: "es", page_size: 100, sort: "trending" }
        }).catch(() => ({ data: { voices: [] } })),
        axios.get("https://api.elevenlabs.io/v1/shared-voices", {
          headers: { "xi-api-key": apiKey },
          params: { gender: "female", language: "es", use_cases: "conversational", page_size: 100, sort: "usage_character_count_7d" }
        }).catch(() => ({ data: { voices: [] } })),
        axios.get("https://api.elevenlabs.io/v1/shared-voices", {
          headers: { "xi-api-key": apiKey },
          params: { language: "es", search: "andrea", page_size: 50 }
        }).catch(() => ({ data: { voices: [] } }))
      ]);

      const allSharedRaw = [
        ...(sharedPopular.data.voices || []),
        ...(sharedTrending.data.voices || []),
        ...(sharedConversational.data.voices || []),
        ...(sharedAndrea.data.voices || []),
      ];
      const sharedDeduped = Array.from(new Map(allSharedRaw.map((v: any) => [v.voice_id, v])).values());

      const userVoices = userVoicesRes.data.voices.map((v: any) => ({
        voice_id: v.voice_id,
        name: v.name,
        category: v.category || "user",
        labels: v.labels || {},
        preview_url: v.preview_url,
        source: "library" as const,
      }));

      const seenIds = new Set(userVoices.map((v: any) => v.voice_id));

      const sharedVoices = sharedDeduped
        .filter((v: any) => !seenIds.has(v.voice_id || v.public_owner_id))
        .map((v: any) => ({
          voice_id: v.voice_id,
          name: v.name,
          category: v.category || "shared",
          labels: { accent: v.accent || "latin american", gender: v.gender || "female", use_case: v.use_case || "", description: v.description || "", ...(v.labels || {}) },
          preview_url: v.preview_url,
          source: "shared" as const,
        }));

      res.json([...userVoices, ...sharedVoices]);
    } catch (error: any) {
      console.error("Error fetching ElevenLabs voices:", error.message);
      res.status(500).json({ message: "Error fetching ElevenLabs voices" });
    }
  });

  // Get AI Settings
  app.get("/api/ai/settings", requireAuth, async (req, res) => {
    try {
      const settings = await storage.getAiSettings();
      res.json(settings || { enabled: false, systemPrompt: null, catalog: null });
    } catch (error) {
      console.error("Error fetching AI settings:", error);
      res.status(500).json({ message: "Error fetching AI settings" });
    }
  });

  // Update AI Settings
  app.patch("/api/ai/settings", requireAuth, async (req, res) => {
    try {
      const parsed = aiSettingsUpdateSchema.parse(req.body);
      const updated = await storage.updateAiSettings(parsed);
      res.json(updated);
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ message: "Invalid settings data", errors: error.errors });
      }
      console.error("Error updating AI settings:", error);
      res.status(500).json({ message: "Error updating AI settings" });
    }
  });

  app.get("/api/ai/prompt-profiles", requireAuth, async (_req, res) => {
    try {
      const profiles = await getPromptProfiles();
      res.json(profiles);
    } catch (error) {
      console.error("Error fetching prompt profiles:", error);
      res.status(500).json({ message: "Error fetching prompt profiles" });
    }
  });

  app.patch("/api/ai/prompt-profiles", requireAuth, async (req, res) => {
    try {
      const parsed = promptProfilesUpdateSchema.parse(req.body);
      await Promise.all([
        upsertPromptProfile(PROMPT_PROFILE_PRIMARY_TITLE, parsed.primaryPrompt),
        upsertPromptProfile(PROMPT_PROFILE_SECONDARY_TITLE, parsed.secondaryPrompt),
        upsertPromptProfile(PROMPT_PROFILE_ACTIVE_TITLE, parsed.activeSlot),
      ]);

      const activePrompt = parsed.activeSlot === "secondary" ? parsed.secondaryPrompt : parsed.primaryPrompt;
      await storage.updateAiSettings({ systemPrompt: activePrompt });

      res.json({
        primaryPrompt: parsed.primaryPrompt,
        secondaryPrompt: parsed.secondaryPrompt,
        activeSlot: parsed.activeSlot,
      });
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ message: "Invalid prompt profile data", errors: error.errors });
      }
      console.error("Error updating prompt profiles:", error);
      res.status(500).json({ message: "Error updating prompt profiles" });
    }
  });

  // Get Training Data
  app.get("/api/ai/training", requireAuth, async (req, res) => {
    try {
      const data = await storage.getAiTrainingData();
      res.json(data.filter(item => !isHiddenPromptProfileTitle(item.title)));
    } catch (error) {
      console.error("Error fetching training data:", error);
      res.status(500).json({ message: "Error fetching training data" });
    }
  });

  // Add Training Data
  app.post("/api/ai/training", requireAuth, async (req, res) => {
    try {
      const parsed = aiTrainingCreateSchema.parse(req.body);
      if (isHiddenPromptProfileTitle(parsed.title)) {
        return res.status(400).json({ message: "Reserved training data title" });
      }
      const created = await storage.createAiTrainingData(parsed);
      res.json(created);
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ message: "Invalid training data", errors: error.errors });
      }
      console.error("Error creating training data:", error);
      res.status(500).json({ message: "Error creating training data" });
    }
  });

  // Update Training Data
  app.patch("/api/ai/training/:id", requireAuth, async (req, res) => {
    try {
      const parsed = aiTrainingCreateSchema.partial().parse(req.body);
      if (isHiddenPromptProfileTitle(parsed.title)) {
        return res.status(400).json({ message: "Reserved training data title" });
      }
      const updated = await storage.updateAiTrainingData(parseInt(req.params.id), parsed);
      res.json(updated);
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ message: "Invalid training data", errors: error.errors });
      }
      console.error("Error updating training data:", error);
      res.status(500).json({ message: "Error updating training data" });
    }
  });

  // Delete Training Data
  app.delete("/api/ai/training/:id", requireAuth, async (req, res) => {
    try {
      await storage.deleteAiTrainingData(parseInt(req.params.id));
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting training data:", error);
      res.status(500).json({ message: "Error deleting training data" });
    }
  });

  // Get AI Logs
  app.get("/api/ai/logs", requireAuth, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const logs = await storage.getAiLogs(limit);
      res.json(logs);
    } catch (error) {
      console.error("Error fetching AI logs:", error);
      res.status(500).json({ message: "Error fetching AI logs" });
    }
  });

  // Get push notification logs
  app.get("/api/push-logs", requireAuth, async (req, res) => {
    res.json(pushLogs);
  });

  // Get WhatsApp delivery status logs (includes failed reasons when provided by Meta)
  app.get("/api/wa-status-logs", requireAuth, async (_req, res) => {
    res.json(waStatusLogs);
  });

  app.post("/api/tts/preview", requireAuth, async (req, res) => {
    try {
      const parsed = ttsPreviewSchema.parse(req.body);
      const previewText =
        parsed.text?.trim() ||
        "Hola, esta es una prueba de voz para tu CRM de WhatsApp.";
      const voice = parsed.voice || "nova";
      const options: TtsOptions = {
        provider: parsed.provider,
        elevenlabsVoiceId: parsed.elevenlabsVoiceId,
        speed: parsed.speed ? parsed.speed / 100 : 1.0,
        instructions: parsed.instructions ?? null,
      };
      const generated = await generateTtsAudioBuffer(previewText, voice, options, "preview");
      res.setHeader("Content-Type", generated.contentType);
      res.setHeader("Cache-Control", "no-store");
      res.send(generated.audioBuffer);
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ message: "Invalid preview payload", errors: error.errors });
      }
      const details = error?.message || getElevenLabsErrorMessage(error);
      console.error("Error generating TTS preview:", details);
      res.status(500).json({ message: "Error generating TTS preview", details });
    }
  });

  const pushSettingsUpdateSchema = z.object({
    notifyNewMessages: z.boolean().optional(),
    notifyPending: z.boolean().optional(),
  });

  app.get("/api/push-settings", requireAuth, async (_req, res) => {
    try {
      const settings = await getPushNotificationPreferences();
      res.json(settings);
    } catch (error) {
      console.error("Error fetching push settings:", error);
      res.status(500).json({ message: "Error fetching push settings" });
    }
  });

  app.patch("/api/push-settings", requireAuth, async (req, res) => {
    try {
      const parsed = pushSettingsUpdateSchema.parse(req.body);
      const current = await getPushNotificationPreferences();
      const next: PushNotificationPreferences = {
        notifyNewMessages: parsed.notifyNewMessages ?? current.notifyNewMessages,
        notifyPending: parsed.notifyPending ?? current.notifyPending,
      };
      const updated = await updatePushNotificationPreferences(next);
      res.json(updated);
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ message: "Invalid push settings data", errors: error.errors });
      }
      console.error("Error updating push settings:", error);
      res.status(500).json({ message: "Error updating push settings" });
    }
  });

  // === LEARNED RULES ROUTES ===

  // Get all learned rules
  app.get("/api/ai/rules", requireAuth, async (req, res) => {
    try {
      const rules = await storage.getLearnedRules();
      res.json(rules);
    } catch (error) {
      console.error("Error fetching learned rules:", error);
      res.status(500).json({ message: "Error fetching learned rules" });
    }
  });

  // Create learned rule
  app.post("/api/ai/rules", requireAuth, async (req, res) => {
    try {
      const { rule, learnedFrom, conversationId } = req.body;
      if (!rule) {
        return res.status(400).json({ message: "La regla es requerida" });
      }
      const created = await storage.createLearnedRule({
        rule,
        learnedFrom: learnedFrom || null,
        conversationId: conversationId || null,
        isActive: true,
      });
      res.json(created);
    } catch (error) {
      console.error("Error creating learned rule:", error);
      res.status(500).json({ message: "Error creating learned rule" });
    }
  });

  // Update learned rule
  app.patch("/api/ai/rules/:id", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { rule, isActive } = req.body;
      const updated = await storage.updateLearnedRule(id, { rule, isActive });
      res.json(updated);
    } catch (error) {
      console.error("Error updating learned rule:", error);
      res.status(500).json({ message: "Error updating learned rule" });
    }
  });

  // Delete learned rule
  app.delete("/api/ai/rules/:id", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteLearnedRule(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting learned rule:", error);
      res.status(500).json({ message: "Error deleting learned rule" });
    }
  });

  // Learn from conversation - AI analyzes and suggests a rule
  app.post("/api/ai/learn", requireAuth, async (req, res) => {
    try {
      const { conversationId, focus, messageCount } = req.body;
      
      if (!conversationId) {
        return res.status(400).json({ message: "conversationId es requerido" });
      }

      const conversation = await storage.getConversation(conversationId);
      if (!conversation) {
        return res.status(404).json({ message: "Conversación no encontrada" });
      }

      const messages = await storage.getMessages(conversationId);
      const recentMessages = messages.slice(-(messageCount || 10));

      if (recentMessages.length === 0) {
        return res.status(400).json({ message: "No hay mensajes para analizar" });
      }

      const conversationText = recentMessages.map(m => 
        `${m.direction === 'in' ? 'Cliente' : 'Agente'}: ${m.text || `[${m.type}]`}`
      ).join('\n');

      const focusPrompt = focus 
        ? `Enfócate específicamente en: ${focus}`
        : 'Identifica la lección o estrategia más importante';

      const prompt = `Analiza esta conversación de ventas por WhatsApp y extrae UNA regla o estrategia que se pueda aplicar en futuras conversaciones.

${focusPrompt}

CONVERSACIÓN:
${conversationText}

Responde SOLO con la regla/estrategia en formato: "Cuando [situación], entonces [acción/respuesta]"
Máximo 2 líneas. Sé específico y práctico.`;

      const openai = new (await import('openai')).default({
        apiKey: process.env.OPENAI_API_KEY,
      });

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 150,
        temperature: 0.3,
      });

      const suggestedRule = completion.choices[0]?.message?.content?.trim() || "";

      res.json({
        suggestedRule,
        tokensUsed: completion.usage?.total_tokens || 0,
        conversationId,
      });
    } catch (error: any) {
      console.error("Error learning from conversation:", error);
      res.status(500).json({ message: error.message || "Error al analizar conversación" });
    }
  });

  // === PRODUCTS ROUTES ===

  // Get all products
  app.get("/api/products", requireAuth, async (req, res) => {
    try {
      const products = await storage.getProducts();
      res.json(products);
    } catch (error) {
      console.error("Error fetching products:", error);
      res.status(500).json({ message: "Error fetching products" });
    }
  });

  // Create product
  app.post("/api/products", requireAuth, async (req, res) => {
    try {
      const parsed = insertProductSchema.parse(req.body);
      const product = await storage.createProduct(parsed);
      res.json(product);
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ message: "Invalid product data", errors: error.errors });
      }
      console.error("Error creating product:", error);
      res.status(500).json({ message: "Error creating product" });
    }
  });

  // Update product - require name if provided
  app.patch("/api/products/:id", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updateSchema = insertProductSchema.partial().refine(
        (data) => data.name === undefined || (data.name && data.name.length > 0),
        { message: "El nombre no puede estar vacío" }
      );
      const parsed = updateSchema.parse(req.body);
      const product = await storage.updateProduct(id, parsed);
      res.json(product);
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ message: "Invalid product data", errors: error.errors });
      }
      console.error("Error updating product:", error);
      res.status(500).json({ message: "Error updating product" });
    }
  });

  // Delete product
  app.delete("/api/products/:id", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteProduct(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting product:", error);
      res.status(500).json({ message: "Error deleting product" });
    }
  });

  // === AGENT MANAGEMENT (Admin only) ===
  app.get("/api/agents/ai-column-status", requireAdmin, async (_req, res) => {
    try {
      await ensureAgentAiColumnExists();
      const result = await db.execute(sql`
        SELECT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'agents'
            AND column_name = 'is_ai_auto_reply_enabled'
        ) AS exists
      `);
      const exists = Boolean((result.rows as any[])[0]?.exists);
      res.json({ exists });
    } catch (error) {
      console.error("Error checking agent AI column status:", error);
      res.status(500).json({ message: "Error checking agent AI column status" });
    }
  });

  app.get("/api/agents", requireAdmin, async (req, res) => {
    try {
      await ensureAgentAiColumnExists();
      const dateFrom = typeof req.query.dateFrom === "string" ? req.query.dateFrom.trim() : "";
      const dateTo = typeof req.query.dateTo === "string" ? req.query.dateTo.trim() : "";
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

      if (dateFrom && !dateRegex.test(dateFrom)) {
        return res.status(400).json({ message: "Invalid dateFrom format. Use YYYY-MM-DD" });
      }
      if (dateTo && !dateRegex.test(dateTo)) {
        return res.status(400).json({ message: "Invalid dateTo format. Use YYYY-MM-DD" });
      }
      if (dateFrom && dateTo && dateFrom > dateTo) {
        return res.status(400).json({ message: "dateFrom must be before or equal to dateTo" });
      }

      const dateFilterSql = sql`
        ${dateFrom ? sql`AND DATE(m.created_at AT TIME ZONE 'America/La_Paz') >= ${dateFrom}` : sql``}
        ${dateTo ? sql`AND DATE(m.created_at AT TIME ZONE 'America/La_Paz') <= ${dateTo}` : sql``}
      `;

      let statsResult;
      try {
        statsResult = await db.execute(sql`
        SELECT
          a.id,
          a.name,
          a.username,
          a.password,
          a.is_active AS "isActive",
          a.is_ai_auto_reply_enabled AS "isAiAutoReplyEnabled",
          a.weight,
          a.created_at AS "createdAt",
          COALESCE(s.assigned_conversations, 0) AS "assignedConversations",
          COALESCE(s.inbound_messages, 0) AS "inboundMessages",
          COALESCE(s.should_call_count, 0) AS "shouldCallCount",
          s.last_activity_at AS "lastActivityAt"
        FROM agents a
        LEFT JOIN (
          SELECT
            c.assigned_agent_id AS agent_id,
            COUNT(DISTINCT c.id) AS assigned_conversations,
            COUNT(m.id) FILTER (WHERE m.direction = 'in') AS inbound_messages,
            COUNT(DISTINCT c.id) FILTER (WHERE c.should_call = true) AS should_call_count,
            MAX(m.created_at) AS last_activity_at
          FROM conversations c
          LEFT JOIN messages m ON m.conversation_id = c.id
          WHERE c.assigned_agent_id IS NOT NULL
            ${dateFilterSql}
          GROUP BY c.assigned_agent_id
        ) s ON s.agent_id = a.id
        ORDER BY a.name ASC
      `);
      } catch (error: any) {
        // Backward-compatible fallback if production DB still lacks is_ai_auto_reply_enabled
        if (String(error?.message || "").includes("is_ai_auto_reply_enabled")) {
          statsResult = await db.execute(sql`
            SELECT
              a.id,
              a.name,
              a.username,
              a.password,
              a.is_active AS "isActive",
              true AS "isAiAutoReplyEnabled",
              a.weight,
              a.created_at AS "createdAt",
              COALESCE(s.assigned_conversations, 0) AS "assignedConversations",
              COALESCE(s.inbound_messages, 0) AS "inboundMessages",
              COALESCE(s.should_call_count, 0) AS "shouldCallCount",
              s.last_activity_at AS "lastActivityAt"
            FROM agents a
            LEFT JOIN (
              SELECT
                c.assigned_agent_id AS agent_id,
                COUNT(DISTINCT c.id) AS assigned_conversations,
                COUNT(m.id) FILTER (WHERE m.direction = 'in') AS inbound_messages,
                COUNT(DISTINCT c.id) FILTER (WHERE c.should_call = true) AS should_call_count,
                MAX(m.created_at) AS last_activity_at
              FROM conversations c
              LEFT JOIN messages m ON m.conversation_id = c.id
              WHERE c.assigned_agent_id IS NOT NULL
                ${dateFilterSql}
              GROUP BY c.assigned_agent_id
            ) s ON s.agent_id = a.id
            ORDER BY a.name ASC
          `);
        } else {
          throw error;
        }
      }

      const agentsList = statsResult.rows.map((row: any) => ({
        ...row,
        assignedConversations: Number(row.assignedConversations || 0),
        inboundMessages: Number(row.inboundMessages || 0),
        shouldCallCount: Number(row.shouldCallCount || 0),
      }));

      res.json(agentsList);
    } catch (error) {
      console.error("Error fetching agents:", error);
      res.status(500).json({ message: "Error fetching agents" });
    }
  });

  app.post("/api/agents", requireAdmin, async (req, res) => {
    try {
      const { name, username, password, weight, isAiAutoReplyEnabled } = req.body;
      if (!name || !username || !password) {
        return res.status(400).json({ message: "Name, username and password are required" });
      }
      const existing = await storage.getAgentByUsername(username);
      if (existing) {
        return res.status(400).json({ message: "Username already exists" });
      }
      const agent = await storage.createAgent({
        name,
        username,
        password,
        isActive: true,
        isAiAutoReplyEnabled: typeof isAiAutoReplyEnabled === "boolean" ? isAiAutoReplyEnabled : true,
        weight: weight || 1,
      });
      res.json(agent);
    } catch (error) {
      console.error("Error creating agent:", error);
      res.status(500).json({ message: "Error creating agent" });
    }
  });

  app.patch("/api/agents/:id", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updates = req.body;
      if (updates.username) {
        const existing = await storage.getAgentByUsername(updates.username);
        if (existing && existing.id !== id) {
          return res.status(400).json({ message: "Username already exists" });
        }
      }
      const agent = await storage.updateAgent(id, updates);
      res.json(agent);
    } catch (error) {
      console.error("Error updating agent:", error);
      res.status(500).json({ message: "Error updating agent" });
    }
  });

  app.delete("/api/agents/:id", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteAgent(id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Error deleting agent" });
    }
  });

  // Data deletion requests - public endpoint (no auth required)
  const deletionRequests: Array<{ id: number; phone: string; reason: string; createdAt: string; status: string }> = [];
  let deletionIdCounter = 1;

  app.post("/api/data-deletion-request", async (req, res) => {
    try {
      const { phone, reason } = req.body;
      if (!phone) return res.status(400).json({ message: "Phone is required" });
      deletionRequests.unshift({
        id: deletionIdCounter++,
        phone,
        reason: reason || "",
        createdAt: new Date().toISOString(),
        status: "pending",
      });
      if (deletionRequests.length > 100) deletionRequests.pop();
      console.log(`[Data Deletion] New request from ${phone}: ${reason || "No reason provided"}`);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Error processing request" });
    }
  });

  app.get("/api/data-deletion-requests", requireAuth, async (_req, res) => {
    res.json(deletionRequests);
  });

  initFollowUp(sendToWhatsApp, sendAiResponseToWhatsApp);

  return httpServer;
}
