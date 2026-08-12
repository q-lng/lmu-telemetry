export function LegalNotice() {
  return (
    <div className="page-shell legal-page">
      <h1>Legal Notice</h1>
      <p className="field-hint">Last updated: August 2026</p>

      <section>
        <h2 className="social-subheading">Site publisher</h2>
        <p>
          This site is published by QLNG, an individual, as a personal, non-commercial project.
          <br />
          Contact: <a href="mailto:contact@qlng.fr">contact@qlng.fr</a>
        </p>
      </section>

      <section>
        <h2 className="social-subheading">Hosting</h2>
        <p>
          This service is currently self-hosted by its publisher. This section will be updated with the relevant
          hosting provider details if and when the service moves to dedicated third-party hosting.
        </p>
      </section>

      <section>
        <h2 className="social-subheading">Intellectual property</h2>
        <p>
          The site's own code, design, and original content are the property of QLNG, except where otherwise noted.
        </p>
        <p>
          Telemetry files, photos, and any other content uploaded by users remain the property of the user who
          uploaded them. See the{' '}
          <a href="/legal/terms">Terms of Service</a> for the license granted to the site to store and display that
          content.
        </p>
      </section>

      <section>
        <h2 className="social-subheading">Trademarks and non-affiliation</h2>
        <p>
          <strong>Le Mans Ultimate</strong> and any related names, logos, cars, tracks, and other in-game assets are
          trademarks and/or copyrighted material of Studio 397 and/or Motorsport Games, their respective publishers,
          licensors, or successors. Car manufacturer names and logos referenced or displayed on this site (for
          example, in the car catalog) are trademarks of their respective owners.
        </p>
        <p>
          This is an unofficial, fan-made, non-commercial community tool. It is not affiliated with, endorsed by,
          sponsored by, or otherwise connected to Studio 397, Motorsport Games, any car manufacturer, or any other
          rights holder mentioned above. All such names and marks are used solely to identify the game and content
          this site is built around.
        </p>
        <p className="field-hint">
          Rights holder names above are provided in good faith and may not reflect the exact current corporate entity
          — if you are a rights holder and believe this notice needs correction or if you have any concern about
          content on this site, please contact us at{' '}
          <a href="mailto:contact@qlng.fr">contact@qlng.fr</a>.
        </p>
      </section>
    </div>
  );
}
