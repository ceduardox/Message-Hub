import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import session from "express-session";
import MemoryStore from "memorystore";
import axios from "axios";

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
      cookie: { maxAge: 86400000 }, // 24h
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
              
              // 1. Ensure Conversation Exists
              let conversation = await storage.getConversationByWaId(from);
              if (!conversation) {
                conversation = await storage.createConversation({
                  waId: from,
                  contactName: name,
                  lastMessage: msg.type === 'text' ? msg.text.body : `[${msg.type}]`,
                  lastMessageTimestamp: new Date(parseInt(msg.timestamp) * 1000),
                });
              } else {
                await storage.updateConversation(conversation.id, {
                  contactName: name, // update name if changed
                  lastMessage: msg.type === 'text' ? msg.text.body : `[${msg.type}]`,
                  lastMessageTimestamp: new Date(parseInt(msg.timestamp) * 1000),
                });
              }

              // 2. Prevent Duplicate Messages
              const existing = await storage.getMessageByWaId(msg.id);
              if (existing) continue;

              // 3. Save Message
              await storage.createMessage({
                conversationId: conversation.id,
                waMessageId: msg.id,
                direction: "in",
                type: msg.type,
                text: msg.type === 'text' ? msg.text.body : null,
                mediaId: msg.image ? msg.image.id : null,
                mimeType: msg.image ? msg.image.mime_type : null,
                timestamp: msg.timestamp,
                status: "received",
                rawJson: msg,
              });
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

  return httpServer;
}
