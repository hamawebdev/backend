"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const tsyringe_1 = require("tsyringe");
const exam_repository_1 = __importDefault(require("./exam.repository"));
const exam_service_1 = __importDefault(require("./exam.service"));
const exam_controller_1 = __importDefault(require("./exam.controller"));
// Register exam module dependencies
tsyringe_1.container.register("ExamRepository", {
    useClass: exam_repository_1.default,
});
tsyringe_1.container.register("ExamService", {
    useClass: exam_service_1.default,
});
tsyringe_1.container.register("ExamController", {
    useClass: exam_controller_1.default,
});
