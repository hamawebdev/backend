"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.container = void 0;
const tsyringe_1 = require("tsyringe");
Object.defineProperty(exports, "container", { enumerable: true, get: function () { return tsyringe_1.container; } });
const admin_service_1 = __importDefault(require("./admin.service"));
const admin_controller_1 = __importDefault(require("./admin.controller"));
const activation_code_service_1 = require("./services/activation-code.service");
// Register admin service
tsyringe_1.container.registerSingleton(admin_service_1.default);
// Register activation code service
tsyringe_1.container.registerSingleton(activation_code_service_1.ActivationCodeService);
// Register admin controller
tsyringe_1.container.registerSingleton(admin_controller_1.default);
