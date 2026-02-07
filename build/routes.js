"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_routes_1 = __importDefault(require("./modules/auth/auth.routes"));
const quiz_routes_1 = __importDefault(require("./modules/quizzes/quiz.routes"));
const quiz_session_routes_1 = __importDefault(require("./modules/quizzes/quiz-session.routes"));
const exam_routes_1 = __importDefault(require("./modules/exams/exam.routes"));
const student_routes_1 = __importDefault(require("./modules/students/student.routes"));
const content_routes_1 = __importDefault(require("./modules/students/content.routes"));
const admin_routes_1 = __importDefault(require("./modules/admin/admin.routes"));
const media_routes_1 = __importDefault(require("./modules/media/media.routes"));
const payments_routes_1 = __importDefault(require("./modules/payments/payments.routes"));
const router = (0, express_1.Router)();
// Health check endpoint for Docker
router.get('/health', (req, res) => {
    res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: 'medcin-backend'
    });
});
// Mount routes
router.use('/auth', auth_routes_1.default);
router.use('/media', media_routes_1.default); // Media file serving - MUST be before content routes to avoid auth middleware
router.use('/quizzes', quiz_routes_1.default);
router.use('/quiz-sessions', quiz_session_routes_1.default);
router.use('/exams', exam_routes_1.default);
router.use('/students', student_routes_1.default);
router.use('/', content_routes_1.default); // Study packs and course resources at root level
router.use('/admin', admin_routes_1.default);
router.use('/payments', payments_routes_1.default); // Payments routes
exports.default = router;
