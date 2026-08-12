"use client";

import { useSetAtom } from "jotai";
import { useEffect } from "react";

import type { ApiUser } from "@/lib/api-client";
import { userAtom } from "@/lib/store/atoms/user";

/**
 * Seeds `userAtom` from the session already resolved in the server layout.
 * Re-syncs on every navigation (role changes, re-login), keeping the client
 * atom in step with the server-computed session.
 */
export function SessionInitializer({ user }: { user: ApiUser | null }) {
  const setUser = useSetAtom(userAtom);

  useEffect(() => {
    setUser(user);
  }, [user, setUser]);

  return null;
}
