import "reflect-metadata"; // Required for tsyringe to work
import { container } from "tsyringe";

// Import core utilities
import ResponseUtils from "../core/utils/response.utils";
import JwtUtils from "../core/utils/jwt.utils";
import MediaHandler from "../core/utils/media.utils";
import GlobalErrorHandler from "../core/middlewares/errors.middleware";

// Import database
import PrismaService from "./db";

// Import module containers
import '../modules/users/user.container';
import '../modules/auth/auth.container';
import '../modules/questions/question.container';
import '../modules/quizzes/quiz.container';
import '../modules/exams/exam.container';
import '../modules/students/student.container';
import '../modules/admin/admin.container';
import '../modules/payments/payments.container';

// Register core utilities
container.register("responseUtils", {
  useClass: ResponseUtils,
});

container.register("jwt", {
  useClass: JwtUtils,
});

container.register("mediaHandler", {
  useClass: MediaHandler,
});

container.register("globalErrorHandler", {
  useClass: GlobalErrorHandler,
});

// Register database
container.register("db", {
  useClass: PrismaService,
});

export { container };
