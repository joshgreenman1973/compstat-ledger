import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import BoldApp from './bold/BoldApp';

// The stress-tested view is the default; the original dashboard stays one click away at ?classic.
const classic = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('classic');

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    {classic ? <App /> : <BoldApp />}
  </React.StrictMode>
);
