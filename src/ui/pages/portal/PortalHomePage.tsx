import { ArrowRight, BellRing, CheckCircle2, Cpu, HelpCircle, Inbox, KeyRound, Monitor, Plus, Search, Wifi, type LucideIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Category } from '../../../domain';
import { Avatar, StatusBadge } from '../../components/Badges';
import { EmptyState, LoadingRows } from '../../components/EmptyState';
import type { PortalTicketDto } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { CATEGORY_LABELS, formatRelative } from '../../lib/format';
import { usePortalTickets } from '../../lib/hooks';

export const CATEGORY_HELP: Record<Category, { icon: LucideIcon; hint: string }> = {
  HARDWARE: { icon: Monitor, hint: 'Poste, écran, imprimante, téléphone' },
  SOFTWARE: { icon: Cpu, hint: 'Application, messagerie, installation' },
  NETWORK: { icon: Wifi, hint: 'Internet, Wi-Fi, VPN, partages' },
  ACCESS: { icon: KeyRound, hint: 'Mot de passe, compte, droits d’accès' },
  OTHER: { icon: HelpCircle, hint: 'Toute autre demande' },
};

type Filter = 'ongoing' | 'toConfirm' | 'closed';
const FILTERS: { id: Filter; label: string; match: (t: PortalTicketDto) => boolean }[] = [
  { id: 'ongoing', label: 'En cours', match: (t) => t.status === 'OPEN' || t.status === 'IN_PROGRESS' },
  { id: 'toConfirm', label: 'À confirmer', match: (t) => t.status === 'RESOLVED' },
  { id: 'closed', label: 'Clôturées', match: (t) => t.status === 'CLOSED' },
];

/** Libellé de suivi compréhensible par un non-informaticien. */
export const progressLabel = (t: Pick<PortalTicketDto, 'status' | 'assignee'>) => {
  switch (t.status) {
    case 'OPEN':
      return t.assignee ? `Prise en charge par ${t.assignee}` : 'En attente de prise en charge';
    case 'IN_PROGRESS':
      return `${t.assignee ?? 'La DSI'} travaille sur votre demande`;
    case 'RESOLVED':
      return 'Résolue — merci de confirmer';
    case 'CLOSED':
      return 'Clôturée';
  }
};

export const PortalHomePage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: tickets, isPending } = usePortalTickets();
  const [filter, setFilter] = useState<Filter>('ongoing');

  const counts = useMemo(
    () => Object.fromEntries(FILTERS.map((f) => [f.id, (tickets ?? []).filter(f.match).length])) as Record<Filter, number>,
    [tickets],
  );
  const visible = (tickets ?? []).filter(FILTERS.find((f) => f.id === filter)!.match);
  const firstName = user?.name.split(' ')[0] ?? '';

  return (
    <div className="portal-stack">
      <section className="portal-hero">
        <div>
          <h1>Bonjour {firstName}, comment pouvons-nous vous aider ?</h1>
          <p>Décrivez votre problème : la DSI est prévenue immédiatement et vous suivez l’avancement ici.</p>
        </div>
        <form
          className="search-input kb-search"
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            const q = new FormData(e.currentTarget).get('q');
            navigate(`/portal/help${q ? `?q=${encodeURIComponent(String(q))}` : ''}`);
          }}
        >
          <Search size={16} />
          <input className="input" name="q" aria-label="Chercher une solution dans le centre d’aide" placeholder="Chercher une solution : imprimante, VPN, mot de passe…" />
        </form>
        <div className="category-grid">
          {(Object.keys(CATEGORY_HELP) as Category[]).map((c) => {
            const { icon: Icon, hint } = CATEGORY_HELP[c];
            return (
              <Link key={c} to={`/portal/new?category=${c}`} className="category-card">
                <Icon size={20} />
                <b>{CATEGORY_LABELS[c]}</b>
                <span>{hint}</span>
              </Link>
            );
          })}
        </div>
      </section>

      {counts.toConfirm > 0 && (
        <button className="banner banner-success portal-alert" onClick={() => setFilter('toConfirm')}>
          <BellRing size={16} />
          {counts.toConfirm === 1
            ? 'Une demande a été résolue par la DSI : confirmez-vous que tout fonctionne ?'
            : `${counts.toConfirm} demandes ont été résolues par la DSI : confirmez-vous que tout fonctionne ?`}
          <ArrowRight size={16} style={{ marginLeft: 'auto' }} />
        </button>
      )}

      <section className="card">
        <div className="card-head">
          <h2>Mes demandes</h2>
          <div className="views" role="group" aria-label="Filtrer mes demandes">
            {FILTERS.map((f) => (
              <button key={f.id} className="view-chip" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
                {f.label} <span className="n">{counts[f.id]}</span>
              </button>
            ))}
          </div>
        </div>

        {isPending ? (
          <LoadingRows rows={3} />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={filter === 'closed' ? CheckCircle2 : Inbox}
            title={filter === 'ongoing' ? 'Aucune demande en cours' : filter === 'toConfirm' ? 'Rien à confirmer' : 'Aucune demande clôturée'}
            action={
              filter === 'ongoing' ? (
                <Link to="/portal/new" className="btn btn-primary">
                  <Plus size={16} /> Nouvelle demande
                </Link>
              ) : undefined
            }
          >
            {filter === 'ongoing' ? 'Tout fonctionne ? Parfait. En cas de souci, déclarez-le en quelques secondes.' : undefined}
          </EmptyState>
        ) : (
          <ul className="request-list">
            {visible.map((t) => (
              <li key={t.id}>
                <button className="request" onClick={() => navigate(`/portal/${t.id}`)} aria-label={`${t.reference} ${t.title}`}>
                  <span className="ref">{t.reference}</span>
                  <span className="request-main">
                    <b>{t.title}</b>
                    <span className="muted small">
                      {CATEGORY_LABELS[t.category]} · mise à jour {formatRelative(t.updatedAt)}
                      {t.comments.length > 0 && ` · ${t.comments.length} message${t.comments.length > 1 ? 's' : ''}`}
                    </span>
                  </span>
                  <span className="request-progress">
                    {t.assignee && <Avatar name={t.assignee} />}
                    <span className="small">{progressLabel(t)}</span>
                  </span>
                  <StatusBadge status={t.status} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};
