import { describe, expect, it } from "vitest";
import { providerPresets } from "../claudeProviderPresets";

describe("ClawTip Market Claude preset", () => {
  it("is available as a preset provider with market provider metadata", () => {
    const preset = providerPresets.find(
      (item) => item.providerType === "clawtip_market",
    );

    expect(preset).toBeDefined();
    expect(preset?.name).toBe("ClawTip Market");
    expect(preset?.category).toBe("third_party");
    expect(preset?.settingsConfig).toMatchObject({
      env: {
        ANTHROPIC_BASE_URL: "http://127.0.0.1:17860/clawtip-market/anthropic",
        ANTHROPIC_AUTH_TOKEN: "clawtip-market",
      },
    });
  });
});
