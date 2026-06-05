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

      const providerResponse = await callProvider(
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
}).listen(4000);

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
);
