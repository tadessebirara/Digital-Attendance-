const { query } = require('../../config/database');
const logger    = require('../../utils/logger');

/** GET /api/holidays?year=2026&month=6  — list holidays for a year or specific month */
const listHolidays = async (req, res) => {
  try {
    const year  = parseInt(req.query.year  || new Date().getFullYear(), 10);
    const month = req.query.month ? parseInt(req.query.month, 10) : null;

    const from = month
      ? `${year}-${String(month).padStart(2, '0')}-01`
      : `${year}-01-01`;
    const to = month
      ? new Date(year, month, 0).toISOString().split('T')[0]
      : `${year}-12-31`;

    // Use TO_CHAR to get a plain YYYY-MM-DD string — avoids UTC timezone offset
    // converting e.g. Jan 7 EAT → Jan 6 UTC when JavaScript calls .toISOString().
    // Recurring rows have date set to year-2000 sentinel so they NEVER appear here.
    const { rows: exact } = await query(
      `SELECT id, name, name_am,
              TO_CHAR(date, 'YYYY-MM-DD') AS date,
              type, religion, is_recurring, off_type, description
       FROM public_holidays
       WHERE date BETWEEN $1::date AND $2::date
         AND is_recurring = FALSE
       ORDER BY date`,
      [from, to]
    );

    const { rows: recurring } = await query(
      `SELECT id, name, name_am, recurring_month, recurring_day,
              type, religion, off_type, description
       FROM public_holidays
       WHERE is_recurring = TRUE
         AND ($1::int IS NULL OR recurring_month = $1)
       ORDER BY recurring_month, recurring_day`,
      [month ?? null]
    );

    // Build a set of date+name combos already covered by exact rows so we can
    // deduplicate recurring expansions that land on the same date as an exact row.
    const exactKeys = new Set(exact.map(r => `${r.date}|${r.name}`));
    const exactDates = new Set(exact.map(r => r.date));

    const expandedRecurring = recurring
      .map(r => {
        const d = `${year}-${String(r.recurring_month).padStart(2, '0')}-${String(r.recurring_day).padStart(2, '0')}`;
        return {
          id:          r.id,
          name:        r.name,
          nameAm:      r.name_am,
          date:        d,
          type:        r.type,
          religion:    r.religion,
          isRecurring: true,
          offType:     r.off_type || 'FULL_DAY',
          description: r.description,
        };
      })
      // Skip if an exact row already covers this date (regardless of name)
      // to avoid showing two entries for the same calendar day.
      .filter(r => !exactDates.has(r.date) && !exactKeys.has(`${r.date}|${r.name}`));

    const all = [
      ...exact.map(r => ({
        id:          r.id,
        name:        r.name,
        nameAm:      r.name_am,
        date:        r.date,           // already YYYY-MM-DD from TO_CHAR
        type:        r.type,
        religion:    r.religion,
        isRecurring: r.is_recurring,
        offType:     r.off_type || 'FULL_DAY',
        description: r.description,
      })),
      ...expandedRecurring,
    ].sort((a, b) => a.date.localeCompare(b.date));

    res.json({ success: true, data: all });
  } catch (err) {
    logger.error('listHolidays error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to fetch holidays' });
  }
};

/** GET /api/holidays/today — is today a holiday? */
const todayHoliday = async (req, res) => {
  try {
    const now   = new Date();
    const month = now.getMonth() + 1;
    const day   = now.getDate();
    // Use TO_CHAR to avoid UTC offset shifting dates (e.g. EAT = UTC+3)
    const dateStr = `${now.getFullYear()}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;

    const { rows } = await query(
      `SELECT id, name, name_am, TO_CHAR(date,'YYYY-MM-DD') AS date,
              type, religion, off_type, description
       FROM public_holidays
       WHERE (is_recurring = FALSE AND TO_CHAR(date,'YYYY-MM-DD') = $1)
          OR (is_recurring = TRUE  AND recurring_month = $2 AND recurring_day = $3)
       LIMIT 1`,
      [dateStr, month, day]
    );

    if (rows.length === 0) {
      return res.json({ success: true, data: { isHoliday: false } });
    }
    const h = rows[0];
    res.json({
      success: true,
      data: {
        isHoliday: true,
        holiday: {
          id:          h.id,
          name:        h.name,
          nameAm:      h.name_am,
          type:        h.type,
          religion:    h.religion,
          offType:     h.off_type || 'FULL_DAY',
          description: h.description,
        },
      },
    });
  } catch (err) {
    logger.error('todayHoliday error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to check holiday' });
  }
};

/** POST /api/holidays — create a new holiday (HR/Admin only) */
const createHoliday = async (req, res) => {
  try {
    const { name, nameAm, date, type = 'NATIONAL', religion, isRecurring = false, offType = 'FULL_DAY', description } = req.body;
    if (!name || !date) return res.status(400).json({ success: false, error: 'name and date are required' });

    const d = new Date(date);
    const recurMonth = isRecurring ? (d.getMonth() + 1) : null;
    const recurDay   = isRecurring ? d.getDate()         : null;

    const storeDate = isRecurring && recurMonth && recurDay
      ? `2000-${String(recurMonth).padStart(2,'0')}-${String(recurDay).padStart(2,'0')}`
      : date;

    const { rows } = await query(
      `INSERT INTO public_holidays (name, name_am, date, type, religion, is_recurring, recurring_month, recurring_day, off_type, description)
       VALUES ($1,$2,$3::date,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [name, nameAm || null, storeDate, type, religion || null, isRecurring, recurMonth, recurDay, offType, description || null]
    );

    // Bust the backend holiday cache so the next attendance check uses this new holiday
    const { _holidayCache } = require('../../services/schedule.service');
    if (_holidayCache) _holidayCache.clear();

    // Notify all mobile clients — schedule provider will re-fetch holidays
    const io = req.app.get('io');
    if (io) io.emit('config:update', { source: 'holiday_created' });

    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ success: false, error: 'A holiday already exists on that date' });
    logger.error('createHoliday error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to create holiday' });
  }
};

/** PUT /api/holidays/:id */
const updateHoliday = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, nameAm, date, type, religion, isRecurring, offType, description } = req.body;
    const d = date ? new Date(date) : null;
    const recurMonth = isRecurring && d ? (d.getMonth() + 1) : null;
    const recurDay   = isRecurring && d ? d.getDate() : null;

    const { rows } = await query(
      `UPDATE public_holidays
       SET name = COALESCE($1, name),
           name_am = COALESCE($2, name_am),
           date = COALESCE($3::date, date),
           type = COALESCE($4, type),
           religion = COALESCE($5, religion),
           is_recurring = COALESCE($6, is_recurring),
           recurring_month = COALESCE($7, recurring_month),
           recurring_day   = COALESCE($8, recurring_day),
           off_type = COALESCE($9, off_type),
           description = COALESCE($10, description)
       WHERE id = $11
       RETURNING *`,
      [name||null, nameAm||null, date||null, type||null, religion||null,
       isRecurring??null, recurMonth, recurDay, offType||null, description||null, id]
    );
    if (rows.length === 0) return res.status(404).json({ success: false, error: 'Holiday not found' });

    // Bust backend holiday cache and notify mobile clients
    const { _holidayCache } = require('../../services/schedule.service');
    if (_holidayCache) _holidayCache.clear();
    const io = req.app.get('io');
    if (io) io.emit('config:update', { source: 'holiday_updated' });

    res.json({ success: true, data: rows[0] });
  } catch (err) {
    logger.error('updateHoliday error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to update holiday' });
  }
};

/** DELETE /api/holidays/:id */
const deleteHoliday = async (req, res) => {
  try {
    const { rows } = await query('DELETE FROM public_holidays WHERE id = $1 RETURNING id', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ success: false, error: 'Holiday not found' });

    // Bust backend holiday cache and notify mobile clients
    const { _holidayCache } = require('../../services/schedule.service');
    if (_holidayCache) _holidayCache.clear();
    const io = req.app.get('io');
    if (io) io.emit('config:update', { source: 'holiday_deleted' });

    res.json({ success: true, message: 'Holiday deleted' });
  } catch (err) {
    logger.error('deleteHoliday error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to delete holiday' });
  }
};

module.exports = { listHolidays, todayHoliday, createHoliday, updateHoliday, deleteHoliday };
