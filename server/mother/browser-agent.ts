/**
 * MOTHER v74.14: Real Browser Agent — NC-BROWSER-001 + NC-RESEARCH-001
 *
 * Gives MOTHER real web browsing capability via Playwright Chromium.
 * Replaces the previous DuckDuckGo Instant Answer API (text-only) with
 * full browser access to any URL, including Anna's Archive.
 *
 * Scientific basis:
 * - WebGPT (Nakano et al., arXiv:2112.09332, 2021): LLM with web browsing capability
 * - ReAct (Yao et al., ICLR 2023): Reason + Act paradigm for tool-augmented LLMs
 * - Toolformer (Schick et al., NeurIPS 2023): Self-supervised tool use in LLMs
 * - WebArena (Zhou et al., arXiv:2307.13854, 2023): Realistic web task benchmark
 *
 * Architecture:
 * - browseUrl(url): Navigate any URL, return full text content
 * - searchAnnasArchive(query): Search Anna's Archive, extract book list + download links
 * - downloadAndExtractPdf(url): Download PDF, extract text with pdf-parse
 * - searchDuckDuckGo(query): Web search with real browser (bypasses API limits)
 * - searchForums(query, site): Search specific forums (Reddit, HN, Stack Overflow)
 * - searchSoftwareManual(software, topic): Search official documentation
 *
 * Cloud Run compatibility:
 * - Uses --no-sandbox flag (required in containers)
 * - Headless mode (no display needed)
 * - Auto-closes browser after each operation to conserve memory
 */
import { createLogger } from '../_core/logger';
import { addKnowledge } from './knowledge'; // NC-RESEARCH-001: auto-index to bd_central
// pdf-parse: use require for CommonJS compatibility
const pdfParse = require('pdf-parse') as (buffer: Buffer) => Promise<{ text: string; numpages: number }>;

const log = createLogger('BROWSER-AGENT');

// ── Types ─────────────────────────────────────────────────────────────────────
export interface BrowseResult {
  url: string;
  title: string;
  content: string;
  success: boolean;
  error?: string;
}

export interface AnnasArchiveResult {
  title: string;
  author: string;
  year?: string;
  format: string;
  size?: string;
  language: string;
  downloadUrl?: string;
  pageUrl: string;
  extractedText?: string;
}

export interface ForumResult {
  title: string;
  url: string;
  content: string;
  votes?: number;
  replies?: number;
  source: 'reddit' | 'hackernews' | 'stackoverflow' | 'other';
}

// ── Playwright lazy loader ────────────────────────────────────────────────────
// Lazy import to avoid crash if playwright is not installed yet
async function getBrowser() {
  try {
    // @ts-ignore — playwright is an optional runtime dependency
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-gpu',
      ],
    });
    return browser;
  } catch (err) {
    log.error('Playwright not available', { error: String(err) });
    throw new Error('Playwright not installed. Run: pnpm add playwright && npx playwright install chromium');
  }
}

// ── Core: Browse any URL ──────────────────────────────────────────────────────
/**
 * Navigate to any URL and return the full text content.
 * Uses Playwright Chromium in headless mode.
 */
export async function browseUrl(url: string, waitMs = 2000): Promise<BrowseResult> {
  log.info('Browsing URL', { url });
  let browser;
  try {
    browser = await getBrowser();
    const page = await browser.newPage();
    await page.setExtraHTTPHeaders({
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    if (waitMs > 0) await page.waitForTimeout(waitMs);

    const title = await page.title();
    const content = await page.evaluate(() => {
      // Remove scripts, styles, nav, footer for cleaner text
      const toRemove = document.querySelectorAll('script, style, nav, footer, header, .ad, .advertisement, .cookie-banner');
      toRemove.forEach(el => el.remove());
      return document.body?.innerText || document.documentElement.innerText || '';
    });

    return { url, title, content: content.slice(0, 50000), success: true };
  } catch (err) {
    log.error('Browse error', { url, error: String(err) });
    return { url, title: '', content: '', success: false, error: String(err) };
  } finally {
    if (browser) await browser.close();
  }
}

// ── Anna's Archive Search ─────────────────────────────────────────────────────
/**
 * Search Anna's Archive for books and papers.
 * Returns list of results with metadata and download links.
 *
 * Scientific basis: Anna's Archive indexes 35M+ books and papers from
 * Library Genesis, Sci-Hub, Z-Library, and other sources.
 * This gives MOTHER access to the same scientific literature that
 * previously required Manus to navigate manually.
 */
export async function searchAnnasArchive(
  query: string,
  options: {
    lang?: string;
    content?: string;
    ext?: string;
    limit?: number;
    extractText?: boolean;
  } = {}
): Promise<AnnasArchiveResult[]> {
  const { lang = 'en', content = '', ext = 'pdf', limit = 10, extractText = false } = options;
  log.info('Searching Anna\'s Archive', { query, lang, content, ext });

  let browser;
  try {
    browser = await getBrowser();
    const page = await browser.newPage();
    await page.setExtraHTTPHeaders({
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });

    // Build search URL
    const params = new URLSearchParams({ q: query });
    if (lang) params.set('lang', lang);
    if (content) params.set('content', content);
    if (ext) params.set('ext', ext);
    params.set('sort', 'newest');

    const searchUrl = `https://annas-archive.li/search?${params.toString()}`;
    log.info('Anna\'s Archive URL', { url: searchUrl });

    await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    // Extract search results
    const results = await page.evaluate(() => {
      const items: Array<{
        title: string;
        author: string;
        year: string;
        format: string;
        size: string;
        language: string;
        pageUrl: string;
      }> = [];

      // Anna's Archive result cards
      const cards = document.querySelectorAll('a[href*="/md5/"]');
      cards.forEach(card => {
        const href = (card as HTMLAnchorElement).href;
        const titleEl = card.querySelector('h3, .text-xl, .font-bold, [class*="title"]');
        const authorEl = card.querySelector('.italic, [class*="author"]');
        const metaText = card.textContent || '';

        // Extract year from metadata text
        const yearMatch = metaText.match(/\b(19|20)\d{2}\b/);
        const formatMatch = metaText.match(/\b(pdf|epub|djvu|mobi|azw3)\b/i);
        const sizeMatch = metaText.match(/\b(\d+(?:\.\d+)?\s*(?:MB|KB|GB))\b/i);
        const langMatch = metaText.match(/\b(English|Portuguese|Spanish|French|German|Chinese)\b/i);

        if (href && titleEl) {
          items.push({
            title: titleEl.textContent?.trim() || '',
            author: authorEl?.textContent?.trim() || '',
            year: yearMatch?.[0] || '',
            format: formatMatch?.[0]?.toLowerCase() || 'pdf',
            size: sizeMatch?.[0] || '',
            language: langMatch?.[0] || 'English',
            pageUrl: href,
          });
        }
      });
      return items;
    });

    log.info('Anna\'s Archive results', { count: results.length });

    // Get download links for each result (up to limit)
    const enriched: AnnasArchiveResult[] = [];
    for (const result of results.slice(0, limit)) {
      try {
        await page.goto(result.pageUrl, { waitUntil: 'networkidle', timeout: 20000 });
        await page.waitForTimeout(1000);

        const downloadUrl = await page.evaluate(() => {
          // Look for direct download links
          const links = Array.from(document.querySelectorAll('a[href]')) as HTMLAnchorElement[];
          const downloadLink = links.find(l =>
            l.href.includes('/download/') ||
            l.href.includes('.pdf') ||
            l.textContent?.toLowerCase().includes('download') ||
            l.textContent?.toLowerCase().includes('slow download')
          );
          return downloadLink?.href || null;
        });

        const item: AnnasArchiveResult = {
          ...result,
          downloadUrl: downloadUrl || undefined,
        };

        // Optionally extract text from PDF
        if (extractText && downloadUrl && downloadUrl.endsWith('.pdf')) {
          try {
            const pdfText = await downloadAndExtractPdf(downloadUrl);
            item.extractedText = pdfText.slice(0, 5000); // First 5000 chars
          } catch (pdfErr) {
            log.warn('PDF extraction failed', { url: downloadUrl, error: String(pdfErr) });
          }
        }

        enriched.push(item);
      } catch (err) {
        log.warn('Failed to get download link', { url: result.pageUrl, error: String(err) });
        enriched.push(result);
      }
    }

    return enriched;
  } catch (err) {
    log.error('Anna\'s Archive search error', { query, error: String(err) });
    return [];
  } finally {
    if (browser) await browser.close();
  }
}

// ── PDF Download + Text Extraction ───────────────────────────────────────────
/**
 * Download a PDF from URL and extract its text content.
 * Uses pdf-parse (already in MOTHER's dependencies).
 */
export async function downloadAndExtractPdf(url: string): Promise<string> {
  log.info('Downloading PDF', { url });
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
      },
      signal: AbortSignal.timeout(60000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    const data = await pdfParse(buffer);
    log.info('PDF extracted', { pages: data.numpages, chars: data.text.length });
    return data.text;
  } catch (err) {
    log.error('PDF download/extract error', { url, error: String(err) });
    throw err;
  }
}

// ── DuckDuckGo Real Browser Search ───────────────────────────────────────────
/**
 * Search DuckDuckGo with real browser (bypasses API limits, gets full results).
 */
export async function searchDuckDuckGo(query: string, limit = 10): Promise<Array<{
  title: string;
  url: string;
  snippet: string;
}>> {
  log.info('DuckDuckGo browser search', { query });
  let browser;
  try {
    browser = await getBrowser();
    const page = await browser.newPage();
    await page.setExtraHTTPHeaders({
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });
    await page.goto(`https://duckduckgo.com/?q=${encodeURIComponent(query)}&ia=web`, {
      waitUntil: 'networkidle',
      timeout: 30000,
    });
    await page.waitForTimeout(2000);

    const results = await page.evaluate(() => {
      const items: Array<{ title: string; url: string; snippet: string }> = [];
      const resultElements = document.querySelectorAll('[data-result="1"], .result, article[data-testid="result"]');
      resultElements.forEach(el => {
        const titleEl = el.querySelector('h2 a, .result__a, [data-testid="result-title-a"]');
        const snippetEl = el.querySelector('.result__snippet, [data-result="snippet"], [data-testid="result-snippet"]');
        if (titleEl) {
          items.push({
            title: titleEl.textContent?.trim() || '',
            url: (titleEl as HTMLAnchorElement).href || '',
            snippet: snippetEl?.textContent?.trim() || '',
          });
        }
      });
      return items;
    });

    return results.slice(0, limit);
  } catch (err) {
    log.error('DuckDuckGo search error', { query, error: String(err) });
    return [];
  } finally {
    if (browser) await browser.close();
  }
}

// ── Forum Search ──────────────────────────────────────────────────────────────
/**
 * Search technical forums for real-world knowledge.
 * Covers Reddit, Hacker News, Stack Overflow.
 */
export async function searchForums(query: string, options: {
  sites?: Array<'reddit' | 'hackernews' | 'stackoverflow'>;
  limit?: number;
} = {}): Promise<ForumResult[]> {
  const { sites = ['reddit', 'hackernews', 'stackoverflow'], limit = 5 } = options;
  log.info('Forum search', { query, sites });

  const results: ForumResult[] = [];

  for (const site of sites) {
    try {
      let url: string;
      if (site === 'reddit') {
        url = `https://www.reddit.com/search/?q=${encodeURIComponent(query)}&sort=relevance&t=year`;
      } else if (site === 'hackernews') {
        url = `https://hn.algolia.com/?q=${encodeURIComponent(query)}&type=story`;
      } else {
        url = `https://stackoverflow.com/search?q=${encodeURIComponent(query)}`;
      }

      const browsed = await browseUrl(url, 1500);
      if (browsed.success) {
        results.push({
          title: browsed.title,
          url: browsed.url,
          content: browsed.content.slice(0, 3000),
          source: site,
        });
      }
    } catch (err) {
      log.warn('Forum search error', { site, error: String(err) });
    }
  }

  return results.slice(0, limit);
}

// ── Software Manual Search ────────────────────────────────────────────────────
/**
 * Search official software documentation.
 * Covers major AI/ML frameworks, cloud platforms, and developer tools.
 */
export async function searchSoftwareManual(software: string, topic: string): Promise<BrowseResult> {
  const manualUrls: Record<string, string> = {
    'playwright': `https://playwright.dev/docs/intro`,
    'e2b': `https://e2b.dev/docs`,
    'langchain': `https://python.langchain.com/docs/get_started/introduction`,
    'langgraph': `https://langchain-ai.github.io/langgraph/`,
    'openai': `https://platform.openai.com/docs/overview`,
    'anthropic': `https://docs.anthropic.com/en/docs/welcome`,
    'drizzle': `https://orm.drizzle.team/docs/overview`,
    'trpc': `https://trpc.io/docs`,
    'expo': `https://docs.expo.dev/`,
    'react-native': `https://reactnative.dev/docs/getting-started`,
    'mcp': `https://modelcontextprotocol.io/docs`,
    'a2a': `https://developers.googleblog.com/en/a2a-a-new-era-of-agent-interoperability/`,
  };

  const baseUrl = manualUrls[software.toLowerCase()];
  if (baseUrl) {
    log.info('Software manual search', { software, topic, url: baseUrl });
    return browseUrl(baseUrl);
  }

  // Fallback: DuckDuckGo search for the manual
  const results = await searchDuckDuckGo(`${software} documentation ${topic} site:docs.${software}.com OR site:${software}.dev`);
  if (results.length > 0) {
    return browseUrl(results[0].url);
  }

  return { url: '', title: '', content: '', success: false, error: `No manual found for ${software}` };
}

// ── Auto-Index to bd_central (NC-RESEARCH-001) ───────────────────────────────
/**
 * Automatically index extracted content (PDF, web page, forum post) into bd_central.
 * Scientific basis: RAG with persistent memory (Lewis et al., arXiv:2005.11401, 2020)
 * 
 * This enables MOTHER to accumulate knowledge from Anna's Archive, forums, and manuals
 * into her persistent bd_central, making it available for future CRAG queries.
 * 
 * @param title - Title of the document
 * @param content - Extracted text content (will be chunked if > 3000 chars)
 * @param source - Source URL or identifier
 * @param category - Knowledge category (research, forum, manual, etc.)
 * @returns Array of inserted knowledge IDs
 */
export async function indexInBdCentral(
  title: string,
  content: string,
  source: string,
  category: string = 'research'
): Promise<number[]> {
  const ids: number[] = [];
  
  // Chunk content into 2500-char segments with 200-char overlap
  // Scientific basis: optimal chunk size for RAG (Shi et al., arXiv:2310.06025, 2023)
  const CHUNK_SIZE = 2500;
  const OVERLAP = 200;
  
  if (content.length <= CHUNK_SIZE) {
    // Single chunk
    try {
      const id = await addKnowledge(title, content, category, source);
      ids.push(id);
      log.info('Indexed to bd_central', { title, source, category, id });
    } catch (err) {
      log.warn('Failed to index to bd_central', { title, error: String(err) });
    }
  } else {
    // Multiple chunks
    let chunkIndex = 0;
    let start = 0;
    while (start < content.length) {
      const end = Math.min(start + CHUNK_SIZE, content.length);
      const chunk = content.slice(start, end);
      const chunkTitle = `${title} [Part ${chunkIndex + 1}]`;
      
      try {
        const id = await addKnowledge(chunkTitle, chunk, category, source);
        ids.push(id);
        chunkIndex++;
      } catch (err) {
        log.warn('Failed to index chunk to bd_central', { chunkTitle, error: String(err) });
      }
      
      start = end - OVERLAP;
      if (start >= content.length) break;
    }
    log.info('Indexed chunks to bd_central', { title, source, chunks: chunkIndex, ids });
  }
  
  return ids;
}

/**
 * Search Anna's Archive AND automatically index results to bd_central.
 * This is the "research + learn" pipeline for NC-RESEARCH-001.
 * 
 * @param query - Search query
 * @param options - Search options
 * @returns Search results (also indexed to bd_central if extractText=true)
 */
export async function searchAndIndexAnnasArchive(
  query: string,
  options: {
    limit?: number;
    autoIndex?: boolean; // if true, automatically index extracted PDFs to bd_central
  } = {}
): Promise<AnnasArchiveResult[]> {
  const { limit = 5, autoIndex = true } = options;
  
  // Search with text extraction enabled
  const results = await searchAnnasArchive(query, { limit, extractText: true });
  
  if (autoIndex) {
    // Index each result with extracted text to bd_central
    for (const result of results) {
      if (result.extractedText && result.extractedText.length > 200) {
        const source = result.downloadUrl || result.pageUrl;
        const title = `[Anna's Archive] ${result.title} — ${result.author || 'Unknown Author'}`;
        await indexInBdCentral(title, result.extractedText, source, 'research');
      }
    }
    log.info('Anna Archive search+index complete', { query, indexed: results.filter(r => r.extractedText).length });
  }
  
  return results;
}
