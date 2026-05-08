// ============================================================
// src/modules/subscriptions/subscription.routes.js
// ============================================================
const express      = require('express');
const router       = express.Router();
const controller   = require('./subscription.controller');
const authenticate = require('../../middleware/auth');

router.use(authenticate);

router.get('/me',                controller.getMySubscription);
router.post('/preview-change',   controller.previewChange);
router.post('/initiate-change',  controller.initiateChange);   // Step 1: create payment order
router.post('/complete-change',  controller.completeChange);   // Step 2: verify payment + apply
router.post('/renew',            controller.renewSubscription);

module.exports = router;
