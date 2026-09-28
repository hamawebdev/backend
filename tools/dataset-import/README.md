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
   `--update-hierarchy` is given. Skipped when the state file says this exact hierarchy
   was already acknowledged (`--force` sends it anyway).
3. **Media**: `POST /admin/import/media/check` (10,000 names per request), then uploads
   the missing images, `--image-concurrency` at a time.
4. **Questions**: `PUT /admin/import/questions` in batches of up to 200, `--concurrency`
   batches in flight, skipping every question whose `contentHash` the server already
   acknowledged.
5. **Exams**: `PUT /admin/import/exams` for the 523 module exam papers (50 per request),
   after every question.
6. **Verify**: proves that nothing was lost, item by item:
   - every local `sourceKey` is looked up with `POST /admin/import/questions/state`
     (5,000 per request) and the server `contentHash` compared with the local one;
   - every local image name is looked up with `POST /admin/import/media/check`;
   - every exam must be acknowledged (the server linked all its questions), and the
     server's exam count and exam-question links (`GET /admin/import/stats`) must match;
   - the reconciliation of totals (below) must match.

   Whatever is missing or different is re-sent, exactly those items (hierarchy first,
   then images, questions, exams), and everything is checked again, up to
   `--repair-rounds` times (3). A clean run ends with

   ```
   VERIFIED: 86324/86324 questions, 7730/7730 images, 523/523 exams match
   ```

   otherwise with `NOT VERIFIED: ...` and the keys still missing or different, and exits 4.
   `--phases verify` runs it alone (after an import made elsewhere, or to re-check).
7. **Reconcile** (part of verify; `--phases reconcile` alone prints only this):
   `GET /admin/import/stats`, compared with the importer's own totals (overall, per
   university, per source, per study pack, residency per university and part, exams,
   images). A table is printed and any difference makes the run exit with 3.

### Speed and errors

Requests run in parallel: `--concurrency` (4) for question batches, state queries and
exams, `--image-concurrency` (8) for uploads. There is no pause between requests
(`--min-delay-ms` 0) and a slow answer alone does not slow anything down (only one slower
than `--slow-ms`, 30 s, counts as trouble). Phases stay in order: hierarchy, then media,
then questions, then exams, then verify; within a phase batches are handed out in
dataset order.

Trouble means a 408, 429 or 5xx answer, a network error or a timeout (`--timeout-ms`).
The request is retried with the same payload (every endpoint is idempotent) after an
exponential backoff with jitter (about 1 s, 2 s, 4 s, ... capped at `--max-delay-ms`),
up to `--retries` times; a 429 with `Retry-After` pauses every new request that long.
While trouble keeps happening the concurrency of every lane is halved (at most once a
second, never below 1); after 5 s without trouble it grows back one request at a time.
A request still failing after its retries stops the run (after the requests in flight);
re-running resumes. A batch the API refuses as a whole (400, 413, 422) is split until
the bad question is alone and reported.

The importer logs in once. The token is refreshed before it expires and after a 401;
only one refresh runs at a time and every request waits for it (logins are
single-device and refresh tokens rotate, so parallel refreshes would log the importer
out). Use an account dedicated to the import, and never run two imports with it at the
same time.

The state file is written by one process: the importer holds `<state>.lock` while it
runs and refuses to start when another live import holds it. Every acknowledged batch
is appended at once, as whole JSON lines.

Every ~30 s (`--progress-sec`) a line gives the phase, items done/total, the rate, the
ETA, the current concurrency and the retries so far:

```
[progress] questions 12,800/86,324 questions, 146.2/s, 1m27s elapsed, ETA 8m23s | concurrency requests 4/4, uploads 8/8 | retries 3 | requests 1,073
```

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

# 3. Everything (recommended production command); run it in tmux or with nohup
nohup node import.js --dataset /srv/medadn/dataset --api https://api.med-adn.com/api/v1 --full \
  --concurrency 4 --image-concurrency 8 \
  --state /srv/medadn/push/import-state.jsonl --report /srv/medadn/push/import-full.json \
  > /srv/medadn/push/import-full.log 2>&1 &
tail -f /srv/medadn/push/import-full.log   # ends with VERIFIED: ... on success

# 4. Check again later (reads only, unless something has to be repaired)
node import.js --dataset /srv/medadn/dataset --api https://api.med-adn.com/api/v1 --full --phases verify \
  --state /srv/medadn/push/import-state.jsonl --report /srv/medadn/push/import-verify.json
```

Ctrl-C (or `kill -INT` / `kill <pid>`) stops after the requests in flight and still writes
the state and the report. Re-running the same command resumes: acknowledged questions, images and
exams are skipped, and the verify phase re-checks everything on the server.

Taking over from an import started with an older version of this tool: let it finish
(or stop it with Ctrl-C), then run the new version with the same `--state` file. The old
state lines are read as they are; nothing acknowledged is sent again.

| Option | Default | |
|---|---|---|
| `--dataset <dir>` | required | folder with `index.json` and `images/` |
| `--api <url>` | required (not with `--dry-run`) | e.g. `https://api.med-adn.com/api/v1` |
| `--sample` / `--full` | one is required | `--dry-run` alone means `--full` |
| `--dry-run` | | no request, no state written; prints the plan and the totals |
| `--state <file>` | `./import-state.jsonl` | resume state (JSON lines), locked by `<file>.lock` while a run uses it |
| `--report <file>` | `./import-report-<time>.json` | counts and seconds per phase, API statistics, every failure and warning, what verify found |
| `--batch <n>` | 200 | questions per request (max 200) |
| `--concurrency <n>` | 4 | parallel requests: question batches, state queries, exams (1-32) |
| `--image-concurrency <n>` | 8 | parallel image uploads (1-64) |
| `--min-delay-ms <n>` | 0 | minimum pause between request starts |
| `--max-delay-ms <n>` | 60000 | cap of the retry backoff (and of `Retry-After`) |
| `--slow-ms <n>` | 30000 | an answer slower than this halves the concurrency |
| `--timeout-ms <n>` | 180000 | request timeout, then retried (uploads: at least 300000) |
| `--retries <n>` | 8 | retries per request on 408, 429, 5xx, network errors and timeouts |
| `--repair-rounds <n>` | 3 | verify: rounds of re-sending what is missing or different (0: only report) |
| `--progress-sec <n>` | 30 | progress line interval; 0 prints one only at the end of each phase |
| `--phases <list>` | all | any of `hierarchy,media,questions,exams,verify,reconcile` |
| `--force` | | send the hierarchy and every question and exam again (the API still answers `unchanged` for equal hashes) |
| `--update-hierarchy` | | rename existing universities/sources/packs/unites/modules/courses |
| `--skip-image-hash` | | only check that image files exist (no sha1 check) |
| `--ignore-errors` | | import even if validation found errors |
| `--print-modules` | | print every canonical module with the spellings merged into it |

Exit codes: 0 ok (the last line is `VERIFIED: ...` when verify ran), 1 fatal error,
invalid dataset or state file in use, 2 some items failed and were not repaired (see the
report), 3 reconciliation mismatch, 4 verification failed (items still missing or
different after the repairs; the last lines list them), 130 interrupted.

Environment: `IMPORT_EMAIL`, `IMPORT_PASSWORD` (never printed, never written to the report).

## Re-running after new translations

Translations are written into the dataset in place (`en` on each question) without
changing its `uid`, so the question keeps its `sourceKey` and only its `contentHash`
changes. Run the same `--full` command again with the same `--state` file: unchanged
questions are skipped locally, only the newly translated ones are sent (and updated in
place, answers matched by position), then the verification checks every hash and the
reconciliation shows the new `withEnglish` totals. Updates hold more database
connections per request than inserts (see `src/modules/import/import.routes.ts`), so a
run that mostly updates is better with `--concurrency 2`. Without the state file (another machine, file lost) the importer
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
files trimmed to the selected ones, two small images). `test/mock-api.js` is an
in-memory implementation of the import API that can add latency, drop connections,
lose answers after doing the work, hang, expire tokens and refuse chosen questions, and
records how many requests of each route overlapped. `test/mock-run.test.js` runs the
CLI against it: a `--sample` import, a second run that sends no question, a changed
translation, retries on 429/5xx, token refresh, reconciliation mismatch and dry run.
`test/concurrency.test.js`: batches and uploads really overlap (never more than
asked), results complete and in order, phases in order; a storm of 503/429, dropped
connections, lost answers and timeouts where every question is still created exactly
once; one token refresh for many parallel 401s; the verify phase finding and repairing
a missing question, a mismatched one, a missing image and exam links (and alone with
`--phases verify`); an item the server keeps refusing (exit 4, key printed); a second
run that sends nothing but reads; the state lock; progress lines. `test/api.test.js`:
backoff, concurrency limits and their reduction/recovery, the slow threshold, the
shared refresh, the worker pool and the state lock on their own.
