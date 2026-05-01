// ============================================================
// src/modules/comments/comment.standalone.routes.js
// ============================================================

const express      = require('express');
const router       = express.Router();
const controller   = require('./comment.controller');
const authenticate = require('../../middleware/auth');

router.use(authenticate);

// PUT  /api/comments/:id
router.put('/:id',    controller.editComment);
// DELETE /api/comments/:id
router.delete('/:id', controller.deleteComment);

module.exports = router;
