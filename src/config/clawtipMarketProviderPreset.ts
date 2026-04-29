import type { ProviderPreset } from "./claudeProviderPresets";

export const clawtipMarketProviderPreset: ProviderPreset = {
  name: "ClawTip Market",
  nameKey: "providerForm.presets.clawtipMarket",
  websiteUrl: "https://github.com/zhouchangui/tokens-buddy",
  settingsConfig: {
    env: {
      ANTHROPIC_BASE_URL: "http://127.0.0.1:17860/clawtip-market/anthropic",
      ANTHROPIC_AUTH_TOKEN: "clawtip-market",
    },
  },
  category: "third_party",
  providerType: "clawtip_market",
  endpointCandidates: ["http://127.0.0.1:17860/clawtip-market/anthropic"],
  theme: {
    icon: "generic",
    backgroundColor: "#0F766E",
    textColor: "#FFFFFF",
  },
  icon: "mcp",
  iconColor: "#0F766E",
};
