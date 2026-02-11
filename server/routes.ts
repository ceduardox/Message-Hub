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
import { insertProductSchema, updateOrderStatusSchema } from "@shared/schema";
import OpenAI from "openai";
import fs from "fs";
import path from "path";
import os from "os";
import multer from "multer";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const AI_DEBOUNCE_MS = 3000;
interface BufferedMessage {
  messageForAi: string;
  imageBase64ForAi?: string;
  wasAudioMessage: boolean;
  conversationId: number;
  from: string;
  name: string;
}
const messageBuffers = new Map<string, { messages: BufferedMessage[]; timer: ReturnType<typeof setTimeout> }>();

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

  try {
    const recentMessages = await storage.getMessages(conversationId);
    const aiResult = await generateAiResponse(conversationId, messageForAi, recentMessages, imageBase64ForAi);

    if (aiResult && aiResult.needsHuman) {
      await storage.updateConversation(conversationId, { needsHumanAttention: true });
      console.log("=== AI NEEDS HUMAN - MARKED FOR ATTENTION ===", conversationId);
      sendPushNotification(
        "Atención Humana Requerida",
        `${name}: El cliente necesita hablar con un humano`,
        { conversationId: conversationId.toString(), waId: from, event: "human_attention" }
      );
    } else if (aiResult && aiResult.response) {
      await storage.updateConversation(conversationId, { needsHumanAttention: false });

      const audioSettings = await storage.getAiSettings();
      const shouldSendAudio = wasAudioMessage && audioSettings?.audioResponseEnabled;

      let waResponse: any;
      let waMessageId: string;

      if (shouldSendAudio) {
        const selectedVoice = audioSettings?.audioVoice || "nova";
        const ttsSpeed = audioSettings?.ttsSpeed ? audioSettings.ttsSpeed / 100 : 1.0;
        const ttsInstructions = audioSettings?.ttsInstructions || null;
        console.log("=== SENDING AUDIO ===", selectedVoice, ttsSpeed);

        const audioSent = await sendAudioResponse(from, aiResult.response, selectedVoice, { speed: ttsSpeed, instructions: ttsInstructions });
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
          { conversationId: conversationId.toString(), waId: from, event: "order_ready" }
        );
      }

      if (aiResult.shouldCall) {
        updateData.shouldCall = true;
        console.log("=== MARKING FOR CALL (NEUROVENTA) ===", conversationId);
        sendPushNotification(
          "Llamar al Cliente",
          `${name}: Alta probabilidad de compra - llamar ahora`,
          { conversationId: conversationId.toString(), waId: from, event: "should_call" }
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
          text: null,
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
}

// Generate audio response using OpenAI TTS and send via WhatsApp
async function sendAudioResponse(phoneNumber: string, text: string, voice: string = "nova", options: TtsOptions = {}): Promise<boolean> {
  const openaiKey = process.env.OPENAI_API_KEY;
  const token = process.env.META_ACCESS_TOKEN;
  const phoneNumberId = process.env.WA_PHONE_NUMBER_ID;
  
  if (!openaiKey || !token || !phoneNumberId) {
    console.log("[TTS] Missing credentials");
    return false;
  }
  
  let tempPath: string | null = null;
  
  try {
    // Step 1: Generate audio with OpenAI TTS
    console.log("[TTS] Generating audio for:", text.substring(0, 50) + "...");
    const openai = new OpenAI({ apiKey: openaiKey });
    
    // Realistic voices require gpt-4o-mini-tts model, basic voices use tts-1
    const realisticVoices = ["ash", "ballad", "sage", "verse", "marin", "cedar"];
    const isRealisticVoice = realisticVoices.includes(voice.toLowerCase());
    const ttsModel = isRealisticVoice ? "gpt-4o-mini-tts" : "tts-1";
    
    // Speed: default 1.0, range 0.25-4.0
    const speed = options.speed ? Math.max(0.25, Math.min(4.0, options.speed)) : 1.0;
    
    console.log("[TTS] Using model:", ttsModel, "for voice:", voice, "speed:", speed);
    
    // Build TTS request - instructions only work with realistic voices
    const ttsRequest: any = {
      model: ttsModel,
      voice: voice as any,
      input: text,
      response_format: "opus", // WhatsApp prefers opus
      speed: speed
    };
    
    // Add instructions only for realistic voices (gpt-4o-mini-tts model)
    if (isRealisticVoice && options.instructions) {
      ttsRequest.instructions = options.instructions;
      console.log("[TTS] Using instructions:", options.instructions.substring(0, 50) + "...");
    }
    
    const audioResponse = await openai.audio.speech.create(ttsRequest);
    
    // Step 2: Save to temp file
    const audioBuffer = Buffer.from(await audioResponse.arrayBuffer());
    tempPath = path.join(os.tmpdir(), `tts_${Date.now()}.opus`);
    fs.writeFileSync(tempPath, audioBuffer);
    console.log("[TTS] Audio saved:", audioBuffer.length, "bytes");
    
    // Step 3: Upload to WhatsApp Media
    const FormData = (await import('form-data')).default;
    const formData = new FormData();
    formData.append('file', fs.createReadStream(tempPath), {
      filename: 'audio.opus',
      contentType: 'audio/ogg; codecs=opus'
    });
    formData.append('messaging_product', 'whatsapp');
    formData.append('type', 'audio/ogg; codecs=opus');
    
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

// Send push notification via OneSignal
async function sendPushNotification(title: string, message: string, data?: Record<string, string>) {
  const apiKey = process.env.ONESIGNAL_REST_API_KEY;
  const appId = "07dfe1e4-83b1-4623-b57c-e6e33232d4eb";
  const timestamp = new Date().toISOString();
  const event = data?.event || "unknown";

  console.log("[OneSignal] Attempting to send notification:", { title, message });
  console.log("[OneSignal] API Key configured:", !!apiKey);

  if (!apiKey) {
    console.log("[OneSignal] ERROR: API key not configured, skipping push notification");
    pushLogs.unshift({ timestamp, title, message, event, success: false, error: "API key not configured" });
    if (pushLogs.length > 50) pushLogs.pop();
    return;
  }

  try {
    const payload = {
      app_id: appId,
      included_segments: ["Subscribed Users"],
      headings: { en: title },
      contents: { en: message },
      data: data || {},
      url: "https://ryztor.replit.app",
      chrome_web_icon: "https://ryztor.replit.app/icon-512.png",
      ttl: 60,
    };
    
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
    
    // If "Subscribed Users" segment fails, try "All" segment as fallback
    if (error.response?.data?.errors?.includes("Segment 'Subscribed Users' was not found")) {
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
            url: "https://ryztor.replit.app",
            chrome_web_icon: "https://ryztor.replit.app/icon-512.png",
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
                });
              }

              // 3. Prevent Duplicate Messages
              const existing = await storage.getMessageByWaId(msg.id);
              if (existing) continue;

              // 4. Save Message (include mediaId for images and audio)
              const mediaId = msg.image?.id || msg.audio?.id || null;
              const mimeType = msg.image?.mime_type || msg.audio?.mime_type || null;
              
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

              // 5. AI Auto-Response with debounce buffer (groups rapid messages)
              if (messageForAi && !conversation.aiDisabled) {
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
              const status = value.statuses[0];
              await storage.updateMessageStatus(status.id, status.status);
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
      if (agent && agent.password === password && agent.isActive) {
        (req.session as any).authenticated = true;
        (req.session as any).username = agent.name;
        (req.session as any).role = "agent";
        (req.session as any).agentId = agent.id;
        res.json({ success: true });
      } else if (agent && !agent.isActive) {
        res.status(401).json({ message: "Cuenta desactivada" });
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
    let allConversations = await storage.getConversations();
    if ((req.session as any).role === "agent") {
      const agentId = (req.session as any).agentId;
      allConversations = allConversations.filter(c => c.assignedAgentId === agentId);
    }
    res.json(allConversations);
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
    res.json(allLabels);
  });

  app.post("/api/labels", requireAuth, async (req, res) => {
    try {
      const parsed = api.labels.create.input.parse(req.body);
      const label = await storage.createLabel(parsed);
      res.json(label);
    } catch (error) {
      res.status(400).json({ message: "Invalid label data" });
    }
  });

  app.delete("/api/labels/:id", requireAuth, async (req, res) => {
    await storage.deleteLabel(parseInt(req.params.id));
    res.json({ success: true });
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

  // Set conversation label
  app.patch("/api/conversations/:id/label", requireAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    const { labelId } = req.body;
    const updated = await storage.updateConversation(id, { labelId });
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
    const conversations = await storage.getConversations();
    
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    const beforeYesterday = new Date(today.getTime() - 48 * 60 * 60 * 1000);
    
    // Filter conversations where:
    // 1. We sent the last message (direction = out)
    // 2. Customer hasn't responded for the specified time period
    const filtered = [];
    
    for (const conv of conversations) {
      const messages = await storage.getMessages(conv.id);
      if (messages.length === 0) continue;
      
      const lastMsg = messages[messages.length - 1];
      if (lastMsg.direction !== 'out') continue; // Skip if customer sent last message
      
      const lastMsgTime = lastMsg.createdAt ? new Date(lastMsg.createdAt) : null;
      if (!lastMsgTime) continue;
      
      let include = false;
      if (timeFilter === 'today') {
        include = lastMsgTime >= today;
      } else if (timeFilter === 'yesterday') {
        include = lastMsgTime >= yesterday && lastMsgTime < today;
      } else if (timeFilter === 'before_yesterday') {
        include = lastMsgTime >= beforeYesterday && lastMsgTime < yesterday;
      } else {
        include = true; // No filter, return all
      }
      
      if (include) {
        filtered.push({
          ...conv,
          lastOutboundMessage: lastMsg,
          messageCount: messages.length
        });
      }
    }
    
    res.json(filtered);
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
    ttsSpeed: z.number().min(25).max(400).optional(), // 25-400, divide by 100 for 0.25-4.0
    ttsInstructions: z.string().nullable().optional(),
  });

  const aiTrainingCreateSchema = z.object({
    type: z.enum(["text", "url", "image_url"]),
    title: z.string().max(200).nullable().optional(),
    content: z.string().min(1),
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

  // Get Training Data
  app.get("/api/ai/training", requireAuth, async (req, res) => {
    try {
      const data = await storage.getAiTrainingData();
      res.json(data);
    } catch (error) {
      console.error("Error fetching training data:", error);
      res.status(500).json({ message: "Error fetching training data" });
    }
  });

  // Add Training Data
  app.post("/api/ai/training", requireAuth, async (req, res) => {
    try {
      const parsed = aiTrainingCreateSchema.parse(req.body);
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
  app.get("/api/agents", requireAdmin, async (_req, res) => {
    try {
      const agentsList = await storage.getAgents();
      res.json(agentsList);
    } catch (error) {
      res.status(500).json({ message: "Error fetching agents" });
    }
  });

  app.post("/api/agents", requireAdmin, async (req, res) => {
    try {
      const { name, username, password, weight } = req.body;
      if (!name || !username || !password) {
        return res.status(400).json({ message: "Name, username and password are required" });
      }
      const existing = await storage.getAgentByUsername(username);
      if (existing) {
        return res.status(400).json({ message: "Username already exists" });
      }
      const agent = await storage.createAgent({ name, username, password, isActive: true, weight: weight || 1 });
      res.json(agent);
    } catch (error) {
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
      if (updates.isActive === false) {
        const allConversations = await storage.getConversations();
        const agentConvos = allConversations.filter(c => c.assignedAgentId === id);
        for (const convo of agentConvos) {
          const nextAgent = await storage.getNextAgentForAssignment();
          if (nextAgent && nextAgent.id !== id) {
            await storage.assignConversationToAgent(convo.id, nextAgent.id);
          }
        }
      }
      res.json(agent);
    } catch (error) {
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
