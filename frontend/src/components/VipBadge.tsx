import type { Plan } from '../types';
import { t } from '../i18n';
import { CrownIcon } from './icons';

/** Small crown next to a pseudo wherever one is shown for a VIP user — shared
 * so the navbar, profile page, and friends/follows lists all agree instead of
 * only the navbar (for yourself) ever rendering it. */
export function VipBadge({ plan }: { plan: Plan }) {
  if (plan !== 'vip') return null;
  return (
    <span className="vip-badge" title={t('nav.vipBadge')}>
      <CrownIcon />
    </span>
  );
}
