import { GoogleGenAI } from "@google/genai";

const USE_VERTEX = process.env.GOOGLE_GENAI_USE_VERTEXAI === "true";
const PROJECT = process.env.GOOGLE_CLOUD_PROJECT;
const LOCATION = process.env.GOOGLE_CLOUD_LOCATION || "us-central1";
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

export const DEFAULT_MODEL = process.env.ENRICHMENT_MODEL || "gemini-2.5-pro";
export const FAST_MODEL = process.env.FAST_MODEL || "gemini-2.5-flash";

function buildClient(): GoogleGenAI {
  if (USE_VERTEX) {
    if (!PROJECT) throw new Error("GOOGLE_CLOUD_PROJECT must be set for Vertex AI");
    console.log(`[LLMClient] Vertex AI project=${PROJECT} location=${LOCATION}`);
    return new GoogleGenAI({ vertexai: true, project: PROJECT, location: LOCATION });
  }
  if (!GOOGLE_API_KEY) throw new Error("GOOGLE_API_KEY must be set");
  console.log(`[LLMClient] Google AI Studio`);
  return new GoogleGenAI({ apiKey: GOOGLE_API_KEY });
}

// OpenAI-compatible shim so all callers work unchanged
interface CompletionMessage { role: string; content: string }
interface CompletionRequest {
  model: string;
  messages: CompletionMessage[];
  max_tokens?: number;
  temperature?: number;
  stream?: boolean;
  thinkingBudget?: number;
  response_format?: { type: string };
}

function makeClient() {
  const genai = buildClient();

  return {
    chat: {
      completions: {
        create: async (req: CompletionRequest) => {
          const model = genai.models;
          const contents = req.messages.map(m => ({
            role: m.role === "assistant" ? "model" : "user",
            parts: [{ text: m.content }],
          }));

          const response = await model.generateContent({
            model: req.model,
            contents,
            config: {
              maxOutputTokens: req.max_tokens ?? 4096,
              temperature: req.temperature,
              ...(req.thinkingBudget !== undefined && { thinkingConfig: { thinkingBudget: req.thinkingBudget } }),
              ...(req.response_format?.type === "json_object" && { responseMimeType: "application/json" }),
            },
          });

          const text = response.text ?? "";
          return {
            choices: [{ message: { content: text, role: "assistant" }, finish_reason: "stop" }],
          };
        },
      },
    },
  };
}

// Matches existing getLLMClient() call signature
export async function getLLMClient() {
  return makeClient();
}
