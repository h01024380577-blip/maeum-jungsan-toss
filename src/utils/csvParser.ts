import Papa from 'papaparse';
import { parseBulkAmount } from '@/src/lib/bulkEntryDedup';

export interface RawCSVData {
  headers: { name: string; index: number }[];
  rows: any[][];
}

export const parseCSVFile = (file: File): Promise<RawCSVData> => {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      complete: (results) => {
        if (results.data && results.data.length > 0) {
          const rawHeaders = results.data[0] as string[];
          const rows = results.data.slice(1) as any[][];
          
          // Filter headers: remove empty, null, undefined, and dummy names like "열 1" or "Column 7"
          const dummyPattern = /^(열\s*\d+|Column\s*\d+)$/i;
          const headers = rawHeaders
            .map((name, index) => ({ 
              name: (name || '').trim(), 
              index 
            }))
            .filter(h => 
              h.name !== '' && 
              !dummyPattern.test(h.name)
            );

          resolve({ headers, rows });
        } else {
          reject(new Error('Empty file or invalid CSV format'));
        }
      },
      error: (error) => {
        reject(error);
      },
      skipEmptyLines: true,
    });
  });
};

export const cleanAmount = (value: any): number => {
  return parseBulkAmount(value);
};

export const normalizeEventType = (value: any): 'wedding' | 'funeral' | 'birthday' | 'other' => {
  if (!value) return 'wedding';
  const v = String(value).trim().toLowerCase();
  if (!v) return 'wedding';
  if (v === 'wedding' || v.includes('결혼') || v.includes('웨딩') || v.includes('혼')) return 'wedding';
  if (v === 'funeral' || v.includes('부고') || v.includes('장례') || v.includes('조의') || v.includes('상')) return 'funeral';
  if (v === 'birthday' || v.includes('생일') || v.includes('돌') || v.includes('환갑') || v.includes('칠순') || v.includes('팔순')) return 'birthday';
  return 'other';
};

export const cleanDate = (value: any): string => {
  if (!value || typeof value !== 'string') return new Date().toISOString().split('T')[0];
  
  // Replace . or / with -
  let normalized = value.trim().replace(/[\.\/]/g, '-');
  
  // If it's like 2024-3-27, pad with zeros: 2024-03-27
  const parts = normalized.split('-');
  if (parts.length === 3) {
    const year = parts[0].length === 2 ? `20${parts[0]}` : parts[0];
    const month = parts[1].padStart(2, '0');
    const day = parts[2].padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  
  return normalized;
};
