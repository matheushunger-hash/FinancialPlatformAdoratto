"use client";

// Thin wrapper around next-themes' ThemeProvider.
// We need this because the root layout is a Server Component,
// but ThemeProvider uses React context (a client-only feature).
// This "bridge" component lets us use it in the Server Component tree.

import { ThemeProvider as NextThemesProvider } from "next-themes";

export function ThemeProvider({ children, ...props }: React.ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
