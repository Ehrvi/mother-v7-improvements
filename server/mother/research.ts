/**
 * MOTHER v54.0 - Scientific Research Module
 * 
 * Implements autonomous web search and scientific literature retrieval.
 * 
 * Scientific basis:
 * - ReAct (Yao et al., ICLR 2023): Reason + Act paradigm for tool-augmented LLMs
 * - WebGPT (Nakano et al., 2021): LLM with web browsing capability
 * - Toolformer (Schick et al., NeurIPS 2023): Self-supervised tool use
 * - RAG (Lewis et al., NeurIPS 2020): Retrieval-Augmented Generation
 * 
 * Architecture:
 * 1. Query classification: detect if query requires external knowledge
 * 2. Source selection: arXiv, Anna's Archive, DuckDuckGo, Wikipedia
 * 3. Result synthesis: extract relevant information and cite sources
 */

import { invokeLLM } from '../_core/llm';
import { ENV } from '../_core/env';

export interface ResearchResult {
  query: string;
  sources: ResearchSource[];
  synthesis: string;
  usedSearch: boolean;
}

export interface ResearchSource {
  title: string;
  url: string;
  snippet: string;
  type: 'arxiv' | 'web' | 'wikipedia' | 'annas_archive';
}

/**
 * Detect if a query requires scientific research / web search
 * Based on keyword analysis and query intent classification
 */
export function requiresResearch(query: string): boolean {
  const researchIndicators = [
    // Scientific research triggers
    /pesquis[ae]/i,
    /busca.*cient[íi]fica/i,
    /estado da arte/i,
    /literatura.*cient[íi]fica/i,
    /artigo.*cient[íi]fico/i,
    /paper.*recente/i,
    /publica[çc][ãa]o/i,
    /arxiv/i,
    /anna.*archive/i,
    /search.*web/i,
    /buscar.*internet/i,
    /pesquisar.*online/i,
    /o que.*aconteceu/i,
    /not[íi]cia/i,
    /atual.*mente/i,
    /recente.*mente/i,
    /[úu]ltimo.*ano/i,
    /2024|2025|2026/,
    /aprenda.*nivel.*god/i,
    /aprenda.*tudo/i,
    /pesquise/i,
    /investigue/i,
    /descubra/i,
  ];

  return researchIndicators.some(pattern => pattern.test(query));
}

/**
 * Search arXiv for scientific papers
 * API: https://arxiv.org/help/api/user-manual
 */
async function searchArxiv(query: string, maxResults = 3): Promise<ResearchSource[]> {
  try {
    const encodedQuery = encodeURIComponent(query);
    const url = `https://export.arxiv.org/api/query?search_query=all:${encodedQuery}&start=0&max_results=${maxResults}&sortBy=relevance&sortOrder=descending`;
    
    const response = await fetch(url, {
      headers: { 'User-Agent': 'MOTHER-Scientific-Agent/54.0' },
      signal: AbortSignal.timeout(8000),
    });
    
    if (!response.ok) return [];
    
    const xml = await response.text();
    const sources: ResearchSource[] = [];
    
    // Parse XML entries
    const entries = xml.match(/<entry>([\s\S]*?)<\/entry>/g) || [];
    for (const entry of entries.slice(0, maxResults)) {
      const title = entry.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.trim().replace(/\s+/g, ' ') || '';
      const summary = entry.match(/<summary>([\s\S]*?)<\/summary>/)?.[1]?.trim().replace(/\s+/g, ' ') || '';
      const id = entry.match(/<id>([\s\S]*?)<\/id>/)?.[1]?.trim() || '';
      const published = entry.match(/<published>([\s\S]*?)<\/published>/)?.[1]?.trim().split('T')[0] || '';
      
      if (title && id) {
        sources.push({
          title: `[arXiv ${published}] ${title}`,
          url: id,
          snippet: summary.slice(0, 400) + (summary.length > 400 ? '...' : ''),
          type: 'arxiv',
        });
      }
    }
    
    return sources;
  } catch (error) {
    console.error('[Research] arXiv search failed:', error);
    return [];
  }
}

/**
 * Search Wikipedia for factual information
 * API: https://en.wikipedia.org/w/api.php
 */
async function searchWikipedia(query: string): Promise<ResearchSource[]> {
  try {
    // Try Portuguese first, then English
    const langs = ['pt', 'en'];
    const sources: ResearchSource[] = [];
    
    for (const lang of langs) {
      const encodedQuery = encodeURIComponent(query);
      const url = `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodedQuery}&format=json&srlimit=2&srprop=snippet`;
      
      const response = await fetch(url, {
        headers: { 'User-Agent': 'MOTHER-Scientific-Agent/54.0' },
        signal: AbortSignal.timeout(5000),
      });
      
      if (!response.ok) continue;
      
      const data = await response.json() as any;
      const results = data?.query?.search || [];
      
      for (const result of results.slice(0, 2)) {
        sources.push({
          title: `[Wikipedia/${lang.toUpperCase()}] ${result.title}`,
          url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(result.title)}`,
          snippet: result.snippet?.replace(/<[^>]*>/g, '') || '',
          type: 'wikipedia',
        });
      }
      
      if (sources.length >= 2) break;
    }
    
    return sources;
  } catch (error) {
    console.error('[Research] Wikipedia search failed:', error);
    return [];
  }
}

/**
 * Search DuckDuckGo Instant Answer API
 * No API key required, privacy-focused
 */
async function searchDuckDuckGo(query: string): Promise<ResearchSource[]> {
  try {
    const encodedQuery = encodeURIComponent(query);
    const url = `https://api.duckduckgo.com/?q=${encodedQuery}&format=json&no_html=1&skip_disambig=1`;
    
    const response = await fetch(url, {
      headers: { 'User-Agent': 'MOTHER-Scientific-Agent/54.0' },
      signal: AbortSignal.timeout(5000),
    });
    
    if (!response.ok) return [];
    
    const data = await response.json() as any;
    const sources: ResearchSource[] = [];
    
    // Abstract (main result)
    if (data.Abstract && data.AbstractURL) {
      sources.push({
        title: `[DuckDuckGo] ${data.Heading || query}`,
        url: data.AbstractURL,
        snippet: data.Abstract.slice(0, 500),
        type: 'web',
      });
    }
    
    // Related topics
    const topics = data.RelatedTopics || [];
    for (const topic of topics.slice(0, 2)) {
      if (topic.Text && topic.FirstURL) {
        sources.push({
          title: `[DuckDuckGo Related] ${topic.Text.slice(0, 80)}`,
          url: topic.FirstURL,
          snippet: topic.Text.slice(0, 300),
          type: 'web',
        });
      }
    }
    
    return sources;
  } catch (error) {
    console.error('[Research] DuckDuckGo search failed:', error);
    return [];
  }
}

/**
 * Use OpenAI with web_search tool (gpt-4o-search-preview)
 * This is the most powerful option - uses OpenAI's built-in web search
 */
async function searchWithOpenAI(query: string): Promise<string> {
  try {
    const apiKey = ENV.openaiApiKey;
    if (!apiKey) return '';
    
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini-search-preview',
        tools: [{ type: 'web_search_preview' }],
        input: `Pesquise informações científicas e atualizadas sobre: ${query}. 
        Foque em: estado da arte, papers recentes, fontes confiáveis.
        Responda em português com citações das fontes.`,
      }),
      signal: AbortSignal.timeout(30000),
    });
    
    if (!response.ok) {
      console.error('[Research] OpenAI search failed:', response.status, await response.text());
      return '';
    }
    
    const data = await response.json() as any;
    
    // Extract text from the response
    const outputItems = data.output || [];
    for (const item of outputItems) {
      if (item.type === 'message') {
        const content = item.content || [];
        for (const c of content) {
          if (c.type === 'output_text' && c.text) {
            return c.text;
          }
        }
      }
    }
    
    return '';
  } catch (error) {
    console.error('[Research] OpenAI web search failed:', error);
    return '';
  }
}

/**
 * Main research function - orchestrates all search sources
 * Returns synthesized research results with citations
 */
export async function conductResearch(query: string): Promise<ResearchResult> {
  console.log(`[Research] Conducting research for: ${query.slice(0, 100)}`);
  
  const sources: ResearchSource[] = [];
  let openAISearchResult = '';
  
  // Run searches in parallel for speed
  const [arxivResults, wikiResults, ddgResults, openAIResult] = await Promise.allSettled([
    searchArxiv(query),
    searchWikipedia(query),
    searchDuckDuckGo(query),
    searchWithOpenAI(query),
  ]);
  
  if (arxivResults.status === 'fulfilled') sources.push(...arxivResults.value);
  if (wikiResults.status === 'fulfilled') sources.push(...wikiResults.value);
  if (ddgResults.status === 'fulfilled') sources.push(...ddgResults.value);
  if (openAIResult.status === 'fulfilled') openAISearchResult = openAIResult.value;
  
  console.log(`[Research] Found ${sources.length} sources, OpenAI search: ${openAISearchResult ? 'yes' : 'no'}`);
  
  // If OpenAI web search returned results, use them as primary synthesis
  if (openAISearchResult) {
    return {
      query,
      sources,
      synthesis: openAISearchResult,
      usedSearch: true,
    };
  }
  
  // Otherwise synthesize from collected sources
  if (sources.length === 0) {
    return {
      query,
      sources: [],
      synthesis: '',
      usedSearch: false,
    };
  }
  
  // Build synthesis prompt
  const sourcesText = sources
    .map((s, i) => `[${i+1}] ${s.title}\nURL: ${s.url}\nResumo: ${s.snippet}`)
    .join('\n\n');
  
  const synthesisPrompt = `Com base nas seguintes fontes científicas encontradas, sintetize as informações mais relevantes para responder à pergunta: "${query}"

FONTES ENCONTRADAS:
${sourcesText}

Sintetize em português, citando as fontes com [número]. Seja preciso e científico.`;
  
  try {
    const llmResult = await invokeLLM({
      messages: [
        { role: 'system', content: 'Você é um assistente de pesquisa científica. Sintetize as fontes de forma precisa e cite-as.' },
        { role: 'user', content: synthesisPrompt },
      ],
      model: 'gpt-4o-mini',
      maxTokens: 1000,
    });
    
    const synthesis = (llmResult.choices[0]?.message?.content as string) || sourcesText;
    
    return {
      query,
      sources,
      synthesis,
      usedSearch: true,
    };
  } catch (error) {
    return {
      query,
      sources,
      synthesis: sourcesText,
      usedSearch: true,
    };
  }
}
