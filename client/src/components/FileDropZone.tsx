/**
 * FileDropZone.tsx — MOTHER v74.6
 *
 * Drag-and-drop file upload with intelligent content extraction.
 * Extracted text is injected as context into the next prompt.
 *
 * Scientific Basis:
 * - Norman (2013) "The Design of Everyday Things": affordances for drag-and-drop
 *   must be visually explicit (dashed border, color change on drag-over).
 * - Nielsen (1994) "10 Usability Heuristics": visibility of system status —
 *   each file shows pending/processing/success/error state in real time.
 * - OWASP File Upload Cheat Sheet (2024): validate MIME type server-side,
 *   not just extension; limit size; sanitize extracted content.
 * - Yan (2025) arXiv:2512.12806 "Fault-Tolerant Sandboxing": file processing
 *   runs in isolated endpoint with rate limiting and auto-cleanup.
 *
 * Supported formats: TXT, PDF, DOCX/DOC (max 10MB per file, 5 files)
 */

import React, { useState, useCallback, useRef } from 'react';
import { Upload, File, X, AlertCircle, CheckCircle, Paperclip } from 'lucide-react';

interface FileWithStatus {
  file: File;
  id: string;
  status: 'pending' | 'processing' | 'success' | 'error';
  extractedText?: string;
  error?: string;
}

interface FileDropZoneProps {
  onFilesProcessed: (context: string) => void;
  onClear?: () => void;
  maxFiles?: number;
  maxSizeMB?: number;
  compact?: boolean; // compact mode for embedding in chat input
}

const ALLOWED_MIMES: Record<string, string[]> = {
  'text/plain': ['.txt'],
  'application/pdf': ['.pdf'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/msword': ['.doc'],
};

export const FileDropZone: React.FC<FileDropZoneProps> = ({
  onFilesProcessed,
  onClear,
  maxFiles = 5,
  maxSizeMB = 10,
  compact = false,
}) => {
  const [files, setFiles] = useState<FileWithStatus[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateFile = (file: File): string | null => {
    if (file.size > maxSizeMB * 1024 * 1024) {
      return `"${file.name}" excede ${maxSizeMB}MB`;
    }
    if (!Object.keys(ALLOWED_MIMES).includes(file.type)) {
      return `"${file.name}" — tipo não suportado (use TXT, PDF, DOCX)`;
    }
    return null;
  };

  const buildContext = (updatedFiles: FileWithStatus[]): string => {
    const successful = updatedFiles.filter(f => f.status === 'success' && f.extractedText);
    if (successful.length === 0) return '';
    return successful
      .map(f => `### 📄 Arquivo: ${f.file.name}\n\n${f.extractedText}`)
      .join('\n\n---\n\n');
  };

  const extractContent = async (fw: FileWithStatus): Promise<FileWithStatus> => {
    try {
      const formData = new FormData();
      formData.append('file', fw.file);

      const response = await fetch('/api/extract-file-content', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
        return { ...fw, status: 'error', error: err.error || `HTTP ${response.status}` };
      }

      const data = await response.json();
      return { ...fw, status: 'success', extractedText: data.content };
    } catch (err) {
      return {
        ...fw,
        status: 'error',
        error: err instanceof Error ? err.message : 'Erro de rede',
      };
    }
  };

  const processFiles = useCallback(async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setGlobalError(null);

    const currentCount = files.filter(f => f.status !== 'error').length;
    if (currentCount + fileList.length > maxFiles) {
      setGlobalError(`Máximo de ${maxFiles} arquivos. Remova alguns antes de adicionar mais.`);
      return;
    }

    const newEntries: FileWithStatus[] = [];
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      const validationError = validateFile(file);
      newEntries.push({
        file,
        id: `${Date.now()}-${i}-${file.name}`,
        status: validationError ? 'error' : 'pending',
        error: validationError ?? undefined,
      });
    }

    // Add all entries immediately (show pending/error state)
    setFiles(prev => {
      const updated = [...prev, ...newEntries];
      return updated;
    });

    // Process valid files sequentially
    const toProcess = newEntries.filter(f => f.status === 'pending');
    for (const fw of toProcess) {
      // Mark as processing
      setFiles(prev =>
        prev.map(f => (f.id === fw.id ? { ...f, status: 'processing' } : f))
      );

      const result = await extractContent(fw);

      setFiles(prev => {
        const updated = prev.map(f => (f.id === fw.id ? result : f));
        const context = buildContext(updated);
        if (context) onFilesProcessed(context);
        return updated;
      });
    }
  }, [files, maxFiles, maxSizeMB, onFilesProcessed]);

  const removeFile = (id: string) => {
    setFiles(prev => {
      const updated = prev.filter(f => f.id !== id);
      const context = buildContext(updated);
      onFilesProcessed(context); // empty string if none left
      if (updated.length === 0 && onClear) onClear();
      return updated;
    });
  };

  const clearAll = () => {
    setFiles([]);
    setGlobalError(null);
    onFilesProcessed('');
    if (onClear) onClear();
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    processFiles(e.dataTransfer.files);
  }, [processFiles]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    processFiles(e.target.files);
    // Reset input so same file can be re-added after removal
    e.target.value = '';
  };

  const successCount = files.filter(f => f.status === 'success').length;
  const processingCount = files.filter(f => f.status === 'processing').length;
  const hasFiles = files.length > 0;

  if (compact) {
    // Compact mode: just a paperclip button + file chips
    return (
      <div className="w-full">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".txt,.pdf,.docx,.doc"
          onChange={handleFileInput}
          style={{ display: 'none' }}
        />

        {/* File chips row */}
        {hasFiles && (
          <div className="flex flex-wrap gap-1.5 mb-2 px-1">
            {files.map(fw => (
              <div
                key={fw.id}
                className="flex items-center gap-1 px-2 py-1 rounded-full text-xs"
                style={{
                  background: fw.status === 'success'
                    ? 'rgba(16,185,129,0.12)'
                    : fw.status === 'error'
                    ? 'rgba(239,68,68,0.12)'
                    : 'rgba(124,58,237,0.12)',
                  border: `1px solid ${
                    fw.status === 'success'
                      ? 'rgba(16,185,129,0.3)'
                      : fw.status === 'error'
                      ? 'rgba(239,68,68,0.3)'
                      : 'rgba(124,58,237,0.3)'
                  }`,
                  color: fw.status === 'success'
                    ? '#34d399'
                    : fw.status === 'error'
                    ? '#f87171'
                    : '#a78bfa',
                }}
              >
                {fw.status === 'processing' && (
                  <div style={{
                    width: 8, height: 8, borderRadius: '50%',
                    border: '1.5px solid #a78bfa',
                    borderTopColor: 'transparent',
                    animation: 'spin 0.8s linear infinite',
                  }} />
                )}
                {fw.status === 'success' && <CheckCircle size={10} />}
                {fw.status === 'error' && <AlertCircle size={10} />}
                {fw.status === 'pending' && <File size={10} />}
                <span style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {fw.file.name}
                </span>
                <button
                  onClick={() => removeFile(fw.id)}
                  style={{ marginLeft: 2, opacity: 0.7, cursor: 'pointer', background: 'none', border: 'none', padding: 0, color: 'inherit' }}
                >
                  <X size={10} />
                </button>
              </div>
            ))}
            {successCount > 0 && (
              <span style={{ fontSize: 10, color: '#34d399', alignSelf: 'center' }}>
                {successCount} arquivo{successCount > 1 ? 's' : ''} pronto{successCount > 1 ? 's' : ''}
              </span>
            )}
          </div>
        )}

        {globalError && (
          <p style={{ fontSize: 11, color: '#f87171', marginBottom: 4, paddingLeft: 4 }}>
            {globalError}
          </p>
        )}

        {/* Attach button */}
        <button
          onClick={() => fileInputRef.current?.click()}
          title="Anexar arquivo (TXT, PDF, DOCX)"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '4px 6px',
            borderRadius: 8,
            color: processingCount > 0 ? '#a78bfa' : '#55556a',
            transition: 'color 0.2s',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
          onMouseEnter={e => (e.currentTarget.style.color = '#a78bfa')}
          onMouseLeave={e => (e.currentTarget.style.color = processingCount > 0 ? '#a78bfa' : '#55556a')}
        >
          <Paperclip size={16} />
          {processingCount > 0 && (
            <span style={{ fontSize: 10, color: '#a78bfa' }}>
              {processingCount} processando...
            </span>
          )}
        </button>
      </div>
    );
  }

  // Full drop zone mode
  return (
    <div style={{ width: '100%' }}>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".txt,.pdf,.docx,.doc"
        onChange={handleFileInput}
        style={{ display: 'none' }}
      />

      {/* Drop area */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        style={{
          border: `2px dashed ${isDragging ? '#a78bfa' : 'rgba(124,58,237,0.3)'}`,
          borderRadius: 12,
          padding: '24px 16px',
          textAlign: 'center',
          cursor: 'pointer',
          background: isDragging ? 'rgba(124,58,237,0.08)' : 'rgba(124,58,237,0.03)',
          transition: 'all 0.2s ease',
          transform: isDragging ? 'scale(1.01)' : 'scale(1)',
        }}
      >
        <Upload
          size={32}
          style={{ margin: '0 auto 8px', color: isDragging ? '#a78bfa' : '#55556a' }}
        />
        <p style={{ fontSize: 13, color: '#c4c4d4', margin: '0 0 4px' }}>
          <strong>Clique para selecionar</strong> ou arraste arquivos aqui
        </p>
        <p style={{ fontSize: 11, color: '#55556a', margin: 0 }}>
          TXT, PDF, DOCX — máx. {maxSizeMB}MB por arquivo, {maxFiles} arquivos
        </p>
      </div>

      {/* Error */}
      {globalError && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 12px', marginTop: 8,
          background: 'rgba(239,68,68,0.08)',
          border: '1px solid rgba(239,68,68,0.25)',
          borderRadius: 8, color: '#f87171', fontSize: 12,
        }}>
          <AlertCircle size={14} />
          <span>{globalError}</span>
        </div>
      )}

      {/* File list */}
      {hasFiles && (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {files.map(fw => (
            <div
              key={fw.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 12px',
                background: 'rgba(15,15,26,0.8)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 8,
              }}
            >
              <File size={16} style={{ color: '#55556a', flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 12, color: '#c4c4d4', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {fw.file.name}
                </p>
                <p style={{ margin: 0, fontSize: 10, color: '#55556a' }}>
                  {(fw.file.size / 1024).toFixed(1)} KB
                </p>
              </div>

              {fw.status === 'processing' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#a78bfa', fontSize: 11 }}>
                  <div style={{
                    width: 12, height: 12, borderRadius: '50%',
                    border: '2px solid #a78bfa', borderTopColor: 'transparent',
                    animation: 'spin 0.8s linear infinite',
                  }} />
                  Processando...
                </div>
              )}
              {fw.status === 'success' && <CheckCircle size={16} style={{ color: '#34d399' }} />}
              {fw.status === 'error' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#f87171', fontSize: 10 }}>
                  <AlertCircle size={12} />
                  <span style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {fw.error}
                  </span>
                </div>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); removeFile(fw.id); }}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  padding: 4, borderRadius: 4, color: '#55556a',
                  transition: 'color 0.2s',
                }}
                onMouseEnter={e => (e.currentTarget.style.color = '#f87171')}
                onMouseLeave={e => (e.currentTarget.style.color = '#55556a')}
              >
                <X size={14} />
              </button>
            </div>
          ))}

          {successCount > 0 && (
            <div style={{
              padding: '8px 12px',
              background: 'rgba(16,185,129,0.06)',
              border: '1px solid rgba(16,185,129,0.2)',
              borderRadius: 8,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <p style={{ margin: 0, fontSize: 12, color: '#34d399' }}>
                ✅ {successCount} arquivo{successCount > 1 ? 's' : ''} processado{successCount > 1 ? 's' : ''} — conteúdo será incluído no próximo prompt
              </p>
              <button
                onClick={clearAll}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 10, color: '#55556a' }}
              >
                Limpar
              </button>
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
};

export default FileDropZone;
