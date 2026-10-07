import dotenv from 'dotenv'
import { z } from 'zod'

dotenv.config()

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().transform(Number).default('3000'),
  API_PREFIX: z.string().default('/api'),

  CORS_ORIGIN: z.string().refine(
    (val) => val === '*' || z.string().url().safeParse(val).success,
    { message: 'CORS_ORIGIN must be a valid URL or "*" for all origins' }
  ).default('*'),
  RATE_LIMIT_WINDOW_MS: z.string().transform(Number).default('900000'),
  RATE_LIMIT_MAX_REQUESTS: z.string().transform(Number).default('100'),

  // Knowledge base: PostgreSQL + pgvector
  DATABASE_URL: z.string().default('postgres://dispute:dispute@localhost:5432/dispute_review'),

  // Local open-source models served by Ollama
  OLLAMA_BASE_URL: z.string().url().default('http://localhost:11434'),
  EMBED_MODEL: z.string().default('bge-m3'),
  // Must match EMBED_MODEL's output size; baked into the vector column on first start
  EMBED_DIM: z.string().transform(Number).default('1024'),
  LLM_MODEL: z.string().default('qwen2.5:7b'),
  // Optional vision model (e.g. moondream) to describe photos; empty = OCR only
  VISION_MODEL: z.string().optional().transform((v) => v || undefined),

  // Uploads and OCR
  UPLOAD_DIR: z.string().default('uploads'),
  MAX_UPLOAD_MB: z.string().transform(Number).default('25'),
  OCR_LANGS: z.string().default('eng+chi_sim'),

  // Dispute-review agents (Rider/Driver Advocate, Judge). Gemini is used when its key is set.
  GEMINI_API_KEY: z.string().optional().transform((v) => v?.trim() || undefined),
  GEMINI_MODEL: z.string().default('gemini-3.8-flash'),
  // Tried in order when GEMINI_MODEL fails (high demand, quota, retired model)
  GEMINI_FALLBACK_MODELS: z
    .string()
    .default('gemini-3.1-flash-lite,gemini-3.5-flash')
    .transform((v) => v.split(',').map((m) => m.trim()).filter(Boolean)),
  // Gemini thinks before answering; "low" keeps free-tier calls within a few minutes
  GEMINI_REASONING_EFFORT: z.enum(['low', 'medium', 'high']).default('low'),
  TOKENHUB_API_KEY: z.string().optional().transform((v) => v || undefined),
  TOKENHUB_BASE_URL: z.string().url().default('https://tokenhub.tencentmaas.com/v1'),
  TOKENHUB_MODEL: z.string().default('hy3'),
  // A call is abandoned after LLM_TIMEOUT_MS in total, or LLM_IDLE_TIMEOUT_MS without output
  LLM_TIMEOUT_MS: z.string().transform(Number).default('240000'),
  LLM_IDLE_TIMEOUT_MS: z.string().transform(Number).default('90000'),

  // Human decisions the AI Judge learns from (JSON file), and how many go in its prompt
  PRECEDENTS_FILE: z.string().default('data/precedents.json'),
  PRECEDENT_EXAMPLES: z.string().transform(Number).default('3'),

  // Company internal API; unset = use the built-in mock
  COMPANY_API_BASE_URL: z.string().optional().transform((v) => v || undefined),
  COMPANY_API_TOKEN: z.string().optional(),
})

const parseEnv = () => {
  try {
    return envSchema.parse(process.env)
  } catch (error) {
    console.error('❌ Invalid environment variables:', error)
    process.exit(1)
  }
}

export const env = parseEnv()
