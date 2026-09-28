'use strict';

const test = require('node:test');
const assert = require('assert');
const {
  normalizeName,
  canonicalModuleSlug,
  moduleKeyFor,
  courseKeyFor,
  courseSlug,
  pickDisplayName,
  mapPart,
} = require('../lib/normalize');

// Every distinct module (tree, study year, name, slug) of the real dataset
const MODULES = require('./fixtures/modules.json');

test('normalizeName: lower case, no accents, & -> et, no year markers, punctuation collapsed', () => {
  assert.strictEqual(normalizeName('Anatomie (1 ère)'), 'anatomie');
  assert.strictEqual(normalizeName('Unité 1 (2 ème)'), 'unite-1');
  assert.strictEqual(normalizeName('Urologie & Néphrologie'), 'urologie-et-nephrologie');
  assert.strictEqual(normalizeName('Embryologie du cœur'), 'embryologie-du-coeur');
  assert.strictEqual(normalizeName('Urgences (UMC)'), 'urgences-umc');
  assert.strictEqual(normalizeName('L’appareil juxta glomérulaire'), normalizeName("L'appareil juxta glomérulaire"));
  assert.strictEqual(normalizeName('  Introd / Filtration Glomérulaire '), normalizeName('Introd - Filtration Glomérulaire'));
});

test('module synonyms of the real dataset collapse to one canonical module', () => {
  const cases = [
    [1, 'Anatomie (1 ère)', 'anatomie'],
    [1, 'Anatomie', 'anatomie'],
    [2, 'Unité 1 (2 ème)', 'unite-cardio-respiratoire'],
    [2, 'Unité 3 (2 ème)', 'unite-renale'],
    [2, 'Génétique', 'unite-genetique'],
    [2, 'Immunologie (2 ème)', 'unite-immunologique'],
    [3, 'Immunologie (3 ème)', 'immunologie'],
    [3, 'Unité 4 (3 ème)', 'unite-appareil-digestif-et-organes-hematopoietique'],
    [3, 'Anapathologie', 'anatomie-pathologique'],
    [3, 'ACP Anatomie et Cytologie Pathologique', 'anatomie-pathologique'],
    [2, 'Anatomie pathologique', 'anatomie-pathologique'],
    [3, 'Parasitologie', 'parasitologie-mycologie'],
    [3, 'Parasitologie Mycologie', 'parasitologie-mycologie'],
    [3, 'Microbiologie Médicale', 'microbiologie'],
    [3, 'Pharmacologie Clinique', 'pharmacologie'],
    [4, 'Gastro-entérologie', 'hepato-gastro-enterologie'],
    [4, 'Hepato gastro enterologie', 'hepato-gastro-enterologie'],
    [4, 'Hématologie', 'onco-hematologie'],
    [4, 'Oncologie médicale', 'onco-hematologie'],
    [5, 'Urologie & Néphrologie', 'urologie-nephrologie'],
    [5, 'Néphrologie', 'urologie-nephrologie'],
    [5, 'Urologie', 'urologie-nephrologie'],
    [5, 'Gynécologie', 'gynecologie-obstetrique'],
    [5, 'Orthopédie', 'appareil-locomoteur'],
    [5, 'MPR', 'appareil-locomoteur'],
    [6, 'UMC', 'urgences'],
    [6, 'Urgences (UMC)', 'urgences'],
    [6, 'Médecine Légale & droit médical', 'medecine-legale'],
    [6, 'Medecine legale', 'medecine-legale'],
    [6, 'Médecine de travail', 'sante-au-travail'],
    [6, 'Epidémiologie & Economie de la santé', 'epidemiologie'],
    [6, 'Oto rhino laryngologie', 'orl'],
  ];
  for (const [year, name, slug] of cases) assert.strictEqual(canonicalModuleSlug(year, { name }), slug, `${year} ${name}`);
});

test('the dataset gives this canonical module list per study year', () => {
  const byYear = {};
  for (const m of MODULES) {
    const slug = canonicalModuleSlug(m.studyYear, m);
    assert.ok(!/-\d+-(ere|eme)$/.test(slug), `year marker left in ${slug}`);
    (byYear[`${m.tree}:${m.studyYear}`] = byYear[`${m.tree}:${m.studyYear}`] || new Set()).add(slug);
  }
  const lists = Object.fromEntries(Object.entries(byYear).map(([k, v]) => [k, [...v].sort()]));
  assert.deepStrictEqual(lists, {
    'residanat:1': ['anatomie', 'biochimie', 'cytologie', 'embryologie', 'histologie', 'physiologie'],
    'residanat:2': ['unite-cardio-respiratoire', 'unite-digestive', 'unite-endocrinienne', 'unite-genetique', 'unite-immunologique', 'unite-neurosensorielle', 'unite-renale'],
    'residanat:3': ['anatomie-pathologique', 'immunologie', 'microbiologie', 'parasitologie-mycologie', 'pharmacologie', 'unite-appareil-digestif-et-organes-hematopoietique', 'unite-appareil-endocrines-reproduction-et-urinaire', 'unite-appareil-neurologique-locomoteur-et-cutane', 'unite-cardio-respiratoire-et-psychologie-medicale'],
    'residanat:4': ['cardiologie', 'hepato-gastro-enterologie', 'maladies-infectieuses', 'neurologie', 'onco-hematologie', 'pneumologie'],
    'residanat:5': ['appareil-locomoteur', 'endocrinologie', 'gynecologie-obstetrique', 'pediatrie', 'psychiatrie', 'urologie-nephrologie'],
    'residanat:6': ['dermatologie', 'epidemiologie', 'geriatrie', 'maladies-de-systeme', 'medecine-legale', 'ophtalmologie', 'orl', 'sante-au-travail', 'urgences'],
    'year:1': ['anatomie', 'biochimie', 'biophysique', 'biostatistique', 'chimie-generale', 'cytologie', 'embryologie', 'genetique', 'hemobiologie', 'histologie', 'physiologie', 'ssh'],
    'year:2': ['anatomie-pathologique', 'microbiologie', 'unite-cardio-respiratoire', 'unite-digestive', 'unite-endocrinienne', 'unite-genetique', 'unite-immunologique', 'unite-neurosensorielle', 'unite-renale'],
    'year:3': ['anatomie-pathologique', 'immunologie', 'microbiologie', 'parasitologie-mycologie', 'pharmacologie', 'radiologie', 'unite-appareil-digestif-et-organes-hematopoietique', 'unite-appareil-endocrines-reproduction-et-urinaire', 'unite-appareil-neurologique-locomoteur-et-cutane', 'unite-cardio-respiratoire-et-psychologie-medicale'],
    'year:4': ['cardiologie', 'hepato-gastro-enterologie', 'maladies-infectieuses', 'neurochirurgie', 'neurologie', 'onco-hematologie', 'pneumologie'],
    'year:5': ['appareil-locomoteur', 'chirurgie-generale', 'chirurgie-infantile', 'endocrinologie', 'gynecologie-obstetrique', 'pediatrie', 'psychiatrie', 'urologie-nephrologie'],
    'year:6': ['dermatologie', 'epidemiologie', 'geriatrie', 'maladies-de-systeme', 'medecine-legale', 'ophtalmologie', 'orl', 'reanimation', 'sante-au-travail', 'therapeutique', 'urgences'],
  });
});

test('module keys separate the year packs from the résidanat pack', () => {
  const m = { name: 'Cardiologie', slug: 'cardiologie' };
  assert.strictEqual(moduleKeyFor('year', 4, m), 'module:year-4:cardiologie');
  assert.strictEqual(moduleKeyFor('residanat', 4, m), 'module:residanat:year-4:cardiologie');
});

test('course keys ignore case, accents, apostrophes, year markers and stray punctuation', () => {
  const mk = 'module:year-4:cardiologie';
  assert.strictEqual(courseKeyFor(mk, { name: '+ Insuffisance Aortique' }), courseKeyFor(mk, { name: 'insuffisance aortique' }));
  assert.strictEqual(courseKeyFor(mk, { name: 'Hypertension artérielle' }), 'course:module:year-4:cardiologie:hypertension-arterielle');
  assert.strictEqual(courseSlug({ name: 'La thyroïde (2 ème)' }), courseSlug({ name: 'La thyroïde (3 ème)' }));
  assert.strictEqual(courseSlug({ name: 'Cancer de l’endometre' }), courseSlug({ name: "Cancer de l'endomètre" }));
  assert.strictEqual(courseSlug({ name: '', slug: 'fallback-slug' }), 'fallback-slug');
  const long = courseSlug({ name: 'Psychologie médicale : aspects communicationnels de la rencontre avec le malade et sa famille, examen clinique et annonce' });
  assert.ok(long.length <= 100, long);
  assert.match(long, /-[0-9a-f]{8}$/);
  assert.strictEqual(long, courseSlug({ name: 'Psychologie médicale : aspects communicationnels de la rencontre avec le malade et sa famille, examen clinique et annonce' }));
});

test('display name: most common spelling group, accented and capitalised variant, no year marker', () => {
  assert.strictEqual(pickDisplayName(new Map([['Anatomie', 757], ['Anatomie (1 ère)', 679]])), 'Anatomie');
  assert.strictEqual(pickDisplayName(new Map([['Hematologie', 79], ['Hématologie', 30]])), 'Hématologie');
  assert.strictEqual(pickDisplayName(new Map([['insuffisance mitrale', 44], ['Insuffisance Mitrale', 41], ['+ Insuffisance Mitrale', 10]])), 'Insuffisance Mitrale');
  // Numbered units lose to named ones even when they hold more questions
  assert.strictEqual(pickDisplayName(new Map([['Unité 3 (2 ème)', 855], ['Unité rénale', 821]])), 'Unité rénale');
  assert.strictEqual(pickDisplayName(new Map()), undefined);
});

test('residency parts map to the platform enum', () => {
  assert.strictEqual(mapPart('sciences-fondamentales'), 'Sciences_fondamentales');
  assert.strictEqual(mapPart('pathologie-medico-chirurgicale'), 'Pathologie_medico_chirurgical');
  assert.strictEqual(mapPart('dossier-clinique'), 'Dossier_clinique');
  assert.strictEqual(mapPart('biologie'), 'Biologie');
  assert.strictEqual(mapPart('medicale'), 'Medicale');
  assert.strictEqual(mapPart('chirurgie'), 'Chirurgie');
  assert.strictEqual(mapPart(undefined), undefined);
  assert.strictEqual(mapPart('autre'), undefined);
});
