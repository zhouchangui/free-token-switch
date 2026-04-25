import { describe, expect, it } from "vitest";
import { normalizeOpenRouterModelsResponse } from "../../scripts/model-pricing/openrouter-pricing.mjs";

describe("normalizeOpenRouterModelsResponse", () => {
  it("normalizes OpenRouter token prices into a stable local snapshot", () => {
    const snapshot = normalizeOpenRouterModelsResponse(
      {
        data: [
          {
            id: "anthropic/claude-test",
            canonical_slug: "anthropic/claude-test",
            name: "Anthropic: Claude Test",
            context_length: 200000,
            pricing: {
              prompt: "0.000003",
              completion: "0.000015",
              input_cache_read: "0.0000003",
              input_cache_write: "0.00000375",
            },
            supported_parameters: ["tools", "reasoning"],
            top_provider: {
              context_length: 200000,
              max_completion_tokens: 8192,
              is_moderated: true,
            },
          },
        ],
      },
      {
        fetchedAt: "2026-04-25T08:00:00.000Z",
      },
    );

    expect(snapshot).toEqual({
      schemaVersion: 1,
      source: "openrouter",
      sourceUrl: "https://openrouter.ai/api/v1/models",
      fetchedAt: "2026-04-25T08:00:00.000Z",
      currency: "USD",
      pricingUnit: "per_token",
      models: [
        {
          id: "anthropic/claude-test",
          canonicalSlug: "anthropic/claude-test",
          name: "Anthropic: Claude Test",
          contextLength: 200000,
          pricing: {
            prompt: "0.000003",
            completion: "0.000015",
            request: null,
            image: null,
            webSearch: null,
            internalReasoning: null,
            inputCacheRead: "0.0000003",
            inputCacheWrite: "0.00000375",
          },
          usdPerMillionTokens: {
            input: 3,
            output: 15,
            cacheRead: 0.3,
            cacheWrite: 3.75,
            internalReasoning: null,
          },
          supportedParameters: ["tools", "reasoning"],
          topProvider: {
            contextLength: 200000,
            maxCompletionTokens: 8192,
            isModerated: true,
          },
        },
      ],
    });
  });

  it("drops malformed models and sorts by model id", () => {
    const snapshot = normalizeOpenRouterModelsResponse(
      {
        data: [
          { id: "", name: "Missing ID", pricing: { prompt: "1" } },
          {
            id: "z/model",
            name: "Z",
            pricing: { prompt: "0.000002", completion: "0.000004" },
          },
          {
            id: "a/model",
            name: "A",
            pricing: { prompt: "0", completion: "0" },
          },
        ],
      },
      { fetchedAt: "2026-04-25T08:00:00.000Z" },
    );

    expect(snapshot.models.map((model) => model.id)).toEqual([
      "a/model",
      "z/model",
    ]);
  });
});
