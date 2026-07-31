import { useState } from 'react';
import type { FormEvent } from 'react';
import { requestPasswordReset } from '../api';

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
          <h1>Mot de passe oublié</h1>
          <p>Indique ton email, on t'envoie un lien pour en choisir un nouveau.</p>
        </div>

        {done ? (
          <div className="field-hint">
            Si un compte existe avec cet email, un lien de réinitialisation vient d'être envoyé.
          </div>
        ) : (
          <form className="auth-form" onSubmit={handleSubmit}>
            <label className="auth-field">
              <span>Email</span>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
            </label>

            <button className="auth-submit" type="submit" disabled={submitting}>
              {submitting && <span className="spinner" />}
              {submitting ? 'Envoi…' : 'Envoyer le lien'}
            </button>

            <a href="/connexion" className="auth-forgot-link">
              Retour à la connexion
            </a>
          </form>
        )}
      </div>
    </div>
  );
}
