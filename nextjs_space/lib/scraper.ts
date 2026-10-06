import * as cheerio from 'cheerio';

export interface RuleSetItem {
  title: string;
  guid: string;
  url: string;
  type: 'category' | 'document';
}

export interface ScrapedDocument {
  guid: string;
  title: string;
  url: string;
  citation?: string;
  codeSetName?: string;
  titleDescription?: string;
  currentness?: string;
  content: string;
  rawHtml: string;
  scrapedAt: string;
}

export interface ScrapedRuleSet {
  title: string;
  guid: string;
  url: string;
  scrapedAt: string;
  structure: RuleSetNode[];
  documents: ScrapedDocument[];
  metadata: {
    totalDocuments: number;
    totalCategories: number;
  };
}

export interface RuleSetNode {
  title: string;
  guid: string;
  url: string;
  type: 'category' | 'document';
  children?: RuleSetNode[];
}

export interface ScrapeOptions {
  delayMs: number;       // Delay between requests (default 100ms)
  timeoutMs: number;     // Request timeout (default 15s)
  concurrency: number;   // Number of parallel requests (default 3)
}

const BASE_URL = 'https://govt.westlaw.com';

// Standard desktop-browser request headers (a complete, current Chrome UA string)
const REQUEST_HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache',
  'Upgrade-Insecure-Requests': '1',
};

// Helper to fetch with full timeout (including body read)
async function fetchWithTimeout(url: string, timeoutMs: number): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      headers: REQUEST_HEADERS,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    // Race the text() call against remaining timeout
    const textPromise = response.text();
    const timeoutPromise = new Promise<never>((_, reject) => {
      // Check remaining time
      setTimeout(() => reject(new Error(`Body read timed out after ${timeoutMs / 1000}s`)), timeoutMs);
    });

    const html = await Promise.race([textPromise, timeoutPromise]);
    clearTimeout(timeoutId);
    return html;
  } catch (err) {
    clearTimeout(timeoutId);
    if ((err as Error).name === 'AbortError') {
      throw new Error(`Request timed out after ${timeoutMs / 1000}s`);
    }
    throw err;
  }
}

export async function fetchMasterIndex(): Promise<RuleSetItem[]> {
  const response = await fetch(`${BASE_URL}/azrules/Index`, {
    headers: REQUEST_HEADERS,
  });

  if (!response?.ok) {
    throw new Error(`Failed to fetch index: ${response?.status}`);
  }

  const html = await response?.text?.() ?? '';
  const $ = cheerio.load(html);

  const ruleSets: RuleSetItem[] = [];

  $('ul.co_genericWhiteBox li a')?.each?.((_, el) => {
    const $el = $(el);
    const title = $el?.text?.()?.trim?.() ?? '';
    const href = $el?.attr?.('href') ?? '';

    if (href && title) {
      const guidMatch = href?.match?.(/guid=([A-Z0-9]+)/i);
      const guid = guidMatch?.[1] ?? '';

      if (guid) {
        ruleSets.push({
          title,
          guid,
          url: `${BASE_URL}${href}`,
          type: 'category',
        });
      }
    }
  });

  return ruleSets;
}

export async function scrapeCategory(guid: string, title: string, timeoutMs: number = 30000): Promise<RuleSetItem[]> {
  const url = `${BASE_URL}/azrules/Browse/Home/Arizona/ArizonaCourtRules/ArizonaStatutesCourtRules?guid=${guid}&transitionType=CategoryPageItem&contextData=(sc.Default)`;

  const html = await fetchWithTimeout(url, timeoutMs);
  const $ = cheerio.load(html);

  const items: RuleSetItem[] = [];

  $('ul.co_genericWhiteBox li a')?.each?.((_, el) => {
    const $el = $(el);
    const itemTitle = $el?.text?.()?.trim?.() ?? '';
    const href = $el?.attr?.('href') ?? '';

    if (href && itemTitle) {
      const isDocument = href?.includes?.('/Document/');
      const guidMatch = href?.match?.(/guid=([A-Z0-9]+)/i) ?? href?.match?.(/Document\/([A-Z0-9]+)/i);
      const itemGuid = guidMatch?.[1] ?? '';

      if (itemGuid) {
        items.push({
          title: itemTitle,
          guid: itemGuid,
          url: `${BASE_URL}${href}`,
          type: isDocument ? 'document' : 'category',
        });
      }
    }
  });

  return items;
}

export async function scrapeDocument(guid: string, timeoutMs: number = 30000): Promise<ScrapedDocument> {
  const url = `${BASE_URL}/azrules/Document/${guid}?viewType=FullText&originationContext=documenttoc&transitionType=CategoryPageItem&contextData=(sc.Default)`;

  const html = await fetchWithTimeout(url, timeoutMs);
  const $ = cheerio.load(html);

  const title = $('#co_docHeaderTitleLine #title')?.text?.()?.trim?.() ?? $('#co_docHeaderTitleLine')?.text?.()?.trim?.() ?? 'Untitled';
  const codeSetName = $('#codeSetName')?.text?.()?.trim?.() ?? '';
  const titleDescription = $('#titleDesc')?.text?.()?.trim?.() ?? '';
  const citation = $('.co_cites')?.text?.()?.trim?.() ?? '';
  const currentness = $('.co_currentness a, .co_currentness')?.text?.()?.trim?.() ?? '';

  const $document = $('#co_document');
  const rawHtml = $document?.html?.() ?? '';

  // Extract clean text content with preserved line breaks
  $document?.find?.('script, style')?.remove?.();
  
  // Insert newlines before/after block-level elements to preserve structure
  const blockElements = ['p', 'div', 'br', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'tr', 'dt', 'dd', 'blockquote', 'pre', 'section', 'article', 'header', 'footer', 'hr'];
  blockElements.forEach(tag => {
    $document?.find?.(tag)?.each?.((_, el) => {
      $(el).before('\n');
      $(el).after('\n');
    });
  });
  
  // Extract text and clean up excessive whitespace while preserving newlines
  let content = $document?.text?.() ?? '';
  // Replace tabs and multiple spaces (but not newlines) with single space
  content = content.replace(/[^\S\n]+/g, ' ');
  // Collapse multiple newlines into double newlines (paragraph breaks)
  content = content.replace(/\n\s*\n/g, '\n\n');
  // Remove leading/trailing whitespace from each line
  content = content.split('\n').map(line => line.trim()).join('\n');
  // Remove excessive blank lines (more than 2 consecutive)
  content = content.replace(/\n{3,}/g, '\n\n');
  // Final trim
  content = content.trim();

  return {
    guid,
    title,
    url,
    citation,
    codeSetName,
    titleDescription,
    currentness,
    content,
    rawHtml,
    scrapedAt: new Date().toISOString(),
  };
}

// Default options
const DEFAULT_OPTIONS: ScrapeOptions = {
  delayMs: 100,
  timeoutMs: 15000,  // Reduced from 30s to 15s
  concurrency: 3,
};

// Discovery phase: count all items without scraping content
interface DiscoveryResult {
  totalDocuments: number;
  totalCategories: number;
  items: Array<{ guid: string; title: string; url: string; type: 'document' | 'category'; parentPath: string[] }>;
  structure: RuleSetNode[];
}

async function discoverStructure(
  guid: string,
  title: string,
  options: ScrapeOptions,
  onProgress?: (message: string, progress: number) => void
): Promise<DiscoveryResult> {
  const items: DiscoveryResult['items'] = [];
  let totalDocuments = 0;
  let totalCategories = 0;

  const truncate = (str: string, len: number = 60) => 
    str.length > len ? str.substring(0, len) + '...' : str;

  async function discoverCategory(categoryGuid: string, categoryTitle: string, parentPath: string[], depth: number = 0): Promise<RuleSetNode[]> {
    const indent = '  '.repeat(Math.min(depth, 3));
    onProgress?.(`${indent}🔍 Discovering: ${truncate(categoryTitle)}`, Math.min(45, 5 + totalCategories + totalDocuments / 10));

    await new Promise(resolve => setTimeout(resolve, options.delayMs));

    const categoryItems = await scrapeCategory(categoryGuid, categoryTitle, options.timeoutMs);
    const nodes: RuleSetNode[] = [];
    const currentPath = [...parentPath, categoryTitle];

    for (const item of categoryItems ?? []) {
      if (item?.type === 'document') {
        totalDocuments++;
        items.push({
          guid: item.guid,
          title: item.title,
          url: item.url,
          type: 'document',
          parentPath: currentPath,
        });
        nodes.push({
          title: item.title ?? '',
          guid: item.guid ?? '',
          url: item.url ?? '',
          type: 'document',
        });
      } else {
        totalCategories++;
        const children = await discoverCategory(item.guid ?? '', item.title ?? '', currentPath, depth + 1);
        nodes.push({
          title: item.title ?? '',
          guid: item.guid ?? '',
          url: item.url ?? '',
          type: 'category',
          children,
        });
      }
    }

    return nodes;
  }

  const structure = await discoverCategory(guid, title, [], 0);

  return { totalDocuments, totalCategories, items, structure };
}

// Process items in batches with concurrency
async function processBatch<T, R>(
  items: T[],
  processor: (item: T, index: number) => Promise<R>,
  concurrency: number,
  delayMs: number
): Promise<R[]> {
  const results: R[] = [];
  let index = 0;

  async function processNext(): Promise<void> {
    while (index < items.length) {
      const currentIndex = index++;
      const item = items[currentIndex];
      if (delayMs > 0) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
      const result = await processor(item, currentIndex);
      results.push(result);
    }
  }

  // Start concurrent workers
  const workers = Array(Math.min(concurrency, items.length))
    .fill(null)
    .map(() => processNext());

  await Promise.all(workers);
  return results;
}

export async function scrapeRuleSetCompletely(
  guid: string,
  title: string,
  onProgress?: (message: string, progress: number) => void,
  options?: Partial<ScrapeOptions>
): Promise<ScrapedRuleSet> {
  const opts: ScrapeOptions = { ...DEFAULT_OPTIONS, ...options };
  const documents: ScrapedDocument[] = [];
  let completedDocs = 0;
  let failedDocs = 0;
  const startTime = Date.now();

  const truncate = (str: string, len: number = 60) => 
    str.length > len ? str.substring(0, len) + '...' : str;

  // Phase 1: Discovery
  onProgress?.(`🚀 Starting scrape for: ${truncate(title)}`, 2);
  onProgress?.(`⚙️ Settings: ${opts.delayMs}ms delay, ${opts.timeoutMs / 1000}s timeout, ${opts.concurrency} threads`, 2);
  onProgress?.('📊 Phase 1/2: Discovering structure (counting documents)...', 3);

  const discovery = await discoverStructure(guid, title, opts, onProgress);
  
  onProgress?.(`✓ Discovery complete: Found ${discovery.totalDocuments} documents in ${discovery.totalCategories} categories`, 50);
  onProgress?.('', 50);
  onProgress?.(`📥 Phase 2/2: Downloading documents (${opts.concurrency} parallel)...`, 51);

  // Phase 2: Scrape documents with concurrency
  const progressBase = 51;
  const progressRange = 48;
  const docItems = discovery.items.filter(item => item.type === 'document');

  // Process documents concurrently
  await processBatch(
    docItems,
    async (item, _idx) => {
      completedDocs++;
      const progressPct = progressBase + Math.floor((completedDocs / discovery.totalDocuments) * progressRange);
      const pathStr = item.parentPath.length > 1 ? `${truncate(item.parentPath.slice(-1)[0], 25)} > ` : '';
      
      onProgress?.(`📄 [${completedDocs}/${discovery.totalDocuments}] ${pathStr}${truncate(item.title, 40)}`, progressPct);

      try {
        const doc = await scrapeDocument(item.guid, opts.timeoutMs);
        documents.push(doc);
        return { success: true };
      } catch (err) {
        failedDocs++;
        const errMsg = (err as Error)?.message ?? 'Unknown error';
        console.error(`Failed to scrape document ${item.guid}:`, err);
        onProgress?.(`⚠️ Failed: ${truncate(item.title, 35)} - ${errMsg}`, progressPct);
        return { success: false };
      }
    },
    opts.concurrency,
    opts.delayMs
  );

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  onProgress?.('', 99);
  onProgress?.(`✅ Scrape complete! ${completedDocs} documents in ${elapsed}s${failedDocs > 0 ? ` (${failedDocs} failed)` : ''}`, 100);

  return {
    title,
    guid,
    url: `${BASE_URL}/azrules/Browse/Home/Arizona/ArizonaCourtRules/ArizonaStatutesCourtRules?guid=${guid}`,
    scrapedAt: new Date().toISOString(),
    structure: discovery.structure,
    documents,
    metadata: {
      totalDocuments: documents?.length ?? 0,
      totalCategories: discovery.totalCategories,
    },
  };
}
