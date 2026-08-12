/**
 * Session atoms — the canonical client-side mirror of the authenticated user.
 *
 * Seeded from the session already resolved server-side in `app/(app)/layout.tsx`
 * via the `SessionInitializer` (which stays in sync on navigation). Mutations
 * (sign-in/out, role approval) go through Server Actions and land here on the
 * next navigation; nothing fetches `/auth/me` again on the client.
 */

import { atom } from "jotai";

import type { ApiSession, ApiUser } from "@/lib/api-client";

export const userAtom = atom<ApiUser | null>(null);

export const sessionAtom = atom<ApiSession | null>(null);
