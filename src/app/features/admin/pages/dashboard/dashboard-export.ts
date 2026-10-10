export interface ReportSheet {
  name: string;
  rows: (string | number)[][];
}

export function downloadExcel(fileName: string, sheets: ReportSheet[]): void {
  const body = sheets
    .map((item) => {
      const rows = item.rows
        .map(
          (row) =>
            `<Row>${row
              .map((cell) =>
                typeof cell === 'number'
                  ? `<Cell><Data ss:Type="Number">${cell}</Data></Cell>`
                  : `<Cell><Data ss:Type="String">${xml(String(cell))}</Data></Cell>`,
              )
              .join('')}</Row>`,
        )
        .join('');
      return `<Worksheet ss:Name="${xml(item.name)}"><Table>${rows}</Table></Worksheet>`;
    })
    .join('');
  const markup = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">${body}</Workbook>`;
  save(fileName, new Blob([markup], { type: 'application/vnd.ms-excel' }));
}

export function downloadPdf(
  fileName: string,
  title: string,
  subtitle: string,
  sheets: ReportSheet[],
  extra?: { goal: string; chart: { label: string; amount: number }[] },
): void {
  const pages: string[] = [];
  let commands: string[] = [];
  let y = 752;

  const flush = () => {
    pages.push(commands.join('\n'));
    commands = [];
    y = 752;
  };
  const ensure = (need: number) => {
    if (y - need < 48) {
      flush();
    }
  };
  const text = (x: number, size: number, value: string, bold = false) => {
    commands.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${x} ${y.toFixed(1)} Td (${pdfText(value)}) Tj ET`);
  };

  text(40, 16, title, true);
  y -= 18;
  text(40, 10, subtitle);
  y -= 16;
  if (extra?.goal) {
    text(40, 10, extra.goal);
    y -= 16;
  }
  const chart = extra?.chart ?? [];
  if (chart.length > 0) {
    ensure(72);
    const max = Math.max(1, ...chart.map((point) => point.amount));
    const left = 40;
    const width = 520;
    const height = 46;
    const base = y - height;
    const spots = chart.map((point, index) => ({
      x: chart.length === 1 ? left : left + (index / (chart.length - 1)) * width,
      y: base + (point.amount / max) * height,
      label: point.label,
    }));
    const path =
      chart.length === 1
        ? `${left} ${spots[0].y.toFixed(1)} m ${left + width} ${spots[0].y.toFixed(1)} L`
        : spots.map((spot, index) => `${index ? 'L' : 'M'} ${spot.x.toFixed(1)} ${spot.y.toFixed(1)}`).join(' ');
    commands.push(`0.72 0.43 0.47 RG ${path} S`);
    y = base - 12;
    commands.push(`BT /F1 8 Tf ${left} ${y.toFixed(1)} Td (${pdfText(spots[0].label)}) Tj ET`);
    if (spots.length > 1) {
      commands.push(`BT /F1 8 Tf ${left + width - 36} ${y.toFixed(1)} Td (${pdfText(spots[spots.length - 1].label)}) Tj ET`);
    }
    y -= 18;
  }

  for (const sheet of sheets) {
    ensure(36);
    text(40, 12, sheet.name, true);
    y -= 16;
    const widths = columnWidths(sheet.rows);
    for (const row of sheet.rows) {
      ensure(16);
      let x = 40;
      row.forEach((cell, index) => {
        const width = widths[index] ?? 80;
        text(x, 9, fit(String(cell), width));
        x += width;
      });
      y -= 6;
      commands.push(`0.9 0.9 0.89 RG 40 ${y.toFixed(1)} m 572 ${y.toFixed(1)} l S`);
      y -= 12;
    }
    y -= 10;
  }
  if (commands.length) {
    pages.push(commands.join('\n'));
  }

  const objects: string[] = [];
  const pageIds: number[] = [];
  let next = 3;
  const contentIds = pages.map(() => next++);
  pages.forEach((_, index) => pageIds.push(next + index));
  const fontRegular = next + pages.length;
  const fontBold = fontRegular + 1;
  objects.push('1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj');
  objects.push(`2 0 obj << /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >> endobj`);
  pages.forEach((content, index) => {
    objects.push(
      `${contentIds[index]} 0 obj << /Length ${content.length} >> stream\n${content}\nendstream endobj`,
    );
  });
  pageIds.forEach((id, index) => {
    objects.push(
      `${id} 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contentIds[index]} 0 R /Resources << /Font << /F1 ${fontRegular} 0 R /F2 ${fontBold} 0 R >> >> >> endobj`,
    );
  });
  objects.push(`${fontRegular} 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >> endobj`);
  objects.push(`${fontBold} 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >> endobj`);

  let output = '%PDF-1.4\n';
  const offsets = [0];
  for (const object of objects) {
    offsets.push(output.length);
    output += `${object}\n`;
  }
  const xref = output.length;
  output += `xref\n0 ${objects.length + 1}\n`;
  output += '0000000000 65535 f \n';
  for (let index = 1; index < offsets.length; index += 1) {
    output += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
  }
  output += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  save(fileName, new Blob([output], { type: 'application/pdf' }));
}

function columnWidths(rows: (string | number)[][]): number[] {
  const count = Math.max(1, ...rows.map((row) => row.length));
  return Array.from({ length: count }, () => 532 / count);
}

function fit(value: string, width: number): string {
  const max = Math.max(4, Math.floor(width / 4.6));
  return value.length <= max ? value : `${value.slice(0, max - 3)}...`;
}

function xml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const WIN: Record<string, number> = {
  '\u00e1': 0xe1, '\u00e9': 0xe9, '\u00ed': 0xed, '\u00f3': 0xf3, '\u00fa': 0xfa, '\u00f1': 0xf1, '\u00fc': 0xfc,
  '\u00c1': 0xc1, '\u00c9': 0xc9, '\u00cd': 0xcd, '\u00d3': 0xd3, '\u00da': 0xda, '\u00d1': 0xd1,
};

function pdfText(value: string): string {
  return value.replace(/[\\()]/g, (char) => `\\${char}`).replace(/[^\x20-\x7e]/g, (char) => {
    const code = WIN[char];
    return code ? `\\${code.toString(8).padStart(3, '0')}` : '';
  });
}

function save(fileName: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}
