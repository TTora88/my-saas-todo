"use client";

import { ThemeProvider } from "next-themes";
import { NEXT_THEMES_STORAGE_KEY } from "@/src/lib/user-settings";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      storageKey={NEXT_THEMES_STORAGE_KEY}
    >
      {children}
    </ThemeProvider>
  );
}
