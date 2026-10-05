"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { ConfirmModal } from "@/components/confirm-modal";

type UnsavedChangesValue = {
  isDirty: boolean;
  message: string;
  setDirty: (dirty: boolean, message?: string) => void;
  /**
   * Resolves true right away when nothing is unsaved; otherwise shows the in-app
   * "Leave anyway?" popup and resolves with the user's choice.
   */
  confirmLeave: (isDirty: boolean, message?: string) => Promise<boolean>;
};

const UnsavedChangesContext = createContext<UnsavedChangesValue>({
  isDirty: false,
  message: "",
  setDirty: () => {},
  confirmLeave: async () => true,
});

const DEFAULT_MESSAGE = "You have unsaved changes that will be lost. Leave anyway?";

export function UnsavedChangesProvider({ children }: { children: React.ReactNode }) {
  const [isDirty, setIsDirty] = useState(false);
  const [message, setMessage] = useState("");
  const [prompt, setPrompt] = useState<string | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const setDirty = (dirty: boolean, msg?: string) => {
    setIsDirty(dirty);
    if (msg) setMessage(msg);
  };

  const confirmLeave = useCallback((dirty: boolean, msg?: string) => {
    if (!dirty) return Promise.resolve(true);
    return new Promise<boolean>((resolve) => {
      resolver.current?.(false); // never leave an earlier prompt hanging
      resolver.current = resolve;
      setPrompt(msg || DEFAULT_MESSAGE);
    });
  }, []);

  function answer(ok: boolean) {
    resolver.current?.(ok);
    resolver.current = null;
    setPrompt(null);
  }

  // Covers actual browser-level exits: closing the tab, refreshing, typing a new URL.
  // Browsers only allow their own generic prompt here; it cannot be restyled.
  useEffect(() => {
    function handler(e: BeforeUnloadEvent) {
      if (!isDirty) return;
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  return (
    <UnsavedChangesContext.Provider value={{ isDirty, message, setDirty, confirmLeave }}>
      {children}
      {prompt && (
        <ConfirmModal
          message={prompt}
          confirmLabel="Leave"
          cancelLabel="Stay"
          onConfirm={() => answer(true)}
          onCancel={() => answer(false)}
        />
      )}
    </UnsavedChangesContext.Provider>
  );
}

export function useUnsavedChanges() {
  return useContext(UnsavedChangesContext);
}
