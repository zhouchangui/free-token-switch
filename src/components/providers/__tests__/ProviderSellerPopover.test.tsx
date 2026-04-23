import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ProviderSellerPopover } from "@/components/providers/ProviderSellerPopover";

describe("ProviderSellerPopover", () => {
  it("disables price input when free mode is enabled", async () => {
    const user = userEvent.setup();

    render(
      <ProviderSellerPopover
        providerId="provider-1"
        providerName="Demo"
        sellerConfig={{ enabled: false, mode: "free", status: "idle" }}
        onSave={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /seller/i }));
    expect(screen.getByLabelText(/price/i)).toBeDisabled();
  });

  it("shows copy actions after a free seller becomes active", async () => {
    const user = userEvent.setup();

    render(
      <ProviderSellerPopover
        providerId="provider-1"
        providerName="Demo"
        sellerConfig={{
          enabled: true,
          mode: "free",
          status: "active_free",
          endpoint: "https://demo.trycloudflare.com",
          accessToken: "ccs_sell_demo",
        }}
        onSave={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /seller/i }));
    expect(
      screen.getByRole("button", { name: /copy endpoint/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /copy token/i }),
    ).toBeInTheDocument();
  });
});
