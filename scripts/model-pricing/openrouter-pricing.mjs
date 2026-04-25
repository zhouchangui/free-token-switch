export const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";

const PRICING_KEYS = {
  prompt: "prompt",
  completion: "completion",
  request: "request",
  image: "image",
  webSearch: "web_search",
  internalReasoning: "internal_reasoning",
  inputCacheRead: "input_cache_read",
  inputCacheWrite: "input_cache_write",
};

export function normalizeOpenRouterModelsResponse(response, options = {}) {
  const fetchedAt = options.fetchedAt ?? new Date().toISOString();
  const rawModels = Array.isArray(response?.data) ? response.data : [];

  const models = rawModels
    .map(normalizeOpenRouterModel)
    .filter(Boolean)
    .sort((left, right) => left.id.localeCompare(right.id));

  return {
    schemaVersion: 1,
    source: "openrouter",
    sourceUrl: OPENROUTER_MODELS_URL,
    fetchedAt,
    currency: "USD",
    pricingUnit: "per_token",
    models,
  };
}

export async function fetchOpenRouterModels(fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== "function") {
    throw new Error("No fetch implementation is available.");
  }

  const response = await fetchImpl(OPENROUTER_MODELS_URL, {
    headers: {
      accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(
      `OpenRouter models request failed: ${response.status} ${response.statusText}`,
    );
  }

  return response.json();
}

function normalizeOpenRouterModel(model) {
  const id = stringOrNull(model?.id);
  if (!id) {
    return null;
  }

  const pricing = normalizePricing(model?.pricing);

  return {
    id,
    canonicalSlug: stringOrNull(model?.canonical_slug),
    name: stringOrNull(model?.name) ?? id,
    contextLength: finiteNumberOrNull(model?.context_length),
    pricing,
    usdPerMillionTokens: {
      input: usdPerMillionOrNull(pricing.prompt),
      output: usdPerMillionOrNull(pricing.completion),
      cacheRead: usdPerMillionOrNull(pricing.inputCacheRead),
      cacheWrite: usdPerMillionOrNull(pricing.inputCacheWrite),
      internalReasoning: usdPerMillionOrNull(pricing.internalReasoning),
    },
    supportedParameters: stringArray(model?.supported_parameters),
    topProvider: normalizeTopProvider(model?.top_provider),
  };
}

function normalizePricing(pricing) {
  return {
    prompt: priceStringOrNull(pricing?.[PRICING_KEYS.prompt]),
    completion: priceStringOrNull(pricing?.[PRICING_KEYS.completion]),
    request: priceStringOrNull(pricing?.[PRICING_KEYS.request]),
    image: priceStringOrNull(pricing?.[PRICING_KEYS.image]),
    webSearch: priceStringOrNull(pricing?.[PRICING_KEYS.webSearch]),
    internalReasoning: priceStringOrNull(
      pricing?.[PRICING_KEYS.internalReasoning],
    ),
    inputCacheRead: priceStringOrNull(pricing?.[PRICING_KEYS.inputCacheRead]),
    inputCacheWrite: priceStringOrNull(pricing?.[PRICING_KEYS.inputCacheWrite]),
  };
}

function normalizeTopProvider(topProvider) {
  if (!topProvider || typeof topProvider !== "object") {
    return null;
  }

  return {
    contextLength: finiteNumberOrNull(topProvider.context_length),
    maxCompletionTokens: finiteNumberOrNull(topProvider.max_completion_tokens),
    isModerated:
      typeof topProvider.is_moderated === "boolean"
        ? topProvider.is_moderated
        : null,
  };
}

function priceStringOrNull(value) {
  const valueString = stringOrNull(value);
  if (!valueString) {
    return null;
  }

  const parsed = Number(valueString);
  return Number.isFinite(parsed) && parsed >= 0 ? valueString : null;
}

function usdPerMillionOrNull(value) {
  if (value === null) {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return Number((parsed * 1_000_000).toFixed(12));
}

function stringOrNull(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function finiteNumberOrNull(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (item) => typeof item === "string" && item.trim().length > 0,
  );
}
