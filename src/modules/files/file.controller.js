// ============================================================
// src/modules/files/file.controller.js
// ============================================================

const fileService = require('./file.service');
const path        = require('path');

// GET /api/tasks/:taskId/files
const getFiles = async (req, res) => {
  try {
    const files = await fileService.getFiles(req.params.taskId, req.user);
    res.json({ success: true, files });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

// POST /api/tasks/:taskId/files
const uploadFiles = async (req, res) => {
  try {
    if (!req.files || !req.files.length) {
      return res.status(400).json({ success: false, message: 'No files uploaded.' });
    }
    const files = await fileService.uploadFiles({
      taskId:    req.params.taskId,
      requester: req.user,
      files:     req.files,
      ip:        req.ip,
    });
    res.status(201).json({ success: true, message: `${files.length} file(s) uploaded.`, files });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

// DELETE /api/files/:id
const deleteFile = async (req, res) => {
  try {
    const result = await fileService.deleteFile({
      fileId:    req.params.id,
      requester: req.user,
      ip:        req.ip,
    });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

// GET /api/files/:id/download
const downloadFile = async (req, res) => {
  try {
    const { filePath, originalName, mimeType } = await fileService.getFilePath(
      req.params.id, req.user
    );
    res.setHeader('Content-Disposition', `attachment; filename="${originalName}"`);
    res.setHeader('Content-Type', mimeType || 'application/octet-stream');
    res.sendFile(filePath);
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

module.exports = { getFiles, uploadFiles, deleteFile, downloadFile };
