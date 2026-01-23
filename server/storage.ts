import { db } from "./db";
import {
  conversations,
  messages,
  labels,
  quickMessages,
  aiSettings,
  aiTrainingData,
  aiLogs,
  type Conversation,
  type InsertConversation,
  type Message,
  type InsertMessage,
  type Label,
  type InsertLabel,
  type QuickMessage,
  type InsertQuickMessage,
  type AiSettings,
  type InsertAiSettings,
  type AiTrainingData,
  type InsertAiTrainingData,
  type AiLog,
  type InsertAiLog,
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

  // AI Agent
  getAiSettings(): Promise<AiSettings | undefined>;
  updateAiSettings(settings: Partial<InsertAiSettings>): Promise<AiSettings>;
  getAiTrainingData(): Promise<AiTrainingData[]>;
  createAiTrainingData(data: InsertAiTrainingData): Promise<AiTrainingData>;
  deleteAiTrainingData(id: number): Promise<void>;
  getAiLogs(limit?: number): Promise<AiLog[]>;
  createAiLog(log: InsertAiLog): Promise<AiLog>;
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

  // AI Agent
  async getAiSettings(): Promise<AiSettings | undefined> {
    const [settings] = await db.select().from(aiSettings).limit(1);
    return settings;
  }

  async updateAiSettings(settings: Partial<InsertAiSettings>): Promise<AiSettings> {
    const existing = await this.getAiSettings();
    if (existing) {
      const [updated] = await db
        .update(aiSettings)
        .set({ ...settings, updatedAt: new Date() })
        .where(eq(aiSettings.id, existing.id))
        .returning();
      return updated;
    } else {
      const [created] = await db.insert(aiSettings).values(settings).returning();
      return created;
    }
  }

  async getAiTrainingData(): Promise<AiTrainingData[]> {
    return await db.select().from(aiTrainingData).orderBy(desc(aiTrainingData.createdAt));
  }

  async createAiTrainingData(data: InsertAiTrainingData): Promise<AiTrainingData> {
    const [created] = await db.insert(aiTrainingData).values(data).returning();
    return created;
  }

  async deleteAiTrainingData(id: number): Promise<void> {
    await db.delete(aiTrainingData).where(eq(aiTrainingData.id, id));
  }

  async getAiLogs(limit: number = 50): Promise<AiLog[]> {
    return await db.select().from(aiLogs).orderBy(desc(aiLogs.createdAt)).limit(limit);
  }

  async createAiLog(log: InsertAiLog): Promise<AiLog> {
    const [created] = await db.insert(aiLogs).values(log).returning();
    return created;
  }
}

export const storage = new DatabaseStorage();
