import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import session from "express-session";
import MemoryStore from "memorystore";
import axios from "axios";
import { generateAiResponse } from "./ai-service";
import { insertProductSchema, updateOrderStatusSchema } from "@shared/schema";

// Send push notification via OneSignal
async function sendPushNotification(title: string, message: string, data?: Record<string, string>) {
  const apiKey = process.env.ONESIGNAL_REST_API_KEY;
  const appId = "07dfe1e4-83b1-4623-b57c-e6e33232d4eb";

  console.log("[OneSignal] Attempting to send notification:", { title, message });
  console.log("[OneSignal] API Key configured:", !!apiKey);

  if (!apiKey) {
    console.log("[OneSignal] ERROR: API key not configured, skipping push notification");
    return;
  }

  try {
    const payload = {
      app_id: appId,
      included_segments: ["Subscribed Users"],
      headings: { en: title },
      contents: { en: message },
      data: data || {},
      web_push_topic: `message-${Date.now()}`,
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
  } catch (error: any) {
    console.error("[OneSignal] FAILED - Error:", error.response?.data || error.message);
    
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
            web_push_topic: `message-${Date.now()}`,
          },
          {
            headers: {
              Authorization: `Basic ${apiKey}`,
              "Content-Type": "application/json",
            },
          }
        );
        console.log("[OneSignal] Fallback SUCCESS:", JSON.stringify(fallbackResponse.data, null, 2));
      } catch (fallbackError: any) {
        console.error("[OneSignal] Fallback FAILED:", fallbackError.response?.data || fallbackError.message);
      }
    }
  }
}

// Helper to send messages via Graph API
async function sendToWhatsApp(to: string, type: 'text' | 'image', content: any) {
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
  
  // Ensure phone number has + prefix (Meta requires it)
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
      cookie: { maxAge: 604800000 }, // 7 days
      store: new SessionStore({
        checkPeriod: 86400000,
      }),
    })
  );

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

            // Handle Messages
            if (value.messages && value.messages.length > 0) {
              console.log("=== MESSAGE RECEIVED ===");
              const msg = value.messages[0];
              console.log("Message ID:", msg.id);
              console.log("From:", msg.from);
              console.log("Type:", msg.type);
              const from = msg.from; // wa_id
              const name = value.contacts?.[0]?.profile?.name || from;
              
              // 1. Build message text FIRST (handle different types including location)
              let messageText: string | null = null;
              let messageForAi: string | null = null;
              
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
                messageForAi = '[El cliente envió una imagen]';
              } else {
                messageText = `[${msg.type}]`;
                messageForAi = `[El cliente envió un mensaje de tipo: ${msg.type}]`;
              }

              // 2. Ensure Conversation Exists (now using correct messageText)
              let conversation = await storage.getConversationByWaId(from);
              if (!conversation) {
                conversation = await storage.createConversation({
                  waId: from,
                  contactName: name,
                  lastMessage: messageText || `[${msg.type}]`,
                  lastMessageTimestamp: new Date(parseInt(msg.timestamp) * 1000),
                });
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

              // 4. Send push notification for new incoming message
              const messagePreview = messageText || `[${msg.type}]`;
              sendPushNotification(
                name,
                messagePreview.length > 100 ? messagePreview.substring(0, 100) + "..." : messagePreview,
                { conversationId: conversation.id.toString(), waId: from }
              );

              // 5. Save Message
              await storage.createMessage({
                conversationId: conversation.id,
                waMessageId: msg.id,
                direction: "in",
                type: msg.type,
                text: messageText,
                mediaId: msg.image ? msg.image.id : null,
                mimeType: msg.image ? msg.image.mime_type : null,
                timestamp: msg.timestamp,
                status: "received",
                rawJson: msg,
              });

              // 5. AI Auto-Response (if enabled) - now works with location too
              if (messageForAi) {
                try {
                  const recentMessages = await storage.getMessages(conversation.id);
                  const aiResult = await generateAiResponse(
                    conversation.id,
                    messageForAi,
                    recentMessages
                  );

                  if (aiResult && aiResult.response) {
                    // Send text response
                    const waResponse = await sendToWhatsApp(from, 'text', { text: aiResult.response });
                    const waMessageId = waResponse.messages[0].id;

                    await storage.createMessage({
                      conversationId: conversation.id,
                      waMessageId: waMessageId,
                      direction: "out",
                      type: "text",
                      text: aiResult.response,
                      timestamp: Math.floor(Date.now() / 1000).toString(),
                      status: "sent",
                      rawJson: waResponse,
                    });

                    // Update conversation with last message and order status if ready
                    const updateData: any = {
                      lastMessage: aiResult.response,
                      lastMessageTimestamp: new Date(),
                    };
                    
                    // Mark order as ready if AI detected complete order
                    if (aiResult.orderReady) {
                      updateData.orderStatus = 'ready';
                      console.log("=== MARKING ORDER AS READY ===", conversation.id);
                    }
                    
                    await storage.updateConversation(conversation.id, updateData);

                    // Send image if AI included one
                    if (aiResult.imageUrl) {
                      const imgResponse = await sendToWhatsApp(from, 'image', { imageUrl: aiResult.imageUrl });
                      await storage.createMessage({
                        conversationId: conversation.id,
                        waMessageId: imgResponse.messages[0].id,
                        direction: "out",
                        type: "image",
                        text: null,
                        timestamp: Math.floor(Date.now() / 1000).toString(),
                        status: "sent",
                        rawJson: imgResponse,
                      });
                    }

                    console.log("=== AI RESPONSE SENT ===");
                    console.log("Response:", aiResult.response);
                    console.log("Tokens:", aiResult.tokensUsed);
                  }
                } catch (aiError) {
                  console.error("AI Response Error:", aiError);
                }
              }
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
      res.json({ success: true });
    } else {
      res.status(401).json({ message: "Invalid credentials" });
    }
  });

  app.post(api.auth.logout.path, (req, res) => {
    req.session.destroy(() => {
      res.json({ success: true });
    });
  });

  app.get(api.auth.me.path, (req, res) => {
    if ((req.session as any).authenticated) {
      res.json({ authenticated: true, username: (req.session as any).username });
    } else {
      res.json({ authenticated: false });
    }
  });

  // Conversations
  app.get(api.conversations.list.path, requireAuth, async (req, res) => {
    const conversations = await storage.getConversations();
    res.json(conversations);
  });

  app.get(api.conversations.get.path, requireAuth, async (req, res) => {
    const id = parseInt(req.params.id as string);
    const conversation = await storage.getConversation(id);
    if (!conversation) return res.status(404).json({ message: "Conversation not found" });
    
    const messages = await storage.getMessages(id);
    res.json({ conversation, messages });
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
        text: text,
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
    maxPromptChars: z.number().min(500).max(10000).optional(),
    conversationHistory: z.number().min(1).max(10).optional(),
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

  return httpServer;
}
