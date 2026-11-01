import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { io } from 'socket.io-client';

// React is the application shell; the provided SkillSwap UI remains the actual view layer.
// Its store is a thin adapter to the Express/MongoDB API rather than a local mock database.
function PeerLearnShell() {
  useEffect(() => {
    window.io = io;
    const isRenderDeployment = window.location.hostname.endsWith('.onrender.com');
    const productionApi = 'https://skillswap-9zga.onrender.com/api';
    const productionSocket = 'https://skillswap-9zga.onrender.com';
    window.PEERLEARN_API_URL = import.meta.env.VITE_API_URL || (isRenderDeployment ? productionApi : 'http://localhost:5000/api');
    window.PEERLEARN_SOCKET_URL = import.meta.env.VITE_SOCKET_URL || (isRenderDeployment ? productionSocket : 'http://localhost:5000');
    import('./supplied-ui/app.js').catch(error => {
      console.error('PeerLearn UI failed to start:', error);
      const app = document.getElementById('app');
      if (app) app.innerHTML = `<section style="max-width:720px;margin:4rem auto;padding:2rem;border:1px solid #fecaca;border-radius:1rem;background:#fff;color:#7f1d1d;font-family:Inter,system-ui,sans-serif"><h1 style="font-size:1.5rem;font-weight:700">PeerLearn could not start</h1><p style="margin-top:1rem">${String(error?.message || 'The UI assets failed to load.').replace(/[<>]/g, '')}</p><p style="margin-top:.75rem">Start the backend, confirm your MongoDB connection, and reload this page.</p></section>`;
    });
  }, []);
  return <>
    <a className="skip-link" href="#app">Skip to content</a>
    <header id="app-header" className="sticky top-0 z-30 h-16 bg-white/95 backdrop-blur border-b border-slate-200" />
    <main id="app" className="min-h-[calc(100vh-4rem)]" />
    <div id="toasts" className="fixed bottom-4 right-4 z-[100] space-y-2 pointer-events-none" aria-live="polite" />
    <div id="modal-root" />
  </>;
}

createRoot(document.getElementById('root')).render(<PeerLearnShell />);
