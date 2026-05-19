/**
 * @license
 * SPDX-License-Identifier: MIT
 */

import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import { SessionProvider } from './contexts/SessionContext';
import DevLandingPage from './pages/DevLandingPage';
import SsoCallback from './pages/SsoCallback';
import ClientsListPage from './pages/ClientsListPage';
import ClientCreatePage from './pages/ClientCreatePage';
import ClientDetailPage from './pages/ClientDetailPage';
import DocsPage from './pages/DocsPage';
import PlaygroundPage from './pages/PlaygroundPage';
import TokenHelperPage from './pages/TokenHelperPage';

export default function App() {
  return (
    <SessionProvider>
      <Router>
        <Layout>
          <Routes>
            <Route path="/" element={<DevLandingPage />} />
            <Route path="/sso-callback" element={<SsoCallback />} />
            <Route path="/clients" element={<ClientsListPage />} />
            <Route path="/clients/new" element={<ClientCreatePage />} />
            <Route path="/clients/:clientId" element={<ClientDetailPage />} />
            <Route path="/docs" element={<DocsPage />} />
            <Route path="/docs/:slug" element={<DocsPage />} />
            <Route path="/playground" element={<PlaygroundPage />} />
            <Route path="/tokens" element={<TokenHelperPage />} />
          </Routes>
        </Layout>
      </Router>
    </SessionProvider>
  );
}
