import { useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { getAccessToken } from '../api/client';
import { socketService } from '../services/socket.service';

export const useSocket = () => {
  const { user } = useAuth();

  const connect = useCallback(() => {
    const token = getAccessToken();
    if (!token || !user?.id) return;
    socketService.connect(user.id, token);
  }, [user?.id]);

  const disconnect = useCallback(() => {
    socketService.disconnect();
  }, []);

  const emit = useCallback((event: string, data: unknown) => {
    socketService.emit(event, data);
  }, []);

  const on = useCallback((event: string, callback: (data: unknown) => void) => {
    socketService.on(event, callback);
  }, []);

  const off = useCallback((event: string, callback?: (data: unknown) => void) => {
    socketService.off(event, callback);
  }, []);

  // NOTE: Do NOT disconnect on unmount — socketService is a singleton managed
  // by AuthContext (connect on login, disconnect on logout).
  // Disconnecting here would kill the socket whenever any component unmounts.

  return {
    connect,
    disconnect,
    emit,
    on,
    off,
    socket: socketService.getSocket(),
  };
};
