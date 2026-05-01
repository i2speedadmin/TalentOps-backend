// ============================================================
// src/modules/comments/comment.routes.js
// ============================================================

const express      = require('express');
const router       = express.Router({ mergeParams: true }); // mergeParams for :taskId
const controller   = require('./comment.controller');
const authenticate = require('../../middleware/auth');

router.use(authenticate);

// Nested under /api/tasks/:taskId/comments
router.get('/',    controller.getComments);
router.post('/',   controller.addComment);

module.exports = router;
