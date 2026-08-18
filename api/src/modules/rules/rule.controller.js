const { query } = require('../../config/database');
const logger = require('../../utils/logger');
const { auditLog } = require('../../services/audit.service');

// Get all rules
const getAllRules = async (req, res) => {
  try {
    const { rows: rules } = await query(
      'SELECT * FROM attendance_rules WHERE is_active = true ORDER BY priority DESC'
    );

    res.json({
      success: true,
      data: rules.map(r => ({
        id: r.id,
        ruleName: r.rule_name,
        ruleType: r.rule_type,
        description: r.description,
        conditionJson: r.condition_json,
        actionJson: r.action_json,
        priority: r.priority,
        isActive: r.is_active
      }))
    });
  } catch (error) {
    logger.error('Get all rules error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch rules' });
  }
};

// Create rule
const createRule = async (req, res) => {
  try {
    const { ruleName, ruleType, description, conditionJson, actionJson, priority } = req.body;

    const { rows: rules } = await query(
      `INSERT INTO attendance_rules (rule_name, rule_type, description, condition_json, action_json, priority, is_active, created_by, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, true, $7, NOW())
       RETURNING *`,
      [ruleName, ruleType, description, JSON.stringify(conditionJson), JSON.stringify(actionJson), priority, req.user.id]
    );

    await auditLog(req.user.id, 'RULE_CREATED', 'attendance_rules', rules[0].id, { ruleName, ruleType }, req);

    res.status(201).json({
      success: true,
      data: rules[0]
    });
  } catch (error) {
    logger.error('Create rule error:', error);
    res.status(500).json({ success: false, error: 'Failed to create rule' });
  }
};

// Update rule
const updateRule = async (req, res) => {
  try {
    const { id } = req.params;
    const { ruleName, ruleType, description, conditionJson, actionJson, priority, isActive } = req.body;

    const { rows: rules } = await query(
      `UPDATE attendance_rules 
       SET rule_name = COALESCE($1, rule_name),
           rule_type = COALESCE($2, rule_type),
           description = COALESCE($3, description),
           condition_json = COALESCE($4, condition_json),
           action_json = COALESCE($5, action_json),
           priority = COALESCE($6, priority),
           is_active = COALESCE($7, is_active),
           updated_at = NOW()
       WHERE id = $8
       RETURNING *`,
      [ruleName, ruleType, description, conditionJson ? JSON.stringify(conditionJson) : null, 
       actionJson ? JSON.stringify(actionJson) : null, priority, isActive, id]
    );

    if (rules.length === 0) {
      return res.status(404).json({ success: false, error: 'Rule not found' });
    }

    res.json({
      success: true,
      data: rules[0]
    });
  } catch (error) {
    logger.error('Update rule error:', error);
    res.status(500).json({ success: false, error: 'Failed to update rule' });
  }
};

// Delete rule
const deleteRule = async (req, res) => {
  try {
    const { id } = req.params;

    await query('DELETE FROM attendance_rules WHERE id = $1', [id]);

    await auditLog(req.user.id, 'RULE_DELETED', 'attendance_rules', parseInt(id), {}, req);

    res.json({ success: true, message: 'Rule deleted' });
  } catch (error) {
    logger.error('Delete rule error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete rule' });
  }
};

module.exports = {
  getAllRules,
  createRule,
  updateRule,
  deleteRule
};
