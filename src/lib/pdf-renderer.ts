import { jsPDF } from 'jspdf';
import { calculateLine, money, totals, type DocumentData } from '../../shared/model';

export interface PdfLogo {
  bytes: Uint8Array;
  format: 'PNG' | 'JPEG';
}

const LEFT = 20;
const RIGHT = 190;
const WIDTH = RIGHT - LEFT;
const TOP = 32;
const BOTTOM = 267;
const INK = '#1D2E3A';
const MUTED = '#61717C';
const RULE = '#D9E2E8';

function printable(value: string): string {
  return String(value || '')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\u2022/g, '-')
    .replace(/\u00a0/g, ' ')
    .replace(/[^\x09\x0a\x0d\x20-\xff]/g, '');
}

function hexRgb(hex: string): [number, number, number] {
  const v = /^#[0-9a-f]{6}$/i.test(hex) ? hex.slice(1) : '123B3A';
  return [0, 2, 4].map(i => parseInt(v.slice(i, i + 2), 16)) as [number, number, number];
}

function blend(first: string, second: string, weight: number): string {
  const a = hexRgb(first), b = hexRgb(second);
  return '#' + a.map((value, i) => Math.round(value * (1 - weight) + b[i] * weight).toString(16).padStart(2, '0')).join('');
}

function palette(colour: string) {
  const primary = /^#[0-9a-f]{6}$/i.test(colour) ? colour : '#123B3A';
  const [r, g, b] = hexRgb(primary);
  const brightness = (r * 0.2126 + g * 0.7152 + b * 0.0722) / 255;
  const accent = brightness > 0.52 ? blend(primary, '#173649', 0.68) : primary;
  return { primary, accent, soft: blend(primary, '#FFFFFF', 0.84), pale: blend(primary, '#FFFFFF', 0.94) };
}

function isSubheading(value: string): boolean {
  const v = value.trim();
  if (v.length < 3 || v.length > 74 || v.split(/\s+/).length > 9) return false;
  if (/[.!?,;:]$/.test(v) || /^\d/.test(v) || v.includes('|')) return false;
  if (/^(dear |re:|yours |janix will |the |this |these |a |an )/i.test(v)) return false;
  return /[a-z]/i.test(v);
}

function getColumnFractions(headers: string[], cols: number): number[] {
  const label = (headers[0] || '').toLowerCase();
  if (cols === 2) {
    if (/pricing item|description/.test(label)) return [0.72, 0.28];
    if (/commercial item|company detail|declaration field/.test(label)) return [0.40, 0.60];
    return [0.36, 0.64];
  }
  if (cols === 3) {
    if (/person/.test(label)) return [0.19, 0.26, 0.55];
    if (/finish group|milestone/.test(label)) return [0.31, 0.23, 0.46];
    return [0.29, 0.28, 0.43];
  }
  if (cols === 4) {
    if (/optional service/.test(label)) return [0.26, 0.18, 0.17, 0.39];
    if (/labour category/.test(label)) return [0.30, 0.13, 0.26, 0.31];
    return [0.25, 0.20, 0.19, 0.36];
  }
  if (cols === 5) return [0.25, 0.18, 0.18, 0.18, 0.21];
  if (cols === 6) return [0.27, 0.145, 0.145, 0.145, 0.145, 0.15];
  return Array(cols).fill(1 / cols);
}

function formatDate(date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  const v = new Date(date + 'T12:00:00Z');
  if (Number.isNaN(v.getTime())) return date;
  return v.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/**
 * PDF layout engine. All narrative and table content is flowed within a reserved
 * printable region. Footer and header are applied after pagination is complete.
 * Existing document snapshots are never modified.
 */
export async function renderPdf(d: DocumentData, logo: PdfLogo | null = null): Promise<Blob> {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const colours = palette(d.business.colour || '#123B3A');
  const kind = d.kind === 'tender-response' ? 'TENDER RESPONSE' :
    d.kind === 'rfq' ? 'REQUEST FOR QUOTATION' :
    d.kind === 'capability' ? 'CAPABILITY STATEMENT' : 'SERVICE PROPOSAL';
  const sectionPages: { title: string; page: number }[] = [];
  const includeContents = d.sections.length >= 8 && d.sections.length <= 26;
  let currentPage = 1;
  let y = TOP;

  pdf.setProperties({
    title: printable(d.title),
    subject: kind,
    author: printable(d.business.legalName || d.business.name),
    creator: 'Proposal Studio'
  });

  function nextPage(): void {
    pdf.addPage();
    currentPage += 1;
    y = TOP;
  }

  function ensure(height: number): void {
    if (y + height > BOTTOM) nextPage();
  }

  function setText(size: number, bold = false, colour = INK): void {
    pdf.setFont('helvetica', bold ? 'bold' : 'normal');
    pdf.setFontSize(size);
    pdf.setTextColor(colour);
  }

  function paragraph(text: string, size = 9.7, bold = false, indent = 0): void {
    const input = printable(text).trim();
    if (!input) return;
    setText(size, bold);
    const lineHeight = size * 25.4 / 72 * 1.45;
    const lines = pdf.splitTextToSize(input, WIDTH - indent) as string[];
    let start = 0;
    if (y + Math.min(lines.length, 2) * lineHeight > BOTTOM) nextPage();
    while (start < lines.length) {
      let room = Math.floor((BOTTOM - y) / lineHeight);
      if (room < 2) { nextPage(); room = Math.floor((BOTTOM - y) / lineHeight); }
      let count = Math.min(room, lines.length - start);
      if (lines.length - start - count === 1 && count > 2) count -= 1;
      pdf.text(lines.slice(start, start + count), LEFT + indent, y, { lineHeightFactor: 1.45 });
      start += count;
      y += count * lineHeight;
      if (start < lines.length) nextPage();
    }
    y += 2.0;
  }

  function subheading(title: string): void {
    setText(11.2, true, colours.accent);
    const lines = pdf.splitTextToSize(printable(title), WIDTH) as string[];
    // Keep the heading with at least the first two lines of its content.
    ensure(4 + lines.length * 5 + 2.1 + 11);
    y += 4.0;
    pdf.text(lines, LEFT, y, { lineHeightFactor: 1.2 });
    y += lines.length * 5.0 + 2.1;
  }

  function majorHeading(title: string, index?: number): void {
    const titleX = index === undefined ? LEFT : LEFT + 12;
    setText(17, true, INK);
    const lines = pdf.splitTextToSize(printable(title), RIGHT - titleX) as string[];
    // Reserve the full heading, underline, and an opening line before drawing.
    ensure(3.6 + lines.length * 7.9 + 3 + 8.6 + 11);
    y += 3.6;
    if (index !== undefined) {
      setText(8.3, true, colours.accent);
      pdf.text(String(index + 1).padStart(2, '0'), LEFT, y - 0.5);
    }
    setText(17, true, INK);
    pdf.text(lines, titleX, y, { lineHeightFactor: 1.13 });
    y += lines.length * 7.9 + 3;
    pdf.setDrawColor(colours.accent);
    pdf.setLineWidth(0.65);
    pdf.line(LEFT, y, LEFT + 20, y);
    pdf.setDrawColor(RULE);
    pdf.setLineWidth(0.24);
    pdf.line(LEFT + 20, y, RIGHT, y);
    y += 8.6;
  }

  function table(raw: string[]): void {
    const cells = raw.map(line => line.split(/\s*\|\s*/).map(cell => printable(cell).trim()));
    const columns = Math.max(...cells.map(row => row.length));
    if (columns < 2 || columns > 6) {
      for (const row of raw) paragraph(row);
      return;
    }
    const rows = cells.map(row => Array.from({ length: columns }, (_, i) => row[i] || ''));
    const proportions = getColumnFractions(rows[0], columns);
    const widths = proportions.map(fraction => fraction * WIDTH);
    const columnLefts: number[] = [];
    widths.reduce((x, w, i) => { columnLefts[i] = x; return x + w; }, LEFT);
    const fontSize = columns >= 5 ? 7.55 : columns >= 4 ? 8.05 : 8.55;
    const lineHeight = fontSize * 25.4 / 72 * 1.43;
    const paddingX = 2.7, paddingY = 2.5;
    const numeric = (s: string) => /^(\$|AUD\s)?[\d,]+(?:\.\d+)?(?:\s?(?:h|%|\/hr))?$/.test(s.trim()) || /^\$[\d,]+/.test(s.trim());

    function wrap(row: string[], header: boolean): string[][] {
      setText(fontSize, header, header ? '#FFFFFF' : INK);
      return row.map((cell, i) => (pdf.splitTextToSize(cell || ' ', Math.max(8, widths[i] - 2 * paddingX)) as string[]));
    }
    function rowHeight(lines: string[][]): number {
      return Math.max(...lines.map(cell => Math.max(1, cell.length))) * lineHeight + 2 * paddingY + 1.0;
    }
    function drawRow(lines: string[][], height: number, header: boolean, stripe: boolean): void {
      pdf.setFillColor(header ? colours.accent : stripe ? colours.pale : '#FFFFFF');
      pdf.rect(LEFT, y, WIDTH, height, 'F');
      pdf.setDrawColor(RULE);
      pdf.setLineWidth(0.2);
      pdf.rect(LEFT, y, WIDTH, height, 'S');
      for (let i = 1; i < columns; i++) pdf.line(columnLefts[i], y, columnLefts[i], y + height);
      setText(fontSize, header, header ? '#FFFFFF' : INK);
      for (let i = 0; i < columns; i++) {
        const original = lines[i].join(' ').trim();
        const alignRight = !header && i > 0 && numeric(original);
        pdf.text(lines[i], alignRight ? columnLefts[i] + widths[i] - paddingX : columnLefts[i] + paddingX,
          y + paddingY + fontSize * 25.4 / 72, { align: alignRight ? 'right' : 'left', lineHeightFactor: 1.43 });
      }
      y += height;
    }

    const headerLines = wrap(rows[0], true);
    const headerHeight = rowHeight(headerLines);
    const firstHeight = rows.length > 1 ? rowHeight(wrap(rows[1], false)) : 0;
    if (y + headerHeight + Math.min(firstHeight, 18) > BOTTOM) nextPage();
    drawRow(headerLines, headerHeight, true, false);

    for (let rowIndex = 1; rowIndex < rows.length; rowIndex++) {
      const content = wrap(rows[rowIndex], false);
      const totalLines = Math.max(...content.map(c => Math.max(c.length, 1)));
      let offset = 0;
      while (offset < totalLines) {
        let room = Math.floor((BOTTOM - y - 2 * paddingY - 1) / lineHeight);
        if (room < 2) {
          nextPage();
          drawRow(headerLines, headerHeight, true, false);
          room = Math.floor((BOTTOM - y - 2 * paddingY - 1) / lineHeight);
        }
        const take = Math.min(room, totalLines - offset);
        const chunk = content.map(cell => cell.slice(offset, offset + take));
        const height = rowHeight(chunk);
        drawRow(chunk, height, false, rowIndex % 2 === 0);
        offset += take;
        if (offset < totalLines) {
          nextPage();
          drawRow(headerLines, headerHeight, true, false);
        }
      }
    }
    y += 5.5;
  }

  function body(text: string): void {
    const blocks = String(text || '').replace(/\r/g, '').split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);
    for (const block of blocks) {
      const lines = block.split('\n').map(line => line.trim()).filter(Boolean);
      if (lines.length && lines.every(line => line.includes('|')) &&
          lines.every(line => line.split('|').length === lines[0].split('|').length)) {
        table(lines);
      } else if (lines.length === 1 && isSubheading(lines[0])) {
        subheading(lines[0]);
      } else if (lines.length && lines.every(line => /^[-*\u2022]\s+/.test(line))) {
        for (const line of lines) paragraph('- ' + line.replace(/^[-*\u2022]\s+/, ''), 9.7, false, 4);
      } else {
        paragraph(lines.join(' '));
      }
    }
  }

  function pricing(): void {
    if (!d.lines.length) return;
    majorHeading('Pricing');
    const committed = d.lines.filter(line => !line.optional);
    if (committed.length) {
      table([
        'Description | Qty | Rate (ex GST) | Amount (ex GST)',
        ...committed.map(line => [
          line.description, line.quantity + ' ' + line.unit,
          money(Math.round(Number(line.rate) * 100), d.currency),
          money(calculateLine(line).net, d.currency)
        ].join(' | '))
      ]);
    }
    const t = totals(d.lines);
    table([
      'Commercial summary | Amount',
      'Subtotal excluding GST | ' + money(t.net, d.currency),
      'GST | ' + money(t.tax, d.currency),
      'Total including GST | ' + money(t.total, d.currency)
    ]);
    const options = d.lines.filter(line => line.optional);
    if (options.length) {
      subheading('Optional / provisional services - not included in the total');
      table([
        'Description | Unit | Indicative rate (ex GST)',
        ...options.map(line => [
          line.description, line.unit, money(Math.round(Number(line.rate) * 100), d.currency)
        ].join(' | '))
      ]);
    }
  }

  // Restrained cover design with readable text even for light-coloured brands.
  pdf.setFillColor(INK);
  pdf.rect(0, 0, 210, 12, 'F');
  pdf.setFillColor(colours.primary);
  pdf.rect(0, 12, 210, 3.5, 'F');
  setText(15, true, INK);
  const brandLines = pdf.splitTextToSize(printable(d.business.name || d.business.legalName), 113) as string[];
  pdf.text(brandLines.slice(0, 2), LEFT, 36, { lineHeightFactor: 1.1 });
  if (logo) {
    try {
      const props = pdf.getImageProperties(logo.bytes);
      const scale = Math.min(41 / props.width, 19 / props.height);
      const w = props.width * scale, h = props.height * scale;
      pdf.addImage(logo.bytes, logo.format, RIGHT - w, 25, w, h);
    } catch {
      // A missing or damaged optional logo should not prevent exporting the tender.
    }
  }
  setText(10, true, colours.accent);
  pdf.text(kind, LEFT, 80);
  setText(24, true, INK);
  const coverLines = pdf.splitTextToSize(printable(d.title), WIDTH - 7) as string[];
  const coverSize = coverLines.length >= 5 ? 18 : coverLines.length >= 4 ? 21 : 24;
  setText(coverSize, true, INK);
  const fittedCoverLines = pdf.splitTextToSize(printable(d.title), WIDTH - 7) as string[];
  pdf.text(fittedCoverLines, LEFT, 98, { lineHeightFactor: 1.21 });
  const coverEnd = 98 + Math.max(0, fittedCoverLines.length - 1) * coverSize * 25.4 / 72 * 1.21;
  const clientY = Math.max(165, coverEnd + 22);
  setText(8.8, true, MUTED);
  pdf.text('PREPARED FOR', LEFT, clientY);
  setText(15, true, INK);
  pdf.text(pdf.splitTextToSize(printable(d.client.name), WIDTH) as string[], LEFT, clientY + 9);
  pdf.setDrawColor(RULE);
  pdf.setLineWidth(0.4);
  pdf.line(LEFT, 216, RIGHT, 216);
  const metadata = [
    ['REFERENCE', d.reference || 'Not assigned'],
    ['DATE', formatDate(d.date)],
    ['PREPARED BY', d.preparedBy || d.business.name]
  ];
  metadata.forEach(([label, value], i) => {
    const x = LEFT + i * 58;
    setText(8.0, true, MUTED);
    pdf.text(label, x, 229);
    setText(10.0, true, INK);
    pdf.text((pdf.splitTextToSize(printable(value), 51) as string[]).slice(0, 3), x, 237, { lineHeightFactor: 1.2 });
  });
  setText(8, false, MUTED);
  pdf.text('Commercial in confidence', LEFT, 279);

  if (includeContents) nextPage();
  nextPage();

  for (let i = 0; i < d.sections.length; i++) {
    const section = d.sections[i];
    majorHeading(section.title, i);
    sectionPages.push({ title: section.title, page: currentPage });
    body(section.body);
    y += 4;
  }

  // Existing manually authored pricing schedules already contain the agreed
  // tables and qualifications. Do not print a duplicate pricing list at the end.
  const authoredPricing = d.sections.some(section =>
    /pricing|quotation/i.test(section.title) &&
    section.body.includes('|') &&
    /total|subtotal|base quotation/i.test(section.body)
  );
  if (d.lines.length && !authoredPricing) pricing();

  if (d.requirements.length) {
    majorHeading('Tender responses');
    for (const requirement of d.requirements) {
      subheading([requirement.reference, requirement.question].filter(Boolean).join(' - '));
      paragraph(requirement.response || 'Response not provided');
    }
  }
  if (d.terms.trim() && !d.sections.some(section => /^commercial terms$/i.test(section.title))) {
    majorHeading('Commercial terms');
    body(d.terms);
  }

  if (includeContents) {
    pdf.setPage(2);
    setText(9, true, colours.accent);
    pdf.text(kind, LEFT, 40);
    setText(23, true, INK);
    pdf.text('Contents', LEFT, 55);
    let entryY = 71;
    sectionPages.forEach(({ title, page }, i) => {
      setText(8.2, true, colours.accent);
      pdf.text(String(i + 1).padStart(2, '0'), LEFT, entryY);
      setText(10.2, false, INK);
      const shortTitle = (pdf.splitTextToSize(printable(title), 137) as string[])[0];
      pdf.text(shortTitle, LEFT + 12, entryY);
      setText(9.3, true, MUTED);
      pdf.text(String(page), RIGHT, entryY, { align: 'right' });
      pdf.setDrawColor(RULE);
      pdf.setLineWidth(0.16);
      pdf.line(LEFT, entryY + 2.9, RIGHT, entryY + 2.9);
      entryY += 7.6;
    });
  }

  const pageCount = pdf.getNumberOfPages();
  for (let page = 2; page <= pageCount; page++) {
    pdf.setPage(page);
    setText(8.1, true, colours.accent);
    pdf.text(printable(d.business.name), LEFT, 17);
    setText(7.7, false, MUTED);
    pdf.text(kind, RIGHT, 17, { align: 'right' });
    pdf.setDrawColor(RULE);
    pdf.setLineWidth(0.25);
    pdf.line(LEFT, 22, RIGHT, 22);
    pdf.line(LEFT, 276, RIGHT, 276);
    setText(7.7, false, MUTED);
    pdf.text(printable(d.reference || d.title), LEFT, 283);
    pdf.text('Page ' + page + ' of ' + pageCount, RIGHT, 283, { align: 'right' });
  }
  return pdf.output('blob');
}
