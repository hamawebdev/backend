"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const tsyringe_1 = require("tsyringe");
const student_repository_1 = __importDefault(require("./student.repository"));
const student_service_1 = __importDefault(require("./student.service"));
const student_controller_1 = __importDefault(require("./student.controller"));
const code_redemption_service_1 = require("./services/code-redemption.service");
// Register student module dependencies
tsyringe_1.container.register("StudentRepository", {
    useClass: student_repository_1.default,
});
tsyringe_1.container.register("StudentService", {
    useClass: student_service_1.default,
});
tsyringe_1.container.register("CodeRedemptionService", {
    useClass: code_redemption_service_1.CodeRedemptionService,
});
tsyringe_1.container.register("StudentController", {
    useClass: student_controller_1.default,
});
