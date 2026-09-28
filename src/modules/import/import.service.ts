import crypto from "crypto";
import fs from "fs";
import path from "path";
import { inject, injectable } from "tsyringe";
import { Prisma, PrismaClient } from "@prisma/client";
import PrismaService from "../../config/db";
import MediaHandler, { FileType } from "../../core/utils/media.utils";
import { BadRequestError, ConflictError } from "../../core/errors/AppError";
import { TransactionClient } from "../../types/prisma.types";
import { findAnswersUsedInAttempts } from "../questions/question-answers.sync";
import { ANSWER_ORDER } from "../questions/question-visibility";
import { normalizeResidencyPart } from "../admin/validations/admin.validation";
import {
  HierarchyInput,
  ImportAnswer,
  ImportExam,
  ImportQuestion,
  MAX_METADATA_LENGTH,
  MEDIA_EXTENSIONS,
  MEDIA_FILE_NAME,
  describeZodError,
  importExamSchema,
  importQuestionSchema
} from "./import.validation";

export type ImportAction = "created" | "updated" | "unchanged" | "failed";

export interface QuestionImportResult {
  sourceKey: string | null;
  id: number | null;
  action: ImportAction;
  error?: string;
}

export interface ExamImportResult {
  sourceKey: string | null;
  id: number | null;
  action: ImportAction;
  missingQuestions: string[];
  error?: string;
}

type KeyMap = Record<string, number>;

/** A failure of one imported item: reported in its result, the others go on */
class ImportItemError extends Error { }

/**
 * Questions imported in parallel within one request (each in its own
 * transaction); kept low so an import never takes most of the connection pool
 */
const QUESTION_CONCURRENCY = 2;
/** Keys per IN (...) lookup */
const LOOKUP_CHUNK = 5000;
/** Interactive transaction limits for one question or exam */
const ITEM_TRANSACTION = { maxWait: 10000, timeout: 30000 };

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function sameList<T>(a: T[], b: T[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function duplicates(keys: string[]): string[] {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  keys.forEach(key => (seen.has(key) ? repeated.add(key) : seen.add(key)));
  return [...repeated];
}

/** Run fn over items with at most `limit` running at once; results keep the input order */
async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

function errorMessage(error: unknown): string {
  if (error instanceof ImportItemError) return error.message;
  if (error instanceof Prisma.PrismaClientKnownRequestError) return `Database error ${error.code}: ${error.message.split("\n").pop()}`;
  if (error instanceof Error) return error.message;
  return String(error);
}

/**
 * Idempotent import of the question dataset (hierarchy, questions with their
 * English translations, exam papers and content-addressed images). Records are
 * matched by their stable sourceKey; see import.routes.ts for the endpoints.
 */
@injectable()
export default class ImportService {
  constructor(
    @inject("db") private prismaService: PrismaService,
    @inject("mediaHandler") private mediaHandler: MediaHandler
  ) { }

  private get prisma(): PrismaClient {
    return this.prismaService.getClient();
  }

  private get imagesDirectory(): string {
    return this.mediaHandler.getDirectory(FileType.IMAGE);
  }

  // ================================================================ media

  /**
   * Store an uploaded image as UPLOADS_DIR/images/<sha1>.<ext>. The content must
   * hash to the given sha1. An existing file with the right content is kept
   * (existed: true); otherwise the file is written to a temporary name and
   * renamed, so a reader never sees a partial file.
   */
  async storeImage(file: { buffer: Buffer; originalname: string } | undefined, sha1Field: unknown) {
    if (!file) {
      throw new BadRequestError("No file uploaded: send the image in the multipart field 'file'");
    }
    const sha1 = typeof sha1Field === "string" ? sha1Field.trim().toLowerCase() : "";
    if (!/^[0-9a-f]{40}$/.test(sha1)) {
      throw new BadRequestError("sha1 must be the 40 hexadecimal characters of the file's SHA-1");
    }
    const ext = path.extname(file.originalname || "").slice(1).toLowerCase();
    if (!(MEDIA_EXTENSIONS as readonly string[]).includes(ext)) {
      throw new BadRequestError(`File extension must be one of ${MEDIA_EXTENSIONS.join(", ")} (got '${ext || "none"}')`);
    }
    if (file.buffer.length === 0) {
      throw new BadRequestError("The file is empty");
    }
    const actual = crypto.createHash("sha1").update(file.buffer).digest("hex");
    if (actual !== sha1) {
      throw new BadRequestError(`sha1 mismatch: the uploaded file hashes to ${actual}, not ${sha1}`);
    }

    const fileName = `${sha1}.${ext}`;
    const directory = this.imagesDirectory;
    const target = path.join(directory, fileName);
    const existed = await this.fileHasSha1(target, sha1);
    if (!existed) {
      await fs.promises.mkdir(directory, { recursive: true });
      // Dot-prefixed temporary name: the media route never serves it
      const temporary = path.join(directory, `.${fileName}.${process.pid}.${crypto.randomBytes(6).toString("hex")}.tmp`);
      try {
        await fs.promises.writeFile(temporary, file.buffer, { flag: "wx", mode: 0o644 });
        await fs.promises.rename(temporary, target);
      } catch (error) {
        await fs.promises.unlink(temporary).catch(() => undefined);
        throw error;
      }
    }

    return {
      sha1,
      url: this.mediaHandler.getFileUrl(fileName, FileType.IMAGE),
      size: file.buffer.length,
      existed
    };
  }

  /** True when the file exists and its content hashes to sha1 */
  private async fileHasSha1(filePath: string, sha1: string): Promise<boolean> {
    try {
      const content = await fs.promises.readFile(filePath);
      return crypto.createHash("sha1").update(content).digest("hex") === sha1;
    } catch (error: any) {
      if (error?.code === "ENOENT") return false;
      throw error;
    }
  }

  /** The given <sha1>.<ext> names that are already stored */
  async checkImages(files: string[]): Promise<{ existing: string[] }> {
    const invalid = files.filter(name => !MEDIA_FILE_NAME.test(name));
    if (invalid.length > 0) {
      throw new BadRequestError(
        `File names must be <sha1>.<ext> with ext one of ${MEDIA_EXTENSIONS.join(", ")}: ${invalid.slice(0, 10).join(", ")}`
      );
    }
    let stored: Set<string>;
    try {
      stored = new Set(await fs.promises.readdir(this.imagesDirectory));
    } catch (error: any) {
      if (error?.code !== "ENOENT") throw error;
      stored = new Set();
    }
    return { existing: files.filter(name => stored.has(name.toLowerCase())) };
  }

  // ============================================================ hierarchy

  /**
   * Upsert universities, question sources, study packs, unites, modules and
   * courses by sourceKey, parents first. New records are created; existing ones
   * are left untouched unless updateExisting (then their fields and parent are
   * set from the request). A university or question source created in the admin
   * UI (no sourceKey) with exactly the same name is adopted instead of
   * duplicated. Returns sourceKey -> id maps for every key of the request.
   */
  async upsertHierarchy(input: HierarchyInput) {
    const universities = input.universities ?? [];
    const sources = input.sources ?? [];
    const studyPacks = input.studyPacks ?? [];
    const unites = input.unites ?? [];
    const modules = input.modules ?? [];
    const courses = input.courses ?? [];
    const updateExisting = input.updateExisting === true;

    const repeated = [
      ...duplicates(universities.map(u => u.sourceKey)).map(key => `universities: ${key}`),
      ...duplicates(sources.map(s => s.sourceKey)).map(key => `sources: ${key}`),
      ...duplicates(studyPacks.map(p => p.sourceKey)).map(key => `studyPacks: ${key}`),
      ...duplicates(unites.map(u => u.sourceKey)).map(key => `unites: ${key}`),
      ...duplicates(modules.map(m => m.sourceKey)).map(key => `modules: ${key}`),
      ...duplicates(courses.map(c => c.sourceKey)).map(key => `courses: ${key}`)
    ];
    if (repeated.length > 0) {
      throw new BadRequestError(`Duplicate sourceKeys in the request: ${repeated.slice(0, 20).join(", ")}`);
    }
    const repeatedSourceNames = duplicates(sources.map(s => s.name));
    if (repeatedSourceNames.length > 0) {
      throw new BadRequestError(`Question source names must be unique: ${repeatedSourceNames.join(", ")}`);
    }

    // Every parent must be in this request or already imported, checked before any write
    await this.assertParentsExist("studyPackKey", unites.map(u => u.studyPackKey), studyPacks.map(p => p.sourceKey), keys => this.findStudyPackIds(keys));
    await this.assertParentsExist("uniteKey", modules.map(m => m.uniteKey), unites.map(u => u.sourceKey), keys => this.findUniteIds(keys));
    await this.assertParentsExist("moduleKey", courses.map(c => c.moduleKey), modules.map(m => m.sourceKey), keys => this.findModuleIds(keys));
    await this.assertSourceNamesFree(sources);

    // Universities
    await this.adoptByName(universities, "university");
    const universityMap = await this.upsertLevel(universities, keys => this.findUniversityIds(keys), async missing => {
      await this.prisma.university.createMany({
        data: missing.map(u => ({ sourceKey: u.sourceKey, name: u.name, ...(u.country ? { country: u.country } : {}) })),
        skipDuplicates: true
      });
    }, updateExisting ? async (id, u) => {
      await this.prisma.university.update({ where: { id }, data: { name: u.name, ...(u.country ? { country: u.country } : {}) } });
    } : undefined);

    // Question sources
    await this.adoptByName(sources, "source");
    const sourceMap = await this.upsertLevel(sources, keys => this.findSourceIds(keys), async missing => {
      await this.prisma.questionSource.createMany({
        data: missing.map(s => ({ sourceKey: s.sourceKey, name: s.name })),
        skipDuplicates: true
      });
    }, updateExisting ? async (id, s) => {
      await this.prisma.questionSource.update({ where: { id }, data: { name: s.name } });
    } : undefined);

    // Study packs
    const studyPackData = (p: typeof studyPacks[number]) => ({
      name: p.name,
      type: p.type,
      yearNumber: p.yearNumber ?? null,
      description: p.description ?? null,
      pricePerMonth: p.pricePerMonth,
      pricePerYear: p.pricePerYear ?? null,
      ...(p.isActive !== undefined ? { isActive: p.isActive } : {})
    });
    const studyPackMap = await this.upsertLevel(studyPacks, keys => this.findStudyPackIds(keys), async missing => {
      await this.prisma.studyPack.createMany({
        data: missing.map(p => ({ sourceKey: p.sourceKey, ...studyPackData(p) })),
        skipDuplicates: true
      });
    }, updateExisting ? async (id, p) => {
      await this.prisma.studyPack.update({ where: { id }, data: studyPackData(p) });
    } : undefined);

    // Unites, modules, courses: parents resolved from this request, then from the database
    const packIds = await this.resolveParents(unites.map(u => u.studyPackKey), studyPackMap, keys => this.findStudyPackIds(keys));
    const uniteMap = await this.upsertLevel(unites, keys => this.findUniteIds(keys), async missing => {
      await this.prisma.unite.createMany({
        data: missing.map(u => ({ sourceKey: u.sourceKey, name: u.name, studyPackId: packIds[u.studyPackKey] })),
        skipDuplicates: true
      });
    }, updateExisting ? async (id, u) => {
      await this.prisma.unite.update({ where: { id }, data: { name: u.name, studyPackId: packIds[u.studyPackKey] } });
    } : undefined);

    const uniteIds = await this.resolveParents(modules.map(m => m.uniteKey), uniteMap, keys => this.findUniteIds(keys));
    const moduleMap = await this.upsertLevel(modules, keys => this.findModuleIds(keys), async missing => {
      await this.prisma.module.createMany({
        data: missing.map(m => ({ sourceKey: m.sourceKey, name: m.name, uniteId: uniteIds[m.uniteKey] })),
        skipDuplicates: true
      });
    }, updateExisting ? async (id, m) => {
      await this.prisma.module.update({ where: { id }, data: { name: m.name, uniteId: uniteIds[m.uniteKey] } });
    } : undefined);

    const moduleIds = await this.resolveParents(courses.map(c => c.moduleKey), moduleMap, keys => this.findModuleIds(keys));
    const courseMap = await this.upsertLevel(courses, keys => this.findCourseIds(keys), async missing => {
      await this.prisma.course.createMany({
        data: missing.map(c => ({ sourceKey: c.sourceKey, name: c.name, moduleId: moduleIds[c.moduleKey] })),
        skipDuplicates: true
      });
    }, updateExisting ? async (id, c) => {
      await this.prisma.course.update({ where: { id }, data: { name: c.name, moduleId: moduleIds[c.moduleKey] } });
    } : undefined);

    return {
      universities: universityMap,
      sources: sourceMap,
      studyPacks: studyPackMap,
      unites: uniteMap,
      modules: moduleMap,
      courses: courseMap
    };
  }

  /**
   * Create the items whose sourceKey is not stored yet, optionally update the
   * others, and return the sourceKey -> id map of all items
   */
  private async upsertLevel<T extends { sourceKey: string }>(
    items: T[],
    find: (keys: string[]) => Promise<KeyMap>,
    create: (missing: T[]) => Promise<void>,
    update?: (id: number, item: T) => Promise<void>
  ): Promise<KeyMap> {
    if (items.length === 0) return {};
    const keys = items.map(item => item.sourceKey);
    const existing = await find(keys);
    const missing = items.filter(item => existing[item.sourceKey] === undefined);
    if (missing.length > 0) {
      await create(missing);
    }
    if (update) {
      for (const item of items) {
        const id = existing[item.sourceKey];
        if (id !== undefined) await update(id, item);
      }
    }
    const all = await find(keys);
    const unresolved = keys.filter(key => all[key] === undefined);
    if (unresolved.length > 0) {
      throw new ConflictError(`Could not create records for: ${unresolved.slice(0, 20).join(", ")}`);
    }
    return all;
  }

  /**
   * Give a record created in the admin UI (no sourceKey) the sourceKey of the
   * imported item with the same name, when exactly one such record exists
   */
  private async adoptByName(items: Array<{ sourceKey: string; name: string }>, kind: "university" | "source") {
    if (items.length === 0) return;
    const existing = kind === "university" ? await this.findUniversityIds(items.map(i => i.sourceKey)) : await this.findSourceIds(items.map(i => i.sourceKey));
    const candidates = items.filter(item => existing[item.sourceKey] === undefined);
    if (candidates.length === 0) return;
    const names = candidates.map(item => item.name);
    const records: Array<{ id: number; name: string }> = kind === "university"
      ? await this.prisma.university.findMany({ where: { name: { in: names }, sourceKey: null }, select: { id: true, name: true } })
      : await this.prisma.questionSource.findMany({ where: { name: { in: names }, sourceKey: null }, select: { id: true, name: true } });
    for (const item of candidates) {
      const matches = records.filter(record => record.name === item.name);
      if (matches.length !== 1) continue;
      if (kind === "university") {
        await this.prisma.university.updateMany({ where: { id: matches[0].id, sourceKey: null }, data: { sourceKey: item.sourceKey } });
      } else {
        await this.prisma.questionSource.updateMany({ where: { id: matches[0].id, sourceKey: null }, data: { sourceKey: item.sourceKey } });
      }
    }
  }

  /** Question source names are unique: a name already used under another sourceKey is a conflict */
  private async assertSourceNamesFree(sources: Array<{ sourceKey: string; name: string }>) {
    if (sources.length === 0) return;
    const taken = await this.prisma.questionSource.findMany({
      where: { name: { in: sources.map(s => s.name) }, sourceKey: { not: null } },
      select: { name: true, sourceKey: true }
    });
    const conflicts = taken.filter(record => sources.some(s => s.name === record.name && s.sourceKey !== record.sourceKey));
    if (conflicts.length > 0) {
      throw new ConflictError(
        `Question source name(s) already imported under another sourceKey: ${conflicts.map(c => `${c.name} (${c.sourceKey})`).join(", ")}`
      );
    }
  }

  private async assertParentsExist(field: string, parentKeys: string[], inRequest: string[], find: (keys: string[]) => Promise<KeyMap>) {
    const requested = new Set(inRequest);
    const outside = Array.from(new Set(parentKeys.filter(key => !requested.has(key))));
    if (outside.length === 0) return;
    const found = await find(outside);
    const missing = outside.filter(key => found[key] === undefined);
    if (missing.length > 0) {
      throw new BadRequestError(`Unknown ${field}(s), neither in this request nor imported before: ${missing.slice(0, 20).join(", ")}`);
    }
  }

  private async resolveParents(parentKeys: string[], fromRequest: KeyMap, find: (keys: string[]) => Promise<KeyMap>): Promise<KeyMap> {
    const outside = Array.from(new Set(parentKeys.filter(key => fromRequest[key] === undefined)));
    const found = outside.length > 0 ? await find(outside) : {};
    return { ...found, ...fromRequest };
  }

  private async findIds(
    keys: string[],
    query: (keys: string[]) => Promise<Array<{ id: number; sourceKey: string | null }>>
  ): Promise<KeyMap> {
    const map: KeyMap = {};
    for (const part of chunk(Array.from(new Set(keys)), LOOKUP_CHUNK)) {
      for (const row of await query(part)) {
        if (row.sourceKey !== null) map[row.sourceKey] = row.id;
      }
    }
    return map;
  }

  private findUniversityIds(keys: string[]) {
    return this.findIds(keys, part => this.prisma.university.findMany({ where: { sourceKey: { in: part } }, select: { id: true, sourceKey: true } }));
  }

  private findSourceIds(keys: string[]) {
    return this.findIds(keys, part => this.prisma.questionSource.findMany({ where: { sourceKey: { in: part } }, select: { id: true, sourceKey: true } }));
  }

  private findStudyPackIds(keys: string[]) {
    return this.findIds(keys, part => this.prisma.studyPack.findMany({ where: { sourceKey: { in: part } }, select: { id: true, sourceKey: true } }));
  }

  private findUniteIds(keys: string[]) {
    return this.findIds(keys, part => this.prisma.unite.findMany({ where: { sourceKey: { in: part } }, select: { id: true, sourceKey: true } }));
  }

  private findModuleIds(keys: string[]) {
    return this.findIds(keys, part => this.prisma.module.findMany({ where: { sourceKey: { in: part } }, select: { id: true, sourceKey: true } }));
  }

  private findCourseIds(keys: string[]) {
    return this.findIds(keys, part => this.prisma.course.findMany({ where: { sourceKey: { in: part } }, select: { id: true, sourceKey: true } }));
  }

  private findQuestionIds(keys: string[]) {
    return this.findIds(keys, part => this.prisma.question.findMany({ where: { sourceKey: { in: part } }, select: { id: true, sourceKey: true } }));
  }

  // ============================================================ questions

  /**
   * Upsert up to 200 questions by sourceKey, each in its own short transaction:
   * - an equal contentHash leaves the question untouched ('unchanged')
   * - answers are matched by position: the submitted answers, by position, are
   *   paired with the stored ones ordered by position then id and updated in
   *   place (their ids, and so students' recorded answers, stay); extra
   *   submitted answers are created, extra stored ones deleted. Deleting an
   *   answer a student chose fails the question ('failed'), with nothing changed.
   * - question and explanation image lists are replaced when their paths differ
   * - absent optional fields are cleared: the request is the question's full state
   */
  async upsertQuestions(rawQuestions: unknown[], createdById: number): Promise<{ results: QuestionImportResult[] }> {
    const results: QuestionImportResult[] = new Array(rawQuestions.length);
    const valid: Array<{ index: number; question: ImportQuestion }> = [];
    const seenKeys = new Set<string>();

    rawQuestions.forEach((raw, index) => {
      const rawKey = raw && typeof raw === "object" && typeof (raw as any).sourceKey === "string" ? (raw as any).sourceKey.trim() : null;
      const parsed = importQuestionSchema.safeParse(raw);
      if (!parsed.success) {
        results[index] = { sourceKey: rawKey, id: null, action: "failed", error: `Invalid question: ${describeZodError(parsed.error)}` };
        return;
      }
      if (seenKeys.has(parsed.data.sourceKey)) {
        results[index] = { sourceKey: parsed.data.sourceKey, id: null, action: "failed", error: "sourceKey appears more than once in this request" };
        return;
      }
      seenKeys.add(parsed.data.sourceKey);
      valid.push({ index, question: parsed.data as ImportQuestion });
    });

    const questions = valid.map(v => v.question);
    const [courses, universities, sources, existingRows] = await Promise.all([
      this.findCourseIds(questions.flatMap(q => (q.courseKey ? [q.courseKey] : []))),
      this.findUniversityIds(questions.flatMap(q => (q.universityKey ? [q.universityKey] : []))),
      this.findSourceIds(questions.flatMap(q => (q.questionSourceKey ? [q.questionSourceKey] : []))),
      this.findExistingQuestions(questions.map(q => q.sourceKey))
    ]);

    await mapWithConcurrency(valid, QUESTION_CONCURRENCY, async ({ index, question }) => {
      const existing = existingRows.get(question.sourceKey);
      try {
        const references = this.resolveQuestionReferences(question, courses, universities, sources);
        if (existing && existing.contentHash === question.contentHash) {
          results[index] = { sourceKey: question.sourceKey, id: existing.id, action: "unchanged" };
          return;
        }
        if (existing) {
          await this.updateQuestion(existing.id, question, references);
          results[index] = { sourceKey: question.sourceKey, id: existing.id, action: "updated" };
          return;
        }
        try {
          const id = await this.createQuestion(question, references, createdById);
          results[index] = { sourceKey: question.sourceKey, id, action: "created" };
        } catch (error) {
          // Created meanwhile by a concurrent import: update it instead
          if (!isUniqueViolation(error)) throw error;
          const raced = (await this.findExistingQuestions([question.sourceKey])).get(question.sourceKey);
          if (!raced) throw error;
          if (raced.contentHash === question.contentHash) {
            results[index] = { sourceKey: question.sourceKey, id: raced.id, action: "unchanged" };
          } else {
            await this.updateQuestion(raced.id, question, references);
            results[index] = { sourceKey: question.sourceKey, id: raced.id, action: "updated" };
          }
        }
      } catch (error) {
        if (!(error instanceof ImportItemError)) {
          console.error(`Import of question ${question.sourceKey} failed:`, error);
        }
        results[index] = { sourceKey: question.sourceKey, id: existing?.id ?? null, action: "failed", error: errorMessage(error) };
      }
    });

    return { results };
  }

  /** sourceKey -> { id, contentHash } of stored questions */
  private async findExistingQuestions(keys: string[]): Promise<Map<string, { id: number; contentHash: string | null }>> {
    const map = new Map<string, { id: number; contentHash: string | null }>();
    for (const part of chunk(Array.from(new Set(keys)), LOOKUP_CHUNK)) {
      const rows = await this.prisma.question.findMany({
        where: { sourceKey: { in: part } },
        select: { id: true, sourceKey: true, contentHash: true }
      });
      rows.forEach(row => row.sourceKey !== null && map.set(row.sourceKey, { id: row.id, contentHash: row.contentHash }));
    }
    return map;
  }

  private resolveQuestionReferences(question: ImportQuestion, courses: KeyMap, universities: KeyMap, sources: KeyMap) {
    const lookup = (key: string | null | undefined, map: KeyMap, field: string): number | null => {
      if (!key) return null;
      const id = map[key];
      if (id === undefined) {
        throw new ImportItemError(`Unknown ${field} '${key}': import it through PUT /admin/import/hierarchy first`);
      }
      return id;
    };
    return {
      courseId: lookup(question.courseKey, courses, "courseKey"),
      universityId: lookup(question.universityKey, universities, "universityKey"),
      sourceId: lookup(question.questionSourceKey, sources, "questionSourceKey")
    };
  }

  /** Question columns set from an imported question (its full state) */
  private questionData(question: ImportQuestion, references: { courseId: number | null; universityId: number | null; sourceId: number | null }) {
    return {
      contentHash: question.contentHash,
      questionText: question.questionText,
      questionTextEn: question.questionTextEn ?? null,
      explanation: question.explanation ?? null,
      explanationEn: question.explanationEn ?? null,
      questionType: question.questionType,
      isPublished: question.isPublished,
      courseId: references.courseId,
      universityId: references.universityId,
      sourceId: references.sourceId,
      examYear: question.examYear ?? null,
      yearLevel: question.yearLevel ?? null,
      metadata: this.metadataText(question.metadata),
      tags: JSON.stringify(question.tags ?? []),
      repetitionCount: question.repetitionCount ?? 0,
      repetitionYears: JSON.stringify(question.repetitionYears ?? [])
    };
  }

  /**
   * Metadata as a compact JSON string. A residency part is kept at the top level
   * in its canonical form ("part":"Medicale"), which the residency lists filter on.
   */
  private metadataText(metadata: Record<string, unknown> | null | undefined): string | null {
    if (!metadata) return null;
    const normalized: Record<string, unknown> = { ...metadata };
    if (typeof normalized.part === "string") {
      normalized.part = normalizeResidencyPart(normalized.part.trim());
    }
    const text = JSON.stringify(normalized);
    if (text.length > MAX_METADATA_LENGTH) {
      throw new ImportItemError(`metadata is too long (${text.length} characters, at most ${MAX_METADATA_LENGTH})`);
    }
    return text;
  }

  private answerData(answer: ImportAnswer) {
    return {
      position: answer.position,
      answerText: answer.answerText,
      answerTextEn: answer.answerTextEn ?? null,
      isCorrect: answer.isCorrect,
      explanation: answer.explanation ?? null,
      explanationEn: answer.explanationEn ?? null
    };
  }

  private async createQuestion(
    question: ImportQuestion,
    references: { courseId: number | null; universityId: number | null; sourceId: number | null },
    createdById: number
  ): Promise<number> {
    const answers = [...question.answers].sort((a, b) => a.position - b.position);
    const created = await this.prisma.question.create({
      data: {
        sourceKey: question.sourceKey,
        ...this.questionData(question, references),
        createdById,
        questionAnswers: { create: answers.map(answer => this.answerData(answer)) },
        questionImages: { create: (question.questionImages ?? []).map(imagePath => ({ imagePath })) },
        questionExplanationImages: { create: (question.explanationImages ?? []).map(imagePath => ({ imagePath })) }
      },
      select: { id: true }
    });
    return created.id;
  }

  private async updateQuestion(
    questionId: number,
    question: ImportQuestion,
    references: { courseId: number | null; universityId: number | null; sourceId: number | null }
  ): Promise<void> {
    const submitted = [...question.answers].sort((a, b) => a.position - b.position);

    await this.prisma.$transaction(async (tx: TransactionClient) => {
      const stored = await tx.questionAnswer.findMany({
        where: { questionId },
        orderBy: ANSWER_ORDER,
        select: { id: true }
      });

      // Refuse before writing anything when a removed answer was chosen by students
      const removedIds = stored.slice(submitted.length).map(answer => answer.id);
      if (removedIds.length > 0) {
        const used = await findAnswersUsedInAttempts(tx, questionId, removedIds);
        if (used.length > 0) {
          throw new ImportItemError(
            `Answer(s) ${used.join(", ")} would be removed (the question now has ${submitted.length} answer(s)) ` +
            `but students chose them; the question was left unchanged`
          );
        }
      }

      await tx.question.update({
        where: { id: questionId },
        data: this.questionData(question, references)
      });

      for (const [index, answer] of submitted.entries()) {
        if (index < stored.length) {
          await tx.questionAnswer.update({ where: { id: stored[index].id }, data: this.answerData(answer) });
        } else {
          await tx.questionAnswer.create({ data: { questionId, ...this.answerData(answer) } });
        }
      }
      if (removedIds.length > 0) {
        await tx.questionAnswer.deleteMany({ where: { id: { in: removedIds }, questionId } });
      }

      await this.replaceImages(tx, "questionImage", questionId, question.questionImages ?? []);
      await this.replaceImages(tx, "questionExplanationImage", questionId, question.explanationImages ?? []);
    }, ITEM_TRANSACTION);
  }

  /** Replace a question's image list when its paths (in order) differ */
  private async replaceImages(
    tx: TransactionClient,
    table: "questionImage" | "questionExplanationImage",
    questionId: number,
    paths: string[]
  ): Promise<void> {
    const delegate: any = tx[table];
    const current: Array<{ imagePath: string }> = await delegate.findMany({
      where: { questionId },
      orderBy: { id: "asc" },
      select: { imagePath: true }
    });
    if (sameList(current.map(image => image.imagePath), paths)) return;
    await delegate.deleteMany({ where: { questionId } });
    // One insert per image keeps ids, and so the display order, in list order
    for (const imagePath of paths) {
      await delegate.create({ data: { questionId, imagePath } });
    }
  }

  /** id and contentHash of the stored questions among the given sourceKeys */
  async getQuestionState(sourceKeys: string[]) {
    const rows = await this.findExistingQuestions(sourceKeys);
    return {
      items: Array.from(rows.entries()).map(([sourceKey, row]) => ({ sourceKey, id: row.id, contentHash: row.contentHash }))
    };
  }

  // ================================================================ exams

  /**
   * Upsert exam papers by sourceKey and set their question list (exam_questions,
   * orderInExam 1..n in questionKeys order). Question keys not imported yet are
   * reported in missingQuestions and left out.
   */
  async upsertExams(rawExams: unknown[], createdById: number): Promise<{ results: ExamImportResult[] }> {
    const results: ExamImportResult[] = new Array(rawExams.length);
    const valid: Array<{ index: number; exam: ImportExam }> = [];
    const seenKeys = new Set<string>();

    rawExams.forEach((raw, index) => {
      const rawKey = raw && typeof raw === "object" && typeof (raw as any).sourceKey === "string" ? (raw as any).sourceKey.trim() : null;
      const parsed = importExamSchema.safeParse(raw);
      if (!parsed.success) {
        results[index] = { sourceKey: rawKey, id: null, action: "failed", missingQuestions: [], error: `Invalid exam: ${describeZodError(parsed.error)}` };
        return;
      }
      if (seenKeys.has(parsed.data.sourceKey)) {
        results[index] = { sourceKey: parsed.data.sourceKey, id: null, action: "failed", missingQuestions: [], error: "sourceKey appears more than once in this request" };
        return;
      }
      seenKeys.add(parsed.data.sourceKey);
      valid.push({ index, exam: parsed.data as ImportExam });
    });

    const exams = valid.map(v => v.exam);
    const [modules, universities, questionIds] = await Promise.all([
      this.findModuleIds(exams.map(e => e.moduleKey)),
      this.findUniversityIds(exams.map(e => e.universityKey)),
      this.findQuestionIds(exams.flatMap(e => e.questionKeys))
    ]);

    for (const { index, exam } of valid) {
      const missingQuestions = Array.from(new Set(exam.questionKeys.filter(key => questionIds[key] === undefined)));
      let existingId: number | null = null;
      try {
        const moduleId = modules[exam.moduleKey];
        const universityId = universities[exam.universityKey];
        if (moduleId === undefined) throw new ImportItemError(`Unknown moduleKey '${exam.moduleKey}'`);
        if (universityId === undefined) throw new ImportItemError(`Unknown universityKey '${exam.universityKey}'`);

        const orderedIds = Array.from(new Set(exam.questionKeys.flatMap(key => (questionIds[key] !== undefined ? [questionIds[key]] : []))));
        const data = {
          title: exam.title,
          description: exam.description ?? null,
          moduleId,
          universityId,
          yearLevel: exam.yearLevel,
          year: exam.year,
          examYear: exam.examYearDate ? new Date(exam.examYearDate) : new Date(Date.UTC(exam.year, 0, 1))
        };

        const outcome = await this.saveExam(exam.sourceKey, data, orderedIds, createdById);
        existingId = outcome.id;
        results[index] = { sourceKey: exam.sourceKey, id: outcome.id, action: outcome.action, missingQuestions };
      } catch (error) {
        if (!(error instanceof ImportItemError)) {
          console.error(`Import of exam ${exam.sourceKey} failed:`, error);
        }
        results[index] = { sourceKey: exam.sourceKey, id: existingId, action: "failed", missingQuestions, error: errorMessage(error) };
      }
    }

    return { results };
  }

  private async saveExam(
    sourceKey: string,
    data: { title: string; description: string | null; moduleId: number; universityId: number; yearLevel: ImportExam["yearLevel"]; year: number; examYear: Date },
    questionIds: number[],
    createdById: number
  ): Promise<{ id: number; action: ImportAction }> {
    return await this.prisma.$transaction(async (tx: TransactionClient) => {
      const existing = await tx.exam.findUnique({
        where: { sourceKey },
        include: { examQuestions: { orderBy: [{ orderInExam: "asc" }, { id: "asc" }], select: { questionId: true, orderInExam: true } } }
      });

      if (!existing) {
        const created = await tx.exam.create({
          data: {
            sourceKey,
            ...data,
            createdById,
            examQuestions: { create: questionIds.map((questionId, i) => ({ questionId, orderInExam: i + 1 })) }
          },
          select: { id: true }
        });
        return { id: created.id, action: "created" as ImportAction };
      }

      const unchanged = existing.title === data.title
        && existing.description === data.description
        && existing.moduleId === data.moduleId
        && existing.universityId === data.universityId
        && existing.yearLevel === data.yearLevel
        && existing.year === data.year
        && existing.examYear.getTime() === data.examYear.getTime()
        && sameList(existing.examQuestions.map(link => link.questionId), questionIds)
        && existing.examQuestions.every((link, i) => link.orderInExam === i + 1);
      if (unchanged) {
        return { id: existing.id, action: "unchanged" as ImportAction };
      }

      await tx.exam.update({ where: { id: existing.id }, data });
      await tx.examQuestion.deleteMany({ where: { examId: existing.id } });
      if (questionIds.length > 0) {
        await tx.examQuestion.createMany({
          data: questionIds.map((questionId, i) => ({ examId: existing.id, questionId, orderInExam: i + 1 }))
        });
      }
      return { id: existing.id, action: "updated" as ImportAction };
    }, ITEM_TRANSACTION);
  }

  // ================================================================ stats

  /**
   * Counts of the imported content (records with a sourceKey), to reconcile with
   * the dataset: questions (published / unpublished / with English), per
   * university, question source and study pack, exams, residency questions per
   * university and part, and images.
   */
  async getStats() {
    const n = (value: unknown) => Number(value ?? 0);

    const [totals] = await this.prisma.$queryRaw<Array<Record<string, bigint>>>`
      SELECT
        count(*) FILTER (WHERE source_key IS NOT NULL) AS total,
        count(*) FILTER (WHERE source_key IS NOT NULL AND is_published) AS published,
        count(*) FILTER (WHERE source_key IS NOT NULL AND NOT is_published) AS unpublished,
        count(*) FILTER (WHERE source_key IS NOT NULL AND question_text_en IS NOT NULL AND question_text_en <> '') AS with_english,
        count(*) FILTER (WHERE source_key IS NULL) AS not_imported
      FROM questions`;

    const [answers] = await this.prisma.$queryRaw<Array<Record<string, bigint>>>`
      SELECT
        count(*) AS total,
        count(*) FILTER (WHERE a.answer_text_en IS NOT NULL AND a.answer_text_en <> '') AS with_english
      FROM question_answers a
      JOIN questions q ON q.id = a.question_id
      WHERE q.source_key IS NOT NULL`;

    const byUniversity = await this.prisma.$queryRaw<Array<any>>`
      SELECT u.id, u.name, u.source_key, count(q.id) AS total,
             count(q.id) FILTER (WHERE q.is_published) AS published,
             count(q.id) FILTER (WHERE NOT q.is_published) AS unpublished,
             count(q.id) FILTER (WHERE q.question_text_en IS NOT NULL AND q.question_text_en <> '') AS with_english
      FROM questions q
      LEFT JOIN universities u ON u.id = q.university_id
      WHERE q.source_key IS NOT NULL
      GROUP BY u.id, u.name, u.source_key
      ORDER BY u.name NULLS LAST`;

    const bySource = await this.prisma.$queryRaw<Array<any>>`
      SELECT s.id, s.name, s.source_key, count(q.id) AS total,
             count(q.id) FILTER (WHERE q.is_published) AS published,
             count(q.id) FILTER (WHERE NOT q.is_published) AS unpublished,
             count(q.id) FILTER (WHERE q.question_text_en IS NOT NULL AND q.question_text_en <> '') AS with_english
      FROM questions q
      LEFT JOIN question_sources s ON s.id = q.source_id
      WHERE q.source_key IS NOT NULL
      GROUP BY s.id, s.name, s.source_key
      ORDER BY s.name NULLS LAST`;

    const byStudyPack = await this.prisma.$queryRaw<Array<any>>`
      SELECT sp.id, sp.name, sp.source_key, count(q.id) AS total,
             count(q.id) FILTER (WHERE q.is_published) AS published,
             count(q.id) FILTER (WHERE NOT q.is_published) AS unpublished,
             count(q.id) FILTER (WHERE q.question_text_en IS NOT NULL AND q.question_text_en <> '') AS with_english
      FROM questions q
      LEFT JOIN courses c ON c.id = q.course_id
      LEFT JOIN modules m ON m.id = c.module_id
      LEFT JOIN unites un ON un.id = m.unite_id
      LEFT JOIN study_packs sp ON sp.id = un.study_pack_id
      WHERE q.source_key IS NOT NULL
      GROUP BY sp.id, sp.name, sp.source_key
      ORDER BY sp.name NULLS LAST`;

    const [exams] = await this.prisma.$queryRaw<Array<Record<string, bigint>>>`
      SELECT
        count(*) FILTER (WHERE e.source_key IS NOT NULL) AS total,
        count(*) FILTER (WHERE e.source_key IS NULL) AS not_imported,
        (SELECT count(*) FROM exam_questions eq JOIN exams ie ON ie.id = eq.exam_id WHERE ie.source_key IS NOT NULL) AS exam_questions
      FROM exams e`;

    // Residency content, as residencyQuestionWhere defines it: university and exam
    // year, and either no course (and no exam link) or a course of a RESIDENCY pack
    const residency = await this.prisma.$queryRaw<Array<any>>`
      SELECT u.id AS university_id, u.name AS university, u.source_key AS university_key,
             substring(q.metadata from '"part":"([^"]*)"') AS part,
             count(*) AS total, count(*) FILTER (WHERE q.is_published) AS published
      FROM questions q
      JOIN universities u ON u.id = q.university_id
      LEFT JOIN courses c ON c.id = q.course_id
      LEFT JOIN modules m ON m.id = c.module_id
      LEFT JOIN unites un ON un.id = m.unite_id
      LEFT JOIN study_packs sp ON sp.id = un.study_pack_id
      WHERE q.source_key IS NOT NULL
        AND q.exam_year IS NOT NULL
        AND (
          (q.course_id IS NULL AND q.exam_id IS NULL
            AND NOT EXISTS (SELECT 1 FROM exam_questions eq WHERE eq.question_id = q.id))
          OR sp.type = 'RESIDENCY'
        )
      GROUP BY u.id, u.name, u.source_key, part
      ORDER BY u.name, part NULLS LAST`;

    const [images] = await this.prisma.$queryRaw<Array<Record<string, bigint>>>`
      SELECT
        (SELECT count(*) FROM question_images qi JOIN questions q ON q.id = qi.question_id WHERE q.source_key IS NOT NULL) AS question_images,
        (SELECT count(*) FROM question_explanation_images qe JOIN questions q ON q.id = qe.question_id WHERE q.source_key IS NOT NULL) AS explanation_images`;

    let files = 0;
    try {
      files = (await fs.promises.readdir(this.imagesDirectory)).filter(name => MEDIA_FILE_NAME.test(name)).length;
    } catch (error: any) {
      if (error?.code !== "ENOENT") throw error;
    }

    const group = (rows: any[]) => rows.map(row => ({
      id: row.id ?? null,
      name: row.name ?? null,
      sourceKey: row.source_key ?? null,
      total: n(row.total),
      published: n(row.published),
      unpublished: n(row.unpublished),
      withEnglish: n(row.with_english)
    }));

    return {
      questions: {
        total: n(totals.total),
        published: n(totals.published),
        unpublished: n(totals.unpublished),
        withEnglish: n(totals.with_english),
        notImported: n(totals.not_imported)
      },
      answers: {
        total: n(answers.total),
        withEnglish: n(answers.with_english)
      },
      byUniversity: group(byUniversity),
      bySource: group(bySource),
      byStudyPack: group(byStudyPack),
      exams: {
        total: n(exams.total),
        examQuestions: n(exams.exam_questions),
        notImported: n(exams.not_imported)
      },
      residency: residency.map(row => ({
        universityId: row.university_id,
        universityKey: row.university_key ?? null,
        university: row.university,
        part: row.part ?? null,
        count: n(row.total),
        total: n(row.total),
        published: n(row.published)
      })),
      images: {
        // Content-addressed image files (<sha1>.<ext>) in UPLOADS_DIR/images
        total: files,
        files,
        questionImages: n(images.question_images),
        explanationImages: n(images.explanation_images)
      },
      generatedAt: new Date().toISOString()
    };
  }
}
