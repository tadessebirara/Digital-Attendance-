/**
 * salary.controller.js
 * Handles all salary & penalty API endpoints.
 * Access: ADMIN and HR only — enforced at the route level.
 */

const { query } = require('../../config/database');
const logger = require('../../utils/logger');
const { auditLog } = require('../../services/audit.service');
const salaryService = require('../../services/salary.service');

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseYearMonth(req) {
  const now = new Date();
  const year  = parseInt(req.query.year  || now.getFullYear(),  10);
  const month = parseInt(req.query.month || (now.getMonth() + 1), 10);
  if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
    throw Object.assign(new Error('Invalid year or month'), { statusCode: 400 });
  }
  return { year, month };
}

// ── Penalty Settings ──────────────────────────────────────────────────────────

/** GET /api/salary/penalty-settings */
const getPenaltySettings = async (req, res) => {
  try {
    const cfg = await salaryService.loadPenaltyConfig();
    res.json({ success: true, data: cfg });
  } catch (error) {
    logger.error('getPenaltySettings error:', error);
    res.status(500).json({ success: false, error: 'Failed to load penalty settings' });
  }
};

/** PUT /api/salary/penalty-settings */
const updatePenaltySettings = async (req, res) => {
  try {
    const {
      absenceUnit,   // PER_DAY | PER_ABSENCE_RECORD
      absenceType,   // FIXED | PERCENTAGE
      absenceValue,  // number
      lateUnit,      // PER_MINUTE | PER_HOUR
      lateType,      // FIXED | PERCENTAGE
      lateValue,     // number
    } = req.body;

    const validAbsUnit  = ['PER_DAY', 'PER_ABSENCE_RECORD'];
    const validLateUnit = ['PER_MINUTE', 'PER_HOUR'];
    const validType     = ['FIXED', 'PERCENTAGE'];

    if (absenceUnit  && !validAbsUnit.includes(absenceUnit))  return res.status(400).json({ success: false, error: 'Invalid absenceUnit' });
    if (absenceType  && !validType.includes(absenceType))     return res.status(400).json({ success: false, error: 'Invalid absenceType' });
    if (lateUnit     && !validLateUnit.includes(lateUnit))    return res.status(400).json({ success: false, error: 'Invalid lateUnit' });
    if (lateType     && !validType.includes(lateType))        return res.status(400).json({ success: false, error: 'Invalid lateType' });

    const saves = [
      ['penalty_absence_unit',  absenceUnit],
      ['penalty_absence_type',  absenceType],
      ['penalty_absence_value', absenceValue != null ? String(absenceValue) : null],
      ['penalty_late_unit',     lateUnit],
      ['penalty_late_type',     lateType],
      ['penalty_late_value',    lateValue != null ? String(lateValue) : null],
    ].filter(([, v]) => v != null);

    for (const [key, value] of saves) {
      await query(
        `INSERT INTO system_settings (setting_key, setting_value, updated_by, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (setting_key)
         DO UPDATE SET setting_value = $2, updated_by = $3, updated_at = NOW()`,
        [key, value, req.user.id]
      );
    }

    await auditLog(req.user.id, 'PENALTY_SETTINGS_UPDATED', 'system_settings', null, { saves: saves.map(([k]) => k) }, req);

    // Notify mobile clients — salary/penalty settings affect attendance deductions
    const io = req.app.get('io');
    if (io) io.emit('config:update', { source: 'penalty_settings_updated' });

    res.json({ success: true, message: 'Penalty settings saved' });
  } catch (error) {
    logger.error('updatePenaltySettings error:', error);
    res.status(500).json({ success: false, error: 'Failed to save penalty settings' });
  }
};

// ── Employee Salary ───────────────────────────────────────────────────────────

/** GET /api/salary/employees  — list all employees with their base salary */
const getEmployeeSalaries = async (req, res) => {
  try {
    const { department, search, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let where = [`role = 'EMPLOYEE'`, `status = 'ACTIVE'`];
    const params = [];
    let idx = 1;

    if (department) { where.push(`department = $${idx++}`); params.push(department); }
    if (search) {
      where.push(`(first_name ILIKE $${idx} OR last_name ILIKE $${idx} OR employee_id ILIKE $${idx})`);
      params.push(`%${search}%`);
      idx++;
    }

    const whereClause = 'WHERE ' + where.join(' AND ');

    const { rows: total } = await query(`SELECT COUNT(*) FROM users ${whereClause}`, params);
    const { rows: employees } = await query(
      `SELECT id, first_name, last_name, employee_id, department, position,
              monthly_salary, email
       FROM users ${whereClause}
       ORDER BY first_name
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, parseInt(limit), offset]
    );

    res.json({
      success: true,
      data: employees.map(e => ({
        id: e.id,
        firstName: e.first_name,
        lastName: e.last_name,
        fullName: `${e.first_name} ${e.last_name}`,
        employeeId: e.employee_id,
        department: e.department,
        position: e.position,
        monthlySalary: parseFloat(e.monthly_salary || '0'),
      })),
      meta: {
        total: parseInt(total[0].count),
        page: parseInt(page),
        limit: parseInt(limit),
      },
    });
  } catch (error) {
    logger.error('getEmployeeSalaries error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch employees' });
  }
};

/** PUT /api/salary/employees/:id  — update employee base salary */
const updateEmployeeSalary = async (req, res) => {
  try {
    const { id } = req.params;
    const { monthlySalary } = req.body;

    if (monthlySalary == null || isNaN(parseFloat(monthlySalary)) || parseFloat(monthlySalary) < 0) {
      return res.status(400).json({ success: false, error: 'Invalid salary value' });
    }

    const { rows } = await query(
      `UPDATE users SET monthly_salary = $1, updated_at = NOW()
       WHERE id = $2 AND role = 'EMPLOYEE'
       RETURNING id, first_name, last_name, monthly_salary`,
      [parseFloat(monthlySalary), id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Employee not found' });
    }

    await auditLog(req.user.id, 'EMPLOYEE_SALARY_UPDATED', 'users', parseInt(id), {
      monthlySalary: parseFloat(monthlySalary),
    }, req);

    res.json({
      success: true,
      message: 'Salary updated',
      data: { id: rows[0].id, monthlySalary: parseFloat(rows[0].monthly_salary) },
    });
  } catch (error) {
    logger.error('updateEmployeeSalary error:', error);
    res.status(500).json({ success: false, error: 'Failed to update salary' });
  }
};

// ── Monthly Payroll ───────────────────────────────────────────────────────────

/** GET /api/salary/payroll?year=2025&month=6  — full payroll for the month */
const getMonthlyPayroll = async (req, res) => {
  try {
    const { year, month } = parseYearMonth(req);
    const results = await salaryService.calculateMonthlySalaryReport(year, month);
    res.json({ success: true, data: results, meta: { year, month, count: results.length } });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ success: false, error: error.message });
    logger.error('getMonthlyPayroll error:', error);
    res.status(500).json({ success: false, error: 'Failed to calculate payroll' });
  }
};

/** GET /api/salary/payroll/:userId?year=2025&month=6  — one employee */
const getEmployeePayroll = async (req, res) => {
  try {
    const { userId } = req.params;
    const { year, month } = parseYearMonth(req);
    const result = await salaryService.calculateEmployeeSalary(parseInt(userId), year, month);
    res.json({ success: true, data: result });
  } catch (error) {
    if (error.code === 'NOT_FOUND') return res.status(404).json({ success: false, error: error.message });
    if (error.statusCode) return res.status(error.statusCode).json({ success: false, error: error.message });
    logger.error('getEmployeePayroll error:', error);
    res.status(500).json({ success: false, error: 'Failed to calculate payroll' });
  }
};

// ── Export ────────────────────────────────────────────────────────────────────

/** GET /api/salary/export?year=2025&month=6&format=xlsx|csv */
const exportPayroll = async (req, res) => {
  try {
    const { year, month } = parseYearMonth(req);
    const format = (req.query.format || 'xlsx').toLowerCase();
    if (!['xlsx', 'csv'].includes(format)) {
      return res.status(400).json({ success: false, error: 'format must be xlsx or csv' });
    }

    const rows = await salaryService.calculateMonthlySalaryReport(year, month);
    const monthLabel = new Date(year, month - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });

    const headers = [
      'Employee ID', 'Employee Name', 'Department', 'Base Salary (ETB)',
      'Absent Days', 'Half Days', 'Late Days', 'Total Late Minutes',
      'Absence Deduction (ETB)', 'Late Deduction (ETB)',
      'Total Deductions (ETB)', 'Net Salary (ETB)',
    ];

    const dataRows = rows.map(r => [
      r.employeeId || '',
      r.fullName,
      r.department || '',
      r.baseSalary.toFixed(2),
      r.absentDays,
      r.halfDays,
      r.lateDays,
      r.totalLateMinutes,
      r.absenceDeduction.toFixed(2),
      r.lateDeduction.toFixed(2),
      r.totalDeductions.toFixed(2),
      r.netSalary.toFixed(2),
    ]);

    if (format === 'csv') {
      const escape = (v) => `"${String(v).replace(/"/g, '""')}"`;
      const csv = [
        `# Salary Report — ${monthLabel}`,
        headers.map(escape).join(','),
        ...dataRows.map(r => r.map(escape).join(',')),
      ].join('\r\n');

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="salary_${year}_${String(month).padStart(2,'0')}.csv"`);
      return res.send('\uFEFF' + csv); // BOM for Excel UTF-8
    }

    // ── Excel (xlsx via exceljs) ──────────────────────────────────────────────
    let ExcelJS;
    try {
      ExcelJS = require('exceljs');
    } catch {
      return res.status(500).json({ success: false, error: 'exceljs not installed. Run: npm install exceljs' });
    }

    const workbook  = new ExcelJS.Workbook();
    workbook.creator = 'Alyah Smart Attendance';
    workbook.created  = new Date();
    const sheet = workbook.addWorksheet(`Salary ${monthLabel}`);

    // Title row
    sheet.mergeCells('A1:L1');
    const titleCell = sheet.getCell('A1');
    titleCell.value = `Salary Report — ${monthLabel}`;
    titleCell.font = { bold: true, size: 14 };
    titleCell.alignment = { horizontal: 'center' };

    // Header row
    sheet.addRow(headers);
    const headerRow = sheet.getRow(2);
    headerRow.eachCell(cell => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = {
        top:    { style: 'thin' }, bottom: { style: 'thin' },
        left:   { style: 'thin' }, right:  { style: 'thin' },
      };
    });
    headerRow.height = 24;

    // Data rows
    for (let i = 0; i < dataRows.length; i++) {
      const row = sheet.addRow(dataRows[i]);
      const fillColor = i % 2 === 0 ? 'FFF8FAFC' : 'FFFFFFFF';
      row.eachCell(cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillColor } };
        cell.border = {
          top:    { style: 'thin', color: { argb: 'FFE2E8F0' } },
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          left:   { style: 'thin', color: { argb: 'FFE2E8F0' } },
          right:  { style: 'thin', color: { argb: 'FFE2E8F0' } },
        };
      });
    }

    // Totals row
    const totalsRow = sheet.addRow([
      '', 'TOTAL', '',
      rows.reduce((s, r) => s + r.baseSalary, 0).toFixed(2),
      rows.reduce((s, r) => s + r.absentDays, 0),
      rows.reduce((s, r) => s + r.halfDays, 0),
      rows.reduce((s, r) => s + r.lateDays, 0),
      rows.reduce((s, r) => s + r.totalLateMinutes, 0),
      rows.reduce((s, r) => s + r.absenceDeduction, 0).toFixed(2),
      rows.reduce((s, r) => s + r.lateDeduction, 0).toFixed(2),
      rows.reduce((s, r) => s + r.totalDeductions, 0).toFixed(2),
      rows.reduce((s, r) => s + r.netSalary, 0).toFixed(2),
    ]);
    totalsRow.eachCell(cell => {
      cell.font = { bold: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };
    });

    // Column widths
    const colWidths = [14, 28, 18, 20, 13, 11, 11, 20, 24, 22, 24, 20];
    sheet.columns.forEach((col, i) => { col.width = colWidths[i] || 16; });

    // Freeze header rows
    sheet.views = [{ state: 'frozen', ySplit: 2 }];

    const buf = await workbook.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="salary_${year}_${String(month).padStart(2,'0')}.xlsx"`);
    return res.send(Buffer.from(buf));
  } catch (error) {
    logger.error('exportPayroll error:', error);
    res.status(500).json({ success: false, error: 'Failed to export payroll' });
  }
};

module.exports = {
  getPenaltySettings,
  updatePenaltySettings,
  getEmployeeSalaries,
  updateEmployeeSalary,
  getMonthlyPayroll,
  getEmployeePayroll,
  exportPayroll,
};
