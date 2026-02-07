import { container } from "tsyringe";
import ExamRepository from "./exam.repository";
import ExamService from "./exam.service";
import ExamController from "./exam.controller";

// Register exam module dependencies
container.register("ExamRepository", {
  useClass: ExamRepository,
});

container.register("ExamService", {
  useClass: ExamService,
});

container.register("ExamController", {
  useClass: ExamController,
}); 