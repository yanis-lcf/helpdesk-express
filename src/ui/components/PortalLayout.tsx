import { BookOpen, LayoutDashboard, LogOut, Moon, Plus, Sun, Ticket, Zap } from 'lucide-react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useSession } from '../lib/session';
import { Avatar } from './Badges';

/** Espace employé : volontairement simple, sans aucun vocabulaire technique de la DSI. */
export const PortalLayout = () => {
  const { user, isStaff, logout } = useAuth();
  const { theme, toggleTheme } = useSession();
  const navigate = useNavigate();

  return (
    <div className="portal">
      <header className="portal-bar">
        <Link to="/portal" className="portal-brand">
          <span className="brand-mark">
            <Zap size={16} fill="currentColor" />
          </span>
          <span>
            HelpDesk Express <small>Espace support</small>
          </span>
        </Link>
        <nav className="portal-nav" aria-label="Portail">
          <NavLink to="/portal" end>
            <Ticket size={16} /> <span>Mes demandes</span>
          </NavLink>
          <NavLink to="/portal/help">
            <BookOpen size={16} /> <span>Centre d’aide</span>
          </NavLink>
          {isStaff && (
            <NavLink to="/dashboard">
              <LayoutDashboard size={16} /> <span>Back-office DSI</span>
            </NavLink>
          )}
        </nav>
        <div className="portal-user">
          <Link to="/portal/new" className="btn btn-primary btn-sm">
            <Plus size={15} /> <span className="btn-label">Nouvelle demande</span>
          </Link>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={toggleTheme} aria-label="Changer de thème">
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <span className="portal-me" title={user?.email}>
            <Avatar name={user?.name ?? null} />
            <span>
              <b>{user?.name}</b>
              <small>{user?.department}</small>
            </span>
          </span>
          <button
            className="btn btn-ghost btn-icon btn-sm"
            aria-label="Se déconnecter"
            title="Se déconnecter"
            onClick={async () => {
              await logout();
              navigate('/login', { replace: true });
            }}
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>
      <main className="portal-content">
        <Outlet />
      </main>
    </div>
  );
};
