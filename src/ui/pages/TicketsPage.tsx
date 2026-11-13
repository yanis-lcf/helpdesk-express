import { ArrowDownUp, Inbox, Search, SearchX } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CATEGORIES, type Category } from '../../domain';
import { CategoryLabel, Person, PriorityBadge, SlaBadge, StatusBadge, Tags } from '../components/Badges';
import { EmptyState, LoadingRows } from '../components/EmptyState';
import { useUi } from '../components/Layout';
import { applyFilters, countByView, DEFAULT_FILTERS, sortTickets, VIEWS, type SortKey, type TicketFilters } from '../lib/filters';
import { CATEGORY_LABELS, formatRelative } from '../lib/format';
import { useHotkey, useTeam, useTickets } from '../lib/hooks';
import { storage, useSession } from '../lib/session';

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'sla', label: 'Échéance SLA' },
  { key: 'priority', label: 'Priorité' },
  { key: 'updated', label: 'Dernière activité' },
  { key: 'created', label: 'Date de création' },
];

const loadFilters = (): TicketFilters => {
  try {
    return { ...DEFAULT_FILTERS, ...JSON.parse(storage.get('hdx.filters') ?? '{}'), search: '' };
  } catch {
    return DEFAULT_FILTERS;
  }
};

export const TicketsPage = () => {
  const navigate = useNavigate();
  const { actor } = useSession();
  const { openNewTicket } = useUi();
  const { data: tickets, isLoading, error } = useTickets();
  const { data: team = [] } = useTeam();
  const [filters, setFiltersState] = useState<TicketFilters>(loadFilters);
  const [sort, setSort] = useState<SortKey>((storage.get('hdx.sort') as SortKey | null) ?? 'sla');
  const searchRef = useRef<HTMLInputElement>(null);

  useHotkey('/', () => searchRef.current?.focus());

  const setFilters = (patch: Partial<TicketFilters>) =>
    setFiltersState((f) => {
      const next = { ...f, ...patch };
      storage.set('hdx.filters', JSON.stringify({ ...next, search: '' }));
      return next;
    });

  const counts = useMemo(() => countByView(tickets ?? [], actor), [tickets, actor]);
  const visible = useMemo(() => sortTickets(applyFilters(tickets ?? [], filters, actor), sort), [tickets, filters, actor, sort]);
  const filtered = filters.search !== '' || filters.category !== 'ALL' || filters.assignee !== 'ALL';

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Tickets</h1>
          <p>Toutes les demandes actives. Cliquez sur un ticket pour le traiter.</p>
        </div>
      </div>

      <section className="card">
        <div className="toolbar" style={{ paddingBottom: 0, borderBottom: 'none' }}>
          <div className="views" role="group" aria-label="Vues">
            {VIEWS.map((v) => (
              <button key={v.id} className="view-chip" aria-pressed={filters.view === v.id} onClick={() => setFilters({ view: v.id })}>
                {v.label} <span className="n">{counts[v.id]}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="toolbar">
          <div className="search-input">
            <Search size={15} />
            <input
              ref={searchRef}
              className="input"
              placeholder="Rechercher…  ( / )"
              value={filters.search}
              onChange={(e) => setFilters({ search: e.target.value })}
              aria-label="Rechercher dans les tickets"
            />
          </div>
          <select className="select filter-select" value={filters.category} onChange={(e) => setFilters({ category: e.target.value as Category | 'ALL' })} aria-label="Filtrer par catégorie">
            <option value="ALL">Toutes catégories</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
            ))}
          </select>
          <select className="select filter-select" value={filters.assignee} onChange={(e) => setFilters({ assignee: e.target.value })} aria-label="Filtrer par agent">
            <option value="ALL">Tous les agents</option>
            <option value="UNASSIGNED">Non assignés</option>
            {team.map((m) => (
              <option key={m.name} value={m.name}>{m.name}</option>
            ))}
          </select>
          {filtered && (
            <button className="btn btn-ghost btn-sm" onClick={() => setFilters({ search: '', category: 'ALL', assignee: 'ALL' })}>
              Réinitialiser
            </button>
          )}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            <ArrowDownUp size={15} color="var(--muted)" />
            <select
              className="select filter-select"
              value={sort}
              onChange={(e) => {
                setSort(e.target.value as SortKey);
                storage.set('hdx.sort', e.target.value);
              }}
              aria-label="Trier par"
            >
              {SORTS.map((s) => (
                <option key={s.key} value={s.key}>Trier : {s.label}</option>
              ))}
            </select>
          </div>
        </div>

        {isLoading && <LoadingRows />}
        {error && <div className="banner banner-danger" style={{ margin: 14 }}>Impossible de charger les tickets : {error.message}</div>}

        {tickets && visible.length === 0 && (
          tickets.length === 0 ? (
            <EmptyState icon={Inbox} title="Aucun ticket" action={<button className="btn btn-primary" onClick={openNewTicket}>Nouveau ticket</button>}>
              Créez votre premier ticket ou appuyez sur <kbd>N</kbd>.
            </EmptyState>
          ) : (
            <EmptyState icon={SearchX} title="Aucun ticket ne correspond">
              Essayez une autre vue ou modifiez vos filtres.
            </EmptyState>
          )
        )}

        {visible.length > 0 && (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Réf.</th>
                  <th>Sujet</th>
                  <th>Statut</th>
                  <th>Priorité</th>
                  <th>Catégorie</th>
                  <th>Assigné à</th>
                  <th>SLA</th>
                  <th>Activité</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((t) => (
                  <tr
                    key={t.id}
                    tabIndex={0}
                    onClick={() => navigate(`/tickets/${t.id}`)}
                    onKeyDown={(e) => e.key === 'Enter' && navigate(`/tickets/${t.id}`)}
                    aria-label={`${t.reference} ${t.title}`}
                  >
                    <td><span className="ref">{t.reference}</span></td>
                    <td>
                      <div className="cell-title">
                        <strong>{t.title}</strong>
                        <span className="muted small">
                          {t.requester}
                          {t.comments.length > 0 && ` · ${t.comments.length} message${t.comments.length > 1 ? 's' : ''}`}
                        </span>
                        <Tags tags={t.tags} />
                      </div>
                    </td>
                    <td><StatusBadge status={t.status} /></td>
                    <td><PriorityBadge priority={t.priority} /></td>
                    <td><CategoryLabel category={t.category} /></td>
                    <td><Person name={t.assignee} /></td>
                    <td><SlaBadge sla={t.sla} /></td>
                    <td className="muted small nowrap" title={t.updatedAt}>{formatRelative(t.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <p className="muted small">
        {visible.length} ticket{visible.length > 1 ? 's' : ''} affiché{visible.length > 1 ? 's' : ''} · Astuce : <kbd>/</kbd> pour
        rechercher, <kbd>N</kbd> pour créer, <kbd>Ctrl</kbd>+<kbd>K</kbd> pour tout le reste.
      </p>
    </>
  );
};
