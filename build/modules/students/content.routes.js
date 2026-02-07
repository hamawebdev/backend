"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const tsyringe_1 = require("tsyringe");
const student_controller_1 = __importDefault(require("./student.controller"));
const auth_middleware_1 = __importDefault(require("../../core/middlewares/auth.middleware"));
const paymentCheck_middleware_1 = require("../../core/middlewares/paymentCheck.middleware");
const admin_controller_1 = __importDefault(require("../admin/admin.controller"));
const router = (0, express_1.Router)();
const studentController = tsyringe_1.container.resolve(student_controller_1.default);
// Study Packs endpoints (public content access)
router.get("/study-packs", (req, res) => studentController.getStudyPacks(req, res));
router.get("/study-packs/:id", (req, res) => studentController.getStudyPackById(req, res));
const adminController = tsyringe_1.container.resolve(admin_controller_1.default);
// Public endpoints for registration - lowercase (legacy)
router.get("/universities", (req, res, next) => adminController.getAllUniversities(req, res, next));
router.get("/specialties", (req, res, next) => adminController.getAllSpecialties(req, res, next));
// Public endpoints for registration - canonical spec uses capital letters
router.get("/Universities", (req, res, next) => adminController.getAllUniversities(req, res, next));
router.get("/Specialties", (req, res, next) => adminController.getAllSpecialties(req, res, next));
// ==========================================
// PROTECTED ROUTES - REQUIRE AUTHENTICATION
// ==========================================
// Apply authentication and payment check only to protected routes
router.use(auth_middleware_1.default);
router.use((0, paymentCheck_middleware_1.checkPayment)());
// ==========================================
// STUDY CONTENT ACCESS & NAVIGATION
// ==========================================
// Course Resources endpoints
router.get("/courses/:id/resources", (req, res) => studentController.getCourseResources(req, res));
// Student study pack in student context (canonical spec)
router.get("/student/study-pack/:studyPackId", (req, res) => studentController.getStudentStudyPack(req, res));
// ==========================================
// SUBSCRIPTION ACCESS CONTROL (Canonical spec)
// ==========================================
// GET /subscriptions/check-access - Check subscription access
router.get("/subscriptions/check-access", (req, res) => studentController.checkSubscriptionAccess(req, res));
// POST /subscriptions/:subscriptionId/cancel - Cancel subscription
router.post("/subscriptions/:subscriptionId/cancel", (req, res) => studentController.cancelSubscription(req, res));
exports.default = router;
