import { container } from "tsyringe";
import QuizRepository from "./quiz.repository";
import QuizService from "./quiz.service";
import QuizController from "./quiz.controller";

// Register quiz module dependencies
container.register("QuizRepository", {
  useClass: QuizRepository,
});

container.register("QuizService", {
  useClass: QuizService,
});

container.register("QuizController", {
  useClass: QuizController,
}); 