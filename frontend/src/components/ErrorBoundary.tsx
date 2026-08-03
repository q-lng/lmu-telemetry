import { Component } from 'react';
import type { ReactNode } from 'react';
import { t } from '../i18n';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

// Class component required — React error boundaries have no hook equivalent.
// Mounted at the very root (main.tsx, outside the router/providers) so a
// crash anywhere — a corrupt saved preset, a bad response shape, anything —
// shows a recoverable message instead of a blank white page.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: { componentStack?: string | null }) {
    // eslint-disable-next-line no-console
    console.error('Uncaught render error:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="crash-screen">
          <p>{t('errorBoundary.message')}</p>
          <button className="upload-btn" onClick={() => window.location.reload()}>
            {t('errorBoundary.reload')}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
