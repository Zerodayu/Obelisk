/**
 * Async-data atom helpers built on core Jotai primitives.
 *
 * The default data-fetching pattern for DB-backed client state: an atom graph
 * that starts from an `initial` seed (mock/sample data or an empty list),
 * auto-fetches on first subscription, and can be re-run on demand via a
 * write-only refresh action. Consumers read `dataAtom` (a plain sync value —
 * no Suspense) and, when useful, branch on `stateAtom` for loading/error UI.
 *
 * The pending/fallback behavior uses `unwrap` from `jotai/utils` (the
 * deprecated `loadable` helper is intentionally not used). See
 * `.agents/skills/jotai/references/async-and-side-effects.md`.
 */

import { type Atom, atom, type Getter, type WritableAtom } from "jotai";
import { unwrap } from "jotai/utils";

export type AsyncState<T> =
  | { status: "loading"; data: T }
  | { status: "ready"; data: T }
  | { status: "error"; data: T; error: unknown };

export interface AsyncDataAtoms<T> {
  /**
   * Current data. Falls back to `initial` while the first fetch is pending
   * and on error; keeps the last good value during a refresh.
   */
  dataAtom: Atom<T>;
  /** Full async state — `status` ("loading" | "ready" | "error") plus data/error. */
  stateAtom: Atom<AsyncState<T>>;
  /** Write-only action atom. `useSetAtom` re-runs the fetcher. */
  refreshAtom: WritableAtom<null, [], void>;
}

/**
 * Create an auto-fetching, refreshable data atom.
 *
 * - Reads are synchronous (no Suspense): `dataAtom` resolves to `initial`
 *   until the first successful fetch, then holds the fetched value.
 * - The fetch fires on first subscription (when a component reads the atom)
 *   and on every `refresh` — data fetching never happens during SSR, so the
 *   browser-only `api` client (cookie auth) is never invoked server-side.
 * - The fetcher receives `get`, so a fetch can react to filter atoms (e.g.
 *   status/class-section) — changing one invalidates and re-runs the fetch.
 */
export function atomWithAsyncData<T>(
  initial: T,
  fetcher: (get: Getter, signal?: AbortSignal) => Promise<T>,
): AsyncDataAtoms<T> {
  const refreshKeyAtom = atom(0);

  const fetchAtom = atom(async (get, { signal }) => {
    get(refreshKeyAtom);
    // Never fetch during SSR: the browser-only `api` client relies on cookies
    // the server render has no access to. Skipping keeps the atom in its
    // non-ready state so consumers render the `initial` fallback — matching
    // the first client paint and avoiding a hydration mismatch.
    if (typeof window === "undefined") throw new Error("skip fetch during SSR");
    return fetcher(get, signal);
  });

  const resultAtom = atom(async (get): Promise<AsyncState<T>> => {
    try {
      return { status: "ready", data: await get(fetchAtom) };
    } catch (error) {
      return { status: "error", data: initial, error };
    }
  });

  const stateAtom = unwrap(resultAtom, (previous): AsyncState<T> => {
    if (previous) return previous;
    return { status: "loading", data: initial };
  });

  const dataAtom = atom((get) => get(stateAtom).data);

  const refreshAtom = atom(null, (_get, set) => {
    set(refreshKeyAtom, (key) => key + 1);
  });

  return { dataAtom, stateAtom, refreshAtom };
}

export interface MockDataAtoms<T> {
  /** The mock/sample data — swap to `atomWithAsyncData` when an endpoint lands. */
  dataAtom: Atom<T>;
  /** No-op until the real endpoint exists; keeps the refresh contract uniform. */
  refreshAtom: WritableAtom<null, [], void>;
}

/**
 * Seed a module-scope atom with sample data. This is the temporary form for
 * datasets whose backend rollup endpoint does not exist yet (attainments,
 * plan, CQI, most governance charts). Swapping to real data is a one-line
 * change: replace `atomWithMockData(seed)` with `atomWithAsyncData(seed, fetch)`.
 */
export function atomWithMockData<T>(initial: T): MockDataAtoms<T> {
  const dataAtom = atom(initial);
  // TODO: wire to the real rollup endpoint once it lands (then use atomWithAsyncData).
  const refreshAtom = atom(null, () => {});
  return { dataAtom, refreshAtom };
}
