import { useState } from 'react';
import Editor from '@monaco-editor/react';

export default function CodeEditorPanel() {
  const [code, setCode] = useState('// Enter a file path above to load a file');
  const [language, setLanguage] = useState('typescript');
  const [filePath, setFilePath] = useState('');
  const [saving, setSaving] = useState(false);

  const loadFile = async () => {
    if (!filePath) return;
    try {
      const res = await fetch(`/api/editor/${encodeURIComponent(filePath)}`);
      const text = await res.text();
      setCode(text);
      const ext = filePath.split('.').pop();
      setLanguage(ext === 'ts' || ext === 'tsx' ? 'typescript' :
                  ext === 'js' || ext === 'jsx' ? 'javascript' :
                  ext === 'json' ? 'json' : ext === 'css' ? 'css' : 'plaintext');
    } catch { setCode('// Error loading file'); }
  };

  const saveFile = async () => {
    if (!filePath) return;
    setSaving(true);
    try {
      await fetch(`/api/editor/${encodeURIComponent(filePath)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'text/plain' },
        body: code,
      });
    } finally { setSaving(false); }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-[var(--color-border-subtle)] flex items-center gap-2">
        <div className="flex-1">
          <h2 className="text-sm font-semibold">Code Editor</h2>
          <input
            value={filePath}
            onChange={e => setFilePath(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && loadFile()}
            placeholder="server/routers/mother.ts"
            className="text-xs bg-transparent outline-none text-[var(--color-fg-muted)] w-full"
          />
        </div>
        <button onClick={loadFile} className="text-xs px-2 py-1 rounded bg-[var(--color-bg-raised)]">Load</button>
        <button onClick={saveFile} disabled={saving}
          className="text-xs px-3 py-1 rounded bg-[var(--color-accent-violet)] text-white">
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
      <div className="flex-1">
        <Editor height="100%" language={language} value={code}
          onChange={(v) => setCode(v ?? '')} theme="vs-dark"
          options={{ minimap: { enabled: false }, fontSize: 13, fontFamily: "'JetBrains Mono', monospace" }} />
      </div>
    </div>
  );
}
