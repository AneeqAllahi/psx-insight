'use client';

import { useEffect, useRef, useState } from 'react';

interface UsePollingOptions<T> {
  enabled?: boolean;
  intervalMs?: number;
  initialData?: T;
}

export function usePolling<T>(
  fetcher: () => Promise<T>,
  { enabled = true, intervalMs = 30_000, initialData }: UsePollingOptions<T> = {},
) {
  const [data, setData] = useState<T | undefined>(initialData);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(enabled && initialData === undefined);
  const fetcherRef = useRef(fetcher);

  useEffect(() => {
    fetcherRef.current = fetcher;
  }, [fetcher]);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    async function refresh() {
      setIsLoading(true);

      try {
        const nextData = await fetcherRef.current();
        if (!cancelled) {
          setData(nextData);
          setError(null);
        }
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof Error ? caught : new Error('Polling request failed'));
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    refresh();
    const timer = window.setInterval(refresh, intervalMs);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [enabled, intervalMs]);

  return { data, error, isLoading };
}
