import React, {createContext, useContext, useMemo, useState, useCallback} from 'react';

type DocSessionOrigin = 'intent' | 'wizard' | 'manual';
type DocSessionReason = 'submitted' | 'cancelled' | 'cleared' | 'timeout' | 'unknown';

type DocSessionState = {
  isActive: boolean;
  docType?: string | null;
  origin?: DocSessionOrigin;
  startedAt?: number | null;
};

type DocSessionApi = {
  state: DocSessionState;
  start: (opts?: { docType?: string | null; origin?: DocSessionOrigin }) => void;
  end: (reason?: DocSessionReason) => void;
  reset: () => void;
};

const DocSessionCtx = createContext<DocSessionApi | null>(null);

export const DocSessionProvider: React.FC<{ children: React.ReactNode }> = ({children}) => {
  const [state, setState] = useState<DocSessionState>({
    isActive: false,
    docType: null,
    origin: undefined,
    startedAt: null,
  });

  const start = useCallback(({docType = null, origin = 'manual'} = {}) => {
    setState({ isActive: true, docType, origin, startedAt: Date.now() });
  }, []);

  const end = useCallback((_reason: DocSessionReason = 'unknown') => {
    setState({ isActive: false, docType: null, origin: undefined, startedAt: null });
  }, []);

  const reset = useCallback(() => {
    setState({ isActive: false, docType: null, origin: undefined, startedAt: null });
  }, []);

  const api = useMemo<DocSessionApi>(() => ({ state, start, end, reset }), [state, start, end, reset]);
  return <DocSessionCtx.Provider value={api}>{children}</DocSessionCtx.Provider>;
};

export function useDocSession(): DocSessionApi {
  const ctx = useContext(DocSessionCtx);
  if (!ctx) throw new Error('useDocSession must be used inside <DocSessionProvider/>');
  return ctx;
}
