import { z } from "zod";
import { insertConversationSchema, insertMessageSchema, sendMessageSchema, loginSchema, conversations, messages } from "./schema";

export const api = {
  auth: {
    login: {
      method: "POST" as const,
      path: "/api/login",
      input: loginSchema,
      responses: {
        200: z.object({ success: z.boolean() }),
        401: z.object({ message: z.string() }),
      },
    },
    logout: {
      method: "POST" as const,
      path: "/api/logout",
      responses: {
        200: z.object({ success: z.boolean() }),
      },
    },
    me: {
      method: "GET" as const,
      path: "/api/me",
      responses: {
        200: z.object({ authenticated: z.boolean(), username: z.string().optional() }),
      },
    },
  },
  conversations: {
    list: {
      method: "GET" as const,
      path: "/api/conversations",
      responses: {
        200: z.array(z.custom<typeof conversations.$inferSelect>()),
      },
    },
    get: {
      method: "GET" as const,
      path: "/api/conversations/:id",
      responses: {
        200: z.object({
          conversation: z.custom<typeof conversations.$inferSelect>(),
          messages: z.array(z.custom<typeof messages.$inferSelect>()),
        }),
        404: z.object({ message: z.string() }),
      },
    },
  },
  messages: {
    send: {
      method: "POST" as const,
      path: "/api/send",
      input: sendMessageSchema,
      responses: {
        200: z.object({ success: z.boolean(), messageId: z.string() }),
        400: z.object({ message: z.string() }),
        500: z.object({ message: z.string() }),
      },
    },
  },
  // Webhook is handled separately but we define the verifying path
  webhook: {
    verify: {
      method: "GET" as const,
      path: "/webhook",
    },
    receive: {
      method: "POST" as const,
      path: "/webhook",
    }
  }
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
