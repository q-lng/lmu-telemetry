import { useState } from 'react';
import type { FormEvent } from 'react';
import { resetPassword } from '../api';
import { t } from '../i18n';

export function ResetPassword() {
  const token = new URLSearchParams(window.location.search).get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError(t('resetPassword.mismatch'));
      return;
    }
    setSubmitting(true);
    try {
      await resetPassword(token, password);
      window.location.href = '/login';
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  }

  if (!token) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="social-empty">{t('resetPassword.invalidLink')}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-heading">
          <h1>{t('resetPassword.title')}</h1>
          <p>{t('resetPassword.subtitle')}</p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="auth-field">
            <span>{t('resetPassword.newPasswordLabel')}</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
              minLength={8}
              maxLength={72}
            />
          </label>

          <label className="auth-field">
            <span>{t('resetPassword.confirmLabel')}</span>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              required
              minLength={8}
              maxLength={72}
            />
          </label>

          {error && <div className="auth-error">{error}</div>}

          <button className="auth-submit" type="submit" disabled={submitting}>
            {submitting && <span className="spinner" />}
            {submitting ? t('common.patience') : t('resetPassword.submit')}
          </button>
        </form>
      </div>
    </div>
  );
}
