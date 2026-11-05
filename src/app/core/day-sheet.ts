import { Appointment, AppointmentStatus } from './models/appointment.model';
import { longDay } from './message-templates';

export interface DaySheetRow {
  time: string;
  client: string;
  phone: string | null;
  service: string;
  status: AppointmentStatus;
  note: string | null;
}

export interface DaySheetGroup {
  staff: string;
  rows: DaySheetRow[];
}

export interface DaySheet {
  /** "2026-10-16" */
  day: string;
  label: string;
  groups: DaySheetGroup[];
  total: number;
}

const STATUS_NOTES: Partial<Record<AppointmentStatus, string>> = {
  awaiting_deposit: 'espera anticipo',
  completed: 'ya se hizo',
  no_show: 'no llegó',
};

/** Las citas de un día agrupadas por colaborador y ordenadas por hora. Las canceladas no entran. */
export function buildDaySheet(appointments: readonly Appointment[], day: string): DaySheet {
  const byStaff = new Map<string, DaySheetRow[]>();
  let total = 0;
  for (const item of appointments) {
    if (item.status === 'cancelled' || item.starts_at.slice(0, 10) !== day) continue;
    const rows = byStaff.get(item.staff_name) ?? [];
    rows.push({
      time: item.starts_at.slice(11, 16),
      client: item.client_name,
      phone: item.client_phone,
      service: item.service_name,
      status: item.status,
      note: item.notes?.trim() || null,
    });
    byStaff.set(item.staff_name, rows);
    total++;
  }
  const groups = [...byStaff.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'es'))
    .map(([staff, rows]) => ({ staff, rows: rows.sort((a, b) => a.time.localeCompare(b.time)) }));
  return { day, label: longDay(day), groups, total };
}

/** Texto para WhatsApp: una línea por cita, con un bloque por colaborador. */
export function daySheetText(sheet: DaySheet, business: string): string {
  if (sheet.total === 0) return `${business}\n${sheet.label}: sin citas.`;
  const blocks = sheet.groups.map((group) => {
    const lines = group.rows.map((row) => {
      const extra = STATUS_NOTES[row.status];
      return `${row.time} · ${row.client} · ${row.service}${extra ? ` (${extra})` : ''}`;
    });
    return `*${group.staff}*\n${lines.join('\n')}`;
  });
  return `📅 ${business}\n${sheet.label}: ${sheet.total} cita${sheet.total === 1 ? '' : 's'}\n\n${blocks.join('\n\n')}`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] as string);
}

/** Hoja lista para imprimir (se abre en una ventana aparte, sin depender de los estilos de la app). */
export function daySheetHtml(sheet: DaySheet, business: string): string {
  const groups = sheet.groups
    .map((group) => {
      const rows = group.rows
        .map((row) => {
          const extra = [STATUS_NOTES[row.status], row.note].filter(Boolean).join(' · ');
          return `<tr><td class="t">${escapeHtml(row.time)}</td><td><strong>${escapeHtml(row.client)}</strong>${row.phone ? `<br><span>${escapeHtml(row.phone)}</span>` : ''}</td><td>${escapeHtml(row.service)}${extra ? `<br><span>${escapeHtml(extra)}</span>` : ''}</td></tr>`;
        })
        .join('');
      return `<h2>${escapeHtml(group.staff)}</h2><table>${rows}</table>`;
    })
    .join('');
  const body = sheet.total === 0 ? '<p>No hay citas este día.</p>' : groups;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Agenda · ${escapeHtml(sheet.label)}</title><style>
body{font:15px/1.4 system-ui,sans-serif;color:#111;margin:24px}h1{font-size:20px;margin:0}p.sub{margin:2px 0 16px;color:#444}
h2{font-size:16px;margin:18px 0 6px;border-bottom:2px solid #111;padding-bottom:2px}table{width:100%;border-collapse:collapse}
td{padding:6px 8px;border-bottom:1px solid #ccc;vertical-align:top}td.t{width:64px;font-weight:700}span{color:#444;font-size:13px}
</style></head><body><h1>${escapeHtml(business)}</h1><p class="sub">${escapeHtml(sheet.label)} · ${sheet.total} cita${sheet.total === 1 ? '' : 's'}</p>${body}</body></html>`;
}
