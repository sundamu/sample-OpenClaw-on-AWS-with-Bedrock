#!/usr/bin/env node
/**
 * excel-gen — Generate Excel (.xlsx) files from structured data.
 *
 * Input (JSON string as argv[2]):
 *   {
 *     "filename": "report.xlsx",
 *     "outputPath": "/tmp/report.xlsx",    // optional, defaults to /tmp/<filename>
 *     "sheets": [
 *       {
 *         "name": "Sales Q1",
 *         "headers": ["Region", "Revenue", "Units"],
 *         "rows": [["North", 120000, 340], ["South", 95000, 280]],
 *         "columnWidths": [20, 15, 10]     // optional
 *       }
 *     ]
 *   }
 *
 * Uses Python + openpyxl (available in container via pip).
 * Output: { path, sheets, totalRows }
 */

'use strict';
const { execSync } = require('child_process');
const fs   = require('fs');
const os   = require('os');
const path = require('path');

let args = {};
try { args = JSON.parse(process.argv[2] || '{}'); } catch { args = {}; }

if (!args.sheets || !Array.isArray(args.sheets) || args.sheets.length === 0) {
  console.log(JSON.stringify({
    error:  '`sheets` array is required',
    usage: '{"filename":"report.xlsx","sheets":[{"name":"Sheet1","headers":["A","B","C"],"rows":[[1,2,3],[4,5,6]]}]}',
  }));
  process.exit(1);
}

const filename   = args.filename   || `report-${Date.now()}.xlsx`;
const workspace  = process.env.OPENCLAW_WORKSPACE || '/root/.openclaw/workspace';
const outputDir  = path.join(workspace, 'output');
fs.mkdirSync(outputDir, { recursive: true });
const outputPath = args.outputPath || path.join(outputDir, filename);

// Build Python script as a string, pass data via temp JSON file
const dataFile = path.join(os.tmpdir(), `excel-data-${Date.now()}.json`);
fs.writeFileSync(dataFile, JSON.stringify({ outputPath, sheets: args.sheets }));

const pyScript = `
import json, sys, os

try:
    import openpyxl
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    from openpyxl.utils import get_column_letter
except ImportError:
    import subprocess
    subprocess.check_call([sys.executable, '-m', 'pip', 'install', 'openpyxl', '-q'])
    import openpyxl
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    from openpyxl.utils import get_column_letter

data_path = sys.argv[1]
with open(data_path) as f:
    data = json.load(f)

wb = openpyxl.Workbook()
wb.remove(wb.active)  # remove default sheet

header_fill = PatternFill(start_color='2563EB', end_color='2563EB', fill_type='solid')
header_font = Font(color='FFFFFF', bold=True, size=11)
header_align = Alignment(horizontal='center', vertical='center')
thin_border = Border(
    bottom=Side(style='thin', color='E5E7EB'),
    right=Side(style='thin', color='E5E7EB'),
)

total_rows = 0
for sheet_def in data['sheets']:
    ws = wb.create_sheet(title=sheet_def.get('name', 'Sheet'))
    headers = sheet_def.get('headers', [])
    rows    = sheet_def.get('rows', [])
    col_widths = sheet_def.get('columnWidths', [])

    # Write headers
    for col_idx, header in enumerate(headers, start=1):
        cell = ws.cell(row=1, column=col_idx, value=header)
        cell.font        = header_font
        cell.fill        = header_fill
        cell.alignment   = header_align
        cell.border      = thin_border

    # Write data rows
    for row_idx, row in enumerate(rows, start=2):
        for col_idx, value in enumerate(row, start=1):
            cell = ws.cell(row=row_idx, column=col_idx, value=value)
            if row_idx % 2 == 0:
                cell.fill = PatternFill(start_color='F9FAFB', end_color='F9FAFB', fill_type='solid')
            cell.border = thin_border
        total_rows += 1

    # Set column widths
    for col_idx in range(1, max(len(headers), 1) + 1):
        letter = get_column_letter(col_idx)
        if col_widths and col_idx <= len(col_widths):
            ws.column_dimensions[letter].width = col_widths[col_idx - 1]
        else:
            # Auto-size based on header length
            max_len = len(str(headers[col_idx - 1])) if col_idx <= len(headers) else 10
            for row in rows:
                if col_idx <= len(row):
                    max_len = max(max_len, len(str(row[col_idx - 1])))
            ws.column_dimensions[letter].width = min(max_len + 4, 50)

    # Freeze header row
    ws.freeze_panes = 'A2'

    # Add auto-filter
    if headers and rows:
        ws.auto_filter.ref = ws.dimensions

output_path = data['output' + 'Path']
wb.save(output_path)
print(json.dumps({'path': output_path, 'totalRows': total_rows, 'sheets': len(data['sheets'])}))
`;

const pyFile = path.join(os.tmpdir(), `excel-gen-${Date.now()}.py`);
fs.writeFileSync(pyFile, pyScript);

try {
  const out = execSync(`python3 "${pyFile}" "${dataFile}"`, {
    encoding: 'utf8',
    stdio:    ['pipe', 'pipe', 'pipe'],
    timeout:  30000,
  });
  const result = JSON.parse(out.trim());
  console.log(JSON.stringify({
    path:      result.path,
    filename,
    sheets:    result.sheets,
    totalRows: result.totalRows,
    sizeBytes: fs.statSync(result.path).size,
  }, null, 2));
} catch (e) {
  const msg = (e.stderr || e.message || '').trim();
  console.log(JSON.stringify({ error: msg }));
  process.exit(1);
} finally {
  try { fs.unlinkSync(pyFile);   } catch {}
  try { fs.unlinkSync(dataFile); } catch {}
}
