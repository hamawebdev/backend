'use strict';

const { moduleKeyFor, courseKeyFor, canonicalModuleSlug, pickDisplayName, MODULE_DISPLAY, yearLevel } = require('./normalize');

const KIND_LABEL = { externat: 'Externat', militaire: 'Militaire', residanat: 'Résidanat' };

// Files with course: null (the dataset's _no-course folders) get one course per module.
// A question without a course would count as residency content on the platform
// (residencyQuestionWhere), which externat questions must not.
const NO_COURSE_SLUG = '_no-course';
const NO_COURSE_NAME = 'Questions non classées';
const OTHER_SOURCE = { sourceKey: 'src:other', name: 'Autres sources' };

function ordinal(n) {
  return n === 1 ? '1ère' : `${n}ème`;
}

const STUDY_PACKS = [1, 2, 3, 4, 5, 6].map((n) => ({
  sourceKey: `pack:year-${n}`,
  name: `${ordinal(n)} année`,
  type: 'YEAR',
  yearNumber: yearLevel(n),
  pricePerMonth: 100,
  pricePerYear: 1200,
  isActive: true,
})).concat([{
  sourceKey: 'pack:residanat',
  name: 'Résidanat',
  type: 'RESIDENCY',
  pricePerMonth: 625,
  pricePerYear: 7500,
  isActive: true,
}]);

function addVariant(map, key, name, weight = 1) {
  if (!name) return;
  let variants = map.get(key);
  if (!variants) map.set(key, (variants = new Map()));
  variants.set(name, (variants.get(name) || 0) + weight);
}

/**
 * Sets moduleKey, courseKey, universityKey and questionSourceKey on every record and
 * collects the spelling variants of every module and course over the whole dataset,
 * so display names do not depend on which subset gets imported first.
 */
function assignKeys(dataset) {
  const moduleInfo = new Map(); // moduleKey -> { tree, studyYear, slug }
  const moduleVariants = new Map(); // `${studyYear}:${slug}` -> Map(name -> questions)
  const courseInfo = new Map(); // courseKey -> moduleKey
  const courseVariants = new Map();

  const registerModule = (tree, studyYear, module, weight) => {
    const key = moduleKeyFor(tree, studyYear, module);
    const slug = canonicalModuleSlug(studyYear, module);
    if (!moduleInfo.has(key)) moduleInfo.set(key, { tree, studyYear, slug });
    // Spellings are pooled per study year across both trees, so a résidanat module
    // gets the same name as the year module it mirrors
    addVariant(moduleVariants, `${studyYear}:${slug}`, module && module.name, weight);
    return key;
  };

  for (const r of dataset.records) {
    r.universityKey = r.university ? `univ:${r.university}` : undefined;
    r.questionSourceKey = r.university ? `src:${r.university}:${r.kind}` : OTHER_SOURCE.sourceKey;
    r.moduleKey = undefined;
    r.courseKey = undefined;
    if (r.view === 'course' && r.module && r.studyYear) {
      r.moduleKey = registerModule(r.tree, r.studyYear, r.module, 1);
      r.courseKey = r.course ? courseKeyFor(r.moduleKey, r.course) : `course:${r.moduleKey}:${NO_COURSE_SLUG}`;
      courseInfo.set(r.courseKey, r.moduleKey);
      addVariant(courseVariants, r.courseKey, r.course ? r.course.name : NO_COURSE_NAME);
    }
  }
  for (const paper of dataset.papers) {
    const d = paper.data;
    if (d.kind !== 'residanat' && d.module && d.studyYear) registerModule('year', d.studyYear, d.module, 0.001);
  }
  dataset.naming = { moduleInfo, moduleVariants, courseInfo, courseVariants };
  return dataset.naming;
}

function uniteKeyForModule(info) {
  return info.tree === 'residanat' ? `unite:residanat:year-${info.studyYear}` : `unite:year-${info.studyYear}`;
}

function moduleName(key, naming) {
  const info = naming.moduleInfo.get(key);
  return MODULE_DISPLAY[info.slug] || pickDisplayName(naming.moduleVariants.get(`${info.studyYear}:${info.slug}`) || new Map()) || info.slug;
}

/**
 * Builds the PUT /admin/import/hierarchy payload for the given records and exams
 * (only what they use, plus every study pack and year unite).
 */
function buildHierarchy(dataset, records, exams) {
  const { naming, universityNames } = dataset;
  const universities = new Map();
  const sources = new Map();
  const modules = new Set();
  const courses = new Set();

  for (const r of records) {
    if (r.universityKey) universities.set(r.universityKey, r.university);
    if (r.questionSourceKey === OTHER_SOURCE.sourceKey) sources.set(OTHER_SOURCE.sourceKey, OTHER_SOURCE.name);
    else sources.set(r.questionSourceKey, `${KIND_LABEL[r.kind] || r.kind} ${universityNames[r.university] || r.university}`);
    if (r.moduleKey) modules.add(r.moduleKey);
    if (r.courseKey) courses.add(r.courseKey);
  }
  for (const exam of exams) {
    universities.set(exam.universityKey, exam.universityKey.slice('univ:'.length));
    modules.add(exam.moduleKey);
  }

  const unites = new Map();
  for (let n = 1; n <= 6; n++) unites.set(`unite:year-${n}`, { studyPackKey: `pack:year-${n}`, name: 'Modules' });
  const moduleList = [...modules].sort().map((key) => {
    const info = naming.moduleInfo.get(key);
    if (!info) throw new Error(`module ${key} is not in the dataset`);
    const uniteKey = uniteKeyForModule(info);
    if (!unites.has(uniteKey)) unites.set(uniteKey, { studyPackKey: 'pack:residanat', name: `${ordinal(info.studyYear)} année` });
    return { sourceKey: key, uniteKey, name: moduleName(key, naming) };
  });

  return {
    universities: [...universities.entries()].sort().map(([sourceKey, slug]) => ({ sourceKey, name: universityNames[slug] || slug })),
    sources: [...sources.entries()].sort().map(([sourceKey, name]) => ({ sourceKey, name })),
    studyPacks: STUDY_PACKS.map((p) => ({ ...p })),
    unites: [...unites.entries()].sort().map(([sourceKey, u]) => ({ sourceKey, studyPackKey: u.studyPackKey, name: u.name })),
    modules: moduleList,
    courses: [...courses].sort().map((key) => ({
      sourceKey: key,
      moduleKey: naming.courseInfo.get(key),
      name: pickDisplayName(naming.courseVariants.get(key) || new Map()) || key.split(':').pop(),
    })),
  };
}

function packKeyForModule(moduleKey) {
  const m = /^module:(residanat:)?year-(\d+):/.exec(moduleKey || '');
  if (!m) return undefined;
  return m[1] ? 'pack:residanat' : `pack:year-${m[2]}`;
}

module.exports = { assignKeys, buildHierarchy, packKeyForModule, STUDY_PACKS, OTHER_SOURCE, KIND_LABEL };
