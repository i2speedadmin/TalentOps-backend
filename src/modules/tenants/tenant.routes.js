// ============================================================
// src/modules/tenants/tenant.routes.js
// ============================================================
const express        = require('express');
const router         = express.Router();
const ctrl           = require('./tenant.controller');
const superAdminAuth = require('../../middleware/superAdminAuth');

router.use(superAdminAuth);
router.get('/',                     ctrl.getTenants);
router.get('/:id',                  ctrl.getTenantById);
router.patch('/:id/status',         ctrl.updateStatus);
router.post('/:id/extend-trial',    ctrl.extendTrial);
router.post('/:id/change-plan',     ctrl.changePlan);
router.delete('/:id',               ctrl.deleteTenant);

module.exports = router;
