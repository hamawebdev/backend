import { Router } from "express";
import { container } from "tsyringe";
import StudentController from "./student.controller";
import authMiddleware from "../../core/middlewares/auth.middleware";
import { checkPayment } from "../../core/middlewares/paymentCheck.middleware";
import AdminController from "../admin/admin.controller";
const router = Router();
const studentController = container.resolve(StudentController);

// Study Packs endpoints (public content access)
router.get("/study-packs",
  (req, res) => studentController.getStudyPacks(req, res)
);

router.get("/study-packs/:id",

  (req, res) => studentController.getStudyPackById(req, res)
);

const adminController = container.resolve(AdminController);

// Public endpoints for registration - lowercase (legacy)
router.get("/universities",
  (req, res, next) => adminController.getAllUniversities(req, res, next)
);

router.get("/specialties",
  (req, res, next) => adminController.getAllSpecialties(req, res, next)
);

// Public endpoints for registration - canonical spec uses capital letters
router.get("/Universities",
  (req, res, next) => adminController.getAllUniversities(req, res, next)
);

router.get("/Specialties",
  (req, res, next) => adminController.getAllSpecialties(req, res, next)
);

// ==========================================
// PROTECTED ROUTES - REQUIRE AUTHENTICATION
// ==========================================

// Apply authentication and payment check only to protected routes
router.use(authMiddleware);
router.use(checkPayment());

// ==========================================
// STUDY CONTENT ACCESS & NAVIGATION
// ==========================================

// Course Resources endpoints
router.get("/courses/:id/resources",
  (req, res) => studentController.getCourseResources(req, res)
);

// Independent resources hierarchy (modules → subModules → courses/books)
router.get("/content/independent-resources",
  (req, res) => studentController.getIndependentResources(req, res)
);

// Student study pack in student context (canonical spec)
router.get("/student/study-pack/:studyPackId",
  (req, res) => studentController.getStudentStudyPack(req, res)
);

// ==========================================
// SUBSCRIPTION ACCESS CONTROL (Canonical spec)
// ==========================================

// GET /subscriptions/check-access - Check subscription access
router.get("/subscriptions/check-access",
  (req, res) => studentController.checkSubscriptionAccess(req, res)
);

// POST /subscriptions/:subscriptionId/cancel - Cancel subscription
router.post("/subscriptions/:subscriptionId/cancel",
  (req, res) => studentController.cancelSubscription(req, res)
);

export default router;