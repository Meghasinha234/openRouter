import bearer from "@elysiajs/bearer";
import { prisma } from "db";
import { Elysia, t } from "elysia";
import { Conversation } from "./types";
import { Gemini } from "./llms/Gemini";
import { OpenAi } from "./llms/Openai";
import { Claude } from "./llms/Claude";
import { LlmResponse } from "./llms/Base";

async function callProvider(
  providerName: string,
  providerModelName: string,
  messages: typeof Conversation.static.messages
): Promise<LlmResponse | null> {
  if (providerName === "Google API") {
    return Gemini.chat(providerModelName, messages);
  }

  if (providerName === "Google Vertex") {
    return Gemini.chat(providerModelName, messages);
  }

  if (providerName === "OpenAI") {
    return OpenAi.chat(providerModelName, messages);
  }

  if (providerName === "Claude API") {
    return Claude.chat(providerModelName, messages);
  }

  return null;
}

type ProviderErrorType =
  | "AUTH_ERROR"
  | "RATE_LIMITED"
  | "TIMEOUT"
  | "PROVIDER_5XX"
  | "BAD_REQUEST"
  | "UNKNOWN";

type ProviderStats = {
  requests: number;
  successes: number;
  failures: number;
  totalLatencyMs: number;
};

const providerStats: Record<string, ProviderStats> = {};

function getProviderStats(providerName: string): ProviderStats {
  if (!providerStats[providerName]) {
    providerStats[providerName] = {
      requests: 0,
      successes: 0,
      failures: 0,
      totalLatencyMs: 0,
    };
  }

  return providerStats[providerName];
}

function recordProviderAttempt(
  providerName: string,
  latencyMs: number,
  succeeded: boolean
) {
  const stats = getProviderStats(providerName);

  stats.requests += 1;
  stats.totalLatencyMs += latencyMs;

  if (succeeded) {
    stats.successes += 1;
  } else {
    stats.failures += 1;
  }
}

function getProviderHealthSnapshot() {
  return Object.fromEntries(
    Object.entries(providerStats).map(([providerName, stats]) => [
      providerName,
      {
        requests: stats.requests,
        successes: stats.successes,
        failures: stats.failures,
        avgLatencyMs:
          stats.requests === 0
            ? 0
            : Math.round(stats.totalLatencyMs / stats.requests),
      },
    ])
  );
}

function getErrorStatus(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }

  const maybeError = error as {
    status?: number;
    code?: number;
    response?: {
      status?: number;
    };
  };

  return maybeError.status ?? maybeError.response?.status ?? maybeError.code;
}

function classifyProviderError(error: unknown): ProviderErrorType {
  const status = getErrorStatus(error);

  if (status === 401 || status === 403) {
    return "AUTH_ERROR";
  }

  if (status === 429) {
    return "RATE_LIMITED";
  }

  if (status === 400 || status === 404) {
    return "BAD_REQUEST";
  }

  if (status && status >= 500 && status <= 599) {
    return "PROVIDER_5XX";
  }

  const message = error instanceof Error ? error.message.toLowerCase() : "";

  if (
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("econnreset") ||
    message.includes("network")
  ) {
    return "TIMEOUT";
  }

  return "UNKNOWN";
}

function isRetryableProviderError(errorType: ProviderErrorType): boolean {
  return (
    errorType === "RATE_LIMITED" ||
    errorType === "TIMEOUT" ||
    errorType === "PROVIDER_5XX" ||
    errorType === "UNKNOWN"
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callProviderWithRetry(
  providerName: string,
  providerModelName: string,
  messages: typeof Conversation.static.messages,
  maxAttempts = 2
): Promise<LlmResponse | null> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const attemptStartedAt = Date.now();

    try {
      console.log(`Provider ${providerName} attempt ${attempt}/${maxAttempts}`);

      const response = await callProvider(providerName, providerModelName, messages);
      const latencyMs = Date.now() - attemptStartedAt;

      recordProviderAttempt(providerName, latencyMs, true);

      console.log(
        `Provider ${providerName} attempt ${attempt} succeeded in ${latencyMs}ms`
      );

      return response;
    } catch (error) {
      lastError = error;

      const latencyMs = Date.now() - attemptStartedAt;
      const errorType = classifyProviderError(error);
      const shouldRetry = isRetryableProviderError(errorType) && attempt < maxAttempts;

      recordProviderAttempt(providerName, latencyMs, false);

      console.error(
        `Provider ${providerName} attempt ${attempt} failed with ${errorType} in ${latencyMs}ms`
      );

      if (!shouldRetry) {
        throw error;
      }

      await sleep(500 * attempt);
    }
  }

  throw lastError;
}

const app = new Elysia()
.use(bearer())
.post("/api/v1/chat/completions", async ({ status, bearer: apiKey, body }) => {
  const model = body.model;
  const [_companyName, providerModelName] = model.split("/");
  const apiKeyDb = await prisma.apiKey.findFirst({
    where: {
      apiKey,
      disabled: false,
      deleted: false
    },
    select: {
      user: true
    }
  })

  if (!apiKeyDb) {
    return status(403, {
      message: "Invalid api key"
    })
  }

  if (apiKeyDb?.user.credits <= 0) {
    return status(403, {
      message: "You dont have enough credits in your db"
    })
  }

  const modelDb = await prisma.model.findFirst({
    where: {
      slug: model
    }
  })

  if (!modelDb) {
    return status(403, {
      message: "This is an invalid model we dont support"
    })
  }

  const providers = await prisma.modelProviderMapping.findMany({
    where: {
      modelId: modelDb.id
    },
    include: {
      provider: true
    }
  })

  let response: LlmResponse | null = null
  let selectedProvider = null

  for (const provider of providers) {
    const providerName = provider.provider.name;

    try {
      console.log(`Trying provider ${providerName} for model ${model}`);

      const providerResponse = await callProviderWithRetry(
        providerName,
        providerModelName,
        body.messages
      );

      if (!providerResponse) {
        console.warn(`Provider ${providerName} is not supported by router`);
        continue;
      }

      response = providerResponse;
      selectedProvider = provider;

      console.log(`Provider ${providerName} succeeded for model ${model}`);
      break;
    } catch (error) {
      console.error(`Provider ${providerName} failed for model ${model}`, error);
    }
  }

  if (!response || !selectedProvider) {
    return status(502, {
      message: "All providers failed for this model"
    })
  }

  const creditsUsed = (response.inputTokensConsumed * selectedProvider.inputTokenCost + response.outputTokensConsumed * selectedProvider.outputTokenCost) / 10;
  console.log(creditsUsed);
  const res = await prisma.user.update({
    where: {
      id: apiKeyDb.user.id
    },
    data: {
      credits: {
        decrement: creditsUsed
      }
    }
  });
  console.log(res)
  const res2 = await prisma.apiKey.update({
    where: {
      apiKey: apiKey
    }, 
    data: {
      creditsConsumed: {
        increment: creditsUsed
      }
    }
  })
  console.log(res2)

  return response;
}, {
  body: Conversation
})
.get("/api/v1/provider-health", () => {
  return getProviderHealthSnapshot();
})
.listen(4000);

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
);
