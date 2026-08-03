import type { ReactNode } from 'react';
import { ChevronIcon } from './icons';

interface Props {
  title: string;
  collapsed: boolean;
  onToggle: () => void;
  children: ReactNode;
}

/** A labeled, collapsible sidebar section — same shape for every category
 * (presets, laps, color mode, ...) so the user can hide whichever ones they
 * don't care about right now instead of scrolling past all of them. */
export function CollapsibleSection({ title, collapsed, onToggle, children }: Props) {
  return (
    <div className="sidebar-section">
      <button type="button" className="sidebar-section-header" onClick={onToggle} aria-expanded={!collapsed}>
        <span className={`sidebar-section-chevron${collapsed ? ' collapsed' : ''}`}>
          <ChevronIcon />
        </span>
        <span className="sidebar-section-title">{title}</span>
      </button>
      {!collapsed && <div className="sidebar-section-body">{children}</div>}
    </div>
  );
}
