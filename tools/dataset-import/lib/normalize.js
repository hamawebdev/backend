'use strict';

const { sha1 } = require('./util');

// Lower case, no accents, '&' -> 'et', '(1 ère)'-style year markers dropped,
// every run of other characters collapsed to '-'.
function normalizeName(value) {
  return String(value || '')
    .replace(/[œŒ]/g, 'oe')
    .replace(/[æÆ]/g, 'ae')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' et ')
    .replace(/\(\s*\d+\s*(?:ere|er|re|eme|e|nd|nde)\s*(?:annee)?\s*\)/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Slug-form year markers left at the end ('anatomie-1-ere', 'unite-1-2-eme')
function stripYearMarker(slug) {
  return slug.replace(/-\d+-(?:ere|er|re|eme|e)$/, '');
}

// Module synonyms, keyed by normalised name. Derived from the module names found in
// every university of the dataset (see README, "Module canonicalisation").
const MODULE_SYNONYMS = {
  'gastro-enterologie': 'hepato-gastro-enterologie',
  'hepato-gastro-enterologie': 'hepato-gastro-enterologie',
  urologie: 'urologie-nephrologie',
  nephrologie: 'urologie-nephrologie',
  'urologie-et-nephrologie': 'urologie-nephrologie',
  umc: 'urgences',
  'urgences-umc': 'urgences',
  'medecine-legale-droit-medical': 'medecine-legale',
  'medecine-legale-et-droit-medical': 'medecine-legale',
  parasitologie: 'parasitologie-mycologie',
  anapathologie: 'anatomie-pathologique',
  acp: 'anatomie-pathologique',
  'acp-anatomie-et-cytologie-pathologique': 'anatomie-pathologique',
  'anatomie-et-cytologie-pathologique': 'anatomie-pathologique',
  'anatomie-et-cytologie-pathologiques': 'anatomie-pathologique',
  'microbiologie-medicale': 'microbiologie',
  'pharmacologie-clinique': 'pharmacologie',
  hematologie: 'onco-hematologie',
  'oncologie-medicale': 'onco-hematologie',
  gynecologie: 'gynecologie-obstetrique',
  'gynecologie-et-obstetrique': 'gynecologie-obstetrique',
  'epidemiologie-et-economie-de-la-sante': 'epidemiologie',
  'epidemiologie-economie-de-la-sante': 'epidemiologie',
  'medecine-de-travail': 'sante-au-travail',
  'medecine-du-travail': 'sante-au-travail',
  'sante-au-travail-et-environnement': 'sante-au-travail',
  'oto-rhino-laryngologie': 'orl',
  orthopedie: 'appareil-locomoteur',
  rhumatologie: 'appareil-locomoteur',
  mpr: 'appareil-locomoteur',
};

// Year-specific synonyms: Sétif numbers its units, Alger names them (same national
// unit numbering, confirmed by the course lists), and 2nd-year Sétif genetics and
// immunology are Alger's genetics and immunology units.
const MODULE_SYNONYMS_BY_YEAR = {
  2: {
    'unite-1': 'unite-cardio-respiratoire',
    'unite-2': 'unite-digestive',
    'unite-3': 'unite-renale',
    'unite-4': 'unite-endocrinienne',
    'unite-5': 'unite-neurosensorielle',
    genetique: 'unite-genetique',
    immunologie: 'unite-immunologique',
  },
  3: {
    'unite-1': 'unite-cardio-respiratoire-et-psychologie-medicale',
    'unite-2': 'unite-appareil-neurologique-locomoteur-et-cutane',
    'unite-3': 'unite-appareil-endocrines-reproduction-et-urinaire',
    'unite-4': 'unite-appareil-digestif-et-organes-hematopoietique',
  },
};

// Display names for merged modules where the most common variant would hide part of
// the merged content. Everything else uses the most common accented variant.
const MODULE_DISPLAY = {
  'hepato-gastro-enterologie': 'Hépato-gastro-entérologie',
  'onco-hematologie': 'Onco-hématologie',
  'gynecologie-obstetrique': 'Gynécologie et obstétrique',
  'medecine-legale': 'Médecine légale et droit médical',
};

const YEAR_LEVELS = [null, 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX'];

function yearLevel(studyYear) {
  return YEAR_LEVELS[Number(studyYear)] || undefined;
}

function canonicalModuleSlug(studyYear, module) {
  const fromName = stripYearMarker(normalizeName(module && module.name));
  const slug = fromName || stripYearMarker(normalizeName(module && module.slug)) || 'sans-module';
  const perYear = MODULE_SYNONYMS_BY_YEAR[Number(studyYear)] || {};
  return perYear[slug] || MODULE_SYNONYMS[slug] || slug;
}

function moduleKeyFor(tree, studyYear, module) {
  const slug = canonicalModuleSlug(studyYear, module);
  return tree === 'residanat'
    ? `module:residanat:year-${studyYear}:${slug}`
    : `module:year-${studyYear}:${slug}`;
}

// Long course names are cut and suffixed with a short hash so keys stay readable and unique
function courseSlug(course) {
  let slug = stripYearMarker(normalizeName(course && course.name)) || normalizeName(course && course.slug) || 'sans-titre';
  if (slug.length > 100) slug = slug.slice(0, 90).replace(/-+$/, '') + '-' + sha1(Buffer.from(slug)).slice(0, 8);
  return slug;
}

function courseKeyFor(moduleKey, course) {
  return `course:${moduleKey}:${courseSlug(course)}`;
}

function hasAccent(text) {
  return /[^\x00-\x7f]/.test(text) ? 1 : 0;
}

function startsUpper(text) {
  const first = text.charAt(0);
  return first !== first.toLowerCase() ? 1 : 0;
}

// Display names lose the '(1 ère)'-style year markers the keys already ignore, and
// stray leading punctuation ('+ Insuffisance mitrale')
function cleanDisplay(text) {
  return String(text || '')
    .replace(/\(\s*\d+\s*(?:ère|ere|ème|eme|er|re|e|nd|nde)\s*(?:année|annee)?\s*\)/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[^\p{L}\p{N}(]+/u, '');
}

// 'Unité 3': numbered units say nothing about their content
function isGenericName(key) {
  return /^unite-\d+$/.test(key);
}

// counts: Map(rawName -> weight). Picks the most common spelling group (accent- and
// case-insensitive, descriptive names before numbered units), then inside it the most
// common properly accented, capitalised variant.
function pickDisplayName(counts) {
  const groups = new Map();
  for (const [raw, weight] of counts) {
    const name = cleanDisplay(raw);
    if (!name) continue;
    const key = normalizeName(name);
    const group = groups.get(key) || { total: 0, variants: new Map() };
    group.total += weight;
    group.variants.set(name, (group.variants.get(name) || 0) + weight);
    groups.set(key, group);
  }
  const ordered = [...groups.entries()].sort(
    (a, b) => isGenericName(a[0]) - isGenericName(b[0]) || b[1].total - a[1].total || (a[0] < b[0] ? -1 : 1),
  );
  if (!ordered.length) return undefined;
  const variants = [...ordered[0][1].variants.entries()].sort(
    (a, b) => hasAccent(b[0]) - hasAccent(a[0]) || startsUpper(b[0]) - startsUpper(a[0]) || b[1] - a[1] || (a[0] < b[0] ? -1 : 1),
  );
  return variants[0][0];
}

const PART_MAP = {
  'sciences-fondamentales': 'Sciences_fondamentales',
  'pathologie-medico-chirurgicale': 'Pathologie_medico_chirurgical',
  'dossier-clinique': 'Dossier_clinique',
  biologie: 'Biologie',
  medicale: 'Medicale',
  chirurgie: 'Chirurgie',
};

function mapPart(part) {
  if (part === undefined || part === null || part === '') return undefined;
  return PART_MAP[normalizeName(part)];
}

module.exports = {
  normalizeName,
  cleanDisplay,
  stripYearMarker,
  canonicalModuleSlug,
  moduleKeyFor,
  courseSlug,
  courseKeyFor,
  pickDisplayName,
  yearLevel,
  mapPart,
  MODULE_SYNONYMS,
  MODULE_SYNONYMS_BY_YEAR,
  MODULE_DISPLAY,
  PART_MAP,
};
