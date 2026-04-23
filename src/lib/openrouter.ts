import OpenAI from 'openai';

// Initialize the native OpenAI client (Primary)
export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 120000,
});

// Initialize the OpenAI client pointing to OpenRouter's API (Fallback)
export const openrouter = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
  timeout: 120000,
  defaultHeaders: {
    "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
    "X-Title": "AI Instagram SaaS",
  }
});
