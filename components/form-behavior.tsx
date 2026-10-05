"use client";

import { useEffect } from "react";

const FIELD_SELECTOR =
  'input:not([type="hidden"]):not([type="button"]):not([type="submit"]):not([type="checkbox"]):not([type="radio"]):not([disabled]):not([readonly]):not([tabindex="-1"]), select:not([disabled]), textarea:not([disabled])';

function isVisible(el: HTMLElement) {
  return el.offsetParent !== null || el.getClientRects().length > 0;
}

/**
 * App-wide keyboard behaviour:
 *  - a <select> opens by itself when it gets keyboard focus (ComboBox already opens on focus)
 *  - Enter moves to the next field instead of submitting. Opt out with data-enter-submit.
 */
export function FormBehavior() {
  useEffect(() => {
    let lastInput: "keyboard" | "pointer" = "pointer";

    const onKeyDownCapture = () => {
      lastInput = "keyboard";
    };
    const onPointerDown = () => {
      lastInput = "pointer";
    };

    function onFocusIn(e: FocusEvent) {
      const el = e.target;
      if (lastInput === "keyboard" && el instanceof HTMLSelectElement) {
        try {
          el.showPicker?.();
        } catch {
          /* the browser refused (no user activation); the select still works normally */
        }
      }
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Enter" || e.shiftKey || e.ctrlKey || e.altKey || e.metaKey || e.defaultPrevented) return;
      const el = e.target;
      if (!(el instanceof HTMLElement)) return;
      if (el instanceof HTMLTextAreaElement || el instanceof HTMLButtonElement || el instanceof HTMLAnchorElement) return;
      if (!(el instanceof HTMLInputElement || el instanceof HTMLSelectElement)) return;
      if (el instanceof HTMLInputElement && ["button", "submit", "reset"].includes(el.type)) return;
      if (el.hasAttribute("data-enter-submit")) return;

      const scope: ParentNode =
        el.closest('[role="dialog"], [role="alertdialog"]') ?? el.closest("form") ?? el.closest("main") ?? document;
      const fields = Array.from(scope.querySelectorAll<HTMLElement>(FIELD_SELECTOR)).filter(isVisible);
      const idx = fields.indexOf(el);
      if (idx === -1 || idx === fields.length - 1) return;

      e.preventDefault();
      const next = fields[idx + 1];
      next.focus();
      if (next instanceof HTMLInputElement && ["text", "number", "search", "date", "month"].includes(next.type)) {
        try {
          next.select();
        } catch {
          /* some input types don't support select() */
        }
      }
    }

    document.addEventListener("keydown", onKeyDownCapture, true);
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDownCapture, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return null;
}
