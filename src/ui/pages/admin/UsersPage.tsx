import { Download, FileDown, FileUp, KeyRound, Search, UserPlus, Users } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { ROLES, type Role } from '../../../domain';
import { Avatar } from '../../components/Badges';
import { EmptyState, LoadingRows } from '../../components/EmptyState';
import { Modal } from '../../components/Modal';
import { api, errorMessage, type ImportReportDto, type UserDto } from '../../lib/api';
import { downloadFile, downloadJson, parseUsersCsv } from '../../lib/download';
import { useToast } from '../../lib/toast';
import { useAuth } from '../../lib/auth';
import { ROLE_LABELS } from '../../lib/format';
import { useCommand, useUsers } from '../../lib/hooks';

type RoleFilter = 'ALL' | Role;

const NewUserForm = ({ onDone }: { onDone: () => void }) => {
  const [form, setForm] = useState({ name: '', email: '', role: 'EMPLOYEE' as Role, department: '', jobTitle: '', password: '' });
  const create = useCommand((input: typeof form) => api.admin.createUser.mutate(input), (u) => `Compte créé pour ${u.name}`);
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate(form, { onSuccess: onDone });
  };
  return (
    <form onSubmit={submit} className="modal-body" style={{ padding: 0 }} aria-label="Nouveau compte">
      <div className="grid-2">
        <label className="field">
          <span>Nom complet *</span>
          <input className="input" data-autofocus required value={form.name} onChange={set('name')} />
        </label>
        <label className="field">
          <span>E-mail professionnel *</span>
          <input className="input" type="email" required value={form.email} onChange={set('email')} />
        </label>
      </div>
      <div className="grid-2">
        <label className="field">
          <span>Service</span>
          <input className="input" value={form.department} onChange={set('department')} placeholder="Comptabilité, DSI…" />
        </label>
        <label className="field">
          <span>Fonction</span>
          <input className="input" value={form.jobTitle} onChange={set('jobTitle')} />
        </label>
      </div>
      <div className="grid-2">
        <label className="field">
          <span>Profil</span>
          <select className="select" value={form.role} onChange={set('role')}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>
            Mot de passe provisoire * <span className="help">8 car. min., lettres et chiffres</span>
          </span>
          <input className="input" type="text" autoComplete="new-password" required value={form.password} onChange={set('password')} />
        </label>
      </div>
      <div className="modal-foot" style={{ margin: '4px -20px -18px' }}>
        <button type="button" className="btn" onClick={onDone}>
          Annuler
        </button>
        <button type="submit" className="btn btn-primary" disabled={create.isPending}>
          Créer le compte
        </button>
      </div>
    </form>
  );
};

const ResetPassword = ({ user, onDone }: { user: UserDto; onDone: () => void }) => {
  const [password, setPassword] = useState('');
  const reset = useCommand(
    (p: string) => api.admin.resetPassword.mutate({ userId: user.id, password: p }),
    `Mot de passe de ${user.name} réinitialisé`,
  );
  return (
    <Modal
      title={`Nouveau mot de passe — ${user.name}`}
      size="sm"
      onClose={onDone}
      footer={
        <>
          <button className="btn" onClick={onDone}>
            Annuler
          </button>
          <button className="btn btn-primary" disabled={!password || reset.isPending} onClick={() => reset.mutate(password, { onSuccess: onDone })}>
            Enregistrer
          </button>
        </>
      }
    >
      <label className="field">
        <span>Mot de passe provisoire</span>
        <input className="input" data-autofocus type="text" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      <p className="muted small">Communiquez-le à l’utilisateur par un canal sûr.</p>
    </Modal>
  );
};

const CSV_TEMPLATE = 'nom;email;profil;service;fonction\nJulie Bernard;julie.bernard@entreprise.fr;Employé;RH;Chargée de recrutement\n';

/** Import en masse depuis l'export de l'annuaire RH (CSV Excel). */
const ImportUsers = ({ onDone }: { onDone: () => void }) => {
  const [parsed, setParsed] = useState<ReturnType<typeof parseUsersCsv> | null>(null);
  const [report, setReport] = useState<ImportReportDto | null>(null);
  const run = useCommand((rows: ReturnType<typeof parseUsersCsv>['rows']) => api.admin.importUsers.mutate({ rows: [...rows] }), (r) => `${r.created.length} compte(s) créé(s)`);

  const credentials = () =>
    downloadFile(
      'identifiants-provisoires.csv',
      '\uFEFFnom;email;mot de passe provisoire\n' + (report?.created ?? []).map((u) => `${u.name};${u.email};${u.temporaryPassword}`).join('\n'),
      'text/csv;charset=utf-8',
    );

  return (
    <Modal
      title="Importer des comptes (CSV)"
      onClose={onDone}
      footer={
        report ? (
          <>
            {report.created.length > 0 && (
              <button className="btn" onClick={credentials}>
                <FileDown size={15} /> Identifiants provisoires
              </button>
            )}
            <button className="btn btn-primary" onClick={onDone}>
              Terminer
            </button>
          </>
        ) : (
          <>
            <button className="btn" onClick={onDone}>
              Annuler
            </button>
            <button
              className="btn btn-primary"
              disabled={!parsed?.rows.length || run.isPending}
              onClick={() => parsed && run.mutate(parsed.rows, { onSuccess: setReport })}
            >
              Importer {parsed?.rows.length ? `${parsed.rows.length} compte(s)` : ''}
            </button>
          </>
        )
      }
    >
      {report ? (
        <div className="import-report">
          <p>
            <b>{report.created.length}</b> compte(s) créé(s), <b>{report.rejected.length}</b> ligne(s) ignorée(s).
          </p>
          {report.created.length > 0 && (
            <p className="muted small">Téléchargez les identifiants provisoires maintenant : ils ne seront plus affichés.</p>
          )}
          {report.rejected.length > 0 && (
            <ul className="small">
              {report.rejected.map((r) => (
                <li key={r.line}>
                  Ligne {r.line} ({r.email || 'sans e-mail'}) : {r.reason}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <>
          <p className="muted small" style={{ marginTop: 0 }}>
            Colonnes : <code>nom;email;profil;service;fonction</code> — profil : Employé, Agent ou Administrateur (Employé par défaut).{' '}
            <button type="button" className="link-button" onClick={() => downloadFile('modele-import-comptes.csv', '\uFEFF' + CSV_TEMPLATE, 'text/csv;charset=utf-8')}>
              Télécharger le modèle
            </button>
          </p>
          <label className="field">
            <span>Fichier CSV</span>
            <input
              className="input"
              type="file"
              accept=".csv,text/csv"
              aria-label="Fichier CSV"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                setParsed(file ? parseUsersCsv(await file.text()) : null);
              }}
            />
          </label>
          {parsed?.error && <div className="banner banner-danger" role="alert">{parsed.error}</div>}
          {parsed && !parsed.error && (
            <p className="small">
              {parsed.rows.length} ligne(s) détectée(s) : {parsed.rows.slice(0, 3).map((r) => r.name).join(', ')}
              {parsed.rows.length > 3 ? '…' : ''}
            </p>
          )}
        </>
      )}
    </Modal>
  );
};

export const UsersPage = () => {
  const { user: me } = useAuth();
  const { data: users, isPending } = useUsers();
  const [filter, setFilter] = useState<RoleFilter>('ALL');
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [resetting, setResetting] = useState<UserDto | null>(null);
  const [importing, setImporting] = useState(false);
  const toast = useToast();

  /** Réversibilité : toutes les données de l'instance, dans un format ouvert et vérifiable. */
  const exportAll = async () => {
    try {
      const data = await api.admin.exportAll.query();
      downloadJson(`helpdesk-export-${data.exportedAt.slice(0, 10)}.json`, data);
      toast.success(`Export complet : ${data.counts.events} événements, ${data.counts.users} comptes, ${data.counts.articles} articles`);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  /** RGPD : données d'une personne (droit d'accès / portabilité). */
  const exportPerson = async (u: UserDto) => {
    try {
      downloadJson(`donnees-${u.email}.json`, await api.admin.exportPerson.query({ userId: u.id }));
      toast.success(`Données de ${u.name} exportées`);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const update = useCommand(
    (input: { userId: string; role?: Role; active?: boolean }) => api.admin.updateUser.mutate(input),
    (u) => `Compte de ${u.name} mis à jour`,
  );

  const counts = useMemo(() => {
    const all = users ?? [];
    return { ALL: all.length, ...Object.fromEntries(ROLES.map((r) => [r, all.filter((u) => u.role === r).length])) } as Record<RoleFilter, number>;
  }, [users]);

  const visible = (users ?? []).filter((u) => {
    if (filter !== 'ALL' && u.role !== filter) return false;
    const q = search.trim().toLowerCase();
    return !q || `${u.name} ${u.email} ${u.department}`.toLowerCase().includes(q);
  });

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Utilisateurs</h1>
          <p>Comptes des collaborateurs (portail) et de l’équipe DSI (back-office).</p>
        </div>
        <div className="head-actions">
          <button className="btn" onClick={exportAll} title="Toutes les données (tickets, journal scellé, comptes, articles) au format JSON">
            <Download size={16} /> Export complet
          </button>
          <button className="btn" onClick={() => setImporting(true)}>
            <FileUp size={16} /> Importer (CSV)
          </button>
          <button className="btn btn-primary" onClick={() => setCreating(true)}>
            <UserPlus size={16} /> Nouveau compte
          </button>
        </div>
      </header>

      <section className="card">
        <div className="toolbar">
          <div className="search-input">
            <Search size={16} />
            <input className="input" aria-label="Rechercher un utilisateur" placeholder="Nom, e-mail, service…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="views" role="group" aria-label="Profil">
            {(['ALL', ...ROLES] as RoleFilter[]).map((r) => (
              <button key={r} className="view-chip" aria-pressed={filter === r} onClick={() => setFilter(r)}>
                {r === 'ALL' ? 'Tous' : ROLE_LABELS[r]} <span className="n">{counts[r]}</span>
              </button>
            ))}
          </div>
        </div>
        {isPending ? (
          <LoadingRows />
        ) : visible.length === 0 ? (
          <EmptyState icon={Users} title="Aucun compte ne correspond" />
        ) : (
          <div className="table-wrap">
            <table className="data static">
              <thead>
                <tr>
                  <th>Utilisateur</th>
                  <th>Service</th>
                  <th>Profil</th>
                  <th>Statut</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {visible.map((u) => {
                  const self = u.id === me?.id;
                  return (
                    <tr key={u.id} className={u.active ? '' : 'inactive'}>
                      <td>
                        <span className="person">
                          <Avatar name={u.name} />
                          <span className="cell-title" style={{ minWidth: 0 }}>
                            <strong>
                              {u.name} {self && <span className="tag">vous</span>}
                            </strong>
                            <span className="muted small">{u.email}</span>
                          </span>
                        </span>
                      </td>
                      <td>
                        <span className="small">{u.department || '—'}</span>
                        {u.jobTitle && <div className="muted small">{u.jobTitle}</div>}
                      </td>
                      <td>
                        <select
                          className="select filter-select"
                          aria-label={`Profil de ${u.name}`}
                          value={u.role}
                          disabled={self}
                          onChange={(e) => update.mutate({ userId: u.id, role: e.target.value as Role })}
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>
                              {ROLE_LABELS[r]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <label className="switch">
                          <input
                            type="checkbox"
                            role="switch"
                            aria-label={`Compte de ${u.name} actif`}
                            checked={u.active}
                            disabled={self}
                            onChange={(e) => update.mutate({ userId: u.id, active: e.target.checked })}
                          />
                          <span>{u.active ? 'Actif' : 'Désactivé'}</span>
                        </label>
                      </td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button className="btn btn-sm" onClick={() => setResetting(u)}>
                          <KeyRound size={14} /> Mot de passe
                        </button>{' '}
                        <button className="btn btn-sm btn-icon" aria-label={`Exporter les données de ${u.name} (RGPD)`} title="Exporter ses données (RGPD)" onClick={() => exportPerson(u)}>
                          <FileDown size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {creating && (
        <Modal title="Nouveau compte" onClose={() => setCreating(false)}>
          <NewUserForm onDone={() => setCreating(false)} />
        </Modal>
      )}
      {resetting && <ResetPassword user={resetting} onDone={() => setResetting(null)} />}
      {importing && <ImportUsers onDone={() => setImporting(false)} />}
    </>
  );
};
