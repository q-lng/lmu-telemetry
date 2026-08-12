export function PrivacyPolicy() {
  return (
    <div className="page-shell legal-page">
      <h1>Privacy Policy</h1>
      <p className="field-hint">Last updated: August 2026</p>

      <section>
        <h2 className="social-subheading">Data controller</h2>
        <p>
          QLNG is the data controller for this site. Contact: <a href="mailto:contact@qlng.fr">contact@qlng.fr</a>
        </p>
      </section>

      <section>
        <h2 className="social-subheading">What we collect</h2>
        <ul>
          <li>
            <strong>Account data</strong>: email, pseudo, first/last name, hashed password, plan (free/VIP), profile
            visibility setting.
          </li>
          <li>
            <strong>Telemetry sessions you upload</strong>: the file itself and metadata extracted from it (track,
            car, recording time), plus whatever visibility you choose (private, friends, or public). A session file
            can contain the driver name(s) recorded by the game for everyone in that session — including people who
            are not registered users of this site (see "Third-party data in sessions" below).
          </li>
          <li>
            <strong>Social data</strong>: friend requests/friendships, follows/followers, and notifications generated
            from those.
          </li>
          <li>
            <strong>Preferences</strong>: display/UI settings you configure (theme, layout, etc.), stored against
            your account so they follow you between devices.
          </li>
          <li>
            <strong>Authentication data</strong>: a session cookie (a random token, hashed before storage) used to
            keep you logged in; the login session's creation time, and optionally the browser user-agent and IP
            address associated with it, kept for account security purposes (e.g. letting you review or revoke active
            sessions).
          </li>
        </ul>
        <p>
          We do not use advertising or analytics trackers. The only cookie set is the essential session cookie
          described above.
        </p>
      </section>

      <section>
        <h2 className="social-subheading">Why we process this data</h2>
        <p>
          To provide the service you signed up for (account, telemetry storage/viewing, social features) — this is
          necessary to perform our end of that arrangement. Authentication/security data is processed on the basis
          of our legitimate interest in keeping the service secure and accounts protected.
        </p>
      </section>

      <section>
        <h2 className="social-subheading">Third-party data in sessions</h2>
        <p>
          If you upload a session recorded with other drivers, it may contain their in-game driver name even though
          they never created an account here. If you are such a person and want that data removed, contact{' '}
          <a href="mailto:contact@qlng.fr">contact@qlng.fr</a> and we will remove or anonymize it from the affected
          session(s).
        </p>
      </section>

      <section>
        <h2 className="social-subheading">Retention</h2>
        <p>
          Your data is kept for as long as your account is active. Deleting your account removes your account data;
          you can also delete individual sessions at any time, which removes them immediately.
        </p>
      </section>

      <section>
        <h2 className="social-subheading">Sharing and transfers</h2>
        <p>
          We do not sell or share your data with third parties for marketing purposes. Data is only accessible to
          the site's infrastructure/hosting. The service is currently self-hosted; if it moves to a third-party
          hosting provider, this policy will be updated with the relevant details, including of any transfer outside
          the EU/EEA if applicable.
        </p>
      </section>

      <section>
        <h2 className="social-subheading">Your rights</h2>
        <p>
          Under GDPR, you have the right to access, correct, delete, restrict, or export (portability) your personal
          data, and to object to certain processing. To exercise any of these rights, contact{' '}
          <a href="mailto:contact@qlng.fr">contact@qlng.fr</a>. You also have the right to lodge a complaint with your
          local data protection authority (in France, the{' '}
          <a href="https://www.cnil.fr" target="_blank" rel="noreferrer">
            CNIL
          </a>
          ).
        </p>
      </section>

      <section>
        <h2 className="social-subheading">Children</h2>
        <p>This service is not directed at children under 16.</p>
      </section>

      <section>
        <h2 className="social-subheading">Changes</h2>
        <p>
          This policy may be updated from time to time; the "last updated" date above reflects the latest revision.
        </p>
      </section>
    </div>
  );
}
