'use client';

import { useEffect, useState } from 'react';
import type { WebSocketTickUpdate } from '@/lib/types';

interface MarketStreamState {
  connected: boolean;
  lastUpdate: WebSocketTickUpdate | null;
  error: string | null;
}

export function useMarketStream() {
  const [state, setState] = useState<MarketStreamState>({
    connected: false,
    lastUpdate: null,
    error: null,
  });

  useEffect(() => {
    setState((current) => ({
      ...current,
      connected: false,
    }));
  }, []);

  return state;
}
