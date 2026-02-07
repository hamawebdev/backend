import { container } from "tsyringe";
import AdminService from "./admin.service";
import AdminController from "./admin.controller";
import { ActivationCodeService } from "./services/activation-code.service";

// Register admin service
container.registerSingleton(AdminService);

// Register activation code service
container.registerSingleton(ActivationCodeService);

// Register admin controller
container.registerSingleton(AdminController);

export { container };