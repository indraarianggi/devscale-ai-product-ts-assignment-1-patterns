import { OpenAIClient } from "@anvia/openai";
import { tavily } from "@tavily/core";
import "dotenv/config";

const openClient = new OpenAIClient({
  baseUrl: process.env.OPENROUTER_BASE_URL,
  apiKey: process.env.OPENROUTER_API_KEY,
});

export function getModel(model: string = "openai/gpt-5.5") {
  return openClient.completionModel(model);
}

// for searching internet
export const tavilyClient = tavily({
  apiKey: process.env.TAVILY_API_KEY!,
});
