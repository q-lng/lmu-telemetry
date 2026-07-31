import { useState } from 'react';
import {
  acceptFriendRequest,
  declineFriendRequest,
  followUser,
  removeFriend,
  sendFriendRequest,
  unfollowUser,
} from '../api';
import type { ProfileSummary } from '../types';
import { t } from '../i18n';

interface Props {
  profile: ProfileSummary;
  onChange: () => void;
}

/** Friend + follow action buttons for a user row/profile — the two relations are
 * independent (a follow can exist regardless of friend status and vice versa). */
export function RelationActions({ profile, onChange }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      onChange();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relation-actions">
      <div className="relation-actions-row">
        {profile.isFriend ? (
          <button disabled={busy} onClick={() => run(() => removeFriend(profile.id))}>
            {t('friends.friendRemove')}
          </button>
        ) : profile.requestState === 'sent' ? (
          <button disabled={busy} onClick={() => run(() => declineFriendRequest(profile.friendRequestId!))}>
            {t('friends.requestSentCancel')}
          </button>
        ) : profile.requestState === 'received' ? (
          <>
            <button className="relation-accept" disabled={busy} onClick={() => run(() => acceptFriendRequest(profile.friendRequestId!))}>
              {t('friends.accept')}
            </button>
            <button disabled={busy} onClick={() => run(() => declineFriendRequest(profile.friendRequestId!))}>
              {t('friends.decline')}
            </button>
          </>
        ) : (
          <button disabled={busy} onClick={() => run(() => sendFriendRequest(profile.pseudo))}>
            {t('friends.add')}
          </button>
        )}

        <button disabled={busy} onClick={() => run(() => (profile.isFollowing ? unfollowUser(profile.pseudo) : followUser(profile.pseudo)))}>
          {profile.isFollowing ? t('follows.unfollow') : t('follows.follow')}
        </button>
      </div>
      {error && <div className="auth-error">{error}</div>}
    </div>
  );
}
