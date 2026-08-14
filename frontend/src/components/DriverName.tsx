import { Link } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { CheckIcon } from './icons';

interface Props {
  driverName: string | null;
  matchedUser: { pseudo: string } | null;
}

/** Renders a lap's raw DriverName, plus — when it matches a registered
 * account's LMU pseudo — a link to that account's site profile. The extra
 * color/icon only appears when the match is the current viewer's own
 * account, so other players' matched rows don't get visually noisier. */
export function DriverName({ driverName, matchedUser }: Props) {
  const { user } = useAuth();

  if (!matchedUser) return <>{driverName ?? '–'}</>;

  const isYou = user?.pseudo === matchedUser.pseudo;
  const content = (
    <>
      {driverName} (
      <Link to={`/u/${encodeURIComponent(matchedUser.pseudo)}`} className="driver-matched-link">
        {matchedUser.pseudo}
      </Link>
      )
    </>
  );

  if (!isYou) return content;

  return (
    <span className="leaderboard-you">
      <CheckIcon size={12} />
      {content}
    </span>
  );
}
