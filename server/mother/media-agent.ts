/**
 * MOTHER Media Agent — NC-MEDIA-001 + NC-SLIDES-001
 * 
 * Capabilities:
 * 1. Image generation via DALL-E 3 (OpenAI) + Forge API (built-in)
 * 2. Slides generation via reveal.js + Puppeteer PDF export
 * 3. PDF generation from Markdown
 * 
 * Scientific basis:
 * - DALL-E 3: Betker et al. (2023) "Improving Image Generation with Better Captions"
 * - Reveal.js: Hakim El Hattab (2011) — HTML presentation framework
 * - Puppeteer PDF: Headless Chrome automation (Google, 2017)
 * 
 * @version v74.17
 */

import { ENV } from 'server/_core/env';
import { generateImage as forgeGenerateImage } from 'server/_core/imageGeneration';
import { storagePut } from 'server/storage';

// ============================================================
// TYPES
// ============================================================

export interface ImageGenerationOptions {
  prompt: string;
  size?: '1024x1024' | '1792x1024' | '1024x1792';
  quality?: 'standard' | 'hd';
  style?: 'vivid' | 'natural';
  provider?: 'dalle3' | 'forge';
  n?: number;
}

export interface ImageGenerationResult {
  url: string;
  revisedPrompt?: string;
  provider: string;
  model: string;
}

export interface SlideContent {
  title: string;
  subtitle?: string;
  slides: Array<{
    title: string;
    content: string;
    notes?: string;
    imagePrompt?: string;
  }>;
  theme?: 'black' | 'white' | 'league' | 'beige' | 'sky' | 'night' | 'serif' | 'simple' | 'solarized';
  language?: string;
}

export interface SlidesGenerationResult {
  htmlUrl: string;
  pdfUrl?: string;
  slideCount: number;
}

export interface PdfGenerationOptions {
  content: string;
  title: string;
  format?: 'A4' | 'Letter';
  includeTableOfContents?: boolean;
}

export interface PdfGenerationResult {
  url: string;
  pageCount?: number;
}

// ============================================================
// NC-MEDIA-001: IMAGE GENERATION
// ============================================================

/**
 * Generate image using DALL-E 3 (primary) or Forge API (fallback)
 * Scientific basis: Betker et al. (2023) — DALL-E 3 prompt adherence
 */
export async function generateImageWithDalle3(
  options: ImageGenerationOptions
): Promise<ImageGenerationResult> {
  const { prompt, size = '1024x1024', quality = 'standard', style = 'vivid', provider = 'dalle3' } = options;

  // Try DALL-E 3 first if OpenAI key is available
  if (provider === 'dalle3' && ENV.openaiApiKey) {
    try {
      const response = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ENV.openaiApiKey}`,
        },
        body: JSON.stringify({
          model: 'dall-e-3',
          prompt,
          n: 1,
          size,
          quality,
          style,
          response_format: 'url',
        }),
      });

      if (response.ok) {
        const data = await response.json() as {
          data: Array<{ url: string; revised_prompt?: string }>;
        };
        const imageData = data.data[0];
        
        // Download and re-upload to MOTHER's S3 storage for persistence
        const imageResponse = await fetch(imageData.url);
        if (imageResponse.ok) {
          const buffer = Buffer.from(await imageResponse.arrayBuffer());
          const { url } = await storagePut(
            `generated/dalle3_${Date.now()}.png`,
            buffer,
            'image/png'
          );
          return {
            url,
            revisedPrompt: imageData.revised_prompt,
            provider: 'openai',
            model: 'dall-e-3',
          };
        }
      }
    } catch (error) {
      console.warn('[media-agent] DALL-E 3 failed, trying Forge:', error);
    }
  }

  // Fallback: Forge API (built-in)
  try {
    const result = await forgeGenerateImage({ prompt });
    return {
      url: result.url || '',
      provider: 'forge',
      model: 'forge-image-v1',
    };
  } catch (error) {
    throw new Error(`Image generation failed: ${error}`);
  }
}

// ============================================================
// NC-SLIDES-001: SLIDES GENERATION
// ============================================================

/**
 * Generate reveal.js HTML slides from structured content
 * Scientific basis: Reveal.js (El Hattab, 2011) — HTML presentation framework
 */
export async function generateRevealSlides(
  content: SlideContent
): Promise<SlidesGenerationResult> {
  const { title, subtitle, slides, theme = 'black', language = 'pt-BR' } = content;

  // Build reveal.js HTML
  const slidesHtml = slides.map((slide, i) => {
    const slideContent = formatSlideContent(slide.content);
    const notes = slide.notes ? `<aside class="notes">${slide.notes}</aside>` : '';
    return `
    <section>
      <h2>${escapeHtml(slide.title)}</h2>
      ${slideContent}
      ${notes}
    </section>`;
  }).join('\n');

  const html = `<!DOCTYPE html>
<html lang="${language}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@5.1.0/dist/reset.css">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@5.1.0/dist/reveal.css">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@5.1.0/dist/theme/${theme}.css">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@5.1.0/plugin/highlight/monokai.css">
  <style>
    .reveal h1, .reveal h2 { text-transform: none; }
    .reveal .slides section { text-align: left; }
    .reveal .slides section h2 { text-align: center; margin-bottom: 0.5em; }
    .reveal ul { margin-left: 1em; }
    .reveal li { margin-bottom: 0.3em; }
    .mother-badge { 
      position: fixed; bottom: 10px; right: 10px; 
      font-size: 0.6em; opacity: 0.5; color: #888;
    }
  </style>
</head>
<body>
  <div class="reveal">
    <div class="slides">
      <section>
        <h1>${escapeHtml(title)}</h1>
        ${subtitle ? `<p style="font-size:0.8em; opacity:0.7">${escapeHtml(subtitle)}</p>` : ''}
      </section>
      ${slidesHtml}
    </div>
  </div>
  <div class="mother-badge">Generated by MOTHER v74.17</div>
  <script src="https://cdn.jsdelivr.net/npm/reveal.js@5.1.0/dist/reveal.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/reveal.js@5.1.0/plugin/notes/notes.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/reveal.js@5.1.0/plugin/highlight/highlight.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/reveal.js@5.1.0/plugin/markdown/markdown.js"></script>
  <script>
    Reveal.initialize({
      hash: true,
      transition: 'slide',
      plugins: [ RevealNotes, RevealHighlight, RevealMarkdown ]
    });
  </script>
</body>
</html>`;

  // Upload HTML to S3
  const htmlBuffer = Buffer.from(html, 'utf-8');
  const { url: htmlUrl } = await storagePut(
    `slides/${Date.now()}_${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.html`,
    htmlBuffer,
    'text/html'
  );

  // Try to generate PDF via Puppeteer if available
  let pdfUrl: string | undefined;
  try {
    pdfUrl = await generatePdfFromHtml(html, title);
  } catch (error) {
    console.warn('[media-agent] PDF generation failed (Puppeteer not available):', error);
  }

  return {
    htmlUrl,
    pdfUrl,
    slideCount: slides.length + 1, // +1 for title slide
  };
}

/**
 * Generate PDF from Markdown content
 * Uses Puppeteer (headless Chrome) for high-fidelity rendering
 */
export async function generatePdfFromMarkdown(
  options: PdfGenerationOptions
): Promise<PdfGenerationResult> {
  const { content, title, format = 'A4', includeTableOfContents = false } = options;

  // Convert Markdown to HTML
  const htmlContent = markdownToHtml(content, title, includeTableOfContents);

  const pdfUrl = await generatePdfFromHtml(htmlContent, title, format);
  return { url: pdfUrl };
}

/**
 * Internal: Generate PDF from HTML using Puppeteer
 */
async function generatePdfFromHtml(
  html: string,
  title: string,
  format: 'A4' | 'Letter' = 'A4'
): Promise<string> {
  // Dynamic import to avoid crash if playwright not installed
  // @ts-ignore
  const { chromium } = await import('playwright');
  
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle' });
    
    const pdfBuffer = await page.pdf({
      format,
      printBackground: true,
      margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' },
    });

    const { url } = await storagePut(
      `pdfs/${Date.now()}_${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pdf`,
      Buffer.from(pdfBuffer),
      'application/pdf'
    );
    return url;
  } finally {
    await browser.close();
  }
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatSlideContent(content: string): string {
  // Convert markdown-like content to HTML for slides
  const lines = content.split('\n').filter(l => l.trim());
  
  if (lines.length === 0) return '';
  
  // Check if it's a list
  const isList = lines.some(l => l.trim().startsWith('- ') || l.trim().startsWith('* ') || /^\d+\./.test(l.trim()));
  
  if (isList) {
    const items = lines
      .filter(l => l.trim().startsWith('- ') || l.trim().startsWith('* ') || /^\d+\./.test(l.trim()))
      .map(l => `<li>${escapeHtml(l.replace(/^[-*]\s+/, '').replace(/^\d+\.\s+/, ''))}</li>`)
      .join('\n');
    return `<ul>${items}</ul>`;
  }
  
  // Paragraphs
  return lines.map(l => `<p>${escapeHtml(l)}</p>`).join('\n');
}

function markdownToHtml(markdown: string, title: string, toc: boolean): string {
  // Simple markdown to HTML conversion for PDF
  let html = markdown
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/^(?!<[hul])/gm, '<p>')
    .replace(/(?<![>])$/gm, '</p>');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: 'Georgia', serif; max-width: 800px; margin: 0 auto; padding: 40px; color: #333; line-height: 1.6; }
    h1 { color: #1a1a2e; border-bottom: 2px solid #1a1a2e; padding-bottom: 10px; }
    h2 { color: #16213e; margin-top: 2em; }
    h3 { color: #0f3460; }
    code { background: #f4f4f4; padding: 2px 6px; border-radius: 3px; font-family: monospace; }
    ul { margin-left: 1.5em; }
    li { margin-bottom: 0.3em; }
    .footer { margin-top: 3em; font-size: 0.8em; color: #888; border-top: 1px solid #eee; padding-top: 1em; }
  </style>
</head>
<body>
  ${html}
  <div class="footer">Generated by MOTHER v74.17 — ${new Date().toISOString().split('T')[0]}</div>
</body>
</html>`;
}
