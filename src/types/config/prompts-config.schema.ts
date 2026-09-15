/**
 * Prompts configuration Zod schemas
 * Provides runtime validation for prompts.yaml configuration
 * Exports inferred types from schemas
 */

import { z } from 'zod';

export const enrichmentPromptsSchema = z.object({
  chunkSummary: z.string().min(1),
});

export const answerPromptsSchema = z.object({
  systemPrompt: z.string().min(1),
  userPrompt: z.string().min(1),
});

export const contextPromptsSchema = z.object({
  chunkTemplate: z.string().min(1),
});

export const promptsConfigSchema = z.object({
  enrichment: enrichmentPromptsSchema,
  answer: answerPromptsSchema,
  context: contextPromptsSchema,
});

// Export inferred types from schemas
export type EnrichmentPrompts = z.infer<typeof enrichmentPromptsSchema>;
export type AnswerPrompts = z.infer<typeof answerPromptsSchema>;
export type ContextPrompts = z.infer<typeof contextPromptsSchema>;
export type PromptsConfig = z.infer<typeof promptsConfigSchema>;