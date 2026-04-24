import { describe, expect, it } from "vitest";
import { resolveSharedProviderModelSelection } from "@/components/DeepLinkImportDialog";

describe("resolveSharedProviderModelSelection", () => {
  const models = [
    { id: "gpt-5.4", ownedBy: "local-config" },
    { id: "gpt-5.4-mini", ownedBy: "local-config" },
  ];

  it("uses the requested model when it exists in the fetched list", () => {
    expect(resolveSharedProviderModelSelection(models, "gpt-5.4-mini")).toBe(
      "gpt-5.4-mini",
    );
  });

  it("falls back to the first fetched model when no requested model is available", () => {
    expect(resolveSharedProviderModelSelection(models, undefined)).toBe(
      "gpt-5.4",
    );
    expect(resolveSharedProviderModelSelection(models, "missing-model")).toBe(
      "gpt-5.4",
    );
  });

  it("returns an empty selection when no models were fetched", () => {
    expect(resolveSharedProviderModelSelection([], "gpt-5.4")).toBe("");
  });
});
