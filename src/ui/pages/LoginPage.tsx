import { Eye, EyeOff, Fingerprint, LockKeyhole, Moon, ShieldCheck, Sun, Ticket, Zap } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { errorMessage } from '../lib/api';
import { homeFor, useAuth } from '../lib/auth';
import { useSession } from '../lib/session';

/** Comptes de démonstration : affichés uniquement en développement (ou si VITE_SHOW_DEMO=true). */
const SHOW_DEMO = import.meta.env.DEV || import.meta.env.VITE_SHOW_DEMO === 'true';
const DEMO_ACCOUNTS = [
  { label: 'Employée', who: 'Claire Dubois · Commercial', email: 'claire.dubois@demo.fr' },
  { label: 'Agent DSI', who: 'Sarah Benali · Technicienne N2', email: 'sarah.benali@demo.fr' },
  { label: 'Admin DSI', who: 'Yanis Loucif · Responsable support', email: 'yanis.loucif@demo.fr' },
];
const DEMO_PASSWORD = 'demo2026';

export const LoginPage = () => {
  const { user, login } = useAuth();
  const { theme, toggleTheme } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // Déjà connecté en arrivant sur la page : direction l'espace du profil (pas pendant une connexion en cours,
  // c'est alors `submit` qui choisit la destination).
  if (user && !pending) return <Navigate to={homeFor(user)} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const me = await login(email, password);
      // Retour à la page demandée seulement si elle correspond à l'espace du profil connecté.
      const home = homeFor(me);
      const allowed = from && (home === '/portal' ? from.startsWith('/portal') : true);
      navigate(allowed ? from : home, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      setPending(false);
    }
  };

  return (
    <div className="login">
      <section className="login-hero" aria-hidden="true">
        <div className="brand">
          <span className="brand-mark">
            <Zap size={18} fill="currentColor" />
          </span>
          <div>
            HelpDesk Express
            <small>Support informatique</small>
          </div>
        </div>
        <div className="login-pitch">
          <h1>
            Un incident ? <span>Déclaré en 30 secondes,</span> suivi jusqu’à sa résolution.
          </h1>
          <ul>
            <li>
              <Ticket size={16} /> Portail employé : déclarez et suivez vos demandes
            </li>
            <li>
              <ShieldCheck size={16} /> Back-office DSI : priorités, SLA, Kanban, audit
            </li>
            <li>
              <Fingerprint size={16} /> Chaque action est tracée et scellée (SHA-256)
            </li>
          </ul>
        </div>
        <small className="login-foot">Accès réservé aux collaborateurs de l’entreprise.</small>
      </section>

      <section className="login-panel">
        <button className="btn btn-ghost btn-icon login-theme" onClick={toggleTheme} aria-label="Changer de thème">
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        <form className="login-form" onSubmit={submit} aria-label="Connexion">
          <div>
            <h1>Connexion</h1>
            <p className="muted">Utilisez votre adresse e-mail professionnelle.</p>
          </div>

          {error && (
            <div className="banner banner-danger" role="alert">
              <LockKeyhole size={16} /> {error}
            </div>
          )}

          <label className="field">
            <span>Adresse e-mail</span>
            <input
              className="input"
              type="email"
              autoComplete="username"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="prenom.nom@entreprise.fr"
            />
          </label>
          <label className="field">
            <span>Mot de passe</span>
            <div className="password-input">
              <input
                className="input"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="btn btn-ghost btn-icon btn-sm"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </label>
          <button className="btn btn-primary login-submit" type="submit" disabled={pending}>
            {pending ? 'Connexion…' : 'Se connecter'}
          </button>

          {SHOW_DEMO && (
            <div className="demo-accounts">
              <span>Comptes de démonstration · mot de passe <code>{DEMO_PASSWORD}</code></span>
              {DEMO_ACCOUNTS.map((a) => (
                <button
                  type="button"
                  key={a.email}
                  className="demo-account"
                  onClick={() => {
                    setEmail(a.email);
                    setPassword(DEMO_PASSWORD);
                  }}
                >
                  <b>{a.label}</b>
                  <span>{a.who}</span>
                </button>
              ))}
            </div>
          )}
        </form>
      </section>
    </div>
  );
};
