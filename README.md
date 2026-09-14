# Westlaw Court Rules Scraper

A Next.js web application that scrapes court rules from **Thomson Reuters Westlaw** and exports them as structured, machine-readable JSON — preserving full document hierarchy, metadata, citations, and currentness data.

> **🌐 Live Demo:** [https://azcourtrules.abacusai.app/](https://azcourtrules.abacusai.app/)  
> The live demo is pre-configured for **Arizona** court rules. Follow the instructions below to deploy your own instance for any state that publishes rules on Westlaw.

---

## Features

- **Browse rule sets** — fetches the master Westlaw index for your configured state/jurisdiction
- **Real-time scraping** — streams progress via Server-Sent Events (SSE) with a live terminal-style activity log
- **Two-phase scrape** — Phase 1 discovers the full document tree; Phase 2 fetches content in parallel
- **Configurable speed** — adjustable concurrency (1–10 parallel threads) and per-request delay (0–1000ms)
- **Retry on failure** — individual failed documents can be retried without re-scraping the entire rule set
- **Download as JSON** — exports the complete hierarchical structure with citations, currentness notes, and full document text
- **Upload & browse** — re-load a previously downloaded JSON file to browse it in the viewer without re-scraping
- **Dark mode** — fully themed with system preference detection

---

## JSON Output Format

Each scraped rule set produces a JSON file with this structure:

```json
{
  "title": "Arizona Rules of Civil Procedure",
  "guid": "Nxxxxxxxxxxxxxxxx",
  "url": "https://govt.westlaw.com/azrules/Browse/...",
  "scrapedAt": "2025-01-15T10:30:00.000Z",
  "metadata": {
    "totalDocuments": 142,
    "totalCategories": 23
  },
  "structure": [
    {
      "type": "category",
      "title": "Part I. General Rules",
      "guid": "...",
      "url": "...",
      "children": [
        {
          "type": "document",
          "title": "Rule 1. Scope and Purpose",
          "guid": "...",
          "url": "..."
        }
      ]
    }
  ],
  "documents": [
    {
      "guid": "...",
      "title": "Rule 1. Scope and Purpose",
      "url": "...",
      "citation": "16 A.R.S. Rules Civ.Proc., Rule 1",
      "currentness": "Current through ...",
      "content": "These rules govern the procedure in all civil actions...",
      "rawHtml": "<div id=\"co_document\">...</div>",
      "scrapedAt": "2025-01-15T10:30:00.000Z"
    }
  ]
}
```

---

## Deployment

### Option A — Deploy on Abacus.AI (Recommended, free hosting)

The app was built and is hosted on [Abacus.AI](https://abacus.ai). You can deploy your own instance in minutes:

1. Sign up / log in at [abacus.ai](https://abacus.ai)
2. Open a new **AI Agent** conversation
3. Paste this prompt (replacing the state name and URL slug):

   > "Build me a Next.js web app that scrapes **[YOUR STATE]** court rules from Westlaw, using the code at https://github.com/scarlion1/westlaw-court-rules-scraper as a reference. The state URL slug is `[staterules]` (e.g. `txrules` for Texas). The app should list available rule sets, let users scrape any rule set with real-time SSE progress, and download the result as JSON. See the README's 'Adapting for Other States' section for the exact code changes needed."

4. The agent will scaffold, configure, and deploy the app, giving you a shareable URL.

---

### Option B — Local Development

**Prerequisites:** Node.js 18+, Yarn (recommended) or npm

```bash
# 1. Clone the repo
git clone https://github.com/scarlion1/westlaw-court-rules-scraper.git
cd westlaw-court-rules-scraper/nextjs_space

# 2. Install dependencies
yarn install
# or: npm install

# 3. Configure environment variables
cp .env.example .env
# Edit .env — see Configuration section below

# 4. Start the development server
yarn dev
# or: npm run dev

# 5. Open http://localhost:3000
```

---

## Configuration

All configuration is done via environment variables in `nextjs_space/.env`.

| Variable | Description | Required |
|----------|-------------|----------|
| `ABACUSAI_API_KEY` | Abacus.AI API key — used for email notifications on scrape completion/failure | No — set to any placeholder to disable |
| `WEB_APP_ID` | Abacus.AI web app ID (notification routing) | No |
| `NOTIF_ID_SCRAPE_COMPLETED` | Notification template ID for completion emails | No |
| `NOTIF_ID_SCRAPE_FAILED` | Notification template ID for failure emails | No |

### Simplest Setup (no notifications)

```env
ABACUSAI_API_KEY=not-used
WEB_APP_ID=
NOTIF_ID_SCRAPE_COMPLETED=
NOTIF_ID_SCRAPE_FAILED=
```

The scraper works fully without notifications — it simply skips the email step.

---

## Adapting for Other States (Westlaw Configuration)

The app targets Arizona by default. Adapting it for another state requires editing **`nextjs_space/lib/scraper.ts`** — the core scraping library. There are five hardcoded references to Arizona's URL paths.

### Step 1 — Find Your State's URL Slug

Westlaw hosts each state's rules under a unique path prefix on `govt.westlaw.com`:

```
https://govt.westlaw.com/{staterules}/Index
```

Common state slugs:

| State | Slug | Index URL |
|-------|------|-----------|
| Arizona *(default)* | `azrules` | `https://govt.westlaw.com/azrules/Index` |
| Texas | `txrules` | `https://govt.westlaw.com/txrules/Index` |
| California | `carules` | `https://govt.westlaw.com/carules/Index` |
| New York | `nyrules` | `https://govt.westlaw.com/nyrules/Index` |
| Florida | `flrules` | `https://govt.westlaw.com/flrules/Index` |
| Illinois | `ilrules` | `https://govt.westlaw.com/ilrules/Index` |
| Ohio | `ohrules` | `https://govt.westlaw.com/ohrules/Index` |

> **To find your state's slug:** Log in to Westlaw, navigate to your state's court rules section, and look at the URL. The slug is the path segment right after `govt.westlaw.com/`.

### Step 2 — Update `lib/scraper.ts`

Make the following five substitutions (replacing `az` / `Arizona` with your state):

#### `fetchMasterIndex` — the index URL
```ts
// BEFORE
const response = await fetch(`${BASE_URL}/azrules/Index`, ...);

// AFTER (Texas example)
const response = await fetch(`${BASE_URL}/txrules/Index`, ...);
```

#### `scrapeCategory` — the category browse URL
```ts
// BEFORE
const url = `${BASE_URL}/azrules/Browse/Home/Arizona/ArizonaCourtRules/ArizonaStatutesCourtRules?guid=${guid}&...`;

// AFTER (Texas example — replace the slug AND the state name path segments)
const url = `${BASE_URL}/txrules/Browse/Home/Texas/TexasCourtRules/TexasStatutesCourtRules?guid=${guid}&...`;
```

> **Tip:** Navigate to a category on your state's Westlaw page while logged in and copy the URL from your browser. Use that path verbatim, replacing only the `guid=...` part with the `${guid}` template variable.

#### `scrapeDocument` — the document URL
```ts
// BEFORE
const url = `${BASE_URL}/azrules/Document/${guid}?viewType=FullText&...`;

// AFTER (Texas example)
const url = `${BASE_URL}/txrules/Document/${guid}?viewType=FullText&...`;
```

#### `scrapeRuleSetCompletely` — the returned source URL
```ts
// BEFORE
url: `${BASE_URL}/azrules/Browse/Home/Arizona/ArizonaCourtRules/ArizonaStatutesCourtRules?guid=${guid}`,

// AFTER (Texas example)
url: `${BASE_URL}/txrules/Browse/Home/Texas/TexasCourtRules/TexasStatutesCourtRules?guid=${guid}`,
```

### Step 3 — Update the UI Labels

In `nextjs_space/app/page.tsx`:
```tsx
<h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">
  Texas Court Rules <span className="text-amber-500">Scraper</span>
</h1>

<p className="text-slate-600 dark:text-slate-300 text-lg leading-relaxed">
  Browse and download Texas court rules from WestLaw as structured JSON. ...
</p>
```

In `nextjs_space/app/layout.tsx`:
```tsx
title: "Texas Court Rules Scraper",
description: "Browse and scrape Texas court rules from WestLaw with downloadable JSON output",
```

### Step 4 — Tune Performance (if needed)

Larger states have more documents and may respond more slowly. Adjust defaults in `nextjs_space/components/home-client.tsx`:

```ts
const [concurrency, setConcurrency] = useState(3);  // Lower for slower servers
const [delayMs, setDelayMs] = useState(100);         // Increase if you see 429 errors
```

And the per-document timeout in `nextjs_space/app/api/scrape/route.ts`:
```ts
const timeoutMs = parseInt(searchParams.get('timeoutMs') || '15000', 10);
// Increase to 30000 for states with very long rule documents
```

---

## Architecture

```
westlaw-court-rules-scraper/
└── nextjs_space/
    ├── app/
    │   ├── page.tsx                       # Main page — header, description, footer
    │   ├── layout.tsx                     # Root layout, theme provider & SEO metadata
    │   ├── globals.css                    # Tailwind base styles
    │   └── api/
    │       ├── index/route.ts             # GET /api/index — fetches Westlaw master index
    │       ├── scrape/route.ts            # GET /api/scrape — streams scrape progress via SSE
    │       └── retry-documents/route.ts   # POST /api/retry-documents — retries failed docs
    ├── components/
    │   ├── home-client.tsx                # Main UI: rule list, scrape controls, viewer
    │   ├── theme-provider.tsx             # Dark/light mode context
    │   └── theme-toggle.tsx              # Theme toggle button
    ├── lib/
    │   ├── scraper.ts                     # ⭐ Core scraping logic — edit this for other states
    │   ├── notifications.ts               # Abacus.AI email notification helpers
    │   └── utils.ts                       # Shared utilities
    └── .env.example                       # Environment variable template
```

### How It Works

1. **Index fetch** (`/api/index`): Calls `fetchMasterIndex()`, which GETs `govt.westlaw.com/{staterules}/Index` and parses the `ul.co_genericWhiteBox li a` link list into title + GUID pairs.

2. **Scrape** (`/api/scrape`): Opens an SSE stream and runs in two phases:
   - **Phase 1 — Discovery**: Recursively walks the category tree, fetching each category URL and parsing its child links to build a `RuleSetNode[]` tree — without downloading document content. Progress is streamed live.
   - **Phase 2 — Content fetch**: Downloads every document in parallel (`concurrency` workers, `delayMs` per request). Each document is fetched from `/{staterules}/Document/{guid}?viewType=FullText&...` and parsed with Cheerio.

3. **Retry** (`/api/retry-documents`): Accepts a list of `{ guid, title }` pairs and re-fetches just those documents, merging successful results back into the client's data.

4. **Download**: The client serializes the complete `ScrapedRuleSet` to JSON and triggers a browser file download.

---

## HTML Selectors (for Debugging)

If Westlaw updates its page structure, these are the Cheerio selectors to check in `lib/scraper.ts`:

| Data | Selector |
|------|----------|
| Rule set / category links | `ul.co_genericWhiteBox li a` |
| Document title | `#co_docHeaderTitleLine #title` (fallback: `#co_docHeaderTitleLine`) |
| Citation | `.co_cites` |
| Currentness note | `.co_currentness a, .co_currentness` |
| Document body text | `#co_document` |
| Code set name | `#codeSetName` |
| Title description | `#titleDesc` |

---

## Important Notes

- **Westlaw access required:** Your Westlaw subscription must be active. The scraper makes server-side requests to `govt.westlaw.com`. If your institution's access is IP-based, deploying to a server on that network should work without additional auth.
- **Rate limits:** Westlaw does not publish official rate limits. Start with the defaults (100ms delay, 3 threads) and increase the delay or reduce concurrency if you see HTTP 429 responses or timeouts. The retry mechanism recovers from transient failures.
- **HTML structure changes:** Westlaw is a commercial platform and may update its markup. If the index or document pages return empty results, compare the selectors above against the current live HTML.
- **Terms of Service:** Use this tool in accordance with your institution's Westlaw subscription agreement. It is intended for legal research and practice.
- **Data freshness:** Each document includes a `currentness` field showing Westlaw's stated publication date. Re-scrape periodically to capture rule amendments.

---

## Contributing

Pull requests are welcome. Priority areas:

- Environment-variable–driven state selection (no code edit required for state switching)
- Cookie / session-based Westlaw auth support for non-IP-authenticated deployments
- Federal court rules (FRCP, FRE, FRAP, local district rules)
- CSV and Markdown export formats in addition to JSON
- Dockerfile for containerized self-hosting
- Automated staleness detection (diff against a previous scrape)

---

## License

MIT — see [LICENSE](LICENSE) for details.

Data is sourced from Thomson Reuters Westlaw. This project is not affiliated with or endorsed by Thomson Reuters.
