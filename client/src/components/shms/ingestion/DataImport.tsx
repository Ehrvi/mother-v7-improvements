/** DataImport.tsx — CSV/Excel upload • Endpoint: POST /ingest/csv */
import { useShmsIngestCsv } from '@/hooks/useShmsApi';
import { useState } from 'react';
export default function DataImport() {
  const ingest = useShmsIngestCsv();
  const [status, setStatus] = useState<string | null>(null);
  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = reader.result as string;
        const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
        if (lines.length < 2) { setStatus('Arquivo vazio ou inválido'); return; }
        const headers = lines[0].split(',').map(h => h.trim());
        const rows = lines.slice(1).map(l => {
          const vals = l.split(',');
          const row: Record<string, string> = {};
          headers.forEach((h, i) => { row[h] = vals[i]?.trim() ?? ''; });
          return row;
        });
        ingest.mutate({
          structureId: 'default', filename: file.name, format: 'csv', encoding: 'utf-8', headerRow: true,
          columnMapping: { sensorId: headers[0] ?? 'sensorId', sensorType: headers[1] ?? 'sensorType', value: headers[2] ?? 'value', unit: headers[3] ?? 'unit', timestamp: headers[4] ?? 'timestamp' },
          rows,
        }, { onSuccess: (d: any) => setStatus(`✅ ${d.readingsIngested ?? 0} leituras importadas`), onError: (e: any) => setStatus(`❌ ${e.message}`) });
      } catch { setStatus('Erro ao processar arquivo'); }
    };
    reader.readAsText(file);
  };
  return (
    <div className="shms-animate-slide-in">
      <div className="shms-section-header"><span className="shms-section-header__title">📥 Importar Dados (CSV/Excel)</span></div>
      <div className="shms-card"><div className="shms-card__body" style={{ textAlign: 'center', padding: 'var(--shms-sp-8)' }}>
        <div style={{ fontSize: 32, marginBottom: 'var(--shms-sp-3)' }}>📄</div>
        <div style={{ marginBottom: 'var(--shms-sp-4)', fontSize: 'var(--shms-fs-sm)', color: 'var(--shms-text-secondary)' }}>
          Selecione um arquivo CSV com colunas: sensorId, sensorType, value, unit, timestamp
        </div>
        <input type="file" accept=".csv,.tsv,.txt" onChange={handleFile} style={{ display: 'none' }} id="csv-upload" />
        <label htmlFor="csv-upload" className="shms-btn shms-btn--accent" style={{ cursor: 'pointer' }}>
          {ingest.isPending ? 'Importando...' : 'Selecionar Arquivo'}
        </label>
        {status && <div style={{ marginTop: 'var(--shms-sp-3)', fontSize: 'var(--shms-fs-sm)' }}>{status}</div>}
      </div></div>
    </div>
  );
}
