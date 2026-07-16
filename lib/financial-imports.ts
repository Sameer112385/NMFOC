import * as XLSX from 'xlsx';
export { parseCn41File } from '@/lib/cn41';
import type { Gr55CostRow, HistoricalRevenueRow, SalesOrderRevenueRow } from '@/lib/types';
import { safeNumber } from '@/lib/utils';

export type ParsedFinancialUpload<T> = {
  rows: T[];
  sourceName?: string;
};

export async function parseGr55File(file: File): Promise<ParsedFinancialUpload<Gr55CostRow>> {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: false });

  const rows = rawRows
    .map((rawRow) => {
      const row = normalizeRow(rawRow);
      const businessTransaction = String(row.business_transaction ?? '').trim();
      const wbs_code = String(row.wbs_element ?? '').trim();
      const posting_date = toIsoDate(String(row.posting_date ?? '').trim());
      const amount = safeNumber(row.val_coarea_crcy ?? 0);
      const costElement = String(row.cost_element ?? '').trim();
      
      // Irrespective of cost element name, if business transaction is COIE, it is Material
      let costCategory = String(row.cost_element_name ?? '').trim();
      if (businessTransaction.toUpperCase() === 'COIE') {
        costCategory = 'Material';
      }

      const currency = String(row.co_area_currency ?? '').trim();
      const purchasingDocument = String(
        row.purchasing_document ??
        row.purchasingdocument ??
        row.purchasing_doc ??
        row.purchasingdoc ??
        row.purch_doc ??
        row.purchase_order ??
        row.po_number ??
        row.po_no ??
        row.po ??
        row.ebeln ??
        ''
      ).trim() || null;

      return {
        project_id: '',
        upload_id: null,
        posting_date,
        fiscal_year: safeNumber(row.fiscal_year ?? row.year) || null,
        fiscal_period: safeNumber(row.fiscal_period ?? row.period ?? row.from_period) || null,
        wbs_code,
        wbs_description: String(row.co_object_name ?? '').trim() || null,
        cost_category: costCategory || null,
        cost_element: costElement || null,
        cost_center: String(row.cost_center ?? row.partner_cctr ?? row.reference_org_unit ?? '').trim() || null,
        purchasing_document: purchasingDocument,
        amount,
        currency: currency || null,
        raw_data_json: {
          wbs_element: wbs_code,
          posting_date,
          val_coarea_crcy: amount,
          co_area_currency: currency,
          cost_element: costElement,
          cost_element_name: costCategory,
          fiscal_year: row.fiscal_year ?? null,
          fiscal_period: row.fiscal_period ?? row.period ?? row.from_period ?? null,
          purchasing_document: purchasingDocument,
          business_transaction: businessTransaction || null,
          source_row_count: 1,
        },
      };
    })
    .filter((row) => row.wbs_code && row.posting_date);

  return {
    rows,
  };
}

export async function parseHistoricalRevenueFile(file: File): Promise<ParsedFinancialUpload<HistoricalRevenueRow>> {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: false });

  const cleanSapAmount = (val: any): number => {
    if (val === undefined || val === null) return 0;
    const str = String(val).trim();
    if (!str) return 0;
    if (str.startsWith('(') && str.endsWith(')')) {
      return -safeNumber(str.slice(1, -1));
    }
    return safeNumber(str);
  };

  const rows = rawRows
    .map((rawRow) => {
      const row = normalizeRow(rawRow);
      const wbs_code = String(row.ps_posid ?? row.wbs_element ?? row.wbs_code ?? row.wbs ?? '').trim();
      const posting_date = toIsoDate(String(row.budat ?? row.posting_date ?? row.date ?? '').trim());
      
      const rawAmount = cleanSapAmount(row.tsl ?? row.wsl ?? row.hsl ?? row.amount ?? row.val_coarea_crcy ?? row.value ?? row.amt ?? 0);
      // Negate because SAP revenues are credit (negative) in ledgers
      const amount = -rawAmount;

      const rawCostElement = String(row.racct ?? row.cost_element ?? row.cost_elem ?? row.gl_account ?? row.gl ?? row.account ?? '').trim();
      const costElement = rawCostElement.replace(/^0+/, ''); // Strip leading zeros like "0000400110" -> "400110"
      
      const currency = String(row.co_area_currency ?? row.currency ?? '').trim();

      return {
        project_id: '',
        upload_id: null,
        posting_date,
        fiscal_year: safeNumber(row.fiscal_year ?? row.year ?? row.ryear ?? row.gjahr) || null,
        fiscal_period: safeNumber(row.fiscal_period ?? row.period ?? row.from_period ?? row.fiscyearper) || null,
        wbs_code,
        wbs_description: String(row.co_object_name ?? row.wbs_description ?? row.description ?? row.sgtxt ?? '').trim() || null,
        cost_element: costElement || '',
        amount,
        currency: currency || null,
        raw_data_json: {
          wbs_element: wbs_code,
          posting_date,
          val_coarea_crcy: amount,
          co_area_currency: currency,
          cost_element: costElement,
          fiscal_year: row.fiscal_year ?? row.year ?? row.ryear ?? row.gjahr ?? null,
          fiscal_period: row.fiscal_period ?? row.period ?? row.from_period ?? row.fiscyearper ?? null,
          source_row_count: 1,
        },
      };
    })
    .filter((row) => row.wbs_code && row.posting_date);

  return {
    rows,
  };
}

export async function parseSalesOrderFile(file: File): Promise<ParsedFinancialUpload<SalesOrderRevenueRow>> {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: false });

  return {
    rows: rawRows
      .map((row) => normalizeRow(row))
      .filter((row) => (row.wbs_code || row.wbs_element) && (row.net_value !== undefined || row.planned_revenue !== undefined || row.amendment_delta !== undefined))
      .map((row) => ({
        project_id: '',
        upload_id: null,
        sales_order_number: String(row.sales_doc ?? row.sales_order_number ?? row.sales_order ?? row.order_number ?? '').trim(),
        sales_order_item: String(row.item ?? row.sales_order_item ?? '').trim() || null,
        wbs_code: String(row.wbs_code ?? row.wbs_element ?? '').trim(),
        wbs_description: String(row.wbs_description ?? '').trim() || null,
        planned_revenue: safeNumber(row.net_value ?? row.planned_revenue ?? row.contract_revenue ?? row.revenue ?? 0),
        amendment_delta: safeNumber(row.amendment_delta ?? row.delta ?? 0),
        effective_date: toIsoDate(String(row.created_on ?? row.effective_date ?? row.valid_from ?? row.posting_date ?? '').trim()) || null,
        currency: String(row.currency ?? '').trim() || null,
        raw_data_json: row,
      })),
  };
}

function normalizeRow(row: Record<string, unknown>) {
  const normalized: Record<string, string | number | boolean | null> = {};

  for (const [key, value] of Object.entries(row)) {
    const baseKey = normalizeHeaderKey(key);
    normalized[baseKey] = value as string | number | boolean | null;
  }

  return normalized;
}

function normalizeHeaderKey(key: string) {
  return key
    .trim()
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/&/g, '_')
    .replace(/\//g, '_')
    .replace(/\s+/g, '_')
    .replace(/[()]/g, '')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/__+/g, '_');
}

function toIsoDate(value: string) {
  const text = value.trim();
  if (!text) return '';
  
  // Support Excel serial dates
  const num = Number(text);
  if (!Number.isNaN(num) && num > 30000 && num < 60000) {
    const date = new Date((num - 25569) * 86400 * 1000);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const match = text.match(/(\d{4})[-/](\d{2})[-/](\d{2})/);
  if (match) {
    return `${match[1]}-${match[2]}-${match[3]}`;
  }
  return text.slice(0, 10);
}
