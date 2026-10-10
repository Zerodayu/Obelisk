"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface AutoGenerate {
	/**
	 * True while a run is scheduled or in flight — and before the first run for
	 * the current keys, so the caller never flashes its failed/retry state in
	 * the frame between the context change and the effect.
	 */
	busy: boolean;
	/** Runs the handler now, bypassing the debounce (manual Retry/Re-generate). */
	retry: () => void;
}

/**
 * Pre-generates a form: runs `run` on mount and whenever `keys` (the academic
 * context values the form needs) change, so the user never clicks Generate —
 * switching program/term/section revalidates instead.
 *
 * NOTE: deps are the joined keys only — `run` is read through a ref, so its
 * per-render closure neither retriggers nor blocks a regeneration. The 300ms
 * debounce guards the backend's non-transactional find-then-create draft
 * against rapid context flips.
 */
export function useAutoGenerate(
	keys: readonly string[],
	run: () => void | Promise<void>,
): AutoGenerate {
	const runRef = useRef(run);
	runRef.current = run;

	const key = keys.join(" ");
	// NOTE: guarded render-phase reset (the React "adjust state when props
	// change" pattern) — a new context must read as busy immediately.
	const [state, setState] = useState({ key, done: false });
	if (state.key !== key) setState({ key, done: false });

	const start = useCallback(() => {
		setState({ key, done: false });
		void Promise.resolve()
			.then(runRef.current)
			.catch(() => {
				// NOTE: handlers toast their own failures; swallow the rejection so
				// an unattended auto-run doesn't surface as an unhandled error.
			})
			.finally(() =>
				// Guard: a context change mid-run owns the state now.
				setState((s) => (s.key === key ? { key, done: true } : s)),
			);
	}, [key]);

	useEffect(() => {
		if (key.split(" ").some((value) => !value.trim())) return;
		const timer = setTimeout(start, 300);
		return () => clearTimeout(timer);
	}, [key, start]);

	return { busy: !state.done, retry: start };
}
