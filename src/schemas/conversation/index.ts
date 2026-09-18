import { z } from "zod";
import { paginationSchema } from "../common/index.js";

// Create conversation request body
export const createConversationSchema = z.object({
  repositoryId: z.string().uuid("Invalid repository ID format"),
  title: z.string().min(1).max(255).optional(),
});

export type CreateConversationBody = z.infer<typeof createConversationSchema>;

// List conversations query params
export const listConversationsQuerySchema = paginationSchema.extend({
  repositoryId: z.string().uuid("Invalid repository ID format"),
});

export type ListConversationsQuery = z.infer<
  typeof listConversationsQuerySchema
>;

// List messages query params
export const listMessagesQuerySchema = paginationSchema;

export type ListMessagesQuery = z.infer<typeof listMessagesQuerySchema>;

// Stream message request body
export const streamMessageSchema = z.object({
  content: z.string().min(1, "Content is required"),
});

export type StreamMessageBody = z.infer<typeof streamMessageSchema>;
