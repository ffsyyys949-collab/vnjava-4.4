import React, { Component } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.warn('ErrorBoundary caught error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#080808] text-white flex flex-col items-center justify-center p-6 text-center">
          <div className="bg-[#141414] border border-white/10 rounded-[24px] p-6 max-w-sm w-full">
            <h2 className="text-lg font-bold mb-2">Terjadi Kesalahan Tampilan</h2>
            <p className="text-xs text-white/50 mb-4">{this.state.error?.message || 'Error tidak terduga'}</p>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              className="bg-white text-black px-5 py-2 rounded-full text-xs font-bold hover:bg-white/90 active:scale-95 transition"
            >
              Muat Ulang
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

import { MusicProvider } from './contexts/MusicContext.tsx';
import { initFpsEngine } from './contexts/fpsEngine.ts';

// Native APK Bridge: when running from bundled WebViewAssetLoader (appassets.androidplatform.net),
// route relative /api/*, /uploads/*, SSE, and WebSocket traffic to the live backend server.
if (typeof window !== 'undefined' && window.location.hostname === 'appassets.androidplatform.net') {
  const nativeBridge = (window as any).ZeNative;
  const rawBase =
    (typeof nativeBridge?.getApiBaseUrl === 'function' ? nativeBridge.getApiBaseUrl() : '') ||
    'https://ais-pre-nboc4t2l7qh2anzmftg6cm-837755722968.asia-northeast1.run.app';
  const apiBase = String(rawBase).replace(/\/+$/, '');

  const rewritePathToApiBase = (url: string): string => {
    if (url.startsWith('https://appassets.androidplatform.net/') || url.startsWith('http://appassets.androidplatform.net/')) {
      try {
        const parsed = new URL(url);
        if (parsed.pathname.startsWith('/api/') || parsed.pathname === '/api' || parsed.pathname.startsWith('/uploads/')) {
          return `${apiBase}${parsed.pathname}${parsed.search}`;
        }
      } catch {}
    }
    if (url.startsWith('/api/') || url === '/api' || url.startsWith('/uploads/')) {
      return `${apiBase}${url}`;
    }
    return url;
  };

  const origFetch = window.fetch.bind(window);
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof input === 'string') {
      return origFetch(rewritePathToApiBase(input), init);
    }
    if (input instanceof URL && input.hostname === 'appassets.androidplatform.net') {
      const nextUrl = rewritePathToApiBase(input.pathname + input.search);
      return origFetch(nextUrl, init);
    }
    if (typeof Request !== 'undefined' && input instanceof Request) {
      try {
        const parsed = new URL(input.url);
        if (parsed.hostname === 'appassets.androidplatform.net' && (parsed.pathname.startsWith('/api/') || parsed.pathname.startsWith('/uploads/'))) {
          return origFetch(new Request(`${apiBase}${parsed.pathname}${parsed.search}`, input), init);
        }
      } catch {}
    }
    return origFetch(input, init);
  }) as typeof window.fetch;

  if (typeof window.EventSource !== 'undefined') {
    const OrigEventSource = window.EventSource;
    window.EventSource = class extends OrigEventSource {
      constructor(url: string | URL, eventSourceInitDict?: EventSourceInit) {
        const str = typeof url === 'string' ? rewritePathToApiBase(url) : url.toString();
        super(str, eventSourceInitDict);
      }
    } as typeof window.EventSource;
  }

  if (typeof window.WebSocket !== 'undefined') {
    const OrigWebSocket = window.WebSocket;
    window.WebSocket = class extends OrigWebSocket {
      constructor(url: string | URL, protocols?: string | string[]) {
        let target = typeof url === 'string' ? url : url.toString();
        try {
          const parsed = new URL(target, window.location.href);
          if (parsed.hostname === 'appassets.androidplatform.net') {
            const apiUrl = new URL(apiBase);
            const wsProto = apiUrl.protocol === 'https:' ? 'wss:' : 'ws:';
            target = `${wsProto}//${apiUrl.host}${parsed.pathname}${parsed.search}`;
          }
        } catch {}
        super(target, protocols);
      }
    } as typeof window.WebSocket;
  }
}

initFpsEngine();

// Global Anti-Select / Anti-Copy Lockdown at App Root (blocks SelectionArea, long-press, double-tap highlight, copy/select-all)
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  const isEditableTarget = (target: EventTarget | null): boolean => {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    if (tag === 'TEXTAREA') {
      const ta = target as HTMLTextAreaElement;
      return !ta.readOnly && !ta.disabled;
    }
    if (tag === 'INPUT') {
      const inp = target as HTMLInputElement;
      const nonTextTypes = new Set(['button', 'submit', 'reset', 'checkbox', 'radio', 'range', 'file', 'color', 'hidden']);
      return !inp.readOnly && !inp.disabled && !nonTextTypes.has((inp.type || 'text').toLowerCase());
    }
    return target.isContentEditable;
  };

  const clearNonEditableSelection = () => {
    try {
      const active = document.activeElement;
      if (isEditableTarget(active)) return;
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
        sel.removeAllRanges();
      }
    } catch {}
  };

  document.addEventListener(
    'selectstart',
    (e) => {
      if (!isEditableTarget(e.target)) {
        e.preventDefault();
        clearNonEditableSelection();
      }
    },
    true
  );

  document.addEventListener('selectionchange', () => {
    try {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
      const anchorNode = sel.anchorNode;
      const anchorEl =
        anchorNode instanceof HTMLElement
          ? anchorNode
          : anchorNode?.parentElement || document.activeElement;
      if (!isEditableTarget(anchorEl) && !isEditableTarget(document.activeElement)) {
        sel.removeAllRanges();
      }
    } catch {}
  });

  document.addEventListener(
    'dblclick',
    (e) => {
      if (!isEditableTarget(e.target)) {
        clearNonEditableSelection();
      }
    },
    true
  );

  // Bubble phase preserves React onContextMenu handlers while stopping native browser/Android "Salin" popup
  document.addEventListener('contextmenu', (e) => {
    if (!isEditableTarget(e.target)) {
      e.preventDefault();
    }
  });

  document.addEventListener(
    'copy',
    (e) => {
      if (!isEditableTarget(e.target) && !isEditableTarget(document.activeElement)) {
        e.preventDefault();
        clearNonEditableSelection();
      }
    },
    true
  );

  document.addEventListener(
    'cut',
    (e) => {
      if (!isEditableTarget(e.target) && !isEditableTarget(document.activeElement)) {
        e.preventDefault();
      }
    },
    true
  );

  document.addEventListener(
    'keydown',
    (e) => {
      if ((e.ctrlKey || e.metaKey) && !isEditableTarget(e.target)) {
        const key = e.key.toLowerCase();
        if (key === 'a' || key === 'c' || key === 'x') {
          e.preventDefault();
        }
      }
    },
    true
  );

  document.addEventListener(
    'dragstart',
    (e) => {
      if (!isEditableTarget(e.target)) {
        e.preventDefault();
      }
    },
    true
  );
}

// Register ZE.io Service Worker for Native Notifications & Background Services (web/PWA only; APK uses native Foreground Services)
if (
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  window.location.hostname !== 'appassets.androidplatform.net'
) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('ZE.io Service Worker registration skipped:', err);
    });
  });
}

const rootEl = document.getElementById('root');
if (rootEl) {
  createRoot(rootEl).render(
    <ErrorBoundary>
      <MusicProvider>
        <div className="select-none">
          <App />
        </div>
      </MusicProvider>
    </ErrorBoundary>
  );
}

