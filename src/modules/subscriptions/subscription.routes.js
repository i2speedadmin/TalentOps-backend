// ============================================================
// src/modules/subscriptions/subscription.routes.js
// ============================================================
const express      = require('express');
const router       = express.Router();
const controller   = require('./subscription.controller');
const authenticate = require('../../middleware/auth');

// All subscription routes require auth
router.use(authenticate);

router.get('/me',            controller.getMySubscription);
router.post('/preview-change', controller.previewChange);
router.post('/change-plan',  controller.changePlan);
router.post('/renew',        controller.renewSubscription);

module.exports = router;
