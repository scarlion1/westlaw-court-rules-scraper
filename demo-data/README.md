# Demo Rule Sets

These are rule sets that were previously scraped from Westlaw with this tool. Use them to try the built-in viewer without scraping anything:

1. Open the app (live demo or a local copy).
2. In **View Previously Downloaded Rules**, click **Upload JSON**.
3. Pick one of the files below.

The file is read entirely in your browser and never uploaded to a server.

| File | Rule set | Documents | Categories | Scraped (UTC) |
|---|---|---:|---:|---|
| `rules_of_civil_appellate_procedure.json` | Rules of Civil Appellate Procedure | 48 | 7 | 2026-06-27 |
| `rules_of_civil_procedure_for_the_superior_courts_of_arizona.json` | Rules of Civil Procedure for the Superior Courts of Arizona | 140 | 10 | 2026-02-27 |
| `rules_of_evidence_for_courts_in_the_state_of_arizona.json` | Rules of Evidence for Courts in the State of Arizona | 77 | 11 | 2026-02-27 |
| `rules_of_small_claims_procedure.json` | Rules of Small Claims Procedure | 21 | 0 | 2026-08-21 |
| `rules_of_the_supreme_court_of_arizona.json` | Rules of the Supreme Court of Arizona | 239 | 41 | 2026-02-27 |

The scrape dates come from each file's `scrapedAt` field. Rules change over time, so these are snapshots and may be out of date. Check the official source at https://govt.westlaw.com/azrules/ before relying on them.

Each file follows the app's export format, with `title`, `guid`, `url`, `scrapedAt`, `structure` (the hierarchy), `documents` (the rule text) and `metadata` (counts).
