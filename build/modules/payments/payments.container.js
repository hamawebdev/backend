"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tsyringe_1 = require("tsyringe");
const payments_service_1 = require("./payments.service");
const payments_controller_1 = require("./payments.controller");
// Register services
tsyringe_1.container.registerSingleton(payments_service_1.PaymentsService);
// Register controllers
tsyringe_1.container.registerSingleton(payments_controller_1.PaymentsController);
