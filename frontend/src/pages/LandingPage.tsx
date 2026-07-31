import { t } from '../i18n';

const FEATURE_KEYS = [
  { title: 'landing.features.0.title', text: 'landing.features.0.text' },
  { title: 'landing.features.1.title', text: 'landing.features.1.text' },
  { title: 'landing.features.2.title', text: 'landing.features.2.text' },
  { title: 'landing.features.3.title', text: 'landing.features.3.text' },
] as const;

export function LandingPage() {
  return (
    <div className="landing">
      <section className="landing-hero">
        <h1>{t('landing.heroTitle')}</h1>
        <p>{t('landing.heroSubtitle')}</p>
        <a href="/telemetrie" className="landing-cta">
          {t('landing.cta')}
        </a>
      </section>
      <section className="landing-features">
        {FEATURE_KEYS.map((f) => (
          <article key={f.title} className="landing-feature-card">
            <h3>{t(f.title)}</h3>
            <p>{t(f.text)}</p>
          </article>
        ))}
      </section>
    </div>
  );
}
