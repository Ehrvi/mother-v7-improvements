// Split message content into text segments and mermaid diagram blocks
export type ContentSegment = { type: 'text'; content: string } | { type: 'mermaid'; content: string };

export function splitMermaidBlocks(text: string): ContentSegment[] {
  const segments: ContentSegment[] = [];
  const regex = /```mermaid\s*\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', content: text.slice(lastIndex, match.index) });
    }
    segments.push({ type: 'mermaid', content: match[1].trim() });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    segments.push({ type: 'text', content: text.slice(lastIndex) });
  }
  return segments.length > 0 ? segments : [{ type: 'text', content: text }];
}
