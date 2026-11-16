import { useCallback, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/lib/AuthContext";
import { submitScore } from "@/lib/server-fns";

export function useGameSubmit(game) {
  const { isAuthenticated } = useAuth();
  const submit = useServerFn(submitScore);
  const [state, setState] = useState({ submitting: false, result: null, error: null });

  const finish = useCallback(
    async (score, durationMs) => {
      const value = Math.max(0, Math.round(score));
      if (!isAuthenticated) {
        setState({ submitting: false, result: { guest: true, earned: 0 }, error: null });
        return;
      }
      setState({ submitting: true, result: null, error: null });
      try {
        const result = await submit({
          data: {
            game,
            score: value,
            duration_ms: Math.max(1500, Math.round(durationMs)),
          },
        });
        setState({ submitting: false, result, error: null });
      } catch (error) {
        setState({ submitting: false, result: null, error: error?.message ?? "Nie udało się zapisać" });
      }
    },
    [game, isAuthenticated, submit]
  );

  const reset = useCallback(() => setState({ submitting: false, result: null, error: null }), []);

  return { ...state, finish, reset };
}
