import type { AuditEntryDto } from './api';
import { EVENT_LABELS, FIELD_LABELS, formatFieldValue } from './format';

/** Échappement CSV (RFC 4180) + neutralisation des injections de formules tableur. */
export const csvCell = (value: string | number): string => {
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const describeChanges = (entry: AuditEntryDto) =>
  entry.changes
    .map((c) => {
      const label = FIELD_LABELS[c.field] ?? c.field;
      const after = formatFieldValue(c.field, c.after);
      return c.before === null ? `${label}: ${after}` : `${label}: ${formatFieldValue(c.field, c.before)} -> ${after}`;
    })
    .join(' | ');

/** Export CSV du journal d'audit (séparateur « ; », compatible Excel FR, BOM UTF-8). */
export const auditToCsv = (entries: readonly AuditEntryDto[], references: ReadonlyMap<string, string>): string => {
  const header = ['Position', 'Date (UTC)', 'Événement', 'Type', 'Référence', 'ID ticket', 'Acteur', 'Modifications', 'Empreinte SHA-256'];
  const rows = entries.map((e) => [
    e.position,
    e.occurredAt,
    EVENT_LABELS[e.type],
    e.type,
    references.get(e.ticketId) ?? '',
    e.ticketId,
    e.actor,
    describeChanges(e),
    e.hash,
  ]);
  return '﻿' + [header, ...rows].map((r) => r.map(csvCell).join(';')).join('\r\n');
};

export const downloadFile = (filename: string, content: string, type: string) => {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};
