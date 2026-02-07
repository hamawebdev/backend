import { container } from "tsyringe";
import QuestionService from "./question.service";

// Register question module dependencies
container.register("QuestionService", {
  useClass: QuestionService,
});

export { container };
