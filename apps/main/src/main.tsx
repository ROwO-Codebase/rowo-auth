import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {isPreviewDeployment} from './environment.ts';
import './index.css';

if (isPreviewDeployment) {
  document.title = `[Preview] ${document.title}`;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
