/**
 * @license
 * SPDX-License-Identifier: MIT
 */

import { BrowserRouter as Router, Navigate, Route, Routes } from 'react-router-dom';
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
import NexusLandingPage from './pages/NexusLandingPage';
import NexusPlaygroundPage from './pages/NexusPlaygroundPage';

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
            <Route path="/nexus" element={<NexusLandingPage />} />
            <Route path="/nexus/docs" element={<DocsPage />} />
            <Route path="/nexus/docs/:slug" element={<DocsPage />} />
            <Route path="/nexus/playground" element={<NexusPlaygroundPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Layout>
      </Router>
    </SessionProvider>
  );
}
