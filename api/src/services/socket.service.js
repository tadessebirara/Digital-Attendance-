const logger = require('../utils/logger');
const { query } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

let io = null;
const ACK_TIMEOUT_MS = 5000;

const EVENTS = {
  CHAT_JOIN: 'chat:join',
  CHAT_LEAVE: 'chat:leave',
  CHAT_SEND: 'chat:send',
  CHAT_EDIT: 'chat:edit',
  CHAT_DELETE: 'chat:delete',
  CHAT_NEW: 'chat:new',
  CHAT_UPDATE: 'chat:update',
  CHAT_TYPING: 'chat:typing',
  CHAT_ROOM: 'chat:room',
  CHAT_ACTIVITY: 'chat:activity',
  ANNOUNCEMENT_NEW: 'announcement:new',
  ANNOUNCEMENT_UPDATE: 'announcement:update',
  LEAVE_REQUEST: 'leave:request',
  LEAVE_UPDATE: 'leave:update',
  ATTENDANCE_UPDATE: 'attendance:update',
  REPORT_UPDATE: 'report:update',
  // Live location — employees emit, admin/HR receive
  LOCATION_UPDATE: 'location:update',
};

// In-memory live location store: userId → { latitude, longitude, accuracy, timestamp, name }
// Intentionally in-memory — this is ephemeral display data, not persisted.
const liveLocations = new Map();

// Redis-backed event store — survives server restarts and supports
// multi-instance deployments. Falls back gracefully if Redis is unavailable.
let redisClient = null;
const EVENT_STREAM_KEY = 'socket:event_log';
const EVENT_TTL_SECONDS = 3600; // keep events for 1 hour for missed-event replay

const initRedis = () => {
  if (!process.env.REDIS_URL) {
    logger.warn('[Socket] REDIS_URL not set — missed-event replay disabled (single-instance only)');
    return;
  }
  try {
    const Redis = require('ioredis');
    redisClient = new Redis(process.env.REDIS_URL);
    redisClient.on('error', (err) => logger.error('[Socket Redis] Error:', err.message));
    logger.info('[Socket] Redis event store connected');
  } catch (e) {
    logger.error('[Socket] Failed to init Redis event store:', e.message);
  }
};

/**
 * Persist an event to Redis Stream for missed-event replay.
 * Uses XADD with MAXLEN to cap stream size.
 */
const persistEvent = async (userId, event, data, eventId, timestamp = new Date().toISOString()) => {
  if (!redisClient) return;
  try {
    const userStreamKey = `${EVENT_STREAM_KEY}:${userId}`;
    await redisClient.xadd(
      userStreamKey,
      'MAXLEN', '~', '500',
      '*',
      'eventId', eventId,
      'event', event,
      'data', JSON.stringify(data),
      'timestamp', timestamp
    );
    await redisClient.expire(userStreamKey, EVENT_TTL_SECONDS);
  } catch (e) {
    logger.error('[Socket] persistEvent error:', e.message);
  }
};

/**
 * Fetch events from Redis Stream since a given ISO timestamp.
 * Returns array of { eventId, event, data, timestamp }.
 */
const getMissedEvents = async (userId, sinceIso) => {
  if (!redisClient) return [];
  try {
    const userStreamKey = `${EVENT_STREAM_KEY}:${userId}`;
    const sinceMs = Number.isFinite(new Date(sinceIso).getTime())
      ? new Date(sinceIso).getTime()
      : 0;
    const entries = await redisClient.xrange(userStreamKey, '-', '+');
    return entries.map(([, fields]) => {
      const obj = {};
      for (let i = 0; i < fields.length; i += 2) obj[fields[i]] = fields[i + 1];
      return {
        eventId: obj.eventId,
        event: obj.event,
        data: JSON.parse(obj.data || '{}'),
        timestamp: obj.timestamp
      };
    }).filter((entry) => new Date(entry.timestamp).getTime() > sinceMs);
  } catch (e) {
    logger.error('[Socket] getMissedEvents error:', e.message);
    return [];
  }
};

const buildPayload = (data) => ({
  eventId: uuidv4(),
  timestamp: new Date().toISOString(),
  data
});

const emitWithRoomAck = (target, event, data) => {
  const payload = buildPayload(data);
  target.timeout(ACK_TIMEOUT_MS).emit(event, payload, (err) => {
    if (err) {
      logger.warn(`[Socket] No ACK for event "${event}" in room emit.`);
    }
  });
  return payload;
};

const initialize = (socketIo) => {
  io = socketIo;
  initRedis();

  io.on('connection', (socket) => {
    const user = socket.user;
    logger.info(`🔌 Client connected: ${socket.id} (User: ${user.id})`);
    socket.join(`user_${user.id}`);

    // Missed-event replay from Redis Stream
    socket.on('sync_missed_events', async ({ lastEventTime }) => {
      try {
        const missed = await getMissedEvents(user.id, lastEventTime);
        missed.forEach(e => socket.emit(e.event, { eventId: e.eventId, timestamp: e.timestamp, data: e.data }));
        logger.info(`[Socket] Replayed ${missed.length} missed events for user ${user.id}`);
      } catch (e) {
        logger.error('[Socket] sync_missed_events error:', e.message);
      }
    });

    // ── Room Isolation ────────────────────────────────────────────────────────

    socket.on(EVENTS.CHAT_JOIN, async (payload, ack = () => {}) => {
      try {
        const roomId = Number(
          typeof payload === 'object' && payload !== null ? payload.roomId : payload
        );

        if (!Number.isInteger(roomId)) {
          if (typeof ack === 'function') ack({ success: false, message: 'Valid roomId is required' });
          return;
        }

        const { rows } = await query(
          'SELECT id FROM chat_participants WHERE room_id = $1 AND user_id = $2',
          [roomId, user.id]
        );
        if (rows.length === 0 && user.role !== 'ADMIN') {
          logger.warn(`Security Warning: User ${user.id} tried to join chat ${roomId} without membership`);
          if (typeof ack === 'function') ack({ success: false, message: 'You are not a member of this chat' });
          return;
        }
        socket.join(`chat_${roomId}`);
        logger.info(`User ${user.id} joined chat room ${roomId}`);
        if (typeof ack === 'function') ack({ success: true, message: 'Joined chat room', data: { roomId } });
      } catch (error) {
        logger.error('Join chat room error:', error);
        if (typeof ack === 'function') ack({ success: false, message: 'Failed to join chat room' });
      }
    });

    socket.on(EVENTS.CHAT_LEAVE, (payload, ack = () => {}) => {
      const roomId = Number(
        typeof payload === 'object' && payload !== null ? payload.roomId : payload
      );

      if (!Number.isInteger(roomId)) {
        if (typeof ack === 'function') ack({ success: false, message: 'Valid roomId is required' });
        return;
      }

      socket.leave(`chat_${roomId}`);
      if (typeof ack === 'function') ack({ success: true, message: 'Left chat room', data: { roomId } });
    });

    if (user.role === 'ADMIN') {
      socket.join('admin_room');
      logger.info(`Admin joined admin_room: ${user.id}`);
    }
    if (user.role === 'HR' || user.role === 'ADMIN') {
      socket.join('hr_room');
      logger.info(`HR joined hr_room: ${user.id}`);
    }

    // ── Standardized Events ───────────────────────────────────────────────────

    socket.on(EVENTS.CHAT_TYPING, ({ roomId, isTyping }) => {
      const payload = { userId: user.id, roomId, isTyping };
      emitWithRoomAck(socket.to(`chat_${roomId}`), EVENTS.CHAT_TYPING, payload);
    });

    // ── location:update — employees push GPS, admin/HR receive live dots ─────
    socket.on(EVENTS.LOCATION_UPDATE, (data) => {
      const { latitude, longitude, accuracy, timestamp } = data || {};
      // Only employees send location — admins/HR don't need to track themselves
      if (user.role !== 'EMPLOYEE') return;
      if (typeof latitude !== 'number' || typeof longitude !== 'number') return;

      // Fetch name once and cache in the location entry
      const existing = liveLocations.get(user.id);
      const entry = {
        userId:    user.id,
        name:      existing?.name || null, // filled in below if missing
        latitude,
        longitude,
        accuracy:  accuracy ?? null,
        timestamp: timestamp || new Date().toISOString(),
        online:    true,
      };

      liveLocations.set(user.id, entry);

      // Fetch name from DB on first update (cache thereafter)
      if (!existing?.name) {
        query('SELECT first_name, last_name FROM users WHERE id = $1', [user.id])
          .then(({ rows }) => {
            if (rows.length > 0) {
              const updated = liveLocations.get(user.id);
              if (updated) {
                updated.name = `${rows[0].first_name} ${rows[0].last_name}`;
                liveLocations.set(user.id, updated);
              }
            }
          }).catch(() => {});
      }

      // Push to admin and HR rooms — no Redis persistence (ephemeral)
      const payload = buildPayload(entry);
      if (io) {
        io.to('admin_room').emit(EVENTS.LOCATION_UPDATE, payload);
        io.to('hr_room').emit(EVENTS.LOCATION_UPDATE, payload);
      }
    });

    socket.on(EVENTS.CHAT_SEND, async (data, ack = () => {}) => {
      try {
        const { roomId, message, tempId } = data;
        if (!roomId || !message || !String(message).trim()) {
          if (typeof ack === 'function') ack({ success: false, message: 'roomId and message are required' });
          return;
        }

        const { rows: membership } = await query(
          'SELECT id FROM chat_participants WHERE room_id = $1 AND user_id = $2',
          [roomId, user.id]
        );
        if (membership.length === 0 && user.role !== 'ADMIN') {
          if (typeof ack === 'function') ack({ success: false, message: 'Unauthorized' });
          return;
        }

        // Employees can only send messages in rooms where the other participant is HR
        if (user.role === 'EMPLOYEE') {
          const { rows: roomParticipants } = await query(
            `SELECT u.role FROM chat_participants cp
             JOIN users u ON u.id = cp.user_id
             WHERE cp.room_id = $1 AND cp.user_id <> $2`,
            [roomId, user.id]
          );
          const hasNonHR = roomParticipants.some(p => p.role !== 'HR');
          if (hasNonHR) {
            if (typeof ack === 'function') ack({ success: false, message: 'Employees can only message HR' });
            return;
          }
        }

        // Use the same transaction as HTTP sendMessage — creates chat_message_reads rows
        // so getMessages (which JOINs on chat_message_reads) can find the message.
        const { transaction } = require('../config/database');
        const DELETE_WINDOW = 15;

        const createdMessageId = await transaction(async (client) => {
          if (tempId) {
            const { rows: existingRows } = await client.query(
              `SELECT id
               FROM chat_messages
               WHERE room_id = $1
                 AND sender_id = $2
                 AND client_temp_id = $3
               LIMIT 1`,
              [roomId, user.id, tempId]
            );
            if (existingRows.length > 0) return existingRows[0].id;
          }

          const { rows: msgRows } = await client.query(
            `INSERT INTO chat_messages (
               room_id, sender_id, message, client_temp_id,
               created_at, updated_at,
               delete_everyone_expires_at
             )
             VALUES ($1, $2, $3, $4, NOW(), NOW(), NOW() + ($5 || ' minutes')::INTERVAL)
             ON CONFLICT (room_id, sender_id, client_temp_id)
             WHERE client_temp_id IS NOT NULL
             DO UPDATE SET updated_at = chat_messages.updated_at
             RETURNING id`,
            [roomId, user.id, String(message).trim(), tempId || null, DELETE_WINDOW]
          );

          const { rows: participants } = await client.query(
            'SELECT user_id FROM chat_participants WHERE room_id = $1',
            [roomId]
          );

          for (const participant of participants) {
            await client.query(
              `INSERT INTO chat_message_reads (message_id, user_id, delivered_at, seen_at)
               VALUES ($1, $2, NOW(), $3)
               ON CONFLICT (message_id, user_id) DO NOTHING`,
              [msgRows[0].id, participant.user_id,
               participant.user_id === user.id ? new Date() : null]
            );
          }

          return msgRows[0].id;
        });

        // Fetch the full normalized message for broadcast
        const { rows: senderRows } = await query(
          'SELECT first_name, last_name, profile_picture FROM users WHERE id = $1',
          [user.id]
        );
        const { rows: msgRows } = await query(
          'SELECT id, room_id, sender_id, message, client_temp_id, created_at FROM chat_messages WHERE id = $1',
          [createdMessageId]
        );
        const savedMessage = msgRows[0];
        const sender = senderRows[0];

        const messageData = {
          id: savedMessage.id,
          roomId: savedMessage.room_id,
          senderId: user.id,
          tempId: savedMessage.client_temp_id || tempId || null,
          sender: sender ? {
            id: user.id,
            firstName: sender.first_name,
            lastName: sender.last_name,
            fullName: `${sender.first_name} ${sender.last_name}`,
            profilePicture: sender.profile_picture
          } : null,
          message: savedMessage.message,
          isEdited: false,
          isDeleted: false,
          canDeleteForEveryone: true,
          deliveryStatus: 'SENT',
          createdAt: savedMessage.created_at,
        };

        // Broadcast to room (all members in chat_{roomId}) — employees receive
        // via their user_{id} room since they may not have socket-joined the chat room.
        // The per-participant emitToUser ensures delivery even if chat:join failed.
        emitToAdmin(EVENTS.CHAT_ACTIVITY, { type: 'NEW_MESSAGE', roomId, senderId: user.id });

        const { rows: roomParticipants } = await query(
          'SELECT user_id FROM chat_participants WHERE room_id = $1',
          [roomId]
        );
        for (const { user_id } of roomParticipants) {
          if (user_id !== user.id) {
            emitToUser(user_id, EVENTS.CHAT_NEW, messageData);
          }
        }

        if (typeof ack === 'function') ack({ success: true, data: messageData, message: 'Message sent' });
      } catch (error) {
        logger.error('Socket message error:', error);
        if (typeof ack === 'function') ack({ success: false, message: 'Failed to send message' });
      }
    });

    // ── chat:edit — update message via socket ─────────────────────────────────
    socket.on(EVENTS.CHAT_EDIT, async (data, ack = () => {}) => {
      try {
        const { roomId, msgId, message } = data;
        if (!roomId || !msgId || !message || !String(message).trim()) {
          if (typeof ack === 'function') ack({ success: false, message: 'roomId, msgId and message are required' });
          return;
        }

        const { rows: membership } = await query(
          'SELECT id FROM chat_participants WHERE room_id = $1 AND user_id = $2',
          [roomId, user.id]
        );
        if (membership.length === 0 && user.role !== 'ADMIN') {
          if (typeof ack === 'function') ack({ success: false, message: 'Unauthorized' });
          return;
        }

        const { rows } = await query(
          'SELECT * FROM chat_messages WHERE id = $1 AND room_id = $2 AND deleted_for_everyone_at IS NULL',
          [msgId, roomId]
        );
        if (rows.length === 0) {
          if (typeof ack === 'function') ack({ success: false, message: 'Message not found' });
          return;
        }
        if (rows[0].sender_id !== user.id) {
          if (typeof ack === 'function') ack({ success: false, message: 'Can only edit your own messages' });
          return;
        }

        const { rows: updated } = await query(
          `UPDATE chat_messages
           SET message = $1, is_edited = true, edited_at = NOW(), updated_at = NOW()
           WHERE id = $2 RETURNING *`,
          [message, msgId]
        );

        const updateData = {
          action: 'EDITED',
          id: parseInt(msgId),
          roomId: parseInt(roomId),
          message: updated[0].message,
          isEdited: true,
          editedAt: updated[0].edited_at
        };

        // Broadcast to each participant's personal room
        const { rows: roomParticipants } = await query(
          'SELECT user_id FROM chat_participants WHERE room_id = $1',
          [roomId]
        );
        for (const { user_id } of roomParticipants) {
          if (user_id !== user.id) {
            emitToUser(user_id, EVENTS.CHAT_UPDATE, updateData);
          }
        }

        if (typeof ack === 'function') ack({ success: true, data: updateData });
      } catch (error) {
        logger.error('Socket edit message error:', error);
        if (typeof ack === 'function') ack({ success: false, message: 'Failed to edit message' });
      }
    });

    // ── chat:delete — soft delete message via socket ──────────────────────────
    socket.on(EVENTS.CHAT_DELETE, async (data, ack = () => {}) => {
      try {
        const { roomId, msgId } = data;
        const scope = String(data?.scope || 'EVERYONE').toUpperCase();
        if (!roomId || !msgId) {
          if (typeof ack === 'function') ack({ success: false, message: 'roomId and msgId are required' });
          return;
        }

        const { rows: membership } = await query(
          'SELECT id FROM chat_participants WHERE room_id = $1 AND user_id = $2',
          [roomId, user.id]
        );
        if (membership.length === 0 && user.role !== 'ADMIN') {
          if (typeof ack === 'function') ack({ success: false, message: 'Unauthorized' });
          return;
        }

        const { rows } = await query(
          'SELECT * FROM chat_messages WHERE id = $1 AND room_id = $2',
          [msgId, roomId]
        );
        if (rows.length === 0) {
          if (typeof ack === 'function') ack({ success: false, message: 'Message not found' });
          return;
        }

        if (scope === 'ME') {
          await query(
            `INSERT INTO chat_message_deletions (message_id, user_id)
             VALUES ($1, $2)
             ON CONFLICT (message_id, user_id) DO NOTHING`,
            [msgId, user.id]
          );
          const deleteForMeData = {
            action: 'DELETED_FOR_ME',
            id: parseInt(msgId),
            roomId: parseInt(roomId),
            scope: 'ME'
          };
          emitToUser(user.id, EVENTS.CHAT_UPDATE, deleteForMeData);
          if (typeof ack === 'function') ack({ success: true, data: deleteForMeData });
          return;
        }

        if (rows[0].sender_id !== user.id) {
          if (typeof ack === 'function') ack({ success: false, message: 'Can only delete your own messages' });
          return;
        }
        if (rows[0].deleted_for_everyone_at) {
          if (typeof ack === 'function') ack({ success: false, message: 'Message already deleted' });
          return;
        }
        if (!rows[0].delete_everyone_expires_at || new Date(rows[0].delete_everyone_expires_at) < new Date()) {
          if (typeof ack === 'function') ack({ success: false, message: `Delete for everyone is only available for ${DELETE_WINDOW} minutes` });
          return;
        }

        await query(
          'UPDATE chat_messages SET deleted_for_everyone_at = NOW(), updated_at = NOW() WHERE id = $1',
          [msgId]
        );

        const deleteData = {
          action: 'DELETED_FOR_EVERYONE',
          id: parseInt(msgId),
          roomId: parseInt(roomId),
          scope: 'EVERYONE'
        };

        // Broadcast to each participant's personal room
        const { rows: roomParticipants } = await query(
          'SELECT user_id FROM chat_participants WHERE room_id = $1',
          [roomId]
        );
        for (const { user_id } of roomParticipants) {
          emitToUser(user_id, EVENTS.CHAT_UPDATE, deleteData);
        }

        if (typeof ack === 'function') ack({ success: true, data: deleteData });
      } catch (error) {
        logger.error('Socket delete message error:', error);
        if (typeof ack === 'function') ack({ success: false, message: 'Failed to delete message' });
      }
    });

    socket.on('disconnect', () => {
      logger.info(`🔌 Client disconnected: ${socket.id}`);
      // Clear live location on disconnect so the map dot disappears
      if (liveLocations.has(user.id)) {
        liveLocations.delete(user.id);
        // Notify admin/HR that this employee went offline
        const offlinePayload = buildPayload({ userId: user.id, online: false });
        io.to('admin_room').emit(EVENTS.LOCATION_UPDATE, offlinePayload);
        io.to('hr_room').emit(EVENTS.LOCATION_UPDATE, offlinePayload);
      }
    });
  });

  logger.info('✅ Socket.IO initialized');
};

// ── Emitters ──────────────────────────────────────────────────────────────────

/**
 * Emit directly to a user's personal socket room.
 * No Redis dedup check — emit directly to avoid issues with dedup race conditions.
 * Persists to Redis for missed-event replay on reconnect.
 */
const emitToUser = (userId, event, data) => {
  if (!io) return;
  const eventId = uuidv4();
  const timestamp = new Date().toISOString();
  const payload = { eventId, timestamp, data };

  // Always persist first — if emit fails, client can replay on reconnect
  persistEvent(userId, event, data, eventId, timestamp);

  const room = io.to(`user_${userId}`);
  const socketsInRoom = io.sockets.adapter.rooms?.get(`user_${userId}`);
  logger.info(`[Socket] emitToUser: user=${userId} event=${event} sockets=${socketsInRoom?.size ?? 0}`);

  // Emit directly — no Redis dedup check (causes issues)
  room.timeout(ACK_TIMEOUT_MS).emit(event, payload, (err) => {
    if (err) {
      logger.warn(
        `[Socket] No ACK for event ${eventId} (user ${userId}, event "${event}") — ` +
        `event persisted in Redis for replay on reconnect.`
      );
    }
  });
};

const emitToRoom = (roomId, event, data) => {
  if (!io) return;
  const payload = buildPayload(data);
  // Persist for each room participant so they can replay on reconnect
  if (redisClient) {
    query(
      'SELECT user_id FROM chat_participants WHERE room_id = $1',
      [roomId]
    ).then(({ rows }) => {
      rows.forEach(({ user_id }) => persistEvent(user_id, event, data, payload.eventId));
    }).catch(() => {});
  }
  io.to(`chat_${roomId}`).timeout(ACK_TIMEOUT_MS).emit(event, payload, (err) => {
    if (err) logger.warn(`[Socket] No ACK for room event "${event}" in room ${roomId}.`);
  });
};

const emitToAdmin = (event, data) => {
  if (!io) return;
  const payload = buildPayload(data);
  if (redisClient) {
    query("SELECT id FROM users WHERE role = 'ADMIN' AND status = 'ACTIVE'").then(({ rows }) => {
      rows.forEach(({ id }) => persistEvent(id, event, data, payload.eventId));
    }).catch(() => {});
  }
  io.to('admin_room').timeout(ACK_TIMEOUT_MS).emit(event, payload, (err) => {
    if (err) logger.warn(`[Socket] No ACK for admin event "${event}".`);
  });
};

const emitToHR = (event, data) => {
  if (!io) return;
  const payload = buildPayload(data);
  if (redisClient) {
    query("SELECT id FROM users WHERE role IN ('HR','ADMIN') AND status = 'ACTIVE'").then(({ rows }) => {
      rows.forEach(({ id }) => persistEvent(id, event, data, payload.eventId));
    }).catch(() => {});
  }
  io.to('hr_room').timeout(ACK_TIMEOUT_MS).emit(event, payload, (err) => {
    if (err) logger.warn(`[Socket] No ACK for HR event "${event}".`);
  });
};

const emitAuditEvent = (auditData) => {
  if (!io) return;
  const payload = {
    eventId: uuidv4(),
    timestamp: new Date().toISOString(),
    data: auditData
  };
  io.to('admin_room').emit('audit_log', payload);
  io.to('hr_room').emit('audit_log', payload);
};

const broadcast = (event, data) => {
  if (!io) return;
  const payload = buildPayload(data);
  if (redisClient) {
    query("SELECT id FROM users WHERE status = 'ACTIVE'").then(({ rows }) => {
      rows.forEach(({ id }) => persistEvent(id, event, data, payload.eventId));
    }).catch(() => {});
  }
  io.timeout(ACK_TIMEOUT_MS).emit(event, payload, (err) => {
    if (err) logger.warn(`[Socket] No ACK for broadcast event "${event}".`);
  });
};

module.exports = {
  EVENTS,
  buildPayload,
  initialize,
  emitToUser,
  emitToRoom,
  emitToAdmin,
  emitToHR,
  emitAuditEvent,
  broadcast,
  getIo: () => io,
  getLiveLocations: () => Array.from(liveLocations.values()),
};
