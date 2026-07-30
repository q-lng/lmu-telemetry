import { useState } from 'react';
import type { FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { login, signup } from '../api';
import { useAuth } from '../AuthContext';

export function Connexion() {
  const { user, setUser } = useAuth();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pseudo, setPseudo] = useState('');
  const [nom, setNom] = useState('');
  const [prenom, setPrenom] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to="/app" replace />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const u = mode === 'login' ? await login({ email, password }) : await signup({ email, pseudo, nom, prenom, password });
      setUser(u);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="segmented auth-tabs">
        <button className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>
          Connexion
        </button>
        <button className={mode === 'signup' ? 'active' : ''} onClick={() => setMode('signup')}>
          Créer un compte
        </button>
      </div>

      <form className="auth-form" onSubmit={handleSubmit}>
        <label className="field">
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>

        {mode === 'signup' && (
          <>
            <label className="field">
              Pseudo
              <input value={pseudo} onChange={(e) => setPseudo(e.target.value)} required minLength={3} maxLength={32} />
            </label>
            <label className="field">
              Prénom
              <input value={prenom} onChange={(e) => setPrenom(e.target.value)} required />
            </label>
            <label className="field">
              Nom
              <input value={nom} onChange={(e) => setNom(e.target.value)} required />
            </label>
          </>
        )}

        <label className="field">
          Mot de passe
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} maxLength={72} />
        </label>

        {error && <div className="auth-error">{error}</div>}

        <button className="upload-btn" type="submit" disabled={submitting}>
          {submitting ? 'Patiente…' : mode === 'login' ? 'Se connecter' : 'Créer mon compte'}
        </button>
      </form>
    </div>
  );
}
