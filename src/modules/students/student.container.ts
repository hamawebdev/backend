import { container } from "tsyringe";
import StudentRepository from "./student.repository";
import StudentService from "./student.service";
import StudentController from "./student.controller";
import { CodeRedemptionService } from "./services/code-redemption.service";

// Register student module dependencies
container.register("StudentRepository", {
  useClass: StudentRepository,
});

container.register("StudentService", {
  useClass: StudentService,
});

container.register("CodeRedemptionService", {
  useClass: CodeRedemptionService,
});

container.register("StudentController", {
  useClass: StudentController,
});