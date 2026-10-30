// Small, dependency-free OOXML writer for the Workshop inventory export.
// Strings are always inline strings; only explicit formula objects can execute.
import { deflateRawSync } from 'node:zlib';

export const column = n => {
  let result = '';
  for (n++; n; n = Math.floor((n - 1) / 26)) result = String.fromCharCode(65 + (n - 1) % 26) + result;
  return result;
};
const xml = text => String(text ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);
const header = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const relns = 'http://schemas.openxmlformats.org/package/2006/relationships';
const documentRel = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
const crcTable = Array.from({ length: 256 }, (_, n) => {
  for (let i = 0; i < 8; i++) n = n & 1 ? 0xEDB88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
const crc32 = data => {
  let crc = 0xFFFFFFFF;
  for (const byte of data) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
};
export function zipFiles(files) {
  const entries = [], central = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const filename = Buffer.from(name), raw = Buffer.from(content), compressed = deflateRawSync(raw), crc = crc32(raw);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034B50); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x800, 6); local.writeUInt16LE(8, 8);
    local.writeUInt16LE(33, 12); local.writeUInt32LE(crc, 14); local.writeUInt32LE(compressed.length, 18); local.writeUInt32LE(raw.length, 22); local.writeUInt16LE(filename.length, 26);
    entries.push(local, filename, compressed);
    const record = Buffer.alloc(46);
    record.writeUInt32LE(0x02014B50); record.writeUInt16LE(20, 4); record.writeUInt16LE(20, 6); record.writeUInt16LE(0x800, 8); record.writeUInt16LE(8, 10);
    record.writeUInt16LE(33, 14); record.writeUInt32LE(crc, 16); record.writeUInt32LE(compressed.length, 20); record.writeUInt32LE(raw.length, 24); record.writeUInt16LE(filename.length, 28); record.writeUInt32LE(offset, 42);
    central.push(record, filename); offset += local.length + filename.length + compressed.length;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054B50); end.writeUInt16LE(central.length / 2, 8); end.writeUInt16LE(central.length / 2, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...entries, directory, end]);
}

export function writeWorkbook(sheets, { title = 'Workshop inventory', namedRanges = {} } = {}) {
  // Styles: body, input, calculated, linked, header, title, mental, physical,
  // score, group. Every body style has dotted rows and a subtle vertical edge.
  const colors = ['FFFFFF', 'FFF3CD', 'F1EFFA', 'E8EFFD', 'FFFFFF', 'FFFFFF', 'DEEBFF', 'FCE2E2', 'E2F1EB', 'E8EDF4'];
  const fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>', ...colors.map(c => `<fill><patternFill patternType="solid"><fgColor rgb="FF${c}"/><bgColor indexed="64"/></patternFill></fill>`)];
  const fonts = [
    '<font><sz val="10"/><color rgb="FF293241"/><name val="Arial"/></font>',
    '<font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Arial"/></font>',
    '<font><b/><sz val="16"/><color rgb="FF39465C"/><name val="Arial"/></font>',
    '<font><u/><sz val="10"/><color rgb="FF3659A2"/><name val="Arial"/></font>',
    '<font><b/><sz val="10"/><color rgb="FF236453"/><name val="Arial"/></font>'
  ];
  const accentFills = sheets.map(s => `<fill><patternFill patternType="solid"><fgColor rgb="FF${s.color}"/><bgColor indexed="64"/></patternFill></fill>`);
  const xf = (font, fill, border = 1, number = 0) => `<xf numFmtId="${number}" fontId="${font}" fillId="${fill}" borderId="${border}" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1" applyNumberFormat="1"><alignment vertical="center" wrapText="1"/></xf>`;
  const styles = [xf(0, 2), xf(0, 3), xf(0, 4), xf(3, 5), xf(1, 11, 2), xf(2, 2, 2), xf(0, 8), xf(0, 9), xf(4, 10, 2, 2), xf(0, 11, 2), ...sheets.map((s, i) => xf(1, 12 + i, 2))];
  const files = {};
  files['xl/styles.xml'] = `${header}<styleSheet xmlns="${ns}"><fonts count="${fonts.length}">${fonts.join('')}</fonts><fills count="${fills.length + accentFills.length}">${fills.join('')}${accentFills.join('')}</fills><borders count="3"><border/><border><left style="hair"><color rgb="FFE0E4EB"/></left><right style="hair"><color rgb="FFE0E4EB"/></right><top/><bottom style="dotted"><color rgb="FFCBD2DF"/></bottom><diagonal/></border><border><left/><right/><top/><bottom style="medium"><color rgb="FFCBD2DF"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${styles.length}">${styles.join('')}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles><dxfs count="1"><dxf><font><color rgb="FF9C2424"/></font><fill><patternFill patternType="solid"><fgColor rgb="FFFCE2E2"/></patternFill></fill></dxf></dxfs></styleSheet>`;
  const cells = (sheet, index) => sheet.rows.map((row, r) => {
    const body = row.map((item, c) => {
      const value = item && typeof item === 'object' ? item : { value: item };
      const style = value.style ?? (r === 4 ? 10 + index : r === 1 ? 5 : (sheet.inputColumns || []).includes(c) && r > 4 ? 1 : 0);
      const address = `${column(c)}${r + 1}`;
      if (value.formula != null) {
        if (value.formula.length > 8192) throw Error('A generated spreadsheet formula is too long.');
        const result = value.value ?? '';
        return `<c r="${address}" s="${style}"${typeof result === 'number' ? '' : ' t="str"'}><f${value.array ? ` t="array" ref="${address}"` : ''}>${xml(value.formula.replace(/^=/, ''))}</f><v>${xml(result)}</v></c>`;
      }
      if (typeof value.value === 'number' && Number.isFinite(value.value)) return `<c r="${address}" s="${style}"><v>${value.value}</v></c>`;
      if (String(value.value ?? '').length > 32767) throw Error('A spreadsheet cell exceeds the Excel text limit.');
      return `<c r="${address}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xml(value.value)}</t></is></c>`;
    }).join('');
    return `<row r="${r + 1}" ht="${sheet.rowHeights?.[r + 1] || (r === 1 ? 30 : r === 4 ? 32 : r > 4 ? sheet.rowHeight || 34 : 22)}" customHeight="1">${body}</row>`;
  }).join('');
  sheets.forEach((s, i) => {
    const maxCol = Math.max(...s.rows.map(r => r.length), 1), maxRow = Math.max(s.rows.length, 6);
    const cols = Array.from({ length: maxCol }, (_, c) => `<col min="${c + 1}" max="${c + 1}" width="${s.widths?.[c] || 16}" customWidth="1"${s.hiddenColumns?.includes(c) ? ' hidden="1" outlineLevel="1"' : ''}/>`).join('');
    const validations = (s.validations || []).map(v => `<dataValidation type="${v.type || 'list'}" allowBlank="1" showErrorMessage="1" errorStyle="stop" errorTitle="Choose a valid value" error="Use a listed value or leave blank." sqref="${xml(v.range)}"><formula1>${xml(v.formula)}</formula1></dataValidation>`).join('');
    const cf = (s.statusColumns || []).map(c => `<conditionalFormatting sqref="${c}6:${c}${maxRow}"><cfRule type="expression" dxfId="0" priority="1"><formula>AND($A6&lt;&gt;"",${c}6&lt;&gt;"Ready")</formula></cfRule></conditionalFormatting>`).join('');
    const freeze = s.freezeColumns ?? 2;
    files[`xl/worksheets/sheet${i + 1}.xml`] = `${header}<worksheet xmlns="${ns}"><sheetPr><tabColor rgb="FF${s.color}"/><outlinePr summaryRight="0"/></sheetPr><dimension ref="A1:${column(maxCol - 1)}${maxRow}"/><sheetViews><sheetView showGridLines="0" workbookViewId="0"><pane xSplit="${freeze}" ySplit="5" topLeftCell="${column(freeze)}6" activePane="bottomRight" state="frozen"/><selection pane="bottomRight" activeCell="${column(freeze)}6" sqref="${column(freeze)}6"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="26"/><cols>${cols}</cols><sheetData>${cells(s, i)}</sheetData>${s.filter === false ? '' : `<autoFilter ref="A5:${column((s.filterColumns || maxCol) - 1)}${maxRow}"/>`}${s.merges?.length ? `<mergeCells count="${s.merges.length}">${s.merges.map(r => `<mergeCell ref="${r}"/>`).join('')}</mergeCells>` : ''}${cf}${validations ? `<dataValidations count="${s.validations.length}">${validations}</dataValidations>` : ''}<pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.2" footer="0.2"/></worksheet>`;
  });
  files['xl/workbook.xml'] = `${header}<workbook xmlns="${ns}" xmlns:r="${documentRel.slice(0, -1)}"><bookViews><workbookView/></bookViews><sheets>${sheets.map((s, i) => `<sheet name="${xml(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>${Object.keys(namedRanges).length ? `<definedNames>${Object.entries(namedRanges).map(([name, range]) => `<definedName name="${xml(name)}">${xml(range)}</definedName>`).join('')}</definedNames>` : ''}<calcPr calcId="191029" calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"/></workbook>`;
  files['xl/_rels/workbook.xml.rels'] = `${header}<Relationships xmlns="${relns}">${sheets.map((s, i) => `<Relationship Id="rId${i + 1}" Type="${documentRel}worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="styles" Type="${documentRel}styles" Target="styles.xml"/></Relationships>`;
  files['_rels/.rels'] = `${header}<Relationships xmlns="${relns}"><Relationship Id="workbook" Type="${documentRel}officeDocument" Target="xl/workbook.xml"/><Relationship Id="core" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`;
  files['docProps/core.xml'] = `${header}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${xml(title)}</dc:title><dc:creator>Workshop</dc:creator></cp:coreProperties>`;
  files['[Content_Types].xml'] = `${header}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>${sheets.map((s, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`;
  return zipFiles(files);
}
