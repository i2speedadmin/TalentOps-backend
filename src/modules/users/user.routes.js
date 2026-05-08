// ============================================================
// src/modules/users/user.routes.js
// ============================================================

const express      = require('express');
const router       = express.Router();
const multer       = require('multer');
const path         = require('path');
const fs           = require('fs');
const controller   = require('./user.controller');
const authenticate = require('../../middleware/auth');
const { allowMinRole } = require('../../middleware/role');

// ─── Multer config for profile pictures ──────────────────────
const uploadDir = path.join(__dirname, '../../uploads/profiles');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename:    (req, file, cb) => {
    const ext  = path.extname(file.originalname).toLowerCase();
    const name = `profile_${req.user.id}_${Date.now()}${ext}`;
    cb(null, name);
  },
});

const fileFilter = (req, file, cb) => {
  const allowed = ['.jpg', '.jpeg', '.png', '.webp'];
  const ext     = path.extname(file.originalname).toLowerCase();
  if (allowed.includes(ext)) cb(null, true);
  else cb(new Error('Only image files are allowed (jpg, jpeg, png, webp).'));
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 3 * 1024 * 1024 }, // 3MB
});

// ─── All routes require authentication ───────────────────────
router.use(authenticate);

// Profile (self) — any authenticated user
router.put('/profile/me', upload.single('profile_pic'), controller.updateProfile);

// Managers dropdown
router.get('/managers/list', controller.getManagers);

// User CRUD — team_leader and above
router.get('/',    allowMinRole('team_leader'), controller.getAllUsers);
router.post('/',   allowMinRole('team_leader'), controller.createUser);
router.get('/:id', allowMinRole('team_leader'), controller.getUserById);
router.put('/:id', allowMinRole('team_leader'), controller.updateUser);

// Delete — manager and above
router.delete('/:id', allowMinRole('manager'), controller.deleteUser);

// Reset password — manager and above
router.post('/:id/reset-password', allowMinRole('manager'), controller.resetUserPassword);

module.exports = router;
