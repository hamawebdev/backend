import { Router } from "express";
import { container } from "tsyringe";
import MediaHandler from "../../core/utils/media.utils";

const mediaRouter = Router();
const mediaHandler = container.resolve<MediaHandler>("mediaHandler");

// Route to serve all types of files
// GET /api/v1/media/:fileType/:filename
mediaRouter.get("/:fileType/:filename", mediaHandler.getFile);

export default mediaRouter; 