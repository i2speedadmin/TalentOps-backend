// ============================================================
// src/modules/files/file.routes.js
// ============================================================

const express      = require('express');
const router       = express.Router({ mergeParams: true }); // for :taskId
const standaloneRouter = express.Router();
const multer       = require('multer');
const path         = require('path');
const fs           = require('fs');
const controller   = require('./file.controller');
const authenticate = require('../../middleware/auth');

// ─── Upload directory ─────────────────────────────────────────
const uploadDir = path.join(__dirname, '../../uploads/tasks');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// ─── Allowed file types ───────────────────────────────────────
const ALLOWED_MIME = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain', 'text/csv',
  'application/zip',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
];

const ALLOWED_EXT = [
  '.jpg', '.jpeg', '.png', '.webp', '.gif',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx',
  '.txt', '.csv', '.zip', '.ppt', '.pptx',
];

// ─── Multer storage ───────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename:    (req, file, cb) => {
    const ext  = path.extname(file.originalname).toLowerCase();
    const name = `task_${req.params.taskId || 'file'}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}${ext}`;
    cb(null, name);
  },
});

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ALLOWED_EXT.includes(ext) && ALLOWED_MIME.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE',
      `File type not allowed: ${ext}. Allowed: ${ALLOWED_EXT.join(', ')}`));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize:  parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024, // 10MB
    files:     5, // max 5 files per upload
  },
});

// ─── Error handler for multer ─────────────────────────────────
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ success: false, message: 'File too large. Maximum size is 10MB.' });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ success: false, message: 'Too many files. Maximum 5 per upload.' });
    }
    return res.status(400).json({ success: false, message: err.message });
  }
  next(err);
};

// ─── Nested routes: /api/tasks/:taskId/files ─────────────────
router.use(authenticate);
router.get('/',  controller.getFiles);
router.post('/', upload.array('files', 5), handleMulterError, controller.uploadFiles);

// ─── Standalone routes: /api/files/:id ───────────────────────
standaloneRouter.use(authenticate);
standaloneRouter.get('/:id/download', controller.downloadFile);
standaloneRouter.delete('/:id',       controller.deleteFile);

module.exports        = router;
module.exports.standalone = standaloneRouter;
