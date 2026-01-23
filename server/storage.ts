import { db } from "./db";
import {
  conversations,
  messages,
  labels,
  quickMessages,
  type Conversation,
  type InsertConversation,
  type Message,
  type InsertMessage,
  type Label,
  type InsertLabel,
  type QuickMessage,
  type InsertQuickMessage,
} from "@shared/schema";
import { eq, desc, asc } from "drizzle-orm";

export interface IStorage {
  // Auth
  validateAdmin(username: string, password: string): Promise<boolean>;

  // Conversations
  getConversations(): Promise<Conversation[]>;
  getConversation(id: number): Promise<Conversation | undefined>;
  getConversationByWaId(waId: string): Promise<Conversation | undefined>;
  createConversation(conversation: InsertConversation): Promise<Conversation>;
  updateConversation(id: number, updates: Partial<Conversation>): Promise<Conversation>;

  // Messages
  getMessages(conversationId: number): Promise<Message[]>;
  createMessage(message: InsertMessage): Promise<Message>;
  getMessageByWaId(waMessageId: string): Promise<Message | undefined>;
  updateMessageStatus(waMessageId: string, status: string): Promise<void>;

  // Labels
  getLabels(): Promise<Label[]>;
  createLabel(label: InsertLabel): Promise<Label>;
  deleteLabel(id: number): Promise<void>;

  // Quick Messages
  getQuickMessages(): Promise<QuickMessage[]>;
  createQuickMessage(qm: InsertQuickMessage): Promise<QuickMessage>;
  deleteQuickMessage(id: number): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async validateAdmin(username: string, pass: string): Promise<boolean> {
    // Check against environment variables as requested
    const adminUser = process.env.ADMIN_USER;
    const adminPass = process.env.ADMIN_PASS;
    return username === adminUser && pass === adminPass;
  }

  async getConversations(): Promise<Conversation[]> {
    return await db.select().from(conversations).orderBy(desc(conversations.updatedAt));
  }

  async getConversation(id: number): Promise<Conversation | undefined> {
    const [conversation] = await db.select().from(conversations).where(eq(conversations.id, id));
    return conversation;
  }

  async getConversationByWaId(waId: string): Promise<Conversation | undefined> {
    const [conversation] = await db.select().from(conversations).where(eq(conversations.waId, waId));
    return conversation;
  }

  async createConversation(insertConversation: InsertConversation): Promise<Conversation> {
    const [conversation] = await db.insert(conversations).values(insertConversation).returning();
    return conversation;
  }

  async updateConversation(id: number, updates: Partial<Conversation>): Promise<Conversation> {
    const [updated] = await db
      .update(conversations)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(conversations.id, id))
      .returning();
    return updated;
  }

  async getMessages(conversationId: number): Promise<Message[]> {
    return await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(asc(messages.createdAt)); // Oldest first for chat history
  }

  async createMessage(insertMessage: InsertMessage): Promise<Message> {
    const [message] = await db.insert(messages).values(insertMessage).returning();
    return message;
  }

  async getMessageByWaId(waMessageId: string): Promise<Message | undefined> {
    const [message] = await db.select().from(messages).where(eq(messages.waMessageId, waMessageId));
    return message;
  }

  async updateMessageStatus(waMessageId: string, status: string): Promise<void> {
    await db
      .update(messages)
      .set({ status })
      .where(eq(messages.waMessageId, waMessageId));
  }

  // Labels
  async getLabels(): Promise<Label[]> {
    return await db.select().from(labels);
  }

  async createLabel(label: InsertLabel): Promise<Label> {
    const [created] = await db.insert(labels).values(label).returning();
    return created;
  }

  async deleteLabel(id: number): Promise<void> {
    await db.delete(labels).where(eq(labels.id, id));
  }

  // Quick Messages
  async getQuickMessages(): Promise<QuickMessage[]> {
    return await db.select().from(quickMessages);
  }

  async createQuickMessage(qm: InsertQuickMessage): Promise<QuickMessage> {
    const [created] = await db.insert(quickMessages).values(qm).returning();
    return created;
  }

  async deleteQuickMessage(id: number): Promise<void> {
    await db.delete(quickMessages).where(eq(quickMessages.id, id));
  }
}

export const storage = new DatabaseStorage();
