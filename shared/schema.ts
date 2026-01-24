import { pgTable, text, serial, integer, timestamp, jsonb, boolean, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

// === TABLE DEFINITIONS ===

export const labels = pgTable("labels", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 50 }).notNull(),
  color: varchar("color", { length: 20 }).notNull(), // hex or tailwind color
});

export const quickMessages = pgTable("quick_messages", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  text: text("text"),
  imageUrl: text("image_url"),
});

export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  waId: varchar("wa_id").notNull().unique(),
  contactName: text("contact_name"),
  labelId: integer("label_id").references(() => labels.id),
  isPinned: boolean("is_pinned").default(false),
  orderStatus: varchar("order_status", { length: 20 }), // null = no order, 'pending' = in progress, 'ready' = ready for delivery, 'delivered' = completed
  aiDisabled: boolean("ai_disabled").default(false), // true = human will respond, AI won't auto-reply
  needsHumanAttention: boolean("needs_human_attention").default(false), // true = AI couldn't respond, needs human
  lastMessage: text("last_message"),
  lastMessageTimestamp: timestamp("last_message_timestamp"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").references(() => conversations.id).notNull(),
  waMessageId: varchar("wa_message_id").unique(), // WhatsApp's message ID
  direction: varchar("direction", { length: 10 }).notNull(), // 'in' | 'out'
  type: varchar("type", { length: 20 }).notNull(), // 'text' | 'image' | 'other'
  text: text("body"),
  mediaId: varchar("media_id"),
  mimeType: varchar("mime_type"),
  status: varchar("status", { length: 20 }).default("received"), // 'sent', 'delivered', 'read'
  timestamp: varchar("timestamp"), // WhatsApp timestamp (unix string)
  rawJson: jsonb("raw_json"), // Store full payload for debugging
  createdAt: timestamp("created_at").defaultNow(),
});

// === RELATIONS ===

export const conversationsRelations = relations(conversations, ({ many }) => ({
  messages: many(messages),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
}));

// === SCHEMAS ===

export const insertConversationSchema = createInsertSchema(conversations).omit({ id: true, updatedAt: true });
export const insertMessageSchema = createInsertSchema(messages).omit({ id: true, createdAt: true });
export const insertLabelSchema = createInsertSchema(labels).omit({ id: true });
export const insertQuickMessageSchema = createInsertSchema(quickMessages).omit({ id: true });

// === API TYPES ===

export type Conversation = typeof conversations.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type Label = typeof labels.$inferSelect;
export type QuickMessage = typeof quickMessages.$inferSelect;

export type InsertConversation = z.infer<typeof insertConversationSchema>;
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type InsertLabel = z.infer<typeof insertLabelSchema>;
export type InsertQuickMessage = z.infer<typeof insertQuickMessageSchema>;

// Request types
export const sendMessageSchema = z.object({
  to: z.string(), // wa_id
  type: z.enum(["text", "image"]),
  text: z.string().optional(),
  imageUrl: z.string().optional(),
  caption: z.string().optional(),
});

export type SendMessageRequest = z.infer<typeof sendMessageSchema>;

// Order Status
export const orderStatusSchema = z.enum(["pending", "ready", "delivered"]).nullable();
export type OrderStatus = z.infer<typeof orderStatusSchema>;

export const updateOrderStatusSchema = z.object({
  orderStatus: orderStatusSchema,
});

// Admin Login
export const loginSchema = z.object({
  username: z.string(),
  password: z.string(),
});

export type LoginRequest = z.infer<typeof loginSchema>;

// === AI AGENT TABLES ===

export const aiSettings = pgTable("ai_settings", {
  id: serial("id").primaryKey(),
  enabled: boolean("enabled").default(false),
  systemPrompt: text("system_prompt"),
  catalog: text("catalog"),
  cacheRefreshMinutes: integer("cache_refresh_minutes").default(5),
  maxTokens: integer("max_tokens").default(120),
  temperature: integer("temperature").default(70), // 0-100, divide by 100 for actual value
  model: varchar("model", { length: 50 }).default("gpt-4o-mini"),
  maxPromptChars: integer("max_prompt_chars").default(2000), // Max chars in system prompt
  conversationHistory: integer("conversation_history").default(3), // How many previous messages to read
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const aiTrainingData = pgTable("ai_training_data", {
  id: serial("id").primaryKey(),
  type: varchar("type", { length: 20 }).notNull(), // 'text' | 'url' | 'image_url'
  title: varchar("title", { length: 200 }),
  content: text("content").notNull(), // The actual text or URL
  createdAt: timestamp("created_at").defaultNow(),
});

export const aiLogs = pgTable("ai_logs", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").references(() => conversations.id),
  userMessage: text("user_message"),
  aiResponse: text("ai_response"),
  tokensUsed: integer("tokens_used"),
  success: boolean("success").default(true),
  error: text("error"),
  createdAt: timestamp("created_at").defaultNow(),
});

// AI Schemas
export const insertAiSettingsSchema = createInsertSchema(aiSettings).omit({ id: true, updatedAt: true });
export const insertAiTrainingDataSchema = createInsertSchema(aiTrainingData).omit({ id: true, createdAt: true });
export const insertAiLogSchema = createInsertSchema(aiLogs).omit({ id: true, createdAt: true });

export type AiSettings = typeof aiSettings.$inferSelect;
export type AiTrainingData = typeof aiTrainingData.$inferSelect;
export type AiLog = typeof aiLogs.$inferSelect;

export type InsertAiSettings = z.infer<typeof insertAiSettingsSchema>;
export type InsertAiTrainingData = z.infer<typeof insertAiTrainingDataSchema>;
export type InsertAiLog = z.infer<typeof insertAiLogSchema>;

// === PRODUCTS TABLE ===

export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  keywords: varchar("keywords", { length: 200 }), // Alternative names/keywords for search
  description: text("description"),
  price: varchar("price", { length: 50 }), // e.g., "280 Bs"
  imageUrl: text("image_url"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertProductSchema = createInsertSchema(products).omit({ id: true, createdAt: true });
export type Product = typeof products.$inferSelect;
export type InsertProduct = z.infer<typeof insertProductSchema>;
