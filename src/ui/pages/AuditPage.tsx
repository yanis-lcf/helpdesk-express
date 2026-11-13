import { Download, FileJson, ScrollText, Search, ShieldAlert, ShieldCheck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { EVENT_TYPES, type TicketEventType } from '../../domain';
import { EmptyState, LoadingRows } from '../components/EmptyState';
import { auditToCsv, downloadFile } from '../lib/csv';
import { EVENT_LABELS, FIELD_LABELS, formatFieldValue, formatFullDate } from '../lib/format';
import { useAuditLog, useIntegrity } from '../lib/hooks';

/** Référence lisible de chaque ticket, dans l'ordre de création (même règle que la projection serveur). */
const referencesOf = (entries: readonly { type: string; ticketId: string }[]) =>
  new Map(
    entries
      .filter((e) => e.type === 'TicketCreated')
      .map((e, i) => [e.ticketId, `HD-${String(i + 1).padStart(4, '0')}`] as const),
  );

const PAGE = 100;

export const AuditPage = () => {
  const { data: entries, isLoading } = useAuditLog();
  const { data: integrity } = useIntegrity();
  const [type, setType] = useState<TicketEventType | 'ALL'>('ALL');
  const [actor, setActor] = useState('ALL');
  const [search, setSearch] = useState('');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');
  const [limit, setLimit] = useState(PAGE);

  const refs = useMemo(() => referencesOf(entries ?? []), [entries]);
  const titles = useMemo(
    () => new Map((entries ?? []).filter((e) => e.type === 'TicketCreated').map((e) => [e.ticketId, (e.payload as { title: string }).title])),
    [entries],
  );
  const actors = useMemo(() => [...new Set((entries ?? []).map((e) => e.actor))].sort(), [entries]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = (entries ?? []).filter(
      (e) =>
        (type === 'ALL' || e.type === type) &&
        (actor === 'ALL' || e.actor === actor) &&
        (!q ||
          (refs.get(e.ticketId) ?? '').toLowerCase().includes(q) ||
          (titles.get(e.ticketId) ?? '').toLowerCase().includes(q) ||
          e.ticketId.includes(q)),
    );
    return order === 'desc' ? [...list].reverse() : list;
  }, [entries, type, actor, search, order, refs, titles]);

  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Journal d'audit</h1>
          <p>Flux brut et inaltérable de l'Event Store. Rien n'est jamais modifié ni effacé : chaque action y est ajoutée.</p>
        </div>
        <div className="page-actions">
          <button className="btn" disabled={!entries?.length} onClick={() => downloadFile(`audit-${stamp}.csv`, auditToCsv(visible, refs), 'text/csv;charset=utf-8')}>
            <Download size={15} /> Export CSV
          </button>
          <button className="btn" disabled={!entries?.length} onClick={() => downloadFile(`audit-${stamp}.json`, JSON.stringify({ exportedAt: new Date().toISOString(), integrity, entries: visible }, null, 2), 'application/json')}>
            <FileJson size={15} /> Export JSON
          </button>
        </div>
      </div>

      {integrity && (
        <section className={`card integrity ${integrity.valid ? 'ok' : 'ko'}`} aria-live="polite">
          <div className="integrity-icon">{integrity.valid ? <ShieldCheck size={22} /> : <ShieldAlert size={22} />}</div>
          <div style={{ minWidth: 0 }}>
            <h2>{integrity.valid ? 'Journal intègre' : 'Altération détectée !'}</h2>
            <p className="small" style={{ color: 'var(--text-2)' }}>
              {integrity.valid
                ? `${integrity.checkedEvents} événements vérifiés : la chaîne d'empreintes SHA-256 est continue, aucune donnée n'a été modifiée.`
                : `La chaîne est rompue à l'événement n°${integrity.firstInvalidPosition}. Le support de stockage a été modifié en dehors de l'application.`}
            </p>
            {integrity.headHash && <div className="seal">Sceau du journal : {integrity.headHash}</div>}
          </div>
        </section>
      )}

      <section className="card">
        <div className="toolbar">
          <div className="search-input">
            <Search size={15} />
            <input className="input" placeholder="Réf. (HD-0003), titre ou ID…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Rechercher un ticket" />
          </div>
          <select className="select filter-select" value={type} onChange={(e) => setType(e.target.value as TicketEventType | 'ALL')} aria-label="Type d'événement">
            <option value="ALL">Tous les événements</option>
            {EVENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select className="select filter-select" value={actor} onChange={(e) => setActor(e.target.value)} aria-label="Acteur">
            <option value="ALL">Tous les acteurs</option>
            {actors.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <div className="segmented" role="group" aria-label="Ordre" style={{ marginLeft: 'auto' }}>
            <button aria-pressed={order === 'desc'} onClick={() => setOrder('desc')}>Plus récents</button>
            <button aria-pressed={order === 'asc'} onClick={() => setOrder('asc')}>Chronologique</button>
          </div>
        </div>

        {isLoading && <LoadingRows />}
        {entries && entries.length === 0 && (
          <EmptyState icon={ScrollText} title="Journal vide">Aucun événement enregistré pour l'instant.</EmptyState>
        )}

        {visible.length > 0 && (
          <div className="table-wrap">
            <table className="data audit">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Date</th>
                  <th>Événement</th>
                  <th>Ticket</th>
                  <th>Acteur</th>
                  <th>Données modifiées</th>
                  <th>Empreinte</th>
                </tr>
              </thead>
              <tbody>
                {visible.slice(0, limit).map((e) => (
                  <tr key={e.position} style={{ cursor: 'default' }}>
                    <td className="muted mono">{e.position}</td>
                    <td className="nowrap small">{formatFullDate(e.occurredAt)}</td>
                    <td>
                      <span className={`ev ev-${e.type}`}>{e.type}</span>
                      <div className="muted small">{EVENT_LABELS[e.type]} · v{e.streamVersion}</div>
                    </td>
                    <td style={{ minWidth: 180 }}>
                      <Link to={`/tickets/${e.ticketId}`} className="ref" title={e.ticketId}>{refs.get(e.ticketId)}</Link>
                      <div className="small" style={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{titles.get(e.ticketId)}</div>
                    </td>
                    <td className="small nowrap">{e.actor}</td>
                    <td style={{ minWidth: 260 }}>
                      <ul className="changes">
                        {e.changes.map((c) => (
                          <li key={c.field}>
                            <b>{FIELD_LABELS[c.field] ?? c.field}</b> :{' '}
                            {c.before !== null && e.type !== 'TicketCreated' && <><span className="before">{formatFieldValue(c.field, c.before)}</span> → </>}
                            {formatFieldValue(c.field, c.after)}
                          </li>
                        ))}
                      </ul>
                      <details>
                        <summary>Payload brut</summary>
                        <pre>{JSON.stringify(e.payload, null, 2)}</pre>
                      </details>
                    </td>
                    <td className="hash" title={`SHA-256 : ${e.hash}\nPrécédent : ${e.previousHash}`}>{e.hash.slice(0, 10)}…</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {visible.length > limit && (
          <div style={{ padding: 14, textAlign: 'center' }}>
            <button className="btn" onClick={() => setLimit((l) => l + PAGE)}>Afficher plus ({visible.length - limit} restants)</button>
          </div>
        )}
      </section>
    </>
  );
};
