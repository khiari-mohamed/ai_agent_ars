import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  failed: boolean;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error): void {
    if (typeof globalThis.reportError === 'function') globalThis.reportError(error);
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className="min-h-screen flex items-center justify-center bg-[#f7f4f2] p-8">
        <div className="max-w-sm text-center">
          <h1 className="text-xl font-semibold text-slate-900 mb-2">Une erreur est survenue</h1>
          <p className="text-sm text-slate-500 mb-6">
            L&apos;application a rencontré un problème inattendu. Rechargez la page pour continuer.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-lg bg-[#d62121] px-4 py-2 text-sm font-medium text-white hover:bg-[#a91717] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300 focus-visible:ring-offset-2"
          >
            Recharger la page
          </button>
        </div>
      </div>
    );
  }
}
