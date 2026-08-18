import { io, Socket } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';
const SOCKET_ACK_TIMEOUT_MS = 10000;

/**
 * SocketService — reliable event delivery layer.
 *
 * Delivery guarantee protocol:
 *   1. Server persists every event to Redis before emitting.
 *   2. Server uses socket.io's timeout().emit() — expects an ACK callback.
 *   3. Client sends the ACK immediately on receipt.
 *   4. On reconnect, client calls `sync_missed_events` to replay missed events.
 *   5. Client-side dedup via processedEvents Set prevents double-processing.
 */
class SocketService {
  private socket: Socket | null = null;
  private lastEventTime: string = new Date().toISOString();
  private pendingListeners: Array<{ event: string; callback: (data: any) => void }> = [];

  // Dedup cache — prevents double-processing of replayed events
  private processedEvents: Set<string> = new Set();
  private readonly MAX_DEDUP_CACHE = 200;

  // Wrapper registry — maps original callbacks to their wrapped versions
  private wrapperRegistry: Map<(data: unknown) => void, (...args: unknown[]) => void> = new Map();

  connect(_userId: number, token: string) {
    if (this.socket?.connected) {
      return;
    }

    this.socket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
    });

    this.socket.on('connect', () => {
      // eslint-disable-next-line no-console
      console.warn('[Socket] Connected:', this.socket?.id);
      // Apply any listeners that were registered before connect
      for (const { event, callback } of this.pendingListeners) {
        this._registerListener(event, callback);
      }
      this.pendingListeners = [];
      this.socket?.emit('sync_missed_events', { lastEventTime: this.lastEventTime });
    });

    this.socket.on('disconnect', () => {
      // eslint-disable-next-line no-console
      console.warn('[Socket] Disconnected — will replay missed events on reconnect');
    });

    this.socket.on('connect_error', (error) => {
      console.error('[Socket] Connection error:', error);
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.wrapperRegistry.clear();
    }
  }

  private emitWithAck<T = any>(event: string, data?: any): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Socket not connected'));
        return;
      }

      const timer = window.setTimeout(() => {
        reject(new Error(`Socket ACK timeout for ${event}`));
      }, SOCKET_ACK_TIMEOUT_MS);

      this.socket.emit(event, data, (ack: T) => {
        window.clearTimeout(timer);
        resolve(ack);
      });
    });
  }

  /**
   * Register an event listener with automatic ACK + dedup.
   * If socket not yet connected, queues the listener for when connect fires.
   */
  on(event: string, callback: (data: any) => void) {
    if (!this.socket) {
      // Queue for when connect() is called
      this.pendingListeners.push({ event, callback });
      return;
    }
    this._registerListener(event, callback);
  }

  private _registerListener(event: string, callback: (data: any) => void) {
    if (!this.socket) return;

    // If already registered, remove old wrapper first to avoid duplicates
    if (this.wrapperRegistry.has(callback)) {
      this.socket.off(event, this.wrapperRegistry.get(callback) as any);
      this.wrapperRegistry.delete(callback);
    }

    const wrapper = (...args: any[]) => {
      const lastArg = args[args.length - 1];
      const hasAck = typeof lastArg === 'function';
      const payload = args[0];
      const ackFn = hasAck ? lastArg : null;

      // Send ACK immediately — confirms delivery to server
      if (ackFn) ackFn();

      if (payload && payload.eventId) {
        if (this.processedEvents.has(payload.eventId)) return;
        this.processedEvents.add(payload.eventId);
        if (this.processedEvents.size > this.MAX_DEDUP_CACHE) {
          const first = this.processedEvents.values().next().value;
          if (first) this.processedEvents.delete(first);
        }
        this.lastEventTime = payload.timestamp || new Date().toISOString();
        callback(payload.data ?? payload);
      } else {
        callback(payload);
      }
    };

    this.wrapperRegistry.set(callback, wrapper);
    this.socket.on(event, wrapper);
  }

  /**
   * Remove an event listener. Correctly removes the wrapper registered by on().
   */
  off(event: string, callback?: (data: any) => void) {
    if (!this.socket) return;
    if (callback) {
      const wrapper = this.wrapperRegistry.get(callback);
      if (wrapper) {
        this.socket.off(event, wrapper as any);
        this.wrapperRegistry.delete(callback);
      } else {
        this.socket.off(event, callback as any);
      }
    } else {
      this.socket.off(event);
    }
  }

  joinChatRoom(roomId: number): Promise<void> {
    // Use ACK-based join — confirms server joined the room before trusting real-time events.
    // Falls back gracefully if socket not connected.
    if (!this.socket?.connected) return Promise.resolve();
    return new Promise((resolve) => {
      const timer = window.setTimeout(resolve, 5000); // timeout = resolve anyway
      this.socket!.emit('chat:join', { roomId }, () => {
        window.clearTimeout(timer);
        resolve();
      });
    });
  }

  leaveChatRoom(roomId: number): Promise<void> {
    this.socket?.emit('chat:leave', { roomId });
    return Promise.resolve();
  }

  onNewMessage(callback: (data: any) => void) {
    this.on('chat:new', callback);
  }

  onTyping(callback: (data: any) => void) {
    this.on('chat:typing', callback);
  }

  onMessageRead(callback: (data: any) => void) {
    this.on('message_read', callback);
  }

  onNewNotification(callback: (data: any) => void) {
    this.on('new_notification', callback);
  }

  onChatActivity(callback: (data: any) => void) {
    this.on('chat:activity', callback);
  }

  sendMessage(data: { roomId: number; senderId?: number; message: string; tempId?: string }) {
    return this.emitWithAck<{ success: boolean; data?: any; message?: string }>('chat:send', data);
  }

  markAsRead(data: { messageId: number; userId: number }) {
    this.socket?.emit('mark_read', data);
  }

  emitTyping(data: { roomId: number; userId: number; isTyping: boolean }) {
    this.socket?.emit('chat:typing', data);
  }

  emit(event: string, data: any) {
    this.socket?.emit(event, data);
  }

  getSocket(): Socket | null {
    return this.socket;
  }

  isConnected(): boolean {
    return this.socket?.connected || false;
  }
}

export const socketService = new SocketService();
