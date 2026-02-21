# Image Optimization Guide - MOTHER v14

**Target**: 70% reduction in image file sizes  
**Date**: 2026-02-21  
**Status**: Ready for implementation when images are added

---

## Overview

This guide provides automated scripts and best practices for optimizing images in the MOTHER project to achieve significant file size reductions while maintaining visual quality.

---

## Quick Start

```bash
# Install optimization tools
pnpm add -D sharp @squoosh/lib imagemin imagemin-webp imagemin-mozjpeg imagemin-pngquant

# Run optimization script
node scripts/optimize-images.js

# Expected results:
# - PNG: 60-80% smaller
# - JPEG: 30-50% smaller  
# - WebP conversion: 25-35% smaller than optimized JPEG
```

---

## Optimization Script

Create `scripts/optimize-images.js`:

```javascript
import sharp from 'sharp';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PUBLIC_DIR = path.join(__dirname, '../client/public');
const IMAGE_DIRS = [
  path.join(PUBLIC_DIR, 'images'),
  path.join(PUBLIC_DIR, 'assets'),
];

// Optimization settings
const JPEG_QUALITY = 85; // 85 is sweet spot (high quality, good compression)
const PNG_QUALITY = 90;
const WEBP_QUALITY = 85;
const MAX_WIDTH = 1920; // Max width for images (responsive)

async function optimizeImage(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const fileName = path.basename(filePath, ext);
  const dir = path.dirname(filePath);
  
  console.log(`Optimizing: ${path.basename(filePath)}`);
  
  try {
    const image = sharp(filePath);
    const metadata = await image.metadata();
    
    // Get original file size
    const originalStats = await fs.stat(filePath);
    const originalSize = originalStats.size;
    
    // Resize if too large
    if (metadata.width > MAX_WIDTH) {
      image.resize(MAX_WIDTH, null, {
        withoutEnlargement: true,
        fit: 'inside',
      });
    }
    
    let optimizedSize = 0;
    let webpSize = 0;
    
    // Optimize based on format
    if (ext === '.jpg' || ext === '.jpeg') {
      // Optimize JPEG
      await image
        .jpeg({ quality: JPEG_QUALITY, progressive: true, mozjpeg: true })
        .toFile(filePath + '.tmp');
      
      const tmpStats = await fs.stat(filePath + '.tmp');
      optimizedSize = tmpStats.size;
      
      // Replace original if smaller
      if (optimizedSize < originalSize) {
        await fs.rename(filePath + '.tmp', filePath);
      } else {
        await fs.unlink(filePath + '.tmp');
        optimizedSize = originalSize;
      }
      
      // Create WebP version
      const webpPath = path.join(dir, `${fileName}.webp`);
      await sharp(filePath)
        .webp({ quality: WEBP_QUALITY })
        .toFile(webpPath);
      
      const webpStats = await fs.stat(webpPath);
      webpSize = webpStats.size;
      
    } else if (ext === '.png') {
      // Optimize PNG
      await image
        .png({ quality: PNG_QUALITY, compressionLevel: 9, adaptiveFiltering: true })
        .toFile(filePath + '.tmp');
      
      const tmpStats = await fs.stat(filePath + '.tmp');
      optimizedSize = tmpStats.size;
      
      // Replace original if smaller
      if (optimizedSize < originalSize) {
        await fs.rename(filePath + '.tmp', filePath);
      } else {
        await fs.unlink(filePath + '.tmp');
        optimizedSize = originalSize;
      }
      
      // Create WebP version
      const webpPath = path.join(dir, `${fileName}.webp`);
      await sharp(filePath)
        .webp({ quality: WEBP_QUALITY, lossless: false })
        .toFile(webpPath);
      
      const webpStats = await fs.stat(webpPath);
      webpSize = webpStats.size;
      
    } else if (ext === '.webp') {
      // Re-optimize WebP
      await image
        .webp({ quality: WEBP_QUALITY })
        .toFile(filePath + '.tmp');
      
      const tmpStats = await fs.stat(filePath + '.tmp');
      optimizedSize = tmpStats.size;
      
      if (optimizedSize < originalSize) {
        await fs.rename(filePath + '.tmp', filePath);
      } else {
        await fs.unlink(filePath + '.tmp');
        optimizedSize = originalSize;
      }
    }
    
    // Calculate savings
    const savings = ((originalSize - optimizedSize) / originalSize * 100).toFixed(1);
    const webpSavings = webpSize > 0 ? ((originalSize - webpSize) / originalSize * 100).toFixed(1) : 0;
    
    console.log(`  Original: ${(originalSize / 1024).toFixed(1)} KB`);
    console.log(`  Optimized: ${(optimizedSize / 1024).toFixed(1)} KB (${savings}% smaller)`);
    if (webpSize > 0) {
      console.log(`  WebP: ${(webpSize / 1024).toFixed(1)} KB (${webpSavings}% smaller than original)`);
    }
    
    return {
      file: path.basename(filePath),
      originalSize,
      optimizedSize,
      webpSize,
      savings: parseFloat(savings),
      webpSavings: parseFloat(webpSavings),
    };
    
  } catch (error) {
    console.error(`  Error optimizing ${filePath}:`, error.message);
    return null;
  }
}

async function findImages(dir) {
  const images = [];
  
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        images.push(...await findImages(fullPath));
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
          images.push(fullPath);
        }
      }
    }
  } catch (error) {
    // Directory doesn't exist, skip
  }
  
  return images;
}

async function main() {
  console.log('🖼️  MOTHER Image Optimization\n');
  console.log('Searching for images...\n');
  
  const allImages = [];
  for (const dir of IMAGE_DIRS) {
    const images = await findImages(dir);
    allImages.push(...images);
  }
  
  if (allImages.length === 0) {
    console.log('No images found to optimize.');
    console.log('\nPlace images in:');
    console.log('  - client/public/images/');
    console.log('  - client/public/assets/');
    return;
  }
  
  console.log(`Found ${allImages.length} images\n`);
  
  const results = [];
  for (const imagePath of allImages) {
    const result = await optimizeImage(imagePath);
    if (result) {
      results.push(result);
    }
    console.log('');
  }
  
  // Summary
  console.log('═══════════════════════════════════════');
  console.log('Summary');
  console.log('═══════════════════════════════════════\n');
  
  const totalOriginal = results.reduce((sum, r) => sum + r.originalSize, 0);
  const totalOptimized = results.reduce((sum, r) => sum + r.optimizedSize, 0);
  const totalWebP = results.reduce((sum, r) => sum + r.webpSize, 0);
  
  const avgSavings = results.reduce((sum, r) => sum + r.savings, 0) / results.length;
  const avgWebPSavings = results.filter(r => r.webpSize > 0).reduce((sum, r) => sum + r.webpSavings, 0) / results.filter(r => r.webpSize > 0).length;
  
  console.log(`Total images optimized: ${results.length}`);
  console.log(`Original total size: ${(totalOriginal / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Optimized total size: ${(totalOptimized / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Average savings: ${avgSavings.toFixed(1)}%`);
  
  if (totalWebP > 0) {
    console.log(`\nWebP versions created: ${results.filter(r => r.webpSize > 0).length}`);
    console.log(`WebP total size: ${(totalWebP / 1024 / 1024).toFixed(2)} MB`);
    console.log(`Average WebP savings: ${avgWebPSavings.toFixed(1)}%`);
  }
  
  console.log('\n✅ Optimization complete!');
}

main().catch(console.error);
```

---

## Usage in React Components

### Using WebP with Fallback

```tsx
// Automatic WebP with fallback
<picture>
  <source srcSet="/images/hero.webp" type="image/webp" />
  <source srcSet="/images/hero.jpg" type="image/jpeg" />
  <img src="/images/hero.jpg" alt="Hero" />
</picture>

// With responsive sizes
<picture>
  <source 
    srcSet="/images/hero-small.webp 640w, /images/hero-medium.webp 1024w, /images/hero-large.webp 1920w"
    type="image/webp"
    sizes="(max-width: 640px) 640px, (max-width: 1024px) 1024px, 1920px"
  />
  <source 
    srcSet="/images/hero-small.jpg 640w, /images/hero-medium.jpg 1024w, /images/hero-large.jpg 1920w"
    type="image/jpeg"
    sizes="(max-width: 640px) 640px, (max-width: 1024px) 1024px, 1920px"
  />
  <img src="/images/hero-large.jpg" alt="Hero" loading="lazy" />
</picture>
```

### Lazy Loading Images

```tsx
// Native lazy loading (modern browsers)
<img src="/images/photo.jpg" alt="Photo" loading="lazy" />

// With Intersection Observer (more control)
import { useEffect, useRef, useState } from 'react';

function LazyImage({ src, alt, ...props }) {
  const [isLoaded, setIsLoaded] = useState(false);
  const imgRef = useRef(null);
  
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsLoaded(true);
          observer.disconnect();
        }
      },
      { rootMargin: '50px' } // Load 50px before entering viewport
    );
    
    if (imgRef.current) {
      observer.observe(imgRef.current);
    }
    
    return () => observer.disconnect();
  }, []);
  
  return (
    <img
      ref={imgRef}
      src={isLoaded ? src : '/images/placeholder.jpg'}
      alt={alt}
      {...props}
    />
  );
}
```

---

## Best Practices

### 1. Choose the Right Format

- **WebP**: Best compression, modern browsers (use with fallback)
- **JPEG**: Photos, complex images with many colors
- **PNG**: Logos, icons, images requiring transparency
- **SVG**: Icons, logos, simple graphics (vector, infinitely scalable)

### 2. Responsive Images

Always provide multiple sizes for different screen sizes:

```tsx
// Generate responsive images
const sizes = [640, 1024, 1920];
for (const size of sizes) {
  await sharp(inputPath)
    .resize(size, null, { withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toFile(`output-${size}.jpg`);
}
```

### 3. Compression Quality Guidelines

- **JPEG**: 85 quality (sweet spot for web)
- **PNG**: 90 quality with compression level 9
- **WebP**: 85 quality (lossy) or lossless for critical images

### 4. Lazy Loading Strategy

- **Above the fold**: Load immediately (no lazy loading)
- **Below the fold**: Lazy load with `loading="lazy"`
- **Far below**: Lazy load with Intersection Observer

### 5. CDN Integration

After Cloudflare CDN setup:
- Images cached for 1 year (immutable)
- Brotli compression applied automatically
- Edge caching reduces latency

---

## Automation

### Add to package.json

```json
{
  "scripts": {
    "optimize:images": "node scripts/optimize-images.js",
    "build": "pnpm optimize:images && vite build && esbuild server/_core/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist"
  }
}
```

### Pre-commit Hook

Create `.husky/pre-commit`:

```bash
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

# Optimize images before commit
pnpm optimize:images

# Add optimized images to commit
git add client/public/images/**/*.{jpg,jpeg,png,webp}
```

---

## Expected Results

### File Size Reductions

| Format | Original | Optimized | Savings |
|--------|----------|-----------|---------|
| PNG    | 500 KB   | 100 KB    | 80%     |
| JPEG   | 300 KB   | 180 KB    | 40%     |
| WebP   | -        | 120 KB    | 60%     |

### Performance Improvements

- **Page load time**: -40% (fewer bytes to download)
- **LCP (Largest Contentful Paint)**: -50% (faster image loading)
- **Bandwidth savings**: 70% (smaller files)

---

## Troubleshooting

### Issue 1: WebP Not Supported

**Solution**: Always provide fallback format

```tsx
<picture>
  <source srcSet="image.webp" type="image/webp" />
  <img src="image.jpg" alt="Fallback" />
</picture>
```

### Issue 2: Images Look Blurry

**Solution**: Increase quality setting

```javascript
const JPEG_QUALITY = 90; // Increase from 85
const WEBP_QUALITY = 90; // Increase from 85
```

### Issue 3: Optimization Takes Too Long

**Solution**: Optimize in parallel

```javascript
const results = await Promise.all(
  allImages.map(imagePath => optimizeImage(imagePath))
);
```

---

## Summary

- ✅ **Automated optimization** with sharp
- ✅ **WebP conversion** for 25-35% additional savings
- ✅ **Responsive images** for different screen sizes
- ✅ **Lazy loading** for better performance
- ✅ **CDN integration** ready

**Expected overall savings**: **70% reduction** in image file sizes

---

**Last Updated**: 2026-02-21  
**Status**: Ready for use when images are added  
**Owner**: Everton Luis Garcia
