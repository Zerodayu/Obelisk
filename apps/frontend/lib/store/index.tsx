"use client";

import { Provider } from "jotai";
import type { ReactNode } from "react";

/**
 * Mounts Jotai's Provider so every atom below the app shell shares one store.
 * Placed in the root layout (inside `ThemeProvider`). All atoms live under
 * `lib/store/atoms/*`; most use the default store, this only scopes the graph.
 */
export function StoreProvider({ children }: { children: ReactNode }) {
  return <Provider>{children}</Provider>;
}
