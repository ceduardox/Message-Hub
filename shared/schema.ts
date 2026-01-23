import { pgTable, text, serial, integer, timestamp, jsonb, boolean, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

// === TABLE DEFINITIONS ===

export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  waId: varchar("wa_id").notNull().unique(), // The user's phone number
  contactName: text("contact_name"), // Optional name
  lastMessage: text("last_message"), // Cache for list view
  lastMessageTimestamp: timestamp("last_message_timestamp"), // For sorting
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

// === API TYPES ===

export type Conversation = typeof conversations.$inferSelect;
export type Message = typeof messages.$inferSelect;

export type InsertConversation = z.infer<typeof insertConversationSchema>;
export type InsertMessage = z.infer<typeof insertMessageSchema>;

// Request types
export const sendMessageSchema = z.object({
  to: z.string(), // wa_id
  type: z.enum(["text", "image"]),
  text: z.string().optional(),
  imageUrl: z.string().optional(),
  caption: z.string().optional(),
});

export type SendMessageRequest = z.infer<typeof sendMessageSchema>;

// Admin Login
export const loginSchema = z.object({
  username: z.string(),
  password: z.string(),
});

export type LoginRequest = z.infer<typeof loginSchema>;
