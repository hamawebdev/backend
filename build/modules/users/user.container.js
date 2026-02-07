"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.container = void 0;
const tsyringe_1 = require("tsyringe");
Object.defineProperty(exports, "container", { enumerable: true, get: function () { return tsyringe_1.container; } });
const user_repository_1 = __importDefault(require("./user.repository"));
// Register user repository
tsyringe_1.container.register('IUserRepository', {
    useClass: user_repository_1.default
});
