const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { authenticate, authorize } = require('../../middleware/auth.middleware');
const { query } = require('../../config/database');
const { auditLog } = require('../../services/audit.service');
const logger = require('../../utils/logger');

const router = express.Router();
router.use(authenticate);

// Store uploads in /uploads/leave-documents on disk
const UPLOAD_DIR = path.join(__dirname, '../../../../uploads/leave-documents');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = `leave_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`;
    cb(null, name);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['.pdf', '.jpg', '.jpeg', '.png', '.doc', '.docx'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF, JPG, PNG, DOC, DOCX files are allowed'));
    }
  },
});

// POST /api/uploads/leave-document
router.post('/leave-document', upload.single('document'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }
    // Return a URL the client can store and HR can later view
    const fileUrl = `${process.env.BASE_URL || `${req.protocol}://${req.get('host')}`}/uploads/leave-documents/${req.file.filename}`;
    logger.info(`Leave document uploaded: ${req.file.filename} by user ${req.user.id}`);
    res.json({
      success: true,
      data: {
        url: fileUrl,
        filename: req.file.filename,
        originalName: req.file.originalname,
        size: req.file.size,
      },
    });
  } catch (err) {
    logger.error('Upload error:', err);
    res.status(500).json({ success: false, error: 'Upload failed' });
  }
});

// ── Employee documents (HR/Admin only) ────────────────────────────────────────
const EMP_DOC_DIR = path.join(__dirname, '../../../../uploads/employee-documents');
if (!fs.existsSync(EMP_DOC_DIR)) fs.mkdirSync(EMP_DOC_DIR, { recursive: true });

const empDocStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, EMP_DOC_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `emp_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`);
  },
});
const empDocUpload = multer({
  storage: empDocStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.pdf','.jpg','.jpeg','.png','.doc','.docx'].includes(ext)) cb(null, true);
    else cb(new Error('Only PDF, JPG, PNG, DOC, DOCX files are allowed'));
  },
});

const VALID_DOC_TYPES = ['CV_RESUME','EMPLOYMENT_CONTRACT','NATIONAL_ID','CERTIFICATE','OTHER'];

// GET /api/uploads/employee-documents/:userId
router.get('/employee-documents/:userId', authorize('ADMIN', 'HR'), async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, doc_type, label, file_url, file_name, file_size, created_at,
              u.first_name || ' ' || u.last_name AS uploaded_by_name
       FROM employee_documents ed
       JOIN users u ON u.id = ed.uploaded_by
       WHERE ed.user_id = $1
       ORDER BY ed.created_at DESC`,
      [req.params.userId]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    logger.error('Get employee documents error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch documents' });
  }
});

// POST /api/uploads/employee-documents/:userId
router.post('/employee-documents/:userId', authorize('ADMIN', 'HR'), empDocUpload.single('document'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });
    const docType = req.body.docType || 'OTHER';
    if (!VALID_DOC_TYPES.includes(docType))
      return res.status(400).json({ success: false, error: 'Invalid document type' });
    const label = req.body.label || req.file.originalname;
    const fileUrl = `${process.env.BASE_URL || `${req.protocol}://${req.get('host')}`}/uploads/employee-documents/${req.file.filename}`;
    const { rows } = await query(
      `INSERT INTO employee_documents (user_id, uploaded_by, doc_type, label, file_url, file_name, file_size)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [req.params.userId, req.user.id, docType, label, fileUrl, req.file.originalname, req.file.size]
    );
    await auditLog(req.user.id, 'EMPLOYEE_DOCUMENT_UPLOADED', 'employee_documents', rows[0].id,
      { userId: req.params.userId, docType, label }, req);
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    logger.error('Employee document upload error:', err);
    res.status(500).json({ success: false, error: 'Upload failed' });
  }
});

// DELETE /api/uploads/employee-documents/:userId/:docId
router.delete('/employee-documents/:userId/:docId', authorize('ADMIN', 'HR'), async (req, res) => {
  try {
    const { rows } = await query(
      `DELETE FROM employee_documents WHERE id = $1 AND user_id = $2 RETURNING file_name`,
      [req.params.docId, req.params.userId]
    );
    if (!rows.length) return res.status(404).json({ success: false, error: 'Document not found' });
    // Remove physical file
    const filePath = path.join(EMP_DOC_DIR, rows[0].file_name);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    res.json({ success: true, message: 'Document deleted' });
  } catch (err) {
    logger.error('Delete employee document error:', err);
    res.status(500).json({ success: false, error: 'Failed to delete document' });
  }
});

// Multer error handler
router.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError || err.message) {
    return res.status(400).json({ success: false, error: err.message });
  }
  res.status(500).json({ success: false, error: 'Upload failed' });
});

module.exports = router;
