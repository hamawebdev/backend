# MedADN dataset importer

Pushes the normalised question bank (`/srv/medadn/dataset`, built by `/srv/medadn/tools/build.js`)
into MedADN through the admin import API (`/api/v1/admin/import/*`). Plain Node.js, no
dependencies, Node 18 or newer. It is meant to run on the VPS that holds the dataset.

This folder is not part of the backend image (the Dockerfile builds from an allowlist).

## What it does

1. **Validate**: reads `index.json` and every file it lists, checks uids, question types,
   image paths and paper references, and (when `images/` exists) that every referenced
   image is present, at most 20 MB and hashes to its name.
2. **Hierarchy**: `PUT /admin/import/hierarchy` with the 8 universities, the sources
   (one per university and kind, plus "Autres sources"), 7 study packs, the unites,
   the canonical modules and the courses. Existing records are not renamed unless
   `--update-hierarchy` is given.
3. **Media**: `POST /admin/import/media/check`, then uploads the missing images one by one.
4. **Questions**: `PUT /admin/import/questions` in batches of up to 200, skipping every
   question whose `contentHash` the server already acknowledged.
5. **Exams**: `PUT /admin/import/exams` for the 523 module exam papers.
6. **Reconcile**: `GET /admin/import/stats`, compared with the importer's own totals
   (overall, per university, per source, per study pack, residency per university and
   part, exams, images). A table is printed and any difference makes the run exit with 3.

One request at a time, at least `--min-delay-ms` apart. A slow answer (more than
`--slow-ms`), a 429 or a 5xx doubles the pause (up to `--max-delay-ms`), fast answers bring
it back down by 10% each; slow question batches also get smaller. Failed requests are
retried with the same payload (every endpoint is idempotent). The importer logs in once
and refreshes its token before it expires or after a 401 (logins are single-device, so
use an account dedicated to the import).

## Usage

```sh
cd /srv/medadn/tools/dataset-import        # wherever this folder was copied
export IMPORT_EMAIL=importer@med-adn.com   # an ADMIN account used only by the importer
read -rs IMPORT_PASSWORD && export IMPORT_PASSWORD

# 1. Plan only: no request, no credentials needed
node import.js --dataset /srv/medadn/dataset --dry-run --full

# 2. Sample: a few dozen questions covering every kind of data
node import.js --dataset /srv/medadn/dataset --api https://api.med-adn.com/api/v1 --sample \
  --state /srv/medadn/push/import-state.jsonl --report /srv/medadn/push/import-sample.json

# 3. Everything (hours: ~8,200 requests at >= 1.5 s each); run it in tmux or with nohup
nohup node import.js --dataset /srv/medadn/dataset --api https://api.med-adn.com/api/v1 --full \
  --state /srv/medadn/push/import-state.jsonl --report /srv/medadn/push/import-full.json \
  > /srv/medadn/push/import-full.log 2>&1 &
```

Ctrl-C (or `kill -INT`) stops after the current request and still writes the report.
Re-running the same command resumes: acknowledged questions, images and exams are skipped.

| Option | Default | |
|---|---|---|
| `--dataset <dir>` | required | folder with `index.json` and `images/` |
| `--api <url>` | required (not with `--dry-run`) | e.g. `https://api.med-adn.com/api/v1` |
| `--sample` / `--full` | one is required | `--dry-run` alone means `--full` |
| `--dry-run` | | no request, no state written; prints the plan and the totals |
| `--state <file>` | `./import-state.jsonl` | resume state (JSON lines) |
| `--report <file>` | `./import-report-<time>.json` | counts per phase and action, every failure and warning |
| `--batch <n>` | 200 | questions per request (max 200) |
| `--min-delay-ms <n>` | 1500 | minimum pause between requests |
| `--max-delay-ms <n>` | 60000 | cap of the adaptive pause |
| `--slow-ms <n>` | 4000 | answers slower than this back off |
| `--retries <n>` | 8 | retries per request on 429, 5xx and network errors |
| `--phases <list>` | all | any of `hierarchy,media,questions,exams,reconcile` |
| `--force` | | send every question and exam again (the API still answers `unchanged` for equal hashes) |
| `--update-hierarchy` | | rename existing universities/sources/packs/unites/modules/courses |
| `--skip-image-hash` | | only check that image files exist (no sha1 check) |
| `--ignore-errors` | | import even if validation found errors |
| `--print-modules` | | print every canonical module with the spellings merged into it |

Exit codes: 0 ok, 1 fatal error or invalid dataset, 2 some items failed (see the report),
3 reconciliation mismatch, 130 interrupted.

Environment: `IMPORT_EMAIL`, `IMPORT_PASSWORD` (never printed, never written to the report).

## Re-running after new translations

Translations are written into the dataset in place (`en` on each question) without
changing its `uid`, so the question keeps its `sourceKey` and only its `contentHash`
changes. Run the same `--full` command again with the same `--state` file: unchanged
questions are skipped locally, only the newly translated ones are sent (and updated in
place, answers matched by position), then the reconciliation shows the new
`withEnglish` totals. Without the state file (another machine, file lost) the importer
asks `POST /admin/import/questions/state` for the hashes the server holds, so nothing
unchanged is re-sent either. To see how many questions changed before sending anything:

```sh
node import.js --dataset /srv/medadn/dataset --dry-run --full --state /srv/medadn/push/import-state.jsonl
```

(the `state` line of the plan counts the questions unchanged since the last import).

## Mapping

- **Universities** `univ:<slug>` (name from `universityName`). **Sources**
  `src:<univ>:<kind>` named "Externat Alger", "Résidanat Sétif", "Militaire Alger", …;
  `_unsorted` questions get `src:other` "Autres sources" and no university.
- **Study packs** `pack:year-1`…`pack:year-6` ("1ère année"…, YEAR, 100 DA/month,
  1,200 DA/year) and `pack:residanat` ("Résidanat", RESIDENCY, 625/7,500). Unites:
  `unite:year-N` "Modules" in each year pack, `unite:residanat:year-N` "Nème année" in
  the résidanat pack.
- **Modules** are canonical per study year across universities: `module:year-N:<slug>`
  and `module:residanat:year-N:<slug>`. The slug is the module name lower-cased, without
  accents, year markers ("(1 ère)") and punctuation, `&` read as "et", then passed
  through the synonym map in `lib/normalize.js`: gastro-entérologie = hépato-gastro-
  entérologie; urologie, néphrologie = urologie & néphrologie; UMC = urgences;
  médecine légale = médecine légale & droit médical; parasitologie = parasitologie
  mycologie; anapathologie = ACP = anatomie pathologique; microbiologie médicale =
  microbiologie; pharmacologie clinique = pharmacologie; hématologie, oncologie médicale
  = onco-hématologie; gynécologie = gynécologie et obstétrique; épidémiologie =
  épidémiologie & économie de la santé; médecine de travail = santé au travail et
  environnement; oto-rhino-laryngologie = ORL; orthopédie, rhumatologie, MPR = appareil
  locomoteur; Sétif's numbered units ("Unité 1 (2 ème)" …) = Alger's named units of the
  same number, and Sétif's 2nd-year génétique/immunologie = Alger's units. The display
  name is the most common accented spelling (numbered units lose to named ones), with
  three explicit names for merged modules. `--dry-run --print-modules` shows the result.
- **Courses** `course:<moduleKey>:<normalised course name>`; files whose course is null
  get `course:<moduleKey>:_no-course` ("Questions non classées"), because a question
  without a course counts as résidanat content on the platform.
- **Questions**: `sourceKey` = dataset `uid`; `examYear` from the file (none for
  `no-year`); `yearLevel` from the study year; UNKNOWN types are derived from the
  origin type (qcs → single, qcm/combinaison → multiple) and imported unpublished, as
  are empty questions and choice questions with fewer than two answers or no correct
  one (`metadata.unpublishedReasons` says why). QROC: the expected answer becomes the
  single correct answer. English goes to `questionTextEn`, `explanationEn` and, index
  by index, to each answer's `answerTextEn`/`explanationEn`. `metadata` holds part
  (mapped to `Sciences_fondamentales`, `Pathologie_medico_chirurgical`,
  `Dossier_clinique`, `Biologie`, `Medicale`, `Chirurgie`), session, month, number,
  answerKey, case, isInverse, originType, origin, review, the number of remote images,
  language, and the explanation images beyond the first 10 (`explanationImagesOverflow`).
  `contentHash` is the sha256 of the canonical JSON of the whole payload.
- **Paper questions**: questions embedded in résidanat papers get the paper's
  university, exam year, part and month and no course. Questions embedded in module exam
  papers have no course and are reached through their exam.
- **Exams** `exam:<paper path>`, one per module exam paper: canonical module of its study
  year, questions in paper order. Papers named "Militaire" (also "Miliatire") are Alger's
  with "Militaire" in the title, "Constantine" and "Batna" papers (and their embedded
  questions) go to those universities, pharmacy papers stay Alger's. The year is the
  paper's exam year, else the academic year in its name ("20/21" → 2021, the dataset's
  convention), else the most common year of its questions or of its module's other
  papers (then the description says the year is estimated).

## Tests

```sh
cd backend/tools/dataset-import
node --test test/*.test.js      # or: npm test
```

Unit tests run on `test/fixtures/`, excerpts of the real dataset (whole questions,
files trimmed to the selected ones, two small images). `test/mock-run.test.js` runs the
CLI against an in-memory implementation of the import API (`test/mock-api.js`): a
`--sample` import, a second run that sends no question, a changed translation, retries
on 429/5xx, token refresh, reconciliation mismatch and dry run.
