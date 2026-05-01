// ============================================================
// src/modules/comments/comment.controller.js
// ============================================================

const commentService = require('./comment.service');

// GET /api/tasks/:taskId/comments
const getComments = async (req, res) => {
  try {
    const comments = await commentService.getComments(req.params.taskId, req.user);
    res.json({ success: true, comments });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

// POST /api/tasks/:taskId/comments
const addComment = async (req, res) => {
  try {
    const comment = await commentService.addComment({
      taskId:    req.params.taskId,
      requester: req.user,
      comment:   req.body.comment,
      ip:        req.ip,
    });
    res.status(201).json({ success: true, message: 'Comment added.', comment });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

// PUT /api/comments/:id
const editComment = async (req, res) => {
  try {
    const comment = await commentService.editComment({
      commentId: req.params.id,
      requester: req.user,
      comment:   req.body.comment,
      ip:        req.ip,
    });
    res.json({ success: true, message: 'Comment updated.', comment });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

// DELETE /api/comments/:id
const deleteComment = async (req, res) => {
  try {
    const result = await commentService.deleteComment({
      commentId: req.params.id,
      requester: req.user,
      ip:        req.ip,
    });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

module.exports = { getComments, addComment, editComment, deleteComment };
