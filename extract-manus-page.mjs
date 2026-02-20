#!/usr/bin/env node

/**
 * Extract content from Manus shared pages using Playwright
 * Usage: node extract-manus-page.mjs <url> <output-file>
 */

import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const url = process.argv[2];
const outputFile = process.argv[3];

if (!url || !outputFile) {
  console.error('Usage: node extract-manus-page.mjs <url> <output-file>');
  process.exit(1);
}

console.log(`📄 Extracting content from: ${url}`);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

try {
  // Navigate and wait for content to load
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  
  // Wait for main content to be visible
  await page.waitForTimeout(3000);
  
  // Extract all text content
  const content = await page.evaluate(() => {
    // Remove script and style elements
    const scripts = document.querySelectorAll('script, style, noscript');
    scripts.forEach(el => el.remove());
    
    // Get all text content
    const body = document.body;
    return body ? body.innerText : '';
  });
  
  // Extract title
  const title = await page.title();
  
  // Save to file
  const output = `# ${title}\n\n**URL:** ${url}\n\n---\n\n${content}`;
  writeFileSync(outputFile, output, 'utf8');
  
  console.log(`✅ Content extracted successfully`);
  console.log(`📝 Saved to: ${outputFile}`);
  console.log(`📊 Content length: ${content.length} characters`);
  
} catch (error) {
  console.error(`❌ Error extracting content: ${error.message}`);
  process.exit(1);
} finally {
  await browser.close();
}
