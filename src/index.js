import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import BoldApp from './bold/BoldApp';

// The "read closely" view is the default. ?classic used to render this branch's copy of the classic
// dashboard, which lacks main's corrected annual figures (PR #3); it now forwards to the live version A,
// keeping the rest of the query string and the #section.
const CLASSIC_URL = 'https://compstat-ledger.vercel.app/';
const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
const classic = !!params && params.has('classic');

if (classic) {
  params.delete('classic');
  const q = params.toString();
  window.location.replace(`${CLASSIC_URL}${q ? `?${q}` : ''}${window.location.hash}`);
} else {
  const root = ReactDOM.createRoot(document.getElementById('root'));
  root.render(
    <React.StrictMode>
      <BoldApp />
    </React.StrictMode>
  );
}
