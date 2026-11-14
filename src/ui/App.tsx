import { Zap } from 'lucide-react';
import type { ReactNode } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { Layout } from './components/Layout';
import { PortalLayout } from './components/PortalLayout';
import { homeFor, useAuth } from './lib/auth';
import { UsersPage } from './pages/admin/UsersPage';
import { AuditPage } from './pages/AuditPage';
import { BoardPage } from './pages/BoardPage';
import { DashboardPage } from './pages/DashboardPage';
import { LoginPage } from './pages/LoginPage';
import { PortalHomePage } from './pages/portal/PortalHomePage';
import { PortalNewTicketPage } from './pages/portal/PortalNewTicketPage';
import { PortalTicketPage } from './pages/portal/PortalTicketPage';
import { TicketDetailPage } from './pages/TicketDetailPage';
import { TicketsPage } from './pages/TicketsPage';

const Splash = () => (
  <div className="splash" aria-busy="true" aria-label="Chargement">
    <span className="brand-mark">
      <Zap size={18} fill="currentColor" />
    </span>
  </div>
);

/** Toute l'application exige une session ; sinon, écran de connexion (en mémorisant la page demandée). */
const RequireAuth = () => {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Splash />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
};

/** Back-office : réservé à la DSI (le serveur refuse de toute façon les appels des autres profils). */
const StaffOnly = ({ children }: { children: ReactNode }) => {
  const { isStaff } = useAuth();
  return isStaff ? <>{children}</> : <Navigate to="/portal" replace />;
};

const AdminOnly = ({ children }: { children: ReactNode }) => {
  const { isAdmin } = useAuth();
  return isAdmin ? <>{children}</> : <Navigate to="/dashboard" replace />;
};

const Home = () => {
  const { user } = useAuth();
  return <Navigate to={user ? homeFor(user) : '/login'} replace />;
};

export const App = () => (
  <Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route element={<RequireAuth />}>
      <Route path="/portal" element={<PortalLayout />}>
        <Route index element={<PortalHomePage />} />
        <Route path="new" element={<PortalNewTicketPage />} />
        <Route path=":ticketId" element={<PortalTicketPage />} />
      </Route>
      <Route
        element={
          <StaffOnly>
            <Layout />
          </StaffOnly>
        }
      >
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/tickets" element={<TicketsPage />} />
        <Route path="/tickets/:ticketId" element={<TicketDetailPage />} />
        <Route path="/board" element={<BoardPage />} />
        <Route path="/events" element={<AuditPage />} />
        <Route
          path="/admin/users"
          element={
            <AdminOnly>
              <UsersPage />
            </AdminOnly>
          }
        />
      </Route>
      <Route path="*" element={<Home />} />
    </Route>
  </Routes>
);
