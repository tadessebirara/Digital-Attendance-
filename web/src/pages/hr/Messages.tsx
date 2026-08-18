import { useState, useEffect, useCallback, useRef } from 'react';
import apiClient from '../../api/client';
import { Search, Send, X, Users, MessageSquarePlus, User, Check, CheckCheck, Pencil, Trash2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { socketService } from '../../services/socket.service';
import { useOnRefresh } from '../../context/DataRefreshContext';
import { useNotificationStore } from '../../store/useNotificationStore';

const card = 'bg-white dark:bg-[#0F1929] border border-gray-200 dark:border-white/[0.07]';

// --- Avatar -------------------------------------------------------------------
function Avatar({ user, size = 10 }: { user: any; size?: number }) {
  const dim = `w-${size} h-${size}`;
  if (user?.profilePicture) return <img src={user.profilePicture} alt="" className={`${dim} rounded-full object-cover shrink-0`} />;
  const initials = `${user?.firstName?.[0] ?? ''}${user?.lastName?.[0] ?? ''}`.toUpperCase();
  return (
    <div className={`${dim} rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0`}>
      <span className="text-xs font-bold text-blue-600 dark:text-blue-400">{initials || <User size={12} />}</span>
    </div>
  );
}

// --- Contact List Panel -------------------------------------------------------
function ContactListPanel({ onClose, onStartChat }: { onClose: () => void; onStartChat: (user: any) => void }) {
  const [users, setUsers] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await apiClient.get(`/chat/users`);
      const body = res.data;
      if (body.success) setUsers((body.data as any[]) ?? []);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);
  useOnRefresh('users', fetchUsers);

  const filtered = users.filter(u =>
    u.fullName?.toLowerCase().includes(search.toLowerCase()) ||
    u.department?.toLowerCase().includes(search.toLowerCase()) ||
    u.email?.toLowerCase().includes(search.toLowerCase())
  );

  const grouped = filtered.reduce((acc: Record<string, any[]>, u) => {
    const key = u.role === 'HR' ? 'HR' : u.role === 'ADMIN' ? 'Admin' : (u.department || 'Employees');
    if (!acc[key]) acc[key] = [];
    acc[key].push(u);
    return acc;
  }, {});

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className={`${card} rounded-2xl shadow-2xl w-full max-w-sm flex flex-col`} style={{ maxHeight: '80vh' }}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-white/[0.07] shrink-0">
          <div className="flex items-center gap-2">
            <Users size={16} className="text-blue-500" />
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Contacts</h2>
            <span className="text-xs text-gray-400">({users.length})</span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"><X size={15} /></button>
        </div>
        <div className="px-3 py-2 border-b border-gray-100 dark:border-white/[0.07] shrink-0">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input autoFocus type="text" placeholder="Search contacts..." value={search} onChange={e => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-sm rounded-lg bg-gray-50 dark:bg-[#0F1929] border border-gray-200 dark:border-white/[0.07] text-gray-700 dark:text-gray-300 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-10"><div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
          ) : filtered.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-400">No contacts found</div>
          ) : Object.entries(grouped).map(([group, members]) => (
            <div key={group}>
              <div className="px-4 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider bg-gray-50 dark:bg-[#0F1929]/50 sticky top-0">
                {group} ({members.length})
              </div>
              {members.map(u => (
                <button key={u.id} onClick={() => { onStartChat(u); onClose(); }}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors text-left">
                  <Avatar user={u} size={9} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{u.fullName}</p>
                    <p className="text-xs text-gray-400 truncate">{u.position || u.department || u.email}</p>
                  </div>
                  <MessageSquarePlus size={14} className="text-blue-400 shrink-0" />
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// --- Main Messages Page -------------------------------------------------------
export const Messages = () => {
  const { user: authUser } = useAuth();
  const [rooms, setRooms] = useState<any[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  // Per-room message cache � instant room switching with no blank flash
  const msgCache = useRef<Map<number, any[]>>(new Map());
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const sending = useRef(false); // ref instead of state � no re-render on send
  const [searchTerm, setSearchTerm] = useState('');
  const [showContacts, setShowContacts] = useState(false);
  // Edit state
  const [editingMsg, setEditingMsg] = useState<any>(null);
  const [editText, setEditText] = useState('');
  const [hoveredMsg, setHoveredMsg] = useState<number | null>(null);
  const [typingUsers, setTypingUsers] = useState<number[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<number | null>(null);

  const currentUserId = authUser?.id ?? null;

  // Reset chat unread count in the notification bell when this page mounts
  useEffect(() => {
    useNotificationStore.getState().fetchNotifications();
  }, []);

  // -- Helpers (defined before use) -------------------------------------------
  const getRoomName = useCallback((room: any) => {
    if (room.name && room.type !== 'DIRECT') return room.name;
    const other = room.participants?.find((p: any) => p.id !== currentUserId);
    return other ? (other.fullName || `${other.firstName} ${other.lastName}`.trim()) : 'Chat';
  }, [currentUserId]);

  const getRoomOther = useCallback((room: any) => {
    return room.participants?.find((p: any) => p.id !== currentUserId);
  }, [currentUserId]);

  function formatTime(iso: string) {
    const d = new Date(iso);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  // -- Fetch rooms � always returns the array ----------------------------------
  const fetchRooms = useCallback(async (): Promise<any[]> => {
    try {
      const res = await apiClient.get(`/chat/rooms`);
      const body = res.data;
      if (body.success) {
        const data: any[] = (body.data as any[]) ?? [];
        setRooms(data);
        setLoading(false);
        return data;
      }
    } catch { /* silent */ }
    setLoading(false);
    return [];
  }, []);

  // Clear unread count for a room immediately in local state
  const clearRoomUnread = useCallback((roomId: number) => {
    setRooms(prev => prev.map(r =>
      r.id === roomId ? { ...r, unreadCount: 0 } : r
    ));
    // Also refresh the bell notification count
    useNotificationStore.getState().fetchNotifications();
  }, []);

  // -- Fetch messages ----------------------------------------------------------
  const fetchMessages = useCallback(async (roomId: number, silent = false) => {
    // Instant display from cache � no blank flash on room switch
    const cached = msgCache.current.get(roomId);
    if (cached && cached.length > 0) setMessages(cached);

    try {
      const res = await apiClient.get(`/chat/rooms/${roomId}/messages`);
      const body = res.data;
      if (body.success) {
        const fresh = (body.data as any[]) ?? [];
        // Merge: keep any optimistic temps not yet confirmed
        const temps = (msgCache.current.get(roomId) ?? []).filter((m: any) => m._temp);
        const merged = [
          ...fresh.filter((m: any) => !temps.some((t: any) => t.tempId === m.tempId)),
          ...temps,
        ];
        msgCache.current.set(roomId, merged);
        if (!silent || roomId === selectedRoom?.id) setMessages(merged);
        // Mark as read on server + clear local unread immediately
        apiClient.post(`/chat/rooms/${roomId}/read`).catch(() => {});
        clearRoomUnread(roomId);
      }
    } catch { /* silent */ }
  }, [clearRoomUnread, selectedRoom?.id]);

  useEffect(() => { fetchRooms(); }, [fetchRooms]);

  useEffect(() => {
    if (selectedRoom?.id) {
      setTypingUsers([]);
      fetchMessages(selectedRoom.id);
    }
  }, [selectedRoom?.id]); // intentionally omit fetchMessages � only on room change

  // Polling fallback � only fires when socket is disconnected
  useEffect(() => {
    if (!selectedRoom?.id) return;
    const interval = setInterval(() => {
      if (!socketService.isConnected()) {
        apiClient.get(`/chat/rooms/${selectedRoom.id}/messages`).then(res => {
          if (res.data?.success) {
            const fresh: any[] = (res.data.data as any[]) ?? [];
            setMessages(prev => {
              const prevIds = new Set(prev.map((m: any) => m.id?.toString()));
              const newMsgs = fresh.filter(m => !prevIds.has(m.id?.toString()) && !m._temp);
              if (newMsgs.length === 0) return prev;
              const temps = prev.filter((m: any) => m._temp);
              return [...fresh, ...temps];
            });
          }
        }).catch(() => {});
      }
    }, 3000); // 3s when offline
    return () => clearInterval(interval);
  }, [selectedRoom?.id]);

  // Safety-net — fires every 8s even when socket is connected to catch missed events
  useEffect(() => {
    if (!selectedRoom?.id) return;
    const safetyNet = setInterval(() => {
      if (socketService.isConnected()) {
        fetchMessages(selectedRoom.id, true);
      }
    }, 8000);
    return () => clearInterval(safetyNet);
  }, [selectedRoom?.id, fetchMessages]);

  // -- Socket listeners --------------------------------------------------------
  useEffect(() => {
    // Use socketService.on/off � not the raw socket � so the dedup/ACK
    // layer in socket.service.ts applies to chat messages too.
    const onNewMessage = (msg: any) => {
      const currentRoomId = selectedRoom?.id;

      if (msg.roomId === currentRoomId) {
        setMessages(prev => {
          const alreadyExists =
            prev.some((m) => m.id === msg.id) ||
            (msg.tempId && prev.some((m) => m.tempId === msg.tempId));
          if (alreadyExists) return prev;
          const tempIdx = msg.tempId
            ? prev.findIndex((m) => m.tempId === msg.tempId)
            : -1;
          let next: any[];
          if (tempIdx !== -1) {
            next = [...prev];
            next[tempIdx] = { ...msg, _temp: false };
          } else {
            next = [...prev, msg];
          }
          msgCache.current.set(msg.roomId, next);
          return next;
        });
        apiClient.post(`/chat/rooms/${msg.roomId}/read`).catch(() => {});
      } else {
        // Update cache for non-visible room
        const existing = msgCache.current.get(msg.roomId);
        if (existing) {
          msgCache.current.set(msg.roomId, [...existing, msg]);
        }
      }

      // Update room list � bring room to top, bump unread count for non-active rooms
      setRooms(prev => {
        const isCurrentRoom = msg.roomId === currentRoomId;
        const exists = prev.some(r => r.id === msg.roomId);
        if (exists) {
          return prev
            .map(r => r.id === msg.roomId
              ? {
                  ...r,
                  lastMessage: msg.message,
                  lastMessageAt: msg.createdAt,
                  unreadCount: isCurrentRoom ? 0 : (r.unreadCount || 0) + 1,
                }
              : r)
            .sort((a, b) => {
              const at = a.lastMessageAt || a.createdAt || '';
              const bt = b.lastMessageAt || b.createdAt || '';
              return bt.localeCompare(at);
            });
        }
        // New room not yet in list � fetch rooms fresh (outside setRooms)
        return prev;
      });

      // If room doesn't exist in list, fetch rooms (run outside setRooms to avoid stale closure issues)
      setRooms(prev => {
        const exists = prev.some(r => r.id === msg.roomId);
        if (!exists) {
          // Trigger a fetch on next tick
          setTimeout(() => fetchRooms(), 0);
        }
        return prev;
      });
    };

    const onChatUpdate = (data: any) => {
      if (data.action === 'EDITED') {
        setMessages(prev => prev.map(m =>
          m.id === data.id ? { ...m, message: data.message, isEdited: true, editedAt: data.editedAt } : m
        ));
        return;
      }

      if (data.action === 'READ_STATUS') {
        // Update delivery status in-place � no HTTP round-trip needed
        setMessages(prev => prev.map(m =>
          data.messageIds?.includes(m.id)
            ? { ...m, deliveryStatus: 'SEEN', seenAt: data.seenAt }
            : m
        ));
        // Update unread count in room list locally
        if (data.roomId) {
          setRooms(prev => prev.map(r =>
            r.id === data.roomId ? { ...r, unreadCount: 0 } : r
          ));
        }
        return;
      }

      if (data.action === 'DELETED_FOR_EVERYONE' || data.action === 'DELETED') {
        // Show "Message deleted" placeholder instead of removing
        setMessages(prev => prev.map(m =>
          m.id === data.id ? { ...m, message: 'Message deleted', isDeleted: true } : m
        ));
        return;
      }

      if (data.action === 'DELETED_FOR_ME') {
        setMessages(prev => prev.filter(m => m.id !== data.id));
      }
    };

    const onTyping = (data: any) => {
      if (data.roomId !== selectedRoom?.id || data.userId === currentUserId) return;
      setTypingUsers(prev => {
        if (data.isTyping) return prev.includes(data.userId) ? prev : [...prev, data.userId];
        return prev.filter(id => id !== data.userId);
      });
    };

    // Listen for new room created for us
    const onChatRoom = () => { fetchRooms(); };

    socketService.on('chat:new', onNewMessage);
    socketService.on('chat:update', onChatUpdate);
    socketService.on('chat:typing', onTyping);
    socketService.on('chat:room', onChatRoom);

    return () => {
      socketService.off('chat:new', onNewMessage);
      socketService.off('chat:update', onChatUpdate);
      socketService.off('chat:typing', onTyping);
      socketService.off('chat:room', onChatRoom);
    };
  }, [selectedRoom?.id, fetchRooms]);

  // Join/leave socket room when selected room changes
  useEffect(() => {
    if (!selectedRoom?.id) return;
    socketService.joinChatRoom(selectedRoom.id).catch(() => {});
    return () => { socketService.leaveChatRoom(selectedRoom.id).catch(() => {}); };
  }, [selectedRoom?.id]);

  // Scroll to bottom � instant, no layout jank
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'instant' as ScrollBehavior });
  }, [messages.length]); // only on count change, not every update

  // -- Start chat from contact -------------------------------------------------
  const handleStartChat = async (user: any) => {
    try {
      const res = await apiClient.post(`/chat/rooms`, { type: 'DIRECT', participantIds: [user.id] });
      const body = res.data;
      if (body.success) {
        const roomPayload = body.data as { id: number };
        const roomId = roomPayload.id;
        const freshRooms = await fetchRooms() as any[];
        const target = freshRooms.find((r: any) => r.id === roomId);
        // Select immediately � even if not in list yet, build a minimal room object
        setSelectedRoom(target ?? {
          id: roomId,
          name: user.fullName,
          participants: [
            { id: user.id, firstName: user.firstName, lastName: user.lastName, fullName: user.fullName, profilePicture: user.profilePicture },
          ],
        });
      }
    } catch { /* silent */ }
  };

  // -- Send message � socket-first, HTTP fallback, never blocks UI -------------
  const handleSend = async () => {
    if (!newMessage.trim() || !selectedRoom || sending.current) return;
    sending.current = true;
    const text = newMessage.trim();
    setNewMessage('');
    // Optimistic add � appears instantly
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const tempMsg = {
      id: tempId, tempId,
      senderId: currentUserId,
      sender: { id: currentUserId, firstName: authUser?.firstName, lastName: authUser?.lastName, fullName: authUser?.fullName, profilePicture: authUser?.profilePicture },
      message: text, isRead: false,
      createdAt: new Date().toISOString(), _temp: true,
    };
    setMessages(prev => { const next = [...prev, tempMsg]; msgCache.current.set(selectedRoom.id, next); return next; });

    const roomId = selectedRoom.id;
    try {
      const res = await apiClient.post(`/chat/rooms/${roomId}/messages`, { message: text, tempId });
      if (res.data.success && res.data.data) {
        const realMsg = res.data.data as any;
        setMessages(prev => {
          const next = prev.map(m => m._temp && m.tempId === tempId ? { ...realMsg, _temp: false } : m);
          msgCache.current.set(roomId, next);
          return next;
        });
        setRooms(prev => prev
          .map(r => r.id === roomId ? { ...r, lastMessage: text, lastMessageAt: realMsg.createdAt ?? new Date().toISOString(), unreadCount: 0 } : r)
          .sort((a, b) => (b.lastMessageAt || b.createdAt || '').localeCompare(a.lastMessageAt || a.createdAt || ''))
        );
      } else {
        setMessages(prev => { const next = prev.filter(m => m.tempId !== tempId); msgCache.current.set(roomId, next); return next; });
      }
    } catch {
      setMessages(prev => { const next = prev.filter(m => m.tempId !== tempId); msgCache.current.set(roomId, next); return next; });
    } finally { sending.current = false; }
  };

  // -- Edit message ------------------------------------------------------------
  const handleEdit = async (msg: any) => {
    if (!editText.trim() || editText === msg.message) { setEditingMsg(null); return; }
    try {
      const res = await apiClient.put(`/chat/rooms/${selectedRoom.id}/messages/${msg.id}`, { message: editText });
      if (res.data.success) {
        setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, message: editText, isEdited: true } : m));
      }
    } catch { /* silent */ }
    setEditingMsg(null);
  };

  // -- Delete message ----------------------------------------------------------
  const handleDelete = async (msgId: number, scope: 'ME' | 'EVERYONE') => {
    try {
      const res = await apiClient.delete(`/chat/rooms/${selectedRoom.id}/messages/${msgId}?scope=${scope}`);
      if (res.data?.success) {
        setMessages(prev => scope === 'ME'
          ? prev.filter(m => m.id !== msgId)
          : prev.map(m => m.id === msgId ? { ...m, message: 'Message deleted', isDeleted: true } : m));
      }
    } catch { /* silent */ }
  };

  const emitTyping = (value: string) => {
    if (!selectedRoom?.id) return;
    socketService.emitTyping({ roomId: selectedRoom.id, userId: currentUserId ?? 0, isTyping: value.trim().length > 0 });
    if (typingTimeoutRef.current) window.clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = window.setTimeout(() => {
      socketService.emitTyping({ roomId: selectedRoom.id, userId: currentUserId ?? 0, isTyping: false });
    }, 1200);
  };

  // -- Search: filter by room name OR participant name -------------------------
  const filteredRooms = rooms.filter(r => {
    const term = searchTerm.toLowerCase().trim();
    if (!term) return true;
    const name = getRoomName(r).toLowerCase();
    if (name.includes(term)) return true;
    return r.participants?.some((p: any) =>
      p.fullName?.toLowerCase().includes(term) ||
      p.firstName?.toLowerCase().includes(term) ||
      p.lastName?.toLowerCase().includes(term)
    );
  });

  return (
    <div className="h-[calc(100vh-120px)] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Messages</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Chat with your team</p>
        </div>
        <button onClick={() => setShowContacts(true)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors">
          <Users size={15} /> Contacts
        </button>
      </div>

      <div className={`${card} rounded-xl flex flex-1 overflow-hidden`}>

        {/* -- Sidebar -- */}
        <div className="w-72 shrink-0 border-r border-gray-100 dark:border-white/[0.07] flex flex-col">
          <div className="p-3 border-b border-gray-100 dark:border-white/[0.07] flex items-center gap-2">
            <div className="relative flex-1">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="text" placeholder="Search conversations..." value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-sm rounded-lg bg-gray-50 dark:bg-[#0F1929] border border-gray-200 dark:border-white/[0.07] text-gray-700 dark:text-gray-300 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40" />
            </div>
            <button onClick={() => setShowContacts(true)} title="New conversation"
              className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors shrink-0">
              <MessageSquarePlus size={16} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex justify-center py-10"><div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
            ) : filteredRooms.length === 0 ? (
              <div className="py-12 text-center px-4">
                <MessageSquarePlus size={28} className="text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                <p className="text-sm text-gray-400">{searchTerm ? 'No results' : 'No conversations yet'}</p>
                {!searchTerm && <button onClick={() => setShowContacts(true)} className="mt-2 text-xs text-blue-500 hover:underline">Start one</button>}
              </div>
            ) : filteredRooms.map(room => {
              const other = getRoomOther(room);
              const isSelected = selectedRoom?.id === room.id;
              return (
                <button key={room.id} onClick={() => {
                    setSelectedRoom(room);
                    // Immediately clear unread badge in local state
                    if (room.unreadCount > 0) {
                      clearRoomUnread(room.id);
                    }
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-3 border-b border-gray-50 dark:border-white/[0.07]/50 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors text-left ${isSelected ? 'bg-blue-50 dark:bg-blue-900/20 border-l-2 border-l-blue-500' : ''}`}>
                  <div className="relative shrink-0">
                    <Avatar user={other} size={10} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <p className={`text-sm truncate ${isSelected ? 'font-semibold text-blue-700 dark:text-blue-400' : 'font-medium text-gray-900 dark:text-white'}`}>
                        {getRoomName(room)}
                      </p>
                      {room.lastMessageAt && (
                        <span className="text-[10px] text-gray-400 shrink-0">{formatTime(room.lastMessageAt)}</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 truncate mt-0.5">{room.lastMessage || 'No messages yet'}</p>
                  </div>
                  {room.unreadCount > 0 && (
                    <span className="shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center">
                      {room.unreadCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* -- Chat area -- */}
        <div className="flex-1 flex flex-col min-w-0">
          {selectedRoom ? (
            <>
              {/* Chat header */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 dark:border-white/[0.07] bg-white dark:bg-[#0F1929] shrink-0">
                <Avatar user={getRoomOther(selectedRoom)} size={9} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{getRoomName(selectedRoom)}</p>
                  <p className="text-xs text-gray-400">
                    {typingUsers.length > 0
                      ? 'Typing...'
                      : (getRoomOther(selectedRoom)?.department || getRoomOther(selectedRoom)?.position || 'Team member')}
                  </p>
                </div>
              </div>

              {/* Messages list */}
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1 bg-gray-50 dark:bg-[#0f1117]">
                {messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center">
                    <div className="w-14 h-14 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center mb-3">
                      <MessageSquarePlus size={24} className="text-blue-400" />
                    </div>
                    <p className="text-sm text-gray-400">No messages yet. Say hello!</p>
                  </div>
                ) : messages.map((msg, idx) => {
                  const isMe = msg.senderId === currentUserId;
                  const prevMsg = messages[idx - 1];
                  const showAvatar = !isMe && (!prevMsg || prevMsg.senderId !== msg.senderId);
                  const isEditing = editingMsg?.id === msg.id;

                  return (
                    <div key={msg.id}
                      className={`flex items-end gap-2 group ${isMe ? 'flex-row-reverse' : 'flex-row'} ${showAvatar ? 'mt-3' : 'mt-0.5'}`}
                      onMouseEnter={() => setHoveredMsg(msg.id)}
                      onMouseLeave={() => setHoveredMsg(null)}>

                      {/* Avatar � only for others, only on first in group */}
                      <div className="w-7 shrink-0">
                        {showAvatar && !isMe && <Avatar user={msg.sender} size={7} />}
                      </div>

                      <div className={`max-w-[65%] flex flex-col gap-0.5 ${isMe ? 'items-end' : 'items-start'}`}>
                        {/* Sender name for group chats */}
                        {showAvatar && !isMe && (
                          <span className="text-[10px] text-gray-400 px-1">{msg.sender?.firstName}</span>
                        )}

                        {isEditing ? (
                          <div className="flex items-center gap-2 w-full">
                            <input autoFocus value={editText} onChange={e => setEditText(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') handleEdit(msg); if (e.key === 'Escape') setEditingMsg(null); }}
                              className="flex-1 px-3 py-1.5 text-sm rounded-xl bg-white dark:bg-[#0F1929] border-2 border-blue-500 text-gray-900 dark:text-gray-100 focus:outline-none" />
                            <button onClick={() => handleEdit(msg)} className="p-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700"><Check size={13} /></button>
                            <button onClick={() => setEditingMsg(null)} className="p-1.5 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-300"><X size={13} /></button>
                          </div>
                        ) : msg.isDeleted ? (
                          <div className="relative px-3 py-2 rounded-2xl text-sm leading-relaxed bg-gray-100 dark:bg-[#0F1929] text-gray-400 dark:text-gray-500 italic border border-gray-200 dark:border-white/[0.07] flex items-center gap-1.5">
                            <X size={12} className="shrink-0 opacity-60" />
                            Message deleted
                          </div>
                        ) : (
                          <div className={`relative px-3 py-2 rounded-2xl text-sm leading-relaxed ${isMe
                            ? 'bg-blue-600 text-white rounded-br-sm'
                            : 'bg-white dark:bg-[#0F1929] text-gray-900 dark:text-white rounded-bl-sm shadow-sm border border-gray-100 dark:border-white/[0.07]'}`}>
                            {msg.message}
                            {msg.isEdited && <span className="text-[9px] opacity-60 ml-1 italic">edited</span>}
                          </div>
                        )}

                        {/* Time + read receipt */}
                        <div className={`flex items-center gap-1 text-[10px] text-gray-400 px-1 ${isMe ? 'flex-row-reverse' : ''}`}>
                          <span>{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          {isMe && ((msg.deliveryStatus === 'SEEN')
                            ? <CheckCheck size={11} className="text-blue-400" />
                            : <Check size={11} />)}
                        </div>
                      </div>

                      {/* Action buttons � show on hover for own messages */}
                      {isMe && hoveredMsg === msg.id && !isEditing && (
                        <div className="flex items-center gap-1 mb-4 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => { setEditingMsg(msg); setEditText(msg.message); }}
                            className="p-1 rounded-lg bg-white dark:bg-[#0F1929] border border-gray-200 dark:border-white/[0.07] text-gray-400 hover:text-blue-600 hover:border-blue-300 transition-colors shadow-sm">
                            <Pencil size={12} />
                          </button>
                          {msg.canDeleteForEveryone && (
                            <button onClick={() => handleDelete(msg.id, 'EVERYONE')}
                              className="p-1 rounded-lg bg-white dark:bg-[#0F1929] border border-gray-200 dark:border-white/[0.07] text-gray-400 hover:text-red-500 hover:border-red-300 transition-colors shadow-sm">
                              <Trash2 size={12} />
                            </button>
                          )}
                          <button onClick={() => handleDelete(msg.id, 'ME')}
                            className="p-1 rounded-lg bg-white dark:bg-[#0F1929] border border-gray-200 dark:border-white/[0.07] text-gray-400 hover:text-amber-500 hover:border-amber-300 transition-colors shadow-sm">
                            <X size={12} />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div className="px-4 py-3 border-t border-gray-100 dark:border-white/[0.07] bg-white dark:bg-[#0F1929] shrink-0">
                <div className="flex items-center gap-2">
                  <input ref={inputRef} type="text" value={newMessage} onChange={e => { setNewMessage(e.target.value); emitTyping(e.target.value); }}
                    onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
                    placeholder="Type a message..."
                    className="flex-1 px-4 py-2.5 text-sm rounded-xl bg-gray-50 dark:bg-[#0F1929] border border-gray-200 dark:border-white/[0.07] text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40" />
                  <button onClick={handleSend} disabled={!newMessage.trim()}
                    className="p-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-40 transition-colors shrink-0">
                    <Send size={16} />
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-gray-50 dark:bg-[#0f1117]">
              <div className="w-16 h-16 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center mb-4">
                <MessageSquarePlus size={28} className="text-blue-400" />
              </div>
              <p className="text-base font-semibold text-gray-700 dark:text-gray-300">Select a conversation</p>
              <p className="text-sm text-gray-400 mt-1">or start a new one from Contacts</p>
              <button onClick={() => setShowContacts(true)}
                className="mt-4 flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors">
                <Users size={15} /> Open Contacts
              </button>
            </div>
          )}
        </div>
      </div>

      {showContacts && (
        <ContactListPanel onClose={() => setShowContacts(false)} onStartChat={handleStartChat} />
      )}
    </div>
  );
};
