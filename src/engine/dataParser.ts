import * as XLSX from 'xlsx';
import { parquetReadObjects } from 'hyparquet';
import { DataRow } from '../types/analytics';

export interface ParseOptions {
  delimiter?: 'auto' | ',' | ';' | '\t' | '|';
  encoding?: 'utf-8' | 'iso-8859-1';
  decimalSeparator?: '.' | ',';
}

export interface ParsedDataResult {
  fileName: string;
  fileFormat: string;
  rows: DataRow[];
  isUnstructured: boolean;
  unstructuredNotice?: string;
}

function normalizeNumericString(raw: string, decimalSep: '.' | ','): string | number | null {
  const trimmed = raw.trim();
  if (trimmed === '' || /^(null|na|n\/a|nan|none|nil|-)$/i.test(trimmed)) {
    return null;
  }
  // Remove currency symbols and spaces
  let cleaned = trimmed.replace(/[$€£¥COPUSD\s]/gi, '');
  if (decimalSep === ',') {
    // European / LatAm format: 1.234,56 -> 1234.56
    if (/^-?\d{1,3}(\.\d{3})*(,\d+)?$/.test(cleaned)) {
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    } else if (/^-?\d+,\d+$/.test(cleaned)) {
      cleaned = cleaned.replace(',', '.');
    }
  } else {
    // US format: 1,234.56 -> 1234.56
    if (/^-?\d{1,3}(,\d{3})*(\.\d+)?$/.test(cleaned)) {
      cleaned = cleaned.replace(/,/g, '');
    }
  }
  // Handle percentage strings like "12.5%"
  if (/^-?\d+(\.\d+)?%$/.test(cleaned)) {
    const num = Number(cleaned.slice(0, -1));
    return Number.isFinite(num) ? num : trimmed;
  }
  if (/^-?\d+(\.\d+)?$/.test(cleaned)) {
    const num = Number(cleaned);
    return Number.isFinite(num) ? num : trimmed;
  }
  return trimmed;
}

function detectDelimiter(text: string): ',' | ';' | '\t' | '|' {
  const firstLines = text.split(/\r?\n/).slice(0, 5).join('\n');
  const counts: Record<',' | ';' | '\t' | '|', number> = {
    ',': (firstLines.match(/,/g) || []).length,
    ';': (firstLines.match(/;/g) || []).length,
    '\t': (firstLines.match(/\t/g) || []).length,
    '|': (firstLines.match(/\|/g) || []).length,
  };
  let best: ',' | ';' | '\t' | '|' = ',';
  let max = -1;
  (Object.keys(counts) as Array<',' | ';' | '\t' | '|'>).forEach((d) => {
    if (counts[d] > max) {
      max = counts[d];
      best = d;
    }
  });
  return best;
}

function splitDelimitedLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

export function parseDelimitedText(
  text: string,
  options: ParseOptions = {}
): { rows: DataRow[]; isUnstructured: boolean; notice?: string } {
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim().length > 0);

  if (lines.length < 2) {
    return {
      rows: [],
      isUnstructured: true,
      notice:
        'El archivo contiene menos de 2 líneas tabulares o corresponde a texto libre no estructurado. Estructúrelo con encabezados en la primera fila o utilice el asistente de estructuración.',
    };
  }

  const delimiter =
    options.delimiter && options.delimiter !== 'auto'
      ? options.delimiter
      : detectDelimiter(lines.slice(0, 10).join('\n'));
  const decimalSep = options.decimalSeparator ?? '.';

  const headers = splitDelimitedLine(lines[0], delimiter).map((h, idx) => {
    const clean = h.replace(/^"|"$/g, '').trim();
    return clean || `Columna_${idx + 1}`;
  });

  if (headers.length < 2) {
    return {
      rows: [],
      isUnstructured: true,
      notice:
        'No se detectaron múltiples columnas separadas por un delimitador consistente. Si es texto libre o un reporte sin estructura tabular, utilice la etapa de estructuración.',
    };
  }

  const rows: DataRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = splitDelimitedLine(lines[i], delimiter);
    const row: DataRow = {};
    for (let c = 0; c < headers.length; c++) {
      const raw = (values[c] ?? '').replace(/^"|"$/g, '');
      row[headers[c]] = normalizeNumericString(raw, decimalSep);
    }
    rows.push(row);
  }
  return { rows, isUnstructured: false };
}

export async function parseUploadedFile(
  file: File,
  options: ParseOptions = {}
): Promise<ParsedDataResult> {
  const name = file.name;
  const ext = name.split('.').pop()?.toLowerCase() || '';
  const decimalSep = options.decimalSeparator ?? '.';

  if (ext === 'xlsx' || ext === 'xls') {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      throw new Error('El libro de Excel no contiene hojas de cálculo.');
    }
    const sheet = workbook.Sheets[firstSheetName];
    const jsonRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: null,
      raw: false,
    });
    const normalized: DataRow[] = jsonRows.map((r) => {
      const row: DataRow = {};
      for (const [k, v] of Object.entries(r)) {
        if (v === null || v === undefined) row[k] = null;
        else if (typeof v === 'number' || typeof v === 'boolean') row[k] = v;
        else if (v instanceof Date) row[k] = v.toISOString().slice(0, 10);
        else row[k] = normalizeNumericString(String(v), decimalSep);
      }
      return row;
    });
    return {
      fileName: name,
      fileFormat: ext.toUpperCase(),
      rows: normalized,
      isUnstructured: normalized.length === 0,
    };
  }

  if (ext === 'parquet') {
    const arrayBuffer = await file.arrayBuffer();
    const objects = await parquetReadObjects({ file: arrayBuffer });
    const normalized: DataRow[] = (objects as Array<Record<string, unknown>>).map((r) => {
      const row: DataRow = {};
      for (const [k, v] of Object.entries(r)) {
        if (v === null || v === undefined) row[k] = null;
        else if (typeof v === 'bigint') row[k] = Number(v);
        else if (typeof v === 'number' || typeof v === 'boolean') row[k] = v;
        else if (v instanceof Date) row[k] = v.toISOString().slice(0, 10);
        else row[k] = String(v);
      }
      return row;
    });
    return {
      fileName: name,
      fileFormat: 'PARQUET',
      rows: normalized,
      isUnstructured: normalized.length === 0,
    };
  }

  const buffer = await file.arrayBuffer();
  const decoder = new TextDecoder(options.encoding === 'iso-8859-1' ? 'iso-8859-1' : 'utf-8');
  const text = decoder.decode(buffer);

  if (ext === 'json') {
    const parsed = JSON.parse(text);
    const arr: Array<Record<string, unknown>> = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.data)
        ? parsed.data
        : Array.isArray(parsed?.rows)
          ? parsed.rows
          : [];
    if (arr.length === 0) {
      return {
        fileName: name,
        fileFormat: 'JSON',
        rows: [],
        isUnstructured: true,
        unstructuredNotice:
          'El archivo JSON no contiene un arreglo de registros tabulares en el nivel raíz ni bajo "data" o "rows". Puede estructurarlo abajo.',
      };
    }
    const allKeys = Array.from(new Set(arr.flatMap((obj) => Object.keys(obj))));
    const normalized: DataRow[] = arr.map((item) => {
      const row: DataRow = {};
      for (const key of allKeys) {
        const val = item[key];
        if (val === null || val === undefined) row[key] = null;
        else if (typeof val === 'number' || typeof val === 'boolean') row[key] = val;
        else if (typeof val === 'object') row[key] = JSON.stringify(val);
        else row[key] = normalizeNumericString(String(val), decimalSep);
      }
      return row;
    });
    return {
      fileName: name,
      fileFormat: 'JSON',
      rows: normalized,
      isUnstructured: false,
    };
  }

  // CSV, TSV, TXT
  const forcedDelim = ext === 'tsv' ? '\t' : options.delimiter;
  const res = parseDelimitedText(text, { ...options, delimiter: forcedDelim });
  return {
    fileName: name,
    fileFormat: ext === 'tsv' ? 'TSV' : ext === 'csv' ? 'CSV' : 'TEXTO',
    rows: res.rows,
    isUnstructured: res.isUnstructured,
    unstructuredNotice: res.notice,
  };
}

export function parseRawTextInput(rawText: string, options: ParseOptions = {}): ParsedDataResult {
  const trimmed = rawText.trim();
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      const arr: Array<Record<string, unknown>> = Array.isArray(parsed) ? parsed : [parsed];
      const allKeys = Array.from(new Set(arr.flatMap((o) => Object.keys(o))));
      if (allKeys.length >= 2) {
        const rows: DataRow[] = arr.map((item) => {
          const r: DataRow = {};
          for (const k of allKeys) {
            const v = item[k];
            r[k] = v === undefined ? null : typeof v === 'object' && v !== null ? JSON.stringify(v) : (v as string | number | boolean | null);
          }
          return r;
        });
        return { fileName: 'datos_pegados.json', fileFormat: 'JSON', rows, isUnstructured: false };
      }
    } catch {
      // fall through to delimited / unstructured
    }
  }
  const res = parseDelimitedText(trimmed, options);
  return {
    fileName: 'datos_pegados.csv',
    fileFormat: res.isUnstructured ? 'NO ESTRUCTURADO' : 'CSV',
    rows: res.rows,
    isUnstructured: res.isUnstructured,
    unstructuredNotice: res.notice,
  };
}
