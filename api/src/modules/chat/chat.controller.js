const { query, transaction } = require('../../config/database');
const logger = require('../../utils/logger');
const socketService = require('../../services/socket.service');

const DELETE_FOR_EVERYONE_WINDOW_MINUTES = 15;

const normalizeMessage = (row, currentUserId) => {
  const seenCount = Number(row.seen_count || 0);
  const deliveredCount = Number(row.delivered_count || 0);
  const deliveryStatus =
    row.sender_id === currentUserId
      ? (seenCount > 0 ? 'SEEN' : deliveredCount > 0 ? 'DELIVERED' : 'SENT')
      : (row.self_seen_at ? 'SEEN' : row.self_delivered_at ? 'DELIVERED' : 'SENT');

  return {
    id: row.id,
    roomId: row.room_id,
    senderId: row.sender_id,
    tempId: row.client_temp_id || null,
    sender: {
      id: row.sender_id,
      firstName: row.first_name,
      lastName: row.last_name,
      fullName: `${row.first_name} ${row.last_name}`.trim(),
      profilePicture: row.profile_picture
    },
    message: row.deleted_for_everyone_at ? 'Message deleted' : row.message,
    isEdited: !!row.is_edited,
    isDeleted: !!row.deleted_for_everyone_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    editedAt: row.edited_at,
    deliveredAt: row.self_delivered_at,
    seenAt: row.self_seen_at,
    deliveredCount,
    seenCount,
    deliveryStatus,
    canDeleteForEveryone:
      row.sender_id === currentUserId &&
      !row.deleted_for_everyone_at &&
      !!row.can_delete_for_everyone
  };
};

const getRoomParticipants = async (roomId) => {
  const { rows } = await query(
    `SELECT cp.user_id, cp.is_admin, u.first_name, u.last_name, u.email, u.profile_picture, u.role
     FROM chat_participants cp
     JOIN users u ON u.id = cp.user_id
     WHERE cp.room_id = $1`,
    [roomId]
  );
  return rows;
};

const assertParticipant = async (roomId, userId) => {
  const { rows } = await query(
    'SELECT 1 FROM chat_participants WHERE room_id = $1 AND user_id = $2',
    [roomId, userId]
  );
  return rows.length > 0;
};

const fetchMessageRows = async ({ roomId, userId, limit = 50, offset = 0, since = null, messageId = null }) => {
  const params = [roomId, userId];
  let cursorSql = '';

  if (since) {
    params.push(since);
    cursorSql += ` AND cm.created_at > $${params.length}`;
  }

  if (messageId) {
    params.push(messageId);
    cursorSql += ` AND cm.id = $${params.length}`;
  }

  params.push(limit);
  params.push(offset);

  const { rows } = await query(
    `SELECT
       cm.id,
       cm.room_id,
       cm.sender_id,
       cm.message,
       cm.client_temp_id,
       cm.created_at,
       cm.updated_at,
       cm.edited_at,
       cm.is_edited,
       cm.deleted_for_everyone_at,
       u.first_name,
       u.last_name,
       u.profile_picture,
       self_read.delivered_at AS self_delivered_at,
       self_read.seen_at AS self_seen_at,
       stats.delivered_count,
       stats.seen_count,
       (cm.delete_everyone_expires_at IS NOT NULL AND NOW() <= cm.delete_everyone_expires_at) AS can_delete_for_everyone
     FROM chat_messages cm
     JOIN users u
       ON u.id = cm.sender_id
     JOIN chat_message_reads self_read
       ON self_read.message_id = cm.id
      AND self_read.user_id = $2
     LEFT JOIN chat_message_deletions cmd
       ON cmd.message_id = cm.id
      AND cmd.user_id = $2
     LEFT JOIN LATERAL (
       SELECT
         COUNT(*) FILTER (WHERE delivered_at IS NOT NULL AND user_id <> cm.sender_id)::INT AS delivered_count,
         COUNT(*) FILTER (WHERE seen_at IS NOT NULL AND user_id <> cm.sender_id)::INT AS seen_count
       FROM chat_message_reads
       WHERE message_id = cm.id
     ) stats ON TRUE
     WHERE cm.room_id = $1
       AND cmd.message_id IS NULL
       ${cursorSql}
     ORDER BY cm.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return rows;
};

const fetchMessageForUser = async (messageId, roomId, userId) => {
  const rows = await fetchMessageRows({ roomId, userId, limit: 1, offset: 0, messageId });
  return rows[0] ? normalizeMessage(rows[0], userId) : null;
};

const emitRoomUpdate = async (roomId, event, payload, senderId = null) => {
  // Build ONE payload with a single eventId ΓÇö prevents dedup bypass from double-emit
  const builtPayload = socketService.buildPayload(payload);
  const participants = await getRoomParticipants(roomId);

  // Emit to each participant's personal user_{id} room.
  // We do NOT emit to the shared chat_${roomId} room because:
  //   1) emitToUser persists to Redis for missed-event replay on reconnect
  //   2) emitToRoomRaw does NOT persist ΓÇö causing silent message loss
  //   3) Personal rooms are always joined on socket connect (reliable delivery)
  for (const participant of participants) {
    if (senderId && participant.user_id === senderId && event === socketService.EVENTS.CHAT_NEW) {
      continue; // Skip sender for new messages (they already have it via ACK)
    }
    // Use emitToUser (non-Raw) which persists to Redis before emitting
    socketService.emitToUser(participant.user_id, event, builtPayload.data);
  }
};

const markMessagesDelivered = async (roomId, userId) => {
  await query(
    `UPDATE chat_message_reads cmr
     SET delivered_at = COALESCE(delivered_at, NOW())
     FROM chat_messages cm
     WHERE cm.id = cmr.message_id
       AND cm.room_id = $1
       AND cmr.user_id = $2
       AND cm.sender_id <> $2
       AND cmr.delivered_at IS NULL`,
    [roomId, userId]
  );
};

const getMyRooms = async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;

    // Employees may only see direct HR conversations.
    let roomFilter = '';
    if (userRole === 'EMPLOYEE') {
      roomFilter = `
        AND EXISTS (
          SELECT 1 FROM chat_participants cp2
          JOIN users u2 ON u2.id = cp2.user_id
          WHERE cp2.room_id = cr.id
            AND cp2.user_id <> $1
            AND u2.role = 'HR'
        )
        AND NOT EXISTS (
          SELECT 1 FROM chat_participants cp3
          JOIN users u3 ON u3.id = cp3.user_id
          WHERE cp3.room_id = cr.id
            AND cp3.user_id <> $1
            AND u3.role <> 'HR'
        )
      `;
    }

    const { rows: rooms } = await query(
      `SELECT
         cr.id,
         cr.name,
         cr.type,
         cr.created_at,
         cp.is_admin,
         COALESCE(unread.unread_count, 0) AS unread_count,
         last_message.message AS last_message,
         last_message.created_at AS last_message_at,
         COALESCE(participants.participants, '[]'::json) AS participants
       FROM chat_rooms cr
       JOIN chat_participants cp
         ON cp.room_id = cr.id
        AND cp.user_id = $1
       ${roomFilter}
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::INT AS unread_count
         FROM chat_messages cm
         JOIN chat_message_reads cmr
           ON cmr.message_id = cm.id
          AND cmr.user_id = $1
         LEFT JOIN chat_message_deletions cmd
           ON cmd.message_id = cm.id
          AND cmd.user_id = $1
         WHERE cm.room_id = cr.id
           AND cm.sender_id <> $1
           AND cm.deleted_for_everyone_at IS NULL
           AND cmd.message_id IS NULL
           AND cmr.seen_at IS NULL
       ) unread ON TRUE
       LEFT JOIN LATERAL (
         SELECT
           CASE
             WHEN cm.deleted_for_everyone_at IS NOT NULL THEN 'Message deleted'
             ELSE cm.message
           END AS message,
           cm.created_at
         FROM chat_messages cm
         LEFT JOIN chat_message_deletions cmd
           ON cmd.message_id = cm.id
          AND cmd.user_id = $1
         WHERE cm.room_id = cr.id
           AND cmd.message_id IS NULL
         ORDER BY cm.created_at DESC
          LIMIT 1
        ) last_message ON TRUE
        LEFT JOIN LATERAL (
          SELECT json_agg(
            json_build_object(
              'id', p.user_id,
              'firstName', p.first_name,
              'lastName', p.last_name,
              'fullName', trim(p.first_name || ' ' || p.last_name),
              'email', p.email,
              'profilePicture', p.profile_picture,
              'role', p.role,
              'isAdmin', p.is_admin
            )
            ORDER BY p.role, p.first_name, p.last_name
          ) AS participants
          FROM (
            SELECT cp2.user_id, cp2.is_admin, u.first_name, u.last_name, u.email, u.profile_picture, u.role
            FROM chat_participants cp2
            JOIN users u ON u.id = cp2.user_id
            WHERE cp2.room_id = cr.id
          ) p
        ) participants ON TRUE
        ORDER BY COALESCE(last_message.created_at, cr.created_at) DESC`,
      [userId]
    );

    const roomsWithParticipants = rooms.map((room) => {
      const participants = Array.isArray(room.participants) ? room.participants : [];
      const otherParticipant = participants.find((participant) => participant.id !== userId);

      return {
        id: room.id,
        name:
          room.name ||
          (room.type === 'DIRECT' && otherParticipant
            ? otherParticipant.fullName
            : 'Group Chat'),
        type: room.type,
        isAdmin: room.is_admin,
        unreadCount: Number(room.unread_count || 0),
        lastMessage: room.last_message,
        lastMessageAt: room.last_message_at,
        createdAt: room.created_at,
        participants,
      };
    });

    res.json({ success: true, data: roomsWithParticipants });
  } catch (error) {
    logger.error('Get my rooms error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch chat rooms' });
  }
};

const getAvailableUsers = async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;

    let text = `
      SELECT id, first_name, last_name, email, profile_picture, role, department, position
      FROM users
      WHERE id <> $1 AND status = 'ACTIVE'
    `;

    if (userRole === 'EMPLOYEE') {
      text += ` AND role = 'HR'`;
    }

    text += ` ORDER BY role, first_name`;

    const { rows } = await query(text, [userId]);

    res.json({
      success: true,
      data: rows.map((user) => ({
        id: user.id,
        firstName: user.first_name,
        lastName: user.last_name,
        fullName: `${user.first_name} ${user.last_name}`.trim(),
        email: user.email,
        profilePicture: user.profile_picture,
        role: user.role,
        department: user.department,
        position: user.position
      }))
    });
  } catch (error) {
    logger.error('Get available users error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch users' });
  }
};

const createRoom = async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, type, participantIds } = req.body;
    const normalizedParticipantIds = [...new Set((participantIds || []).map(Number))]
      .filter((participantId) => Number.isInteger(participantId) && participantId !== userId);

    if (normalizedParticipantIds.length === 0) {
      return res.status(400).json({ success: false, message: 'At least one valid participant is required' });
    }

    // Employees can only chat with HR ΓÇö block attempts to create rooms with Admin
    if (req.user.role === 'EMPLOYEE') {
      const { rows: targetUsers } = await query(
        `SELECT id, role FROM users WHERE id = ANY($1::int[])`,
        [normalizedParticipantIds]
      );
      const hasNonHR = targetUsers.some(u => u.role !== 'HR');
      if (hasNonHR) {
        return res.status(403).json({ success: false, error: 'Employees can only chat with HR' });
      }
    }

    if (type === 'DIRECT' && normalizedParticipantIds.length !== 1) {
      return res.status(400).json({ success: false, message: 'Direct chats require exactly one participant' });
    }

    if (type === 'DIRECT') {
      const otherUserId = normalizedParticipantIds[0];
      const { rows: existing } = await query(
        `SELECT cr.id
         FROM chat_rooms cr
         JOIN chat_participants cp1 ON cp1.room_id = cr.id AND cp1.user_id = $1
         JOIN chat_participants cp2 ON cp2.room_id = cr.id AND cp2.user_id = $2
         WHERE cr.type = 'DIRECT'`,
        [userId, otherUserId]
      );

      if (existing.length > 0) {
        return res.json({ success: true, data: { id: existing[0].id }, message: 'Existing chat room found' });
      }
    }

    const trimmedName = typeof name === 'string' ? name.trim() : '';
    const roomName = trimmedName || (type === 'GROUP' ? `Group Chat ${new Date().toISOString()}` : '');

    const room = await transaction(async (client) => {
      const { rows: roomRows } = await client.query(
        `INSERT INTO chat_rooms (name, type, created_by, created_at)
         VALUES ($1, $2, $3, NOW())
         RETURNING *`,
        [roomName, type, userId]
      );

      const createdRoom = roomRows[0];
      const allParticipants = [userId, ...normalizedParticipantIds];
      for (const participantId of allParticipants) {
        await client.query(
          `INSERT INTO chat_participants (room_id, user_id, is_admin, joined_at)
           VALUES ($1, $2, $3, NOW())`,
          [createdRoom.id, participantId, participantId === userId]
        );
      }

      return createdRoom;
    });

    for (const participantId of normalizedParticipantIds) {
      socketService.emitToUser(participantId, socketService.EVENTS.CHAT_ROOM, { roomId: room.id });
    }

    res.status(201).json({ success: true, data: { id: room.id }, message: 'Chat room created' });
  } catch (error) {
    logger.error('Create room error:', error);
    res.status(500).json({ success: false, error: 'Failed to create chat room' });
  }
};

const getMessages = async (req, res) => {
  try {
    const roomId = Number(req.params.id);
    const userId = req.user.id;
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const page = Number(req.query.page) || 1;
    const offset = (page - 1) * limit;
    const since = typeof req.query.since === 'string' ? req.query.since : null;

    if (!(await assertParticipant(roomId, userId))) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    await markMessagesDelivered(roomId, userId);

    const rows = await fetchMessageRows({ roomId, userId, limit, offset, since });

    res.json({
      success: true,
      data: rows.reverse().map((row) => normalizeMessage(row, userId))
    });
  } catch (error) {
    logger.error('Get messages error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch messages' });
  }
};

const sendMessage = async (req, res) => {
  try {
    const roomId = Number(req.params.id);
    const userId = req.user.id;
    const message = String(req.body.message || '').trim();
    const tempId = typeof req.body.tempId === 'string' ? req.body.tempId : null;

    if (!message) {
      return res.status(400).json({ success: false, error: 'Message is required' });
    }

    if (!(await assertParticipant(roomId, userId))) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    // Employees can only send messages in rooms where the other participant is HR
    if (req.user.role === 'EMPLOYEE') {
      const { rows: roomParticipants } = await query(
        `SELECT u.role FROM chat_participants cp
         JOIN users u ON u.id = cp.user_id
         WHERE cp.room_id = $1 AND cp.user_id <> $2`,
        [roomId, userId]
      );
      const hasNonHR = roomParticipants.some(p => p.role !== 'HR');
      if (hasNonHR) {
        return res.status(403).json({ success: false, error: 'Employees can only message HR' });
      }
    }

    const createdMessageId = await transaction(async (client) => {
      if (tempId) {
        const { rows: existingRows } = await client.query(
          `SELECT id
           FROM chat_messages
           WHERE room_id = $1
             AND sender_id = $2
             AND client_temp_id = $3
           LIMIT 1`,
          [roomId, userId, tempId]
        );
        if (existingRows.length > 0) return existingRows[0].id;
      }

      const { rows: messageRows } = await client.query(
        `INSERT INTO chat_messages (
           room_id,
           sender_id,
           message,
           client_temp_id,
           created_at,
           updated_at,
           delete_everyone_expires_at
          )
          VALUES ($1, $2, $3, $4, NOW(), NOW(), NOW() + ($5 || ' minutes')::INTERVAL)
          ON CONFLICT (room_id, sender_id, client_temp_id)
          WHERE client_temp_id IS NOT NULL
          DO UPDATE SET updated_at = chat_messages.updated_at
          RETURNING id`,
        [roomId, userId, message, tempId, DELETE_FOR_EVERYONE_WINDOW_MINUTES]
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
          [messageRows[0].id, participant.user_id, participant.user_id === userId ? new Date() : null]
        );
      }

      return messageRows[0].id;
    });

    // Fetch full payload and emit to recipients ΓÇö run in background so
    // the HTTP response goes back to the sender immediately.
    const payload = await fetchMessageForUser(createdMessageId, roomId, userId);

    // Respond to sender right away ΓÇö don't wait for socket emission
    res.status(201).json({ success: true, data: payload });

    // Emit to other participants in background (non-blocking)
    emitRoomUpdate(roomId, socketService.EVENTS.CHAT_NEW, payload, userId).catch(() => {});
  } catch (error) {
    logger.error('Send message error:', error);
    res.status(500).json({ success: false, error: 'Failed to send message' });
  }
};

const editMessage = async (req, res) => {
  try {
    const roomId = Number(req.params.id);
    const messageId = Number(req.params.msgId);
    const userId = req.user.id;
    const message = String(req.body.message || '').trim();

    if (!message) {
      return res.status(400).json({ success: false, error: 'Message is required' });
    }

    const { rows } = await query(
      `SELECT id, sender_id
       FROM chat_messages
       WHERE id = $1 AND room_id = $2 AND deleted_for_everyone_at IS NULL`,
      [messageId, roomId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Message not found' });
    }

    if (rows[0].sender_id !== userId) {
      return res.status(403).json({ success: false, error: 'Can only edit your own messages' });
    }

    await query(
      `UPDATE chat_messages
       SET message = $1,
           is_edited = TRUE,
           edited_at = NOW(),
           updated_at = NOW()
       WHERE id = $2`,
      [message, messageId]
    );

    const updateData = {
      action: 'EDITED',
      id: messageId,
      roomId,
      message,
      isEdited: true,
      editedAt: new Date().toISOString()
    };

    await emitRoomUpdate(roomId, socketService.EVENTS.CHAT_UPDATE, updateData);

    res.json({ success: true, data: updateData });
  } catch (error) {
    logger.error('Edit message error:', error);
    res.status(500).json({ success: false, error: 'Failed to edit message' });
  }
};

const deleteMessage = async (req, res) => {
  try {
    const roomId = Number(req.params.id);
    const messageId = Number(req.params.msgId);
    const userId = req.user.id;
    const scope = String(req.query.scope || req.body?.scope || 'EVERYONE').toUpperCase();

    const { rows } = await query(
      `SELECT id, sender_id, deleted_for_everyone_at, delete_everyone_expires_at
       FROM chat_messages
       WHERE id = $1 AND room_id = $2`,
      [messageId, roomId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Message not found' });
    }

    const messageRow = rows[0];

    if (scope === 'ME') {
      await query(
        `INSERT INTO chat_message_deletions (message_id, user_id)
         VALUES ($1, $2)
         ON CONFLICT (message_id, user_id) DO NOTHING`,
        [messageId, userId]
      );

      const updateData = { action: 'DELETED_FOR_ME', id: messageId, roomId, scope: 'ME' };
      socketService.emitToUser(userId, socketService.EVENTS.CHAT_UPDATE, updateData);
      return res.json({ success: true, data: updateData });
    }

    if (messageRow.sender_id !== userId) {
      return res.status(403).json({ success: false, error: 'Can only delete your own messages for everyone' });
    }

    if (messageRow.deleted_for_everyone_at) {
      return res.status(400).json({ success: false, error: 'Message already deleted' });
    }

    if (!messageRow.delete_everyone_expires_at || new Date(messageRow.delete_everyone_expires_at) < new Date()) {
      return res.status(400).json({
        success: false,
        error: `Delete for everyone is only available for ${DELETE_FOR_EVERYONE_WINDOW_MINUTES} minutes`
      });
    }

    await query(
      `UPDATE chat_messages
       SET deleted_for_everyone_at = NOW(),
           updated_at = NOW()
       WHERE id = $1`,
      [messageId]
    );

    const updateData = {
      action: 'DELETED_FOR_EVERYONE',
      id: messageId,
      roomId,
      scope: 'EVERYONE'
    };

    await emitRoomUpdate(roomId, socketService.EVENTS.CHAT_UPDATE, updateData);

    res.json({ success: true, data: updateData });
  } catch (error) {
    logger.error('Delete message error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete message' });
  }
};

const markAsRead = async (req, res) => {
  try {
    const roomId = Number(req.params.id);
    const userId = req.user.id;

    if (!(await assertParticipant(roomId, userId))) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const { rows } = await query(
      `UPDATE chat_message_reads cmr
       SET delivered_at = COALESCE(cmr.delivered_at, NOW()),
           seen_at = COALESCE(cmr.seen_at, NOW())
       FROM chat_messages cm
       LEFT JOIN chat_message_deletions cmd
         ON cmd.message_id = cm.id
        AND cmd.user_id = $2
       WHERE cm.id = cmr.message_id
         AND cm.room_id = $1
         AND cm.sender_id <> $2
         AND cmr.user_id = $2
         AND cm.deleted_for_everyone_at IS NULL
         AND cmd.message_id IS NULL
         AND cmr.seen_at IS NULL
       RETURNING cm.id AS message_id, cm.sender_id`,
      [roomId, userId]
    );

    if (rows.length > 0) {
      const messageIds = rows.map((row) => row.message_id);
      const updateData = {
        action: 'READ_STATUS',
        roomId,
        messageIds,
        seenByUserId: userId,
        seenAt: new Date().toISOString()
      };
      await emitRoomUpdate(roomId, socketService.EVENTS.CHAT_UPDATE, updateData);
    }

    res.json({ success: true, message: 'Messages marked as read' });
  } catch (error) {
    logger.error('Mark as read error:', error);
    res.status(500).json({ success: false, error: 'Failed to mark messages as read' });
  }
};

const getUnreadCount = async (req, res) => {
  try {
    const userId = req.user.id;

    const { rows } = await query(
      `SELECT COUNT(*)::INT AS count
       FROM chat_messages cm
       JOIN chat_message_reads cmr
         ON cmr.message_id = cm.id
        AND cmr.user_id = $1
       LEFT JOIN chat_message_deletions cmd
         ON cmd.message_id = cm.id
        AND cmd.user_id = $1
       WHERE cm.sender_id <> $1
         AND cm.deleted_for_everyone_at IS NULL
         AND cmd.message_id IS NULL
         AND cmr.seen_at IS NULL`,
      [userId]
    );

    res.json({ success: true, data: { unreadCount: Number(rows[0].count || 0) } });
  } catch (error) {
    logger.error('Get unread count error:', error);
    res.status(500).json({ success: false, error: 'Failed to get unread count' });
  }
};

module.exports = {
  getMyRooms,
  getAvailableUsers,
  createRoom,
  getMessages,
  sendMessage,
  editMessage,
  deleteMessage,
  markAsRead,
  getUnreadCount
};
