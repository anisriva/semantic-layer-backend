import dotenv from 'dotenv';
import { z } from 'zod';

// Load environment variables
dotenv.config();

// Define the configuration schema
const configSchema = z.object({
  // Server Configuration
  port: z.coerce.number().default(3000),
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),

  // Qdrant Configuration
  qdrantUrl: z.string().url().default('http://localhost:6333'),
  qdrantApiKey: z.string().optional(),

  // LLM Configuration (for future use)
  openaiApiKey: z.string().optional(),
  modelUrl: z.string().url().or(z.literal('')).optional(),
  modelName: z.string().optional(),
});

// Parse and validate environment variables
const envVars = {
  port: process.env.PORT,
  nodeEnv: process.env.NODE_ENV,
  qdrantUrl: process.env.QDRANT_URL,
  qdrantApiKey: process.env.QDRANT_API_KEY,
  openaiApiKey: process.env.OPENAI_API_KEY,
  modelUrl: process.env.MODEL_URL && process.env.MODEL_URL.trim() !== '' ? process.env.MODEL_URL : undefined,
  modelName: process.env.MODEL_NAME,
};

// Validate and export config
const config = configSchema.parse(envVars);

export default config;
