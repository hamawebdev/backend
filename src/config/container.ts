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
  useToken: ResponseUtils,
});

container.register("jwt", {
  useToken: JwtUtils,
});

container.register("mediaHandler", {
  useToken: MediaHandler,
});

container.register("globalErrorHandler", {
  useToken: GlobalErrorHandler,
});

// Register database
container.register("db", {
  useToken: PrismaService,
});

export { container };
