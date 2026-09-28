import { PrismaClient, QuestionType, YearLevel } from "@prisma/client";

/**
 * In-memory copy of what the session setup screens need: the content tree
 * (study packs, unites, modules, courses) and one compact entry per published
 * question (ids and filter fields only, no text). Setup endpoints (content and
 * session filters, question counts, picking a session's questions, résidanat
 * universities and parts) are answered from it instead of running aggregate
 * queries on every request.
 *
 * Freshness: the catalog is reloaded when Postgres' write counters for the
 * tables it copies change (checked at most every CHECK_INTERVAL_MS, in the
 * background, while the current copy keeps being served) and right away after
 * an admin write in this process (invalidate()). Under NODE_ENV=test every
 * request reads the database, so tests see the rows they have just written.
 */

const CHECK_INTERVAL_MS = Number(process.env.CATALOG_CHECK_INTERVAL_MS || 15000);
const FALLBACK_MAX_AGE_MS = 5 * 60 * 1000;

const TRACKED_TABLES = [
  'questions', 'courses', 'modules', 'unites', 'study_packs',
  'universities', 'question_sources', 'exam_questions'
];

export const QUESTION_TYPES: QuestionType[] = ['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'QROC'];
export const YEAR_LEVELS: YearLevel[] = ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN'];

export type CatalogPack = { id: number; name: string; type: string; yearNumber: string | null; isActive: boolean };
export type CatalogUnite = { id: number; studyPackId: number; name: string; logoUrl: string | null };
export type CatalogModule = { id: number; uniteId: number | null; name: string; description: string | null; imagePath: string | null };
export type CatalogCourse = { id: number; moduleId: number; name: string; description: string | null };
export type CatalogNamed = { id: number; name: string; country?: string };

/** Filters shared by question counts and session creation (POST /quizzes/question-count, /quizzes/sessions) */
export type QuestionFilters = {
  courseIds: number[];
  questionTypes?: string[];
  years?: number[];
  rotations?: string[];
  universityIds?: number[];
  questionSourceIds?: number[];
  repetitionCountMin?: number;
  repetitionYears?: number[];
};

/**
 * Whether a study pack belongs to a year level: its yearNumber, and for SEVEN (the
 * résidanat year) also any RESIDENCY pack, whose yearNumber is empty
 */
export function packMatchesYearLevel(pack: { type: string; yearNumber: string | null }, yearLevel: string): boolean {
  return pack.yearNumber === yearLevel || (yearLevel === 'SEVEN' && String(pack.type).toUpperCase() === 'RESIDENCY');
}

export class QuestionCatalog {
  readonly builtAt = Date.now();

  // Content tree, each list in database order
  readonly packs: CatalogPack[];
  readonly unites: CatalogUnite[];
  readonly modules: CatalogModule[];
  readonly courses: CatalogCourse[];
  readonly universities: CatalogNamed[];
  readonly sources: CatalogNamed[];
  readonly packById = new Map<number, CatalogPack>();
  readonly uniteById = new Map<number, CatalogUnite>();
  readonly moduleById = new Map<number, CatalogModule>();
  readonly courseById = new Map<number, CatalogCourse>();
  readonly universityById = new Map<number, CatalogNamed>();
  readonly sourceById = new Map<number, CatalogNamed>();
  readonly modulesByUnite = new Map<number, CatalogModule[]>();
  readonly coursesByModule = new Map<number, CatalogCourse[]>();
  readonly independentModules: CatalogModule[];

  // Published questions, one slot per question, in id order. 0 means null.
  readonly size: number;
  readonly id: Int32Array;
  readonly courseId: Int32Array;
  readonly sourceId: Int32Array;
  readonly universityId: Int32Array;
  readonly examYear: Int32Array;
  readonly questionType: Uint8Array; // index in QUESTION_TYPES
  readonly yearLevel: Uint8Array; // 1 + index in YEAR_LEVELS, 0 = null
  readonly repetitionCount: Int32Array;
  readonly repetitionYears: Map<number, string>; // slot -> raw JSON text, only when not '[]'
  readonly residency: Uint8Array; // 1 when the question is résidanat content (see residencyQuestionWhere)
  readonly part: Map<number, string>; // slot -> résidanat part from metadata
  /** Slots of each course's published questions, in id order */
  readonly slotsByCourse = new Map<number, number[]>();
  /** Per course: bit i set when a published question has yearLevel YEAR_LEVELS[i] */
  readonly yearLevelMaskByCourse = new Map<number, number>();

  constructor(data: {
    packs: CatalogPack[]; unites: CatalogUnite[]; modules: CatalogModule[]; courses: CatalogCourse[];
    universities: CatalogNamed[]; sources: CatalogNamed[];
    questions: Array<{
      id: number; courseId: number | null; examId: number | null; sourceId: number | null; universityId: number | null;
      examYear: number | null; questionType: QuestionType; yearLevel: YearLevel | null; repetitionCount: number;
      repetitionYears: string; metadata: string | null;
    }>;
    examQuestionIds: Set<number>;
  }) {
    // Lists keep the order the database returned them in, which is the order the
    // endpoints listed them in before they were served from this catalog
    const byId = <T extends { id: number }>(a: T, b: T) => a.id - b.id;
    this.packs = data.packs;
    this.unites = data.unites;
    this.modules = data.modules;
    this.courses = data.courses;
    this.universities = data.universities;
    this.sources = data.sources;
    for (const p of this.packs) this.packById.set(p.id, p);
    for (const u of this.unites) this.uniteById.set(u.id, u);
    for (const m of this.modules) {
      this.moduleById.set(m.id, m);
      if (m.uniteId !== null) push(this.modulesByUnite, m.uniteId, m);
    }
    this.independentModules = this.modules.filter(m => m.uniteId === null);
    for (const c of this.courses) {
      this.courseById.set(c.id, c);
      push(this.coursesByModule, c.moduleId, c);
    }
    for (const u of this.universities) this.universityById.set(u.id, u);
    for (const s of this.sources) this.sourceById.set(s.id, s);

    const questions = [...data.questions].sort(byId);
    const n = questions.length;
    this.size = n;
    this.id = new Int32Array(n);
    this.courseId = new Int32Array(n);
    this.sourceId = new Int32Array(n);
    this.universityId = new Int32Array(n);
    this.examYear = new Int32Array(n);
    this.questionType = new Uint8Array(n);
    this.yearLevel = new Uint8Array(n);
    this.repetitionCount = new Int32Array(n);
    this.repetitionYears = new Map();
    this.residency = new Uint8Array(n);
    this.part = new Map();

    const residencyPackIds = new Set(this.packs.filter(p => p.type === 'RESIDENCY').map(p => p.id));
    for (let i = 0; i < n; i++) {
      const q = questions[i];
      this.id[i] = q.id;
      this.courseId[i] = q.courseId ?? 0;
      this.sourceId[i] = q.sourceId ?? 0;
      this.universityId[i] = q.universityId ?? 0;
      this.examYear[i] = q.examYear ?? 0;
      this.questionType[i] = Math.max(0, QUESTION_TYPES.indexOf(q.questionType));
      this.yearLevel[i] = q.yearLevel ? YEAR_LEVELS.indexOf(q.yearLevel) + 1 : 0;
      this.repetitionCount[i] = q.repetitionCount ?? 0;
      if (q.repetitionYears && q.repetitionYears !== '[]') this.repetitionYears.set(i, q.repetitionYears);

      // Same rule as residencyQuestionWhere(): a university and an exam year, and either
      // no course (and not part of an exam) or a course in a RESIDENCY study pack
      if (q.universityId !== null && q.examYear !== null) {
        let isResidency = false;
        if (q.courseId === null) {
          isResidency = q.examId === null && !data.examQuestionIds.has(q.id);
        } else {
          const packId = this.packIdOfCourse(q.courseId);
          isResidency = packId !== null && residencyPackIds.has(packId);
        }
        if (isResidency) {
          this.residency[i] = 1;
          const part = parsePart(q.metadata);
          if (part) this.part.set(i, part);
        }
      }

      if (q.courseId !== null) {
        push(this.slotsByCourse, q.courseId, i);
        if (q.yearLevel) {
          const bit = 1 << YEAR_LEVELS.indexOf(q.yearLevel);
          this.yearLevelMaskByCourse.set(q.courseId, (this.yearLevelMaskByCourse.get(q.courseId) || 0) | bit);
        }
      }
    }
  }

  /** Study pack of a course's module, null for an independent module (or an unknown course) */
  packIdOfCourse(courseId: number): number | null {
    const course = this.courseById.get(courseId);
    if (!course) return null;
    const module = this.moduleById.get(course.moduleId);
    if (!module || module.uniteId === null) return null;
    return this.uniteById.get(module.uniteId)?.studyPackId ?? null;
  }

  /**
   * Whether a course is open to someone with these study packs: its module sits in
   * one of the packs, or it is an independent module (no unite)
   */
  courseAccessible(courseId: number, packIds: Set<number>): boolean {
    const course = this.courseById.get(courseId);
    if (!course) return false;
    const module = this.moduleById.get(course.moduleId);
    if (!module) return false;
    if (module.uniteId === null) return true;
    const unite = this.uniteById.get(module.uniteId);
    return !!unite && packIds.has(unite.studyPackId);
  }

  /** Every course open to someone with these study packs, optionally within one unite or module */
  accessibleCourseIds(packIds: Set<number>, scope?: { uniteId?: number; moduleId?: number }): number[] {
    const out: number[] = [];
    for (const course of this.courses) {
      const module = this.moduleById.get(course.moduleId);
      if (!module) continue;
      if (scope?.moduleId && course.moduleId !== scope.moduleId) continue;
      if (scope?.uniteId && module.uniteId !== scope.uniteId) continue;
      if (this.courseAccessible(course.id, packIds)) out.push(course.id);
    }
    return out;
  }

  /** Slots of the questions of these courses that pass the filters (question-count and session rules) */
  matchingSlots(filters: QuestionFilters, courseOk?: (courseId: number) => boolean): number[] {
    const types = filters.questionTypes?.length ? new Set(filters.questionTypes) : null;
    const years = filters.years?.length ? new Set(filters.years) : null;
    const rotations = filters.rotations?.length ? new Set(filters.rotations) : null;
    const universities = filters.universityIds?.length ? new Set(filters.universityIds) : null;
    const sources = filters.questionSourceIds?.length ? new Set(filters.questionSourceIds) : null;
    const repetitionMin = filters.repetitionCountMin !== undefined && filters.repetitionCountMin > 0 ? filters.repetitionCountMin : null;
    const repetitionYears = filters.repetitionYears?.length ? filters.repetitionYears.map(String) : null;

    const out: number[] = [];
    for (const courseId of new Set(filters.courseIds)) {
      if (courseOk && !courseOk(courseId)) continue;
      const slots = this.slotsByCourse.get(courseId);
      if (!slots) continue;
      for (const i of slots) {
        if (types && !types.has(QUESTION_TYPES[this.questionType[i]])) continue;
        if (years && !years.has(this.examYear[i])) continue;
        if (rotations && (this.yearLevel[i] === 0 || !rotations.has(YEAR_LEVELS[this.yearLevel[i] - 1]))) continue;
        if (universities && !universities.has(this.universityId[i])) continue;
        if (sources && !sources.has(this.sourceId[i])) continue;
        if (repetitionMin !== null && this.repetitionCount[i] < repetitionMin) continue;
        if (repetitionYears) {
          // Substring match on the stored JSON text, like the previous `contains` filter
          const text = this.repetitionYears.get(i) ?? '[]';
          if (!repetitionYears.some(year => text.includes(year))) continue;
        }
        out.push(i);
      }
    }
    return out;
  }

  /** Slots of the published résidanat questions of a university and exam year, in id order */
  residencySlots(universityId: number, examYear: number): number[] {
    const out: number[] = [];
    for (let i = 0; i < this.size; i++) {
      if (this.residency[i] && this.universityId[i] === universityId && this.examYear[i] === examYear) out.push(i);
    }
    return out;
  }
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const list = map.get(key);
  if (list) list.push(value); else map.set(key, [value]);
}

function parsePart(metadata: string | null): string | null {
  if (!metadata) return null;
  try {
    const meta = JSON.parse(metadata);
    return meta && typeof meta.part === 'string' ? meta.part : null;
  } catch {
    return null;
  }
}

type QuestionRow = {
  id: number; course_id: number | null; exam_id: number | null; source_id: number | null; university_id: number | null;
  exam_year: number | null; question_type: QuestionType; year_level: YearLevel | null; repetition_count: number;
  repetition_years: string | null; metadata: string | null;
};

async function loadCatalog(prisma: PrismaClient): Promise<QuestionCatalog> {
  const [packs, unites, modules, courses, universities, sources, questions, examQuestions] = await Promise.all([
    prisma.studyPack.findMany({ select: { id: true, name: true, type: true, yearNumber: true, isActive: true } }),
    prisma.unite.findMany({ select: { id: true, studyPackId: true, name: true, logoUrl: true } }),
    prisma.module.findMany({ select: { id: true, uniteId: true, name: true, description: true, imagePath: true } }),
    prisma.course.findMany({ select: { id: true, moduleId: true, name: true, description: true } }),
    prisma.university.findMany({ select: { id: true, name: true, country: true } }),
    prisma.questionSource.findMany({ select: { id: true, name: true } }),
    // Filter fields only; metadata only when it may hold a résidanat part, repetition
    // years only when not empty, so the load stays small
    prisma.$queryRawUnsafe<QuestionRow[]>(
      `SELECT id, course_id, exam_id, source_id, university_id, exam_year,
              question_type::text AS question_type, year_level::text AS year_level, repetition_count,
              CASE WHEN repetition_years <> '[]' THEN repetition_years END AS repetition_years,
              CASE WHEN position('"part"' IN metadata) > 0 THEN metadata END AS metadata
         FROM questions WHERE is_published`
    ),
    // Course-less questions that belong to an exam are not résidanat content
    prisma.$queryRawUnsafe<Array<{ question_id: number }>>(
      `SELECT DISTINCT eq.question_id FROM exam_questions eq
         JOIN questions q ON q.id = eq.question_id WHERE q.course_id IS NULL`
    )
  ]);
  return new QuestionCatalog({
    packs, unites, modules, courses, universities, sources,
    questions: questions.map(q => ({
      id: q.id, courseId: q.course_id, examId: q.exam_id, sourceId: q.source_id, universityId: q.university_id,
      examYear: q.exam_year, questionType: q.question_type, yearLevel: q.year_level, repetitionCount: q.repetition_count,
      repetitionYears: q.repetition_years ?? '[]', metadata: q.metadata
    })),
    examQuestionIds: new Set(examQuestions.map(e => e.question_id))
  });
}

/** Write counters of the copied tables: any insert, update or delete changes the result */
async function readFingerprint(prisma: PrismaClient): Promise<string> {
  const rows = await prisma.$queryRawUnsafe<Array<{ relname: string; ins: bigint; upd: bigint; del: bigint }>>(
    `SELECT relname, n_tup_ins AS ins, n_tup_upd AS upd, n_tup_del AS del
       FROM pg_stat_user_tables WHERE relname = ANY($1::text[]) ORDER BY relname`,
    TRACKED_TABLES
  );
  return rows.map(r => `${r.relname}:${r.ins}:${r.upd}:${r.del}`).join('|');
}

let current: QuestionCatalog | null = null;
let currentFingerprint: string | null = null;
let loading: Promise<QuestionCatalog> | null = null;
let checking: Promise<void> | null = null;
let lastCheck = 0;
let dirty = false;

function reload(prisma: PrismaClient): Promise<QuestionCatalog> {
  if (!loading) {
    loading = (async () => {
      // Read the counters first: a write that lands during the load changes them
      // again, so the next check reloads
      const fingerprint = await readFingerprint(prisma).catch(() => null);
      dirty = false;
      const catalog = await loadCatalog(prisma);
      current = catalog;
      currentFingerprint = fingerprint;
      lastCheck = Date.now();
      return catalog;
    })().finally(() => { loading = null; });
  }
  return loading;
}

function checkInBackground(prisma: PrismaClient) {
  if (checking || loading) return;
  checking = (async () => {
    try {
      let fingerprint: string | null = null;
      try {
        fingerprint = await readFingerprint(prisma);
      } catch (error) {
        console.error('Question catalog: write counters unavailable:', error);
      }
      lastCheck = Date.now();
      const changed = fingerprint === null
        // Without counters, reload on a timer
        ? !current || Date.now() - current.builtAt >= FALLBACK_MAX_AGE_MS
        : fingerprint !== currentFingerprint;
      if (dirty || changed) await reload(prisma);
    } catch (error) {
      console.error('Question catalog refresh failed:', error);
    }
  })().finally(() => { checking = null; });
}

/**
 * The current catalog. Only the first call (and every call under NODE_ENV=test)
 * waits for the database; afterwards changes are picked up in the background.
 */
export async function getQuestionCatalog(prisma: PrismaClient): Promise<QuestionCatalog> {
  if (process.env.NODE_ENV === 'test') {
    return loadCatalog(prisma);
  }
  if (!current) {
    return reload(prisma);
  }
  if (dirty || Date.now() - lastCheck >= CHECK_INTERVAL_MS) {
    checkInBackground(prisma);
  }
  return current;
}

/** Reload on next use: called after admin writes, which may change content or questions */
export function invalidateQuestionCatalog() {
  dirty = true;
}

/** Load the catalog ahead of the first student request (server start) */
export function warmQuestionCatalog(prisma: PrismaClient) {
  if (process.env.NODE_ENV === 'test') return;
  reload(prisma).catch(error => console.error('Question catalog warm-up failed:', error));
}
