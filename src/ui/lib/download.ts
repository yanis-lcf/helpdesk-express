/** Téléchargement d'un fichier généré côté navigateur. */
export const downloadFile = (filename: string, content: string, type = 'application/json') => {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

export const downloadJson = (filename: string, data: unknown) => downloadFile(filename, JSON.stringify(data, null, 2));

/**
 * Lecture d'un CSV d'annuaire (séparateur « ; » ou « , », guillemets RFC 4180, BOM Excel toléré).
 * En-têtes reconnus (insensibles à la casse et aux accents) : nom, email / e-mail, profil / role, service, fonction.
 */
export const parseUsersCsv = (text: string) => {
  const clean = text.replace(/^﻿/, '');
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? '';
  const sep = (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i]!;
    if (quoted) {
      if (c === '"' && clean[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && clean[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell || row.length) rows.push([...row, cell]);

  const norm = (h: string) => h.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');
  const [header = [], ...data] = rows.filter((r) => r.some((c) => c.trim()));
  const index = (...names: string[]) => header.findIndex((h) => names.includes(norm(h)));
  const col = { name: index('nom', 'name', 'nomcomplet'), email: index('email', 'mail', 'courriel'), role: index('profil', 'role'), department: index('service', 'departement', 'department'), jobTitle: index('fonction', 'poste', 'jobtitle') };
  if (col.name < 0 || col.email < 0) return { error: 'Colonnes « nom » et « email » obligatoires.', rows: [] as const };

  const ROLE_ALIASES: Record<string, 'EMPLOYEE' | 'AGENT' | 'ADMIN'> = { employe: 'EMPLOYEE', employee: 'EMPLOYEE', agent: 'AGENT', agentdsi: 'AGENT', admin: 'ADMIN', administrateur: 'ADMIN', administrateurdsi: 'ADMIN' };
  return {
    error: null,
    rows: data.map((r) => ({
      name: (r[col.name] ?? '').trim(),
      email: (r[col.email] ?? '').trim(),
      role: ROLE_ALIASES[norm(col.role >= 0 ? (r[col.role] ?? '') : '')] ?? ('EMPLOYEE' as const),
      department: col.department >= 0 ? (r[col.department] ?? '').trim() : '',
      jobTitle: col.jobTitle >= 0 ? (r[col.jobTitle] ?? '').trim() : '',
    })),
  };
};
