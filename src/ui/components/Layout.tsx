import { Columns3, LayoutDashboard, Moon, Plus, Search, ShieldCheck, Sun, Ticket, Zap } from 'lucide-react';
import { createContext, useCallback, useContext, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useCommand, useHotkey, useTeam, useTickets } from '../lib/hooks';
import { useSession } from '../lib/session';
import { Avatar } from './Badges';
import { CommandPalette } from './CommandPalette';
import { Modal } from './Modal';
import { NewTicketForm, type NewTicketInput } from './NewTicketForm';

type Ui = { openNewTicket: () => void; openPalette: () => void };
const UiContext = createContext<Ui>({ openNewTicket: () => {}, openPalette: () => {} });
export const useUi = () => useContext(UiContext);

export const Layout = () => {
  const navigate = useNavigate();
  const { actor, setActor, theme, toggleTheme } = useSession();
  const { data: team = [] } = useTeam();
  const { data: tickets = [] } = useTickets();
  const [newTicketOpen, setNewTicketOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const openNewTicket = useCallback(() => {
    setPaletteOpen(false);
    setNewTicketOpen(true);
  }, []);
  const openPalette = useCallback(() => setPaletteOpen(true), []);
  const closeNewTicket = useCallback(() => setNewTicketOpen(false), []);
  const closePalette = useCallback(() => setPaletteOpen(false), []);

  useHotkey('mod+k', openPalette);
  useHotkey('n', openNewTicket, !newTicketOpen && !paletteOpen);

  const create = useCommand(
    (input: NewTicketInput) => api.tickets.create.mutate(input),
    'Ticket créé',
  );

  const submitNewTicket = (input: NewTicketInput) =>
    create.mutate(input, {
      onSuccess: (result) => {
        setNewTicketOpen(false);
        navigate(`/tickets/${result.ticketId}`);
      },
    });

  const backlog = tickets.filter((t) => t.status === 'OPEN' || t.status === 'IN_PROGRESS').length;
  const mine = tickets.filter((t) => t.assignee === actor && (t.status === 'OPEN' || t.status === 'IN_PROGRESS')).length;
  const member = team.find((m) => m.name === actor);

  return (
    <UiContext.Provider value={{ openNewTicket, openPalette }}>
      <div className="shell">
        <aside className="sidebar">
          <div className="brand">
            <span className="brand-mark">
              <Zap size={18} fill="currentColor" />
            </span>
            <div>
              HelpDesk Express
              <small>Ticketing IT traçable</small>
            </div>
          </div>

          <div className="nav-section">Pilotage</div>
          <NavLink to="/dashboard" className="nav-link">
            <LayoutDashboard size={17} /> <span className="label">Tableau de bord</span>
          </NavLink>
          <div className="nav-section">Support</div>
          <NavLink to="/tickets" end className="nav-link">
            <Ticket size={17} /> <span className="label">Tickets</span>
            <span className="count">{backlog}</span>
          </NavLink>
          <NavLink to="/board" className="nav-link">
            <Columns3 size={17} /> <span className="label">Kanban</span>
            {mine > 0 && <span className="count" title="Mes tickets en file">{mine}</span>}
          </NavLink>
          <div className="nav-section">Conformité</div>
          <NavLink to="/events" className="nav-link">
            <ShieldCheck size={17} /> <span className="label">Journal d'audit</span>
          </NavLink>

          <div className="sidebar-footer">
            <div className="actor-switch">
              <Avatar name={actor} size="lg" />
              <div style={{ minWidth: 0, flex: 1 }}>
                <select value={actor} onChange={(e) => setActor(e.target.value)} aria-label="Agent connecté">
                  {!member && <option value={actor}>{actor}</option>}
                  {team.map((m) => (
                    <option key={m.name} value={m.name}>
                      {m.name}
                    </option>
                  ))}
                </select>
                <small>{member?.role ?? 'Agent'}</small>
              </div>
            </div>
            <div className="sidebar-tools">
              <button onClick={toggleTheme} aria-label="Changer de thème">
                {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
                <span>{theme === 'dark' ? 'Clair' : 'Sombre'}</span>
              </button>
            </div>
          </div>
        </aside>

        <div className="main">
          <header className="topbar">
            <button className="search-trigger" onClick={openPalette}>
              <Search size={16} />
              <span>Rechercher un ticket, une action…</span>
              <kbd>Ctrl K</kbd>
            </button>
            <div className="live" title="Les données se mettent à jour automatiquement">
              <span className="live-dot" /> Temps réel
            </div>
            <button className="btn btn-primary" onClick={openNewTicket} aria-label="Nouveau ticket">
              <Plus size={16} /> <span className="btn-label">Nouveau ticket</span> <kbd style={{ marginLeft: 4, background: 'transparent', color: 'inherit', borderColor: 'rgba(255,255,255,.35)', boxShadow: 'none' }}>N</kbd>
            </button>
          </header>
          <main className="content">
            <Outlet />
          </main>
        </div>
      </div>

      {newTicketOpen && (
        <Modal title="Nouveau ticket" onClose={closeNewTicket}>
          <div
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                e.currentTarget.querySelector('form')?.requestSubmit();
              }
            }}
          >
            <NewTicketForm team={team} submitting={create.isPending} onSubmit={submitNewTicket} onCancel={closeNewTicket} />
          </div>
        </Modal>
      )}
      {paletteOpen && <CommandPalette onClose={closePalette} onNewTicket={openNewTicket} />}
    </UiContext.Provider>
  );
};
