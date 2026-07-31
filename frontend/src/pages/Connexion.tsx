import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { login, signup } from '../api';
import { useAuth } from '../AuthContext';
import { t } from '../i18n';

function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      {off ? (
        <>
          <path d="M2 2l20 20" />
          <path d="M9.9 5.2A9.9 9.9 0 0 1 12 5c6 0 10 7 10 7a17.6 17.6 0 0 1-3.2 3.9M6.5 6.6C3.6 8.4 2 12 2 12s4 7 10 7a9.6 9.6 0 0 0 4.4-1" />
          <path d="M14.1 14.1a3 3 0 1 1-4.2-4.2" />
        </>
      ) : (
        <>
          <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z" />
          <circle cx="12" cy="12" r="3" />
        </>
      )}
    </svg>
  );
}

export function Connexion() {
  const { user } = useAuth();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [pseudo, setPseudo] = useState('');
  const [nom, setNom] = useState('');
  const [prenom, setPrenom] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Full page navigation (not a client-side redirect) — the fresh load of
  // /telemetrie re-fetches auth state itself, no need to carry it over via context.
  useEffect(() => {
    if (user) window.location.replace('/telemetrie');
  }, [user]);

  if (user) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      mode === 'login' ? await login({ email, password }) : await signup({ email, pseudo, nom, prenom, password });
      window.location.href = '/telemetrie';
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="pill-tabs">
          <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>
            {t('auth.tabLogin')}
          </button>
          <button type="button" className={mode === 'signup' ? 'active' : ''} onClick={() => setMode('signup')}>
            {t('auth.tabSignup')}
          </button>
        </div>

        <div className="auth-heading">
          <h1>{mode === 'login' ? t('auth.loginTitle') : t('auth.signupTitle')}</h1>
          <p>{mode === 'login' ? t('auth.loginSubtitle') : t('auth.signupSubtitle')}</p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit} key={mode}>
          <label className="auth-field">
            <span>{t('auth.email')}</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
          </label>

          {mode === 'signup' && (
            <>
              <label className="auth-field">
                <span>{t('auth.pseudo')}</span>
                <input value={pseudo} onChange={(e) => setPseudo(e.target.value)} required minLength={3} maxLength={32} />
              </label>
              <div className="auth-field-row">
                <label className="auth-field">
                  <span>{t('auth.firstName')}</span>
                  <input value={prenom} onChange={(e) => setPrenom(e.target.value)} required />
                </label>
                <label className="auth-field">
                  <span>{t('auth.lastName')}</span>
                  <input value={nom} onChange={(e) => setNom(e.target.value)} required />
                </label>
              </div>
            </>
          )}

          <label className="auth-field">
            <span>{t('auth.password')}</span>
            <div className="auth-password-wrap">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                required
                minLength={8}
                maxLength={72}
              />
              <button
                type="button"
                className="auth-password-toggle"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
              >
                <EyeIcon off={showPassword} />
              </button>
            </div>
          </label>

          {error && <div className="auth-error">{error}</div>}

          <button className="auth-submit" type="submit" disabled={submitting}>
            {submitting && <span className="spinner" />}
            {submitting ? t('common.patience') : mode === 'login' ? t('auth.submitLogin') : t('auth.submitSignup')}
          </button>

          {mode === 'login' && (
            <a href="/forgot-password" className="auth-forgot-link">
              {t('auth.forgotPassword')}
            </a>
          )}
        </form>
      </div>
    </div>
  );
}
