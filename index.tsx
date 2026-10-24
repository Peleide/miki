import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { GmaoDemoApp } from './components/gmao/GmaoDemoApp';

// Branche CSP : `?demo` dans l'URL (ou VITE_GMAO_DEMO=1) lance la GMAO sans Firebase.
const isDemo = new URLSearchParams(window.location.search).has('demo') || import.meta.env.VITE_GMAO_DEMO === '1';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    {isDemo ? <GmaoDemoApp /> : <App />}
  </React.StrictMode>
);