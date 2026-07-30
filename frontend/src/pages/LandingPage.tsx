import { Link } from 'react-router-dom';

const FEATURES = [
  {
    title: 'Canaux synchronisés',
    text: 'Tous les canaux de télémétrie superposés sur un curseur temporel commun, façon MoTeC i2.',
  },
  {
    title: 'Carte du circuit',
    text: 'Position GPS en direct, avec la portion de piste actuellement affichée dans les graphes mise en évidence.',
  },
  {
    title: 'Comparaison de tours',
    text: 'Superposez deux tours, ou deux fichiers de session, pour comparer vos lignes et vos réglages.',
  },
  {
    title: 'Mode invité sans upload',
    text: "Chargez un fichier .duckdb directement dans le navigateur — rien n'est envoyé au serveur.",
  },
];

export function LandingPage() {
  return (
    <div className="landing">
      <section className="landing-hero">
        <h1>Télémétrie Le Mans Ultimate, façon MoTeC i2</h1>
        <p>Ouvrez vos sessions .duckdb, visualisez tous les canaux, comparez vos tours.</p>
        <Link to="/app" className="landing-cta">
          Ouvrir l'application
        </Link>
      </section>
      <section className="landing-features">
        {FEATURES.map((f) => (
          <article key={f.title} className="landing-feature-card">
            <h3>{f.title}</h3>
            <p>{f.text}</p>
          </article>
        ))}
      </section>
    </div>
  );
}
