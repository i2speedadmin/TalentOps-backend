// ============================================================
// src/modules/tenants/tenant.routes.js
// ============================================================

const express        = require('express');
const router         = express.Router();
const controller     = require('./tenant.controller');
const superAdminAuth = require('../../middleware/superAdminAuth');

router.use(superAdminAuth);

router.get('/',                    controller.getTenants);
router.get('/:id',                 controller.getTenantById);
router.patch('/:id/status',        controller.updateStatus);
router.post('/:id/extend-trial',   controller.extendTrial);
router.post('/:id/change-plan',    controller.changePlan);
router.delete('/:id',              controller.deleteTenant);

module.exports = router;
