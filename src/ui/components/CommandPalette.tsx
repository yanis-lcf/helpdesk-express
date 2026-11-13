import { ArrowRight, Columns3, LayoutDashboard, MoonStar, Plus, Search, ShieldCheck, Ticket } from 'lucide-react';
import { useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { matchesSearch } from '../lib/filters';
import { useTickets } from '../lib/hooks';
import { useSession } from '../lib/session';
import { StatusBadge } from './Badges';

type Item = { id: string; group: string; icon: ReactNode; label: ReactNode; hint?: ReactNode; run: () => void };

/** Palette de commandes (Ctrl+K) : navigation, actions et recherche de tickets au clavier. */
export const CommandPalette = ({ onClose, onNewTicket }: { onClose: () => void; onNewTicket: () => void }) => {
  const navigate = useNavigate();
  const { toggleTheme } = useSession();
  const { data: tickets = [] } = useTickets();
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);

  const items = useMemo<Item[]>(() => {
    const go = (path: string) => () => navigate(path);
    const actions: Item[] = [
      { id: 'new', group: 'Actions', icon: <Plus size={16} />, label: 'Créer un ticket', hint: <kbd>N</kbd>, run: onNewTicket },
      { id: 'dash', group: 'Navigation', icon: <LayoutDashboard size={16} />, label: 'Tableau de bord', run: go('/dashboard') },
      { id: 'list', group: 'Navigation', icon: <Ticket size={16} />, label: 'Tickets', run: go('/tickets') },
      { id: 'board', group: 'Navigation', icon: <Columns3 size={16} />, label: 'Tableau Kanban', run: go('/board') },
      { id: 'audit', group: 'Navigation', icon: <ShieldCheck size={16} />, label: "Journal d'audit", run: go('/events') },
      { id: 'theme', group: 'Actions', icon: <MoonStar size={16} />, label: 'Basculer thème clair / sombre', run: toggleTheme },
    ];
    const q = query.trim().toLowerCase();
    const filteredActions = q ? actions.filter((a) => String(a.label).toLowerCase().includes(q)) : actions;
    const found = (q ? tickets.filter((t) => matchesSearch(t, query)) : tickets.slice(0, 5)).slice(0, 8).map<Item>((t) => ({
      id: t.id,
      group: q ? 'Tickets' : 'Tickets récents',
      icon: <span className="ref">{t.reference}</span>,
      label: t.title,
      hint: <StatusBadge status={t.status} />,
      run: go(`/tickets/${t.id}`),
    }));
    return [...found, ...filteredActions];
  }, [query, tickets, navigate, onNewTicket, toggleTheme]);

  const select = (item: Item | undefined) => {
    if (!item) return;
    onClose();
    item.run();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') setCursor((c) => Math.min(c + 1, items.length - 1));
    else if (e.key === 'ArrowUp') setCursor((c) => Math.max(c - 1, 0));
    else if (e.key === 'Enter') select(items[cursor]);
    else if (e.key === 'Escape') onClose();
    else return;
    e.preventDefault();
  };

  let lastGroup = '';
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Palette de commandes">
        <div className="palette-input">
          <Search size={18} color="var(--muted)" />
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setCursor(0);
            }}
            onKeyDown={onKeyDown}
            placeholder="Rechercher un ticket (réf., titre, demandeur…) ou une action"
            aria-label="Rechercher"
          />
          <kbd>Échap</kbd>
        </div>
        <div className="palette-list" role="listbox">
          {items.length === 0 && <div className="empty" style={{ padding: 28 }}>Aucun résultat pour « {query} »</div>}
          {items.map((item, i) => {
            const header = item.group !== lastGroup ? <div className="palette-group">{item.group}</div> : null;
            lastGroup = item.group;
            return (
              <div key={item.id}>
                {header}
                <div
                  className="palette-item"
                  role="option"
                  aria-selected={i === cursor}
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => select(item)}
                >
                  {item.icon}
                  <span className="grow">{item.label}</span>
                  {item.hint ?? <ArrowRight size={14} color="var(--muted)" />}
                </div>
              </div>
            );
          })}
        </div>
        <div className="palette-foot">
          <span>
            <kbd>↑</kbd> <kbd>↓</kbd> naviguer
          </span>
          <span>
            <kbd>Entrée</kbd> ouvrir
          </span>
          <span>
            <kbd>Ctrl</kbd> + <kbd>K</kbd> à tout moment
          </span>
        </div>
      </div>
    </div>
  );
};
