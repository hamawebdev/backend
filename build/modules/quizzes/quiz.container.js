"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const tsyringe_1 = require("tsyringe");
const quiz_repository_1 = __importDefault(require("./quiz.repository"));
const quiz_service_1 = __importDefault(require("./quiz.service"));
const quiz_controller_1 = __importDefault(require("./quiz.controller"));
// Register quiz module dependencies
tsyringe_1.container.register("QuizRepository", {
    useClass: quiz_repository_1.default,
});
tsyringe_1.container.register("QuizService", {
    useClass: quiz_service_1.default,
});
tsyringe_1.container.register("QuizController", {
    useClass: quiz_controller_1.default,
});
