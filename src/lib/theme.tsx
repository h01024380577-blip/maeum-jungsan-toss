"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo } from "react";

export type ThemeMode = 'light';
type ResolvedTheme = 'light';

const STORAGE_KEY = "heartbook-theme";

interface ThemeContextValue {
  mode: ThemeMode;
  resolved: ResolvedTheme;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyLightTheme() {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.remove('dark');
  root.style.colorScheme = 'light';
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, 'light');
    applyLightTheme();
  }, []);

  const setMode = useCallback(() => {
    window.localStorage.setItem(STORAGE_KEY, 'light');
    applyLightTheme();
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ mode: 'light', resolved: 'light', setMode }),
    [setMode],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    return { mode: 'light', resolved: 'light', setMode: () => {} };
  }
  return ctx;
}
