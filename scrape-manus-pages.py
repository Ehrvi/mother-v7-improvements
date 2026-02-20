#!/usr/bin/env python3
"""
Scrape content from Manus shared pages using requests + BeautifulSoup
Usage: python3 scrape-manus-pages.py
"""

import requests
from bs4 import BeautifulSoup
import json
import time
import sys

# List of 12 mandatory pages
PAGES = [
    ("https://manus.im/share/yDOh1drRC17hH4IE2yNbMg", "PAGE-1-MOTHER-CORE-SYSTEM.md"),
    ("https://manus.im/share/gksjrYTgxMMBakFlSDDTq3", "PAGE-2-PROJETO-APOLLO.md"),
    ("https://manus.im/share/2Rn2IIETyb4DQxMarxzCms", "PAGE-3.md"),
    ("https://manus.im/share/KF5ab1LEZZ64sGhPIUenTh", "PAGE-4.md"),
    ("https://manus.im/share/KwDoStfju0UiDgyM34oGQh", "PAGE-5.md"),
    ("https://manus.im/share/PQzRnWXxzqYfIJJ6T5FkVM", "PAGE-6.md"),
    ("https://manus.im/share/m8gJA8uhTVe79kG5gXxwhx", "PAGE-7.md"),
    ("https://manus.im/share/KroAoxuqboixjBobypu7mm", "PAGE-8.md"),
    ("https://australiaeventos.manus.space", "PAGE-9-AUSTRALIA-EVENTOS.md"),
    ("https://manus.im/share/BM93dZJiuhxb4sY3Ts7uPD", "PAGE-10.md"),
    ("https://manus.im/share/XNlYqqI5Kd3Nr7hLnC3zm9", "PAGE-11.md"),
    ("https://manus.im/share/QGQmulqFNPo6XoPrtIJ1bK", "PAGE-12.md"),
]

def extract_next_data(html):
    """Extract Next.js __NEXT_DATA__ JSON from HTML"""
    soup = BeautifulSoup(html, 'html.parser')
    
    # Find script tag with id="__NEXT_DATA__"
    next_data_script = soup.find('script', {'id': '__NEXT_DATA__'})
    if next_data_script:
        try:
            data = json.loads(next_data_script.string)
            return data
        except json.JSONDecodeError:
            return None
    return None

def scrape_page(url, output_file):
    """Scrape a single Manus page"""
    print(f"\n📄 Scraping: {url}")
    
    try:
        # Fetch HTML
        headers = {
            'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36'
        }
        response = requests.get(url, headers=headers, timeout=30)
        response.raise_for_status()
        
        # Parse HTML
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # Extract title
        title = soup.find('title')
        title_text = title.string if title else "Untitled"
        
        # Try to extract Next.js data
        next_data = extract_next_data(response.text)
        
        # Extract visible text (fallback)
        # Remove script and style elements
        for script in soup(["script", "style", "noscript"]):
            script.decompose()
        
        text = soup.get_text()
        lines = (line.strip() for line in text.splitlines())
        chunks = (phrase.strip() for line in lines for phrase in line.split("  "))
        text_content = '\n'.join(chunk for chunk in chunks if chunk)
        
        # Build markdown output
        output = f"# {title_text}\n\n"
        output += f"**URL:** {url}\n\n"
        output += f"**Scraped:** {time.strftime('%Y-%m-%d %H:%M:%S')}\n\n"
        output += "---\n\n"
        
        if next_data:
            output += "## Next.js Data Found\n\n"
            output += f"```json\n{json.dumps(next_data, indent=2, ensure_ascii=False)[:5000]}\n```\n\n"
        
        output += "## Extracted Text Content\n\n"
        output += text_content[:10000]  # Limit to 10k chars
        
        # Save to file
        with open(output_file, 'w', encoding='utf-8') as f:
            f.write(output)
        
        print(f"✅ Saved to: {output_file}")
        print(f"📊 Content length: {len(text_content)} characters")
        
        return True
        
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

def main():
    """Main function to scrape all pages"""
    print("🚀 Starting Manus Pages Scraper")
    print(f"📋 Total pages: {len(PAGES)}")
    
    success_count = 0
    
    for i, (url, output_file) in enumerate(PAGES, 1):
        print(f"\n{'='*60}")
        print(f"Progress: {i}/{len(PAGES)}")
        
        if scrape_page(url, output_file):
            success_count += 1
        
        # Rate limiting
        if i < len(PAGES):
            time.sleep(2)
    
    print(f"\n{'='*60}")
    print(f"🎉 Scraping complete!")
    print(f"✅ Success: {success_count}/{len(PAGES)}")
    print(f"❌ Failed: {len(PAGES) - success_count}/{len(PAGES)}")

if __name__ == "__main__":
    main()
