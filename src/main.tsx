// Must run before any module that captures window.saveAs (jsPDF, SheetJS).
import './utils/nativeDownloads';
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import ErrorBoundary from './ErrorBoundary.tsx';
import {ThemeProvider} from './context/ThemeContext.tsx';
import {LanguageProvider} from './context/LanguageContext.tsx';
import App from './App.tsx';
import {applyAppShell} from './utils/appShell';
import './index.css';

applyAppShell();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <LanguageProvider>
          <App />
        </LanguageProvider>
      </ThemeProvider>
    </ErrorBoundary>
  </StrictMode>,
);
