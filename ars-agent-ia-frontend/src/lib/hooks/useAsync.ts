import { useState, useCallback, useEffect, useRef } from 'react';

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

export function useAsync<T>() {
  const [state, setState] = useState<AsyncState<T>>({
    data: null,
    loading: false,
    error: null,
  });
  const latest = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(async (promise: Promise<T>): Promise<T | null> => {
    const id = ++latest.current;
    setState((previous) => ({ ...previous, loading: true, error: null }));
    try {
      const data = await promise;
      if (id !== latest.current) return null;
      if (mounted.current) setState({ data, loading: false, error: null });
      return data;
    } catch (err) {
      if (id !== latest.current) return null;
      const message = err instanceof Error ? err.message : 'Une erreur est survenue';
      if (mounted.current) setState((previous) => ({ ...previous, loading: false, error: message }));
      return null;
    }
  }, []);

  const reset = useCallback(() => {
    latest.current += 1;
    setState({ data: null, loading: false, error: null });
  }, []);

  return { ...state, run, reset };
}