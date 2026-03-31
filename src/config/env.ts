import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  ASTRA_DB_API_ENDPOINT: z.string().min(1, 'ASTRA_DB_API_ENDPOINT is required'),
  ASTRA_DB_APPLICATION_TOKEN: z.string().min(1, 'ASTRA_DB_APPLICATION_TOKEN is required'),
  ASTRA_DB_NAMESPACE: z.string().default('default_keyspace'),
  JWT_SECRET: z.string().min(1, 'JWT_SECRET is required'),
  PORT: z.string().default('5000'),
  FRONTEND_URL: z.string().default('https://ixnel-frontend.vercel.app'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
