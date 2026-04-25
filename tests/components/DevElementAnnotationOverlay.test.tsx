import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DevElementAnnotationOverlay } from "@/components/dev/DevElementAnnotationOverlay";

let clipboardWriteTextMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  clipboardWriteTextMock = vi.fn().mockResolvedValue(undefined);
});

function installClipboardMock() {
  const clipboard = { writeText: clipboardWriteTextMock };
  Object.defineProperty(globalThis.navigator, "clipboard", {
    configurable: true,
    value: clipboard,
  });
  Object.defineProperty(window.navigator, "clipboard", {
    configurable: true,
    value: clipboard,
  });
}

function renderAnnotatablePage() {
  return render(
    <div>
      <button aria-label="好友分享开关" className="friend-switch">
        好友分享
      </button>
      <main>
        <button data-testid="copy-action" className="primary-action">
          复制好友导入链接
        </button>
      </main>
      <DevElementAnnotationOverlay />
    </div>,
  );
}

describe("DevElementAnnotationOverlay", () => {
  it("toggles element annotation mode with the dev shortcut", () => {
    renderAnnotatablePage();

    expect(screen.queryByText("元素标注模式")).not.toBeInTheDocument();

    fireEvent.keyDown(window, {
      key: "M",
      shiftKey: true,
      metaKey: true,
    });

    expect(screen.getByText("元素标注模式")).toBeInTheDocument();
    expect(
      screen.getByText("点击界面元素并记录问题，完成后复制给 Codex。"),
    ).toBeInTheDocument();
  });

  it("captures the selected element metadata and copies a repair prompt", async () => {
    const user = userEvent.setup();
    installClipboardMock();
    renderAnnotatablePage();

    fireEvent.keyDown(window, {
      key: "m",
      shiftKey: true,
      ctrlKey: true,
    });

    const target = screen.getByRole("button", { name: "好友分享开关" });
    await user.hover(target);
    expect(target).toHaveAttribute("data-tb-annotator-hovered", "true");

    await user.click(target);

    const noteInput = screen.getByLabelText("标注问题");
    await user.type(noteInput, "这个开关需要保持紧凑并靠左");
    await user.click(screen.getByRole("button", { name: "保存标注" }));
    await user.click(screen.getByRole("button", { name: "完成并复制" }));

    await waitFor(() => {
      expect(clipboardWriteTextMock).toHaveBeenCalled();
    });
    const copiedPrompt = clipboardWriteTextMock.mock.calls[0][0] as string;
    expect(copiedPrompt).toContain("请根据以下 Tauri 界面元素标注修复问题");
    expect(copiedPrompt).toContain('button[aria-label="好友分享开关"]');
    expect(copiedPrompt).toContain("文本：好友分享");
    expect(copiedPrompt).toContain("class：friend-switch");
    expect(copiedPrompt).toContain("问题：这个开关需要保持紧凑并靠左");
  });

  it("prefers stable test id selectors when available", async () => {
    const user = userEvent.setup();
    installClipboardMock();
    renderAnnotatablePage();

    fireEvent.keyDown(window, {
      key: "m",
      shiftKey: true,
      metaKey: true,
    });

    await user.click(screen.getByTestId("copy-action"));
    await user.type(screen.getByLabelText("标注问题"), "按钮颜色不够明显");
    await user.click(screen.getByRole("button", { name: "保存标注" }));
    await user.click(screen.getByRole("button", { name: "完成并复制" }));

    await waitFor(() => {
      expect(clipboardWriteTextMock).toHaveBeenCalled();
    });
    const copiedPrompt = clipboardWriteTextMock.mock.calls[0][0] as string;
    expect(copiedPrompt).toContain('[data-testid="copy-action"]');
    expect(copiedPrompt).toContain("文本：复制好友导入链接");
    expect(copiedPrompt).toContain("问题：按钮颜色不够明显");
  });
});
