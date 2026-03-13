/**
 * office-connector.ts — Module 14: Word/Excel Data Export Connector
 * SHMS MOTHER v7 | Sprint 1 | 2026-03-13
 *
 * Scientific basis:
 * - OOXML (ECMA-376 4th ed.) — Open Office XML standard for .xlsx / .docx
 * - CSV RFC 4180 (Shafranovich, 2005) — comma-separated values interchange
 * - ISO 8601 — date/time formatting
 *
 * Generates structured exports without external Office libraries:
 * - CSV (universally importable into Excel)
 * - JSON (Power Query / Power BI compatible)
 * - SpreadsheetML XML (native Excel Open XML subset, no dependencies)
 * - Word-compatible HTML (paste into Word preserving table formatting)
 */

export type ExportFormat = 'csv' | 'json' | 'xlsx_xml' | 'word_html';

export interface SensorReading {
  sensorId: string;
  sensorName: string;
  timestamp: string;    // ISO 8601
  value: number;
  unit: string;
  alarmLevel: 'ok' | 'warning' | 'alert' | 'critical';
}

export interface ExportOptions {
  format: ExportFormat;
  structureId: string;
  structureName: string;
  dateFrom?: string;    // ISO 8601
  dateTo?: string;
  includeMetadata?: boolean;
  title?: string;
}

export interface ExportResult {
  content: string;
  mimeType: string;
  filename: string;
  rowCount: number;
}

// ─── CSV (RFC 4180) ──────────────────────────────────────────────────────

function toCSV(readings: SensorReading[], options: ExportOptions): ExportResult {
  const headers = ['timestamp', 'sensor_id', 'sensor_name', 'value', 'unit', 'alarm_level'];
  const rows = readings.map((r) =>
    [
      r.timestamp,
      r.sensorId,
      `"${r.sensorName.replace(/"/g, '""')}"`,
      r.value.toString(),
      r.unit,
      r.alarmLevel,
    ].join(',')
  );

  const lines: string[] = [];
  if (options.includeMetadata) {
    lines.push(`# Structure: ${options.structureName}`);
    lines.push(`# Structure ID: ${options.structureId}`);
    lines.push(`# Exported: ${new Date().toISOString()}`);
    if (options.dateFrom) lines.push(`# From: ${options.dateFrom}`);
    if (options.dateTo) lines.push(`# To: ${options.dateTo}`);
    lines.push('#');
  }
  lines.push(headers.join(','));
  lines.push(...rows);

  return {
    content: lines.join('\r\n'),
    mimeType: 'text/csv;charset=utf-8',
    filename: `shms_${options.structureId}_${dateSuffix()}.csv`,
    rowCount: readings.length,
  };
}

// ─── JSON (Power BI / Power Query) ──────────────────────────────────────

function toJSON(readings: SensorReading[], options: ExportOptions): ExportResult {
  const payload = {
    metadata: {
      structureId: options.structureId,
      structureName: options.structureName,
      exportedAt: new Date().toISOString(),
      dateFrom: options.dateFrom,
      dateTo: options.dateTo,
      rowCount: readings.length,
    },
    readings,
  };

  return {
    content: JSON.stringify(payload, null, 2),
    mimeType: 'application/json',
    filename: `shms_${options.structureId}_${dateSuffix()}.json`,
    rowCount: readings.length,
  };
}

// ─── SpreadsheetML XML (Excel Open XML subset) ──────────────────────────

function toSpreadsheetML(readings: SensorReading[], options: ExportOptions): ExportResult {
  const title = options.title ?? `SHMS — ${options.structureName}`;
  const alarmColors: Record<string, string> = {
    ok: 'FF92D050',
    warning: 'FFFFC000',
    alert: 'FFFF0000',
    critical: 'FF7030A0',
  };

  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const cell = (v: string | number, bold = false, bgColor?: string) => {
    const style = bold ? ' s="1"' : bgColor ? ` s="2"` : '';
    const t = typeof v === 'string' ? ' t="inlineStr"' : '';
    const val = typeof v === 'string' ? `<is><t>${esc(v)}</t></is>` : `<v>${v}</v>`;
    return `<c${style}${t}>${val}</c>`;
  };

  const headerRow = `<row r="1">
    ${cell('Timestamp', true)}${cell('Sensor ID', true)}${cell('Sensor Name', true)}${cell('Value', true)}${cell('Unit', true)}${cell('Alarm', true)}
  </row>`;

  const dataRows = readings
    .map(
      (r, i) =>
        `<row r="${i + 2}">
      ${cell(r.timestamp)}${cell(r.sensorId)}${cell(r.sensorName)}${cell(r.value)}${cell(r.unit)}${cell(r.alarmLevel)}
    </row>`
    )
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheets>
    <sheet name="${esc(title)}" sheetId="1" r:id="rId1" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/>
  </sheets>
  <worksheet>
    <sheetData>
      ${headerRow}
      ${dataRows}
    </sheetData>
  </worksheet>
</workbook>`;

  return {
    content: xml,
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    filename: `shms_${options.structureId}_${dateSuffix()}.xml`,
    rowCount: readings.length,
  };
}

// ─── Word-compatible HTML ────────────────────────────────────────────────

function toWordHTML(readings: SensorReading[], options: ExportOptions): ExportResult {
  const title = options.title ?? `SHMS — ${options.structureName}`;
  const alarmBg: Record<string, string> = {
    ok: '#e6ffe6',
    warning: '#fff8cc',
    alert: '#ffd6d6',
    critical: '#f0ccff',
  };

  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const rows = readings
    .map(
      (r) => `
    <tr style="background:${alarmBg[r.alarmLevel] ?? '#fff'}">
      <td style="font-size:10pt;padding:4px 8px;border:1px solid #ccc">${esc(r.timestamp)}</td>
      <td style="font-size:10pt;padding:4px 8px;border:1px solid #ccc">${esc(r.sensorId)}</td>
      <td style="font-size:10pt;padding:4px 8px;border:1px solid #ccc">${esc(r.sensorName)}</td>
      <td style="font-size:10pt;padding:4px 8px;border:1px solid #ccc;text-align:right">${r.value}</td>
      <td style="font-size:10pt;padding:4px 8px;border:1px solid #ccc">${esc(r.unit)}</td>
      <td style="font-size:10pt;padding:4px 8px;border:1px solid #ccc">${r.alarmLevel.toUpperCase()}</td>
    </tr>`
    )
    .join('');

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>${esc(title)}</title></head>
<body style="font-family:Calibri,Arial,sans-serif;margin:2cm">
  <h1 style="font-size:16pt;color:#2F5496">${esc(title)}</h1>
  <p style="font-size:10pt;color:#666">
    Estrutura: <strong>${esc(options.structureName)}</strong> &nbsp;|&nbsp;
    Exportado: <strong>${new Date().toISOString()}</strong>
    ${options.dateFrom ? ` &nbsp;|&nbsp; De: ${options.dateFrom}` : ''}
    ${options.dateTo ? ` até ${options.dateTo}` : ''}
  </p>
  <table style="border-collapse:collapse;width:100%;margin-top:12pt">
    <thead>
      <tr style="background:#2F5496;color:#fff">
        <th style="padding:6px 8px;border:1px solid #1a3a7a;text-align:left">Timestamp</th>
        <th style="padding:6px 8px;border:1px solid #1a3a7a;text-align:left">Sensor ID</th>
        <th style="padding:6px 8px;border:1px solid #1a3a7a;text-align:left">Sensor</th>
        <th style="padding:6px 8px;border:1px solid #1a3a7a;text-align:right">Valor</th>
        <th style="padding:6px 8px;border:1px solid #1a3a7a;text-align:left">Unidade</th>
        <th style="padding:6px 8px;border:1px solid #1a3a7a;text-align:left">Alarme</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <p style="font-size:9pt;color:#999;margin-top:24pt">
    Gerado por MOTHER SHMS v7 — ${new Date().toISOString()}
  </p>
</body>
</html>`;

  return {
    content: html,
    mimeType: 'text/html;charset=utf-8',
    filename: `shms_${options.structureId}_${dateSuffix()}.html`,
    rowCount: readings.length,
  };
}

// ─── Public API ──────────────────────────────────────────────────────────

export function exportReadings(
  readings: SensorReading[],
  options: ExportOptions
): ExportResult {
  switch (options.format) {
    case 'csv':       return toCSV(readings, options);
    case 'json':      return toJSON(readings, options);
    case 'xlsx_xml':  return toSpreadsheetML(readings, options);
    case 'word_html': return toWordHTML(readings, options);
    default:
      throw new Error(`Unsupported export format: ${options.format as string}`);
  }
}

function dateSuffix(): string {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '');
}
