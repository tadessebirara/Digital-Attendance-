import React, { createContext, useContext, useCallback, useRef, useEffect } from 'react';
import { socketService } from '../services/socket.service';

// Events that can trigger a refresh
export type RefreshEvent = 'users' | 'attendance' | 'leaves' | 'devices';

type Listener = () => void;

interface DataRefreshContextType {
  notify: (event: RefreshEvent) => void;
  subscribe: (event: RefreshEvent, fn: Listener) => () => void;
}

const DataRefreshContext = createContext<DataRefreshContextType | undefined>(undefined);

// Debounce window per event type (ms).
// Multiple socket events of the same type within this window collapse into
// a single refresh call — prevents cascading refetches during reconnect
// storms or replay bursts where the same logical state change arrives
// multiple times in quick succession.
const DEBOUNCE_MS = 300;

export const DataRefreshProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const listenersRef = useRef<Map<RefreshEvent, Set<Listener>>>(new Map());
  // Per-event debounce timers
  const debounceTimers = useRef<Map<RefreshEvent, ReturnType<typeof setTimeout>>>(new Map());

  const notify = useCallback((event: RefreshEvent) => {
    // Cancel any pending timer for this event — collapse rapid-fire events
    const existing = debounceTimers.current.get(event);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      debounceTimers.current.delete(event);
      listenersRef.current.get(event)?.forEach((fn) => fn());
    }, DEBOUNCE_MS);

    debounceTimers.current.set(event, timer);
  }, []);

  useEffect(() => {
    // ── Real-time Socket Refresh Links ───────────────────────────────────────
    const handleAttendance = () => notify('attendance');
    const handleLeave = () => notify('leaves');
    const handleUser = () => notify('users');

    socketService.on('attendance:update', handleAttendance);
    socketService.on('leave:request', handleLeave);
    socketService.on('leave:update', handleLeave);
    socketService.on('user_update', handleUser);

    return () => {
      socketService.off('attendance:update', handleAttendance);
      socketService.off('leave:request', handleLeave);
      socketService.off('leave:update', handleLeave);
      socketService.off('user_update', handleUser);
      // Clear all pending timers on unmount
      debounceTimers.current.forEach((t) => clearTimeout(t));
      debounceTimers.current.clear();
    };
  }, [notify]);

  const subscribe = useCallback((event: RefreshEvent, fn: Listener) => {
    if (!listenersRef.current.has(event)) {
      listenersRef.current.set(event, new Set());
    }
    listenersRef.current.get(event)!.add(fn);
    return () => {
      listenersRef.current.get(event)?.delete(fn);
    };
  }, []);

  return (
    <DataRefreshContext.Provider value={{ notify, subscribe }}>
      {children}
    </DataRefreshContext.Provider>
  );
};

export const useDataRefresh = () => {
  const ctx = useContext(DataRefreshContext);
  if (!ctx) throw new Error('useDataRefresh must be used within DataRefreshProvider');
  return ctx;
};

export const useOnRefresh = (event: RefreshEvent, callback: Listener) => {
  const { subscribe } = useDataRefresh();
  useEffect(() => {
    return subscribe(event, callback);
  }, [subscribe, event, callback]);
};
