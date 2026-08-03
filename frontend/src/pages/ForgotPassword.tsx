import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { requestPasswordReset } from '../api';
import { t } from '../i18n';

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await requestPasswordReset(email);
    } finally {
      // Same outcome shown whether or not the email matches an account — the
      // backend already responds identically either way, no enumeration here.
      setSubmitting(false);
      setDone(true);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-heading">
          <h1>{t('forgotPassword.title')}</h1>
          <p>{t('forgotPassword.subtitle')}</p>
        </div>

        {done ? (
          <div className="field-hint">{t('forgotPassword.done')}</div>
        ) : (
          <form className="auth-form" onSubmit={handleSubmit}>
            <label className="auth-field">
              <span>{t('auth.email')}</span>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
            </label>

            <button className="auth-submit" type="submit" disabled={submitting}>
              {submitting && <span className="spinner" />}
              {submitting ? t('forgotPassword.sending') : t('forgotPassword.submit')}
            </button>

            <Link to="/login" className="auth-forgot-link">
              {t('forgotPassword.backToLogin')}
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}
