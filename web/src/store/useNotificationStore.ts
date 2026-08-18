import { create } from 'zustand';
import { notificationService } from '../services/api.services';
import { socketService } from '../services/socket.service';
import apiClient from '../api/client';
import type { ApiResponse } from '../api/types';

interface Notification {
  id: number;
  isRead: boolean;
  [key: string]: any;
}

interface NotificationState {
  notifications: Notification[];
  unreadCount: number;
  chatUnreadCount: number;
  isLoading: boolean;
  fetchNotifications: () => Promise<void>;
  addNotification: (notification: Notification) => void;
  markAsRead: (id: number) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  initSocketListeners: () => void;
}

type ChatUnreadPayload = { unreadCount?: number };

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  chatUnreadCount: 0,
  isLoading: false,

  fetchNotifications: async () => {
    set({ isLoading: true });
    try {
      const [allRes, countRes, chatRes] = await Promise.all([
        notificationService.getAll({ limit: 50 }),
        notificationService.getUnreadCount(),
        apiClient
          .get<ChatUnreadPayload>('/chat/unread')
          .catch(() => ({ data: { success: false } as ApiResponse<ChatUnreadPayload> })),
      ]);
      const listBody = allRes.data;
      const countBody = countRes.data;
      const list = listBody.success && Array.isArray(listBody.data) ? listBody.data : [];
      const unread =
        countBody.success && countBody.data && typeof countBody.data === 'object' && 'unreadCount' in countBody.data
          ? (countBody.data as { unreadCount: number }).unreadCount
          : 0;
      const chatUnreadBody = chatRes.data as ApiResponse<ChatUnreadPayload>;
      const chatUnread =
        chatUnreadBody?.success && chatUnreadBody.data?.unreadCount != null
          ? chatUnreadBody.data.unreadCount
          : 0;
      set({ notifications: list, unreadCount: unread, chatUnreadCount: chatUnread });
    } catch (e) {
      console.error('Failed to fetch notifications', e);
    } finally {
      set({ isLoading: false });
    }
  },

  addNotification: (notification: Notification) => {
    set((state) => {
      if (state.notifications.some((n) => n.id === notification.id)) return state;
      return {
        notifications: [notification, ...state.notifications],
        unreadCount: state.unreadCount + 1,
      };
    });
  },

  markAsRead: async (id: number) => {
    try {
      await notificationService.markAsRead(id);
      set((state) => ({
        notifications: state.notifications.map((n) =>
          n.id === id ? { ...n, isRead: true } : n
        ),
        unreadCount: Math.max(0, state.unreadCount - 1),
      }));
    } catch (e) {
      console.error('Failed to mark notification as read', e);
    }
  },

  markAllAsRead: async () => {
    try {
      await notificationService.markAllAsRead();
      set((state) => ({
        notifications: state.notifications.map((n) => ({ ...n, isRead: true })),
        unreadCount: 0,
      }));
    } catch (e) {
      console.error('Failed to mark all as read', e);
    }
  },

  initSocketListeners: () => {
    // System notifications
    socketService.onNewNotification((notif: Notification) => {
      get().addNotification(notif);
    });

    // Chat messages → increment chat unread badge on the bell
    socketService.onNewMessage(() => {
      // Only count if we're not currently on the messages page
      const onMessagesPage = window.location.pathname.includes('/messages');
      if (!onMessagesPage) {
        set((state) => ({ chatUnreadCount: state.chatUnreadCount + 1 }));
      }
    });

    // When user opens messages page, reset chat unread count
    socketService.onChatActivity(() => {
      // Refresh the full count from server
      apiClient.get<ChatUnreadPayload>('/chat/unread').then((res) => {
        const body = res.data;
        if (body?.success) {
          set({ chatUnreadCount: body.data?.unreadCount ?? 0 });
        }
      }).catch(() => {});
    });
  },
}));
