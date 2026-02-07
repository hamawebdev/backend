"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.container = void 0;
require("reflect-metadata"); // Required for tsyringe to work
const tsyringe_1 = require("tsyringe");
Object.defineProperty(exports, "container", { enumerable: true, get: function () { return tsyringe_1.container; } });
// Import core utilities
const response_utils_1 = __importDefault(require("../core/utils/response.utils"));
const jwt_utils_1 = __importDefault(require("../core/utils/jwt.utils"));
const media_utils_1 = __importDefault(require("../core/utils/media.utils"));
const errors_middleware_1 = __importDefault(require("../core/middlewares/errors.middleware"));
// Import database
const db_1 = __importDefault(require("./db"));
// Import module containers
require("../modules/users/user.container");
require("../modules/auth/auth.container");
require("../modules/questions/question.container");
require("../modules/quizzes/quiz.container");
require("../modules/exams/exam.container");
require("../modules/students/student.container");
require("../modules/admin/admin.container");
require("../modules/payments/payments.container");
// Register core utilities
tsyringe_1.container.register("responseUtils", {
    useClass: response_utils_1.default,
});
tsyringe_1.container.register("jwt", {
    useClass: jwt_utils_1.default,
});
tsyringe_1.container.register("mediaHandler", {
    useClass: media_utils_1.default,
});
tsyringe_1.container.register("globalErrorHandler", {
    useClass: errors_middleware_1.default,
});
// Register database
tsyringe_1.container.register("db", {
    useClass: db_1.default,
});
