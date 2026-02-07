"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.container = void 0;
const tsyringe_1 = require("tsyringe");
Object.defineProperty(exports, "container", { enumerable: true, get: function () { return tsyringe_1.container; } });
const question_service_1 = __importDefault(require("./question.service"));
// Register question module dependencies
tsyringe_1.container.register("QuestionService", {
    useClass: question_service_1.default,
});
