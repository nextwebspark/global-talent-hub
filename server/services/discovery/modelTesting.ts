import { getLLMClient } from "../llmClient";

// Parse OpenRouter error responses for user-friendly messages
export function parseOpenRouterError(error: any): { code: string; message: string; suggestion: string } {
  const errorMessage = error?.message || error?.error?.message || String(error);
  const statusCode = error?.status || error?.response?.status;

  // Privacy policy issue
  if (errorMessage.includes("No endpoints found matching your data policy")) {
    return {
      code: "PRIVACY_POLICY",
      message: "This model requires OpenRouter privacy settings to be configured.",
      suggestion: "Check your Vertex AI project permissions and ensure the model is enabled in your region."
    };
  }

  // Rate limit
  if (statusCode === 429 || errorMessage.includes("429") || errorMessage.includes("rate limit")) {
    return {
      code: "RATE_LIMITED",
      message: "This model has hit rate limits.",
      suggestion: "Try a different model, or wait a few minutes and try again."
    };
  }

  // Provider error (400)
  if (statusCode === 400 || errorMessage.includes("400")) {
    return {
      code: "PROVIDER_ERROR",
      message: "The model provider returned an error.",
      suggestion: "The :online web search feature may not be supported. Trying without web search..."
    };
  }

  // Model not found
  if (statusCode === 404 || errorMessage.includes("404")) {
    return {
      code: "MODEL_NOT_FOUND",
      message: "This model is not available.",
      suggestion: "Select a different model from the list."
    };
  }

  // Insufficient credits
  if (errorMessage.includes("insufficient") || errorMessage.includes("credits") || errorMessage.includes("balance")) {
    return {
      code: "INSUFFICIENT_CREDITS",
      message: "Insufficient OpenRouter credits.",
      suggestion: "Check your Google Cloud billing is active for project GOOGLE_CLOUD_PROJECT."
    };
  }

  // Generic error
  return {
    code: "UNKNOWN_ERROR",
    message: errorMessage,
    suggestion: "Try a different model or check your OpenRouter API key."
  };
}

// Test if a model is working by sending a simple prompt
export async function testModel(modelId: string, withOnline: boolean = false): Promise<{
  success: boolean;
  model: string;
  withOnline: boolean;
  latencyMs: number;
  responsePreview?: string;
  error?: { code: string; message: string; suggestion: string };
}> {
  const startTime = Date.now();

  console.log(`[Model Test] Testing model: ${modelId}`);

  try {
    const llm = await getLLMClient();
    const response = await llm.chat.completions.create({
      model: modelId,
      messages: [
        { role: "user", content: "Reply with exactly one word: OK" }
      ],
      max_tokens: 10,
      temperature: 0
    });

    const latencyMs = Date.now() - startTime;
    const content = response.choices[0]?.message?.content?.trim() || "";

    console.log(`[Model Test] ${modelId} responded in ${latencyMs}ms: "${content}"`);

    // Validate that we got a reasonable response (not empty)
    if (!content || content.length === 0) {
      return {
        success: false,
        model: modelId,
        withOnline,
        latencyMs,
        error: {
          code: "EMPTY_RESPONSE",
          message: "Model returned an empty response.",
          suggestion: "This model may not be responding correctly. Try a different model."
        }
      };
    }

    return {
      success: true,
      model: modelId,
      withOnline,
      latencyMs,
      responsePreview: content.substring(0, 50)
    };
  } catch (error: any) {
    const latencyMs = Date.now() - startTime;
    const parsedError = parseOpenRouterError(error);

    console.log(`[Model Test] ${modelId} failed in ${latencyMs}ms: ${parsedError.code} - ${parsedError.message}`);

    return {
      success: false,
      model: modelId,
      withOnline,
      latencyMs,
      error: parsedError
    };
  }
}

// Test a model with both online and offline modes
export async function testModelComprehensive(modelId: string): Promise<{
  model: string;
  baseTest: { success: boolean; latencyMs: number; error?: any };
  onlineTest: { success: boolean; latencyMs: number; error?: any };
  recommendation: string;
}> {
  console.log(`[Model Test] Comprehensive test for: ${modelId}`);

  // Test base model first
  const baseResult = await testModel(modelId, false);

  // Test with :online suffix
  const onlineResult = await testModel(modelId, true);

  let recommendation: string;
  if (onlineResult.success) {
    recommendation = "Full web search support available";
  } else if (baseResult.success) {
    recommendation = "Works without web search (will use model's training data only)";
  } else {
    recommendation = `Model unavailable: ${baseResult.error?.suggestion || "Check OpenRouter settings"}`;
  }

  return {
    model: modelId,
    baseTest: { success: baseResult.success, latencyMs: baseResult.latencyMs, error: baseResult.error },
    onlineTest: { success: onlineResult.success, latencyMs: onlineResult.latencyMs, error: onlineResult.error },
    recommendation
  };
}
