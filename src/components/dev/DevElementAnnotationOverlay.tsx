import { useEffect, useRef, useState } from "react";
import { Check, ClipboardCopy, Highlighter, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ElementAnnotation {
  id: number;
  page: string;
  selector: string;
  role: string;
  ariaLabel: string;
  title: string;
  text: string;
  className: string;
  note: string;
}

type ElementMeta = Omit<ElementAnnotation, "id" | "note">;

const HOVER_ATTR = "data-tb-annotator-hovered";
const SELECTED_ATTR = "data-tb-annotator-selected";
const OVERLAY_ATTR = "data-dev-annotation-overlay";

export function DevElementAnnotationOverlay() {
  const [isActive, setIsActive] = useState(false);
  const [selectedMeta, setSelectedMeta] = useState<ElementMeta | null>(null);
  const [draftNote, setDraftNote] = useState("");
  const [annotations, setAnnotations] = useState<ElementAnnotation[]>([]);
  const [status, setStatus] = useState("");
  const hoveredElementRef = useRef<HTMLElement | null>(null);
  const selectedElementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isToggleKey =
        event.key.toLowerCase() === "m" &&
        event.shiftKey &&
        (event.metaKey || event.ctrlKey);

      if (!isToggleKey) {
        return;
      }

      event.preventDefault();
      setIsActive((current) => !current);
      setStatus("");
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  useEffect(() => {
    if (!isActive) {
      clearElementMarker(hoveredElementRef.current, HOVER_ATTR);
      clearElementMarker(selectedElementRef.current, SELECTED_ATTR);
      hoveredElementRef.current = null;
      selectedElementRef.current = null;
      setSelectedMeta(null);
      setDraftNote("");
      return;
    }

    const handleMouseMove = (event: MouseEvent) => {
      const element = getAnnotatableElement(event.target);
      if (!element || element === hoveredElementRef.current) {
        return;
      }

      clearElementMarker(hoveredElementRef.current, HOVER_ATTR);
      hoveredElementRef.current = element;
      element.setAttribute(HOVER_ATTR, "true");
    };

    const handleClick = (event: MouseEvent) => {
      const element = getAnnotatableElement(event.target);
      if (!element) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      clearElementMarker(selectedElementRef.current, SELECTED_ATTR);
      selectedElementRef.current = element;
      element.setAttribute(SELECTED_ATTR, "true");
      setSelectedMeta(readElementMeta(element));
      setDraftNote("");
      setStatus("");
    };

    document.addEventListener("mousemove", handleMouseMove, true);
    document.addEventListener("click", handleClick, true);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove, true);
      document.removeEventListener("click", handleClick, true);
      clearElementMarker(hoveredElementRef.current, HOVER_ATTR);
      hoveredElementRef.current = null;
    };
  }, [isActive]);

  const saveAnnotation = () => {
    if (!selectedMeta || !draftNote.trim()) {
      return;
    }

    setAnnotations((current) => [
      ...current,
      {
        ...selectedMeta,
        id: current.length + 1,
        note: draftNote.trim(),
      },
    ]);
    clearElementMarker(selectedElementRef.current, SELECTED_ATTR);
    selectedElementRef.current = null;
    setSelectedMeta(null);
    setDraftNote("");
    setStatus("标注已保存");
  };

  const clearAnnotations = () => {
    clearElementMarker(selectedElementRef.current, SELECTED_ATTR);
    selectedElementRef.current = null;
    setAnnotations([]);
    setSelectedMeta(null);
    setDraftNote("");
    setStatus("标注已清空");
  };

  const copyPrompt = async () => {
    if (annotations.length === 0) {
      setStatus("还没有标注");
      return;
    }

    await writeClipboardText(buildAnnotationPrompt(annotations));
    setStatus("提示词已复制到剪贴板");
  };

  if (!isActive) {
    return null;
  }

  return (
    <>
      <style>
        {`
          [${HOVER_ATTR}="true"] {
            outline: 2px solid rgb(37 99 235) !important;
            outline-offset: 2px !important;
            cursor: crosshair !important;
          }
          [${SELECTED_ATTR}="true"] {
            outline: 3px solid rgb(16 185 129) !important;
            outline-offset: 3px !important;
          }
        `}
      </style>
      <div
        {...{ [OVERLAY_ATTR]: "" }}
        className="fixed bottom-4 right-4 z-[9999] w-96 max-w-[calc(100vw-2rem)] rounded-lg border border-slate-200 bg-white p-3 text-slate-950 shadow-xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Highlighter className="h-4 w-4 text-blue-600" />
              元素标注模式
            </div>
            <p className="mt-1 text-xs text-slate-500">
              点击界面元素并记录问题，完成后复制给 Codex。
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setIsActive(false)}
            aria-label="关闭标注模式"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {selectedMeta ? (
          <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 p-3">
            <div className="truncate text-xs font-medium text-emerald-950">
              {selectedMeta.selector}
            </div>
            {selectedMeta.text ? (
              <div className="mt-1 truncate text-xs text-emerald-700">
                {selectedMeta.text}
              </div>
            ) : null}
            <label
              htmlFor="dev-element-annotation-note"
              className="mt-3 block text-xs font-medium text-slate-700"
            >
              标注问题
            </label>
            <textarea
              id="dev-element-annotation-note"
              className="mt-1 min-h-20 w-full resize-none rounded-md border border-slate-300 bg-white px-2 py-1 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              value={draftNote}
              onChange={(event) => setDraftNote(event.target.value)}
              placeholder="写下这个元素需要怎么改"
              autoFocus
            />
            <Button
              type="button"
              size="sm"
              className="mt-2 bg-emerald-600 text-white hover:bg-emerald-700"
              disabled={!draftNote.trim()}
              onClick={saveAnnotation}
            >
              <Check className="h-4 w-4" />
              保存标注
            </Button>
          </div>
        ) : null}

        <div className="mt-3 max-h-40 space-y-2 overflow-y-auto">
          {annotations.map((annotation) => (
            <div
              key={annotation.id}
              className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs"
            >
              <div className="font-medium text-slate-900">
                {annotation.id}. {annotation.selector}
              </div>
              <div className="mt-0.5 text-slate-600">{annotation.note}</div>
            </div>
          ))}
        </div>

        <div className="mt-3 flex items-center justify-between gap-2">
          <div className="min-h-4 text-xs text-slate-500">{status}</div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={annotations.length === 0}
              onClick={clearAnnotations}
            >
              <Trash2 className="h-4 w-4" />
              清空
            </Button>
            <Button
              type="button"
              size="sm"
              className="bg-blue-600 text-white hover:bg-blue-700"
              disabled={annotations.length === 0}
              onClick={() => void copyPrompt()}
            >
              <ClipboardCopy className="h-4 w-4" />
              完成并复制
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}

function getAnnotatableElement(target: EventTarget | null) {
  if (!(target instanceof Element)) {
    return null;
  }

  if (target.closest(`[${OVERLAY_ATTR}]`)) {
    return null;
  }

  return (
    target.closest<HTMLElement>(
      [
        "[data-testid]",
        "button",
        "a[href]",
        "input",
        "textarea",
        "select",
        "[role]",
        "[aria-label]",
        "[title]",
      ].join(","),
    ) ?? (target instanceof HTMLElement ? target : null)
  );
}

function readElementMeta(element: HTMLElement): ElementMeta {
  return {
    page: getCurrentPage(),
    selector: getElementSelector(element),
    role: getElementRole(element),
    ariaLabel: element.getAttribute("aria-label") ?? "",
    title: element.getAttribute("title") ?? "",
    text: normalizeText(element.textContent ?? "").slice(0, 160),
    className: getElementClassName(element).slice(0, 220),
  };
}

function getCurrentPage() {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function getElementSelector(element: HTMLElement) {
  const testId = element.getAttribute("data-testid");
  if (testId) {
    return `[data-testid="${escapeAttributeValue(testId)}"]`;
  }

  if (element.id) {
    return `#${escapeCssIdentifier(element.id)}`;
  }

  const ariaLabel = element.getAttribute("aria-label");
  if (ariaLabel) {
    return `${element.tagName.toLowerCase()}[aria-label="${escapeAttributeValue(
      ariaLabel,
    )}"]`;
  }

  const role = element.getAttribute("role");
  if (role) {
    return `${element.tagName.toLowerCase()}[role="${escapeAttributeValue(
      role,
    )}"]`;
  }

  const title = element.getAttribute("title");
  if (title) {
    return `${element.tagName.toLowerCase()}[title="${escapeAttributeValue(
      title,
    )}"]`;
  }

  const className = getElementClassName(element)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((name) => `.${escapeCssIdentifier(name)}`)
    .join("");

  return `${element.tagName.toLowerCase()}${className}`;
}

function getElementRole(element: HTMLElement) {
  const explicitRole = element.getAttribute("role");
  if (explicitRole) {
    return explicitRole;
  }

  const tagName = element.tagName.toLowerCase();
  if (tagName === "button") {
    return "button";
  }
  if (tagName === "a" && element.hasAttribute("href")) {
    return "link";
  }
  if (tagName === "input" || tagName === "textarea") {
    return "textbox";
  }
  return "";
}

function getElementClassName(element: HTMLElement) {
  return typeof element.className === "string" ? element.className : "";
}

function normalizeText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function escapeAttributeValue(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function escapeCssIdentifier(value: string) {
  if (globalThis.CSS?.escape) {
    return globalThis.CSS.escape(value);
  }
  return value.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

function clearElementMarker(
  element: HTMLElement | null,
  attributeName: typeof HOVER_ATTR | typeof SELECTED_ATTR,
) {
  element?.removeAttribute(attributeName);
}

function buildAnnotationPrompt(annotations: ElementAnnotation[]) {
  const items = annotations
    .map((annotation) => {
      const lines = [
        `${annotation.id}. 页面：${annotation.page || "/"}`,
        `元素：${annotation.selector}`,
      ];

      if (annotation.role) {
        lines.push(`角色：${annotation.role}`);
      }
      if (annotation.ariaLabel) {
        lines.push(`aria-label：${annotation.ariaLabel}`);
      }
      if (annotation.title) {
        lines.push(`title：${annotation.title}`);
      }
      if (annotation.text) {
        lines.push(`文本：${annotation.text}`);
      }
      if (annotation.className) {
        lines.push(`class：${annotation.className}`);
      }

      lines.push(`问题：${annotation.note}`);
      return lines.join("\n");
    })
    .join("\n\n");

  return `请根据以下 Tauri 界面元素标注修复问题。优先根据 selector、role、文本和 class 定位相关 React 组件。\n\n${items}`;
}

async function writeClipboardText(text: string) {
  const clipboard = globalThis.navigator?.clipboard;
  if (clipboard?.writeText) {
    await clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}
