"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const tsyringe_1 = require("tsyringe");
const mediaRouter = (0, express_1.Router)();
const mediaHandler = tsyringe_1.container.resolve("mediaHandler");
// Route to serve all types of files
// GET /api/media/:fileType/:filename
mediaRouter.get("/:fileType/:filename", mediaHandler.getFile);
exports.default = mediaRouter;
