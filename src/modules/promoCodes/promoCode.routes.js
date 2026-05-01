// ============================================================
// src/modules/promoCodes/promoCode.routes.js
// ============================================================
const express        = require('express');
const router         = express.Router();
const controller     = require('./promoCode.controller');
const superAdminAuth = require('../../middleware/superAdminAuth');

// Public — validate code during signup
router.get('/validate', controller.validate);

// Super Admin only
router.get('/',         superAdminAuth, controller.getAll);
router.post('/',        superAdminAuth, controller.create);
router.put('/:id',      superAdminAuth, controller.update);
router.delete('/:id',   superAdminAuth, controller.deleteCode);

module.exports = router;
