import { Router, Request, Response, NextFunction } from "express";
import multer from "multer";
import { container } from "tsyringe";
import { adminOnly } from "../../core/middlewares/roleCheck.middleware";
import { RequestWithUser } from "../../types/types";
import ImportService from "./import.service";
import {
  HierarchyInput,
  MAX_MEDIA_BYTES,
  hierarchySchema,
  importExamsSchema,
  importQuestionsSchema,
  mediaCheckSchema,
  parseBody,
  questionStateSchema
} from "./import.validation";

/**
 * Dataset import API, mounted at /api/v1/admin/import (admin only; the admin
 * router authenticates). Every endpoint is idempotent: records are matched by
 * their stable sourceKey, so an interrupted import is resumed by re-running it.
 *
 *   POST /media            multipart `file` + `sha1` -> {sha1, url, size, existed}
 *   POST /media/check      {files: ["<sha1>.<ext>"]} -> {existing: [...]}
 *   PUT  /hierarchy        universities, sources, studyPacks, unites, modules, courses
 *                          -> {universities: {sourceKey: id}, sources, studyPacks, unites, modules, courses}
 *   PUT  /questions        {questions: [<= 200]} -> {results: [{sourceKey, id, action, error?}]},
 *                          results[i] for questions[i]
 *   POST /questions/state  {sourceKeys: [<= 5000]} -> {items: [{sourceKey, id, contentHash}]}
 *   PUT  /exams            {exams: [<= 50]} -> {results: [{sourceKey, id, action, missingQuestions, error?}]}
 *   GET  /stats            counts of the imported content
 *
 * PUT /questions is set-based: one lookup query per kind of key for the whole
 * request, no write at all for unchanged questions (same contentHash), one
 * transaction for all the new ones (about ten statements per request instead
 * of about five per question), and changed ones updated one by one,
 * IMPORT_QUESTION_CONCURRENCY (default 2, at most 4) at a time.
 *
 * Database connections: Prisma's pool holds num_cpus * 2 + 1 connections unless
 * DATABASE_URL sets connection_limit, and every API request shares it. An import
 * request holds one connection while it looks up and inserts, and up to
 * IMPORT_QUESTION_CONCURRENCY while it imports questions one by one (updates,
 * and new ones after a failed bulk insert). Keep (parallel import requests)
 * x (connections per request) at half the pool or less: up to 4 parallel
 * requests for a first import (mostly inserts), 2 for a run that mostly updates
 * on a 4-CPU host (9 connections). Media uploads use a connection only for the
 * authentication lookup every request makes.
 */
const router = Router();
const importService = container.resolve(ImportService);

// Images are hashed and checked before anything is written, so they stay in memory
const uploadImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_MEDIA_BYTES, files: 1, fields: 5, fieldSize: 1024 }
}).single("file");

router.use(adminOnly);

router.post("/media", uploadImage, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await importService.storeImage(req.file, req.body?.sha1);
    res.status(result.existed ? 200 : 201).json(result);
  } catch (error) {
    next(error);
  }
});

router.post("/media/check", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { files } = parseBody(mediaCheckSchema, req.body);
    res.status(200).json(await importService.checkImages(files));
  } catch (error) {
    next(error);
  }
});

router.put("/hierarchy", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = parseBody(hierarchySchema, req.body) as HierarchyInput;
    res.status(200).json(await importService.upsertHierarchy(input));
  } catch (error) {
    next(error);
  }
});

router.put("/questions", async (req: RequestWithUser, res: Response, next: NextFunction) => {
  try {
    const { questions } = parseBody(importQuestionsSchema, req.body);
    res.status(200).json(await importService.upsertQuestions(questions, req.user!.user_data.id));
  } catch (error) {
    next(error);
  }
});

router.post("/questions/state", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { sourceKeys } = parseBody(questionStateSchema, req.body);
    res.status(200).json(await importService.getQuestionState(sourceKeys));
  } catch (error) {
    next(error);
  }
});

router.put("/exams", async (req: RequestWithUser, res: Response, next: NextFunction) => {
  try {
    const { exams } = parseBody(importExamsSchema, req.body);
    res.status(200).json(await importService.upsertExams(exams, req.user!.user_data.id));
  } catch (error) {
    next(error);
  }
});

router.get("/stats", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.set("Cache-Control", "no-store");
    res.status(200).json(await importService.getStats());
  } catch (error) {
    next(error);
  }
});

export default router;
