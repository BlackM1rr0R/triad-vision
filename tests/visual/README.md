# Visual regression test

`scripts/ci/visual.mjs` takes screenshots of key pages and compares them pixel by pixel with the PNGs
in `tests/visual/baseline/`. It runs in CI ("Typecheck & build" job, step "Visual regression test")
after the client build, and a failure blocks the deploy.

**Shots (16):** home (desktop light/dark, mobile; includes the visa-type and service grids), login,
register, `/jobs`, client portal `/account`, admin cases list (light/dark), admin case page, workspace
Drive grid (light/dark). Desktop is 1366x900, mobile 390x844. Public and portal pages are captured full
length (up to 4000 px); admin and workspace screens are captured at viewport size. The list is `SHOTS` in
the script.

**Determinism:** the script never calls a real API. Every `/api` request gets an answer from
`scripts/ci/visual-fixtures/fixtures.mjs` (users, cases, drive, vacancies) and `public-content.json`.
Requests with no fixture get a 404, and requests to other origins are blocked. The script also freezes
the clock at 2026-01-15 10:00 UTC, uses the Europe/Berlin timezone, seeds `Math.random`, turns off
animations, transitions and the caret, waits for fonts, images and network idle, and only takes a
screenshot once two captures in a row are identical.

## Run locally

```powershell
npm run build -w client
node scripts/ci/visual.mjs                      # compare with tests/visual/baseline
node scripts/ci/visual.mjs --only drive,home    # some shots
node scripts/ci/visual.mjs --log-api            # list the /api calls (404 = needs a fixture)
```

Fonts render differently on Windows and macOS than on the Linux runner, so a local run will not match
the committed baselines. To compare two local states, use a scratch folder:
`--update --baseline C:\tmp\vis`, make your change, rebuild, then run `--baseline C:\tmp\vis`.
**Never commit baselines made on your own machine.**

## When CI fails: reading the diffs

Open the failed run, go to **Artifacts**, then download **visual-regression**. For every changed shot it
contains three files:

- `<shot>.diff.png`: the baseline faded to grey, with changed pixels in **red**. Magenta areas mean the
  page height changed (the table then says `size ... vs baseline ...`).
- `<shot>.actual.png`: what this commit renders.
- `<shot>.expected.png`: the committed baseline.

A shot fails when more than 0.05% of its pixels differ (`--max-diff`, env `VISUAL_MAX_DIFF`) or when its
size changed. Pixelmatch ignores anti-aliasing and uses a colour threshold of 0.1. The job log shows a
table with the diff percentage of each shot. A "page error" line under a shot usually means a fixture is
missing or has the wrong shape, or the page redirected (for example to `/login`).

## Updating baselines (intended design change, new shot)

1. Push your branch.
2. On GitHub, go to **Actions**, then **Visual baselines**, then **Run workflow**. Pick your branch, and
   optionally limit the run with `only` (for example `home,drive`).
3. Download the **visual-baselines** artifact and unpack it into `tests/visual/baseline/`, replacing the
   old files.
4. Look through the new PNGs, then commit them with the change that caused them.

The baselines must come from that workflow, which uses the same `ubuntu-24.04` runner and preinstalled
Chrome as CI. `chrome-version.txt` records which Chrome made them. When the runner's Chrome changes, the
log shows a warning. If a failure only shows anti-aliasing noise, regenerate the baselines.

## Bootstrap (no baselines yet)

A shot without a baseline is **not compared and does not fail**. The log prints
`BOOTSTRAP: N shot(s) have no baseline yet`, and the screenshots go to `new-baselines/` in the
**visual-regression** artifact. To start enforcing those shots, unpack that folder into
`tests/visual/baseline/` (or run the "Visual baselines" workflow) and commit it. Do the same whenever
you add a shot.

## Adding a page

Add an entry to `SHOTS` in `scripts/ci/visual.mjs`. Then run it with `--log-api --only <name>` and add
fixtures for the requests it lists. Fixture data should use fixed dates that come before the frozen
"now". Shot names have the form `<page>-<viewport>-<theme>`. Keep the total small (each shot adds about
1 to 2 seconds in CI).
