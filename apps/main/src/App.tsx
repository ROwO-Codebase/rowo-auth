/**
 * @license
 * SPDX-License-Identifier: MIT
 */

import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { useEffect } from 'react';
import Layout from './components/Layout';
import LandingPage from './pages/LandingPage';
import VerificationPage from './pages/VerificationPage';
import DiscordCallback from './pages/DiscordCallback';
import GitHubCallback from './pages/GitHubCallback';
import AdfsCallback from './pages/AdfsCallback';
import AdminPanel from './pages/AdminPanel';
import AboutPage from './pages/AboutPage';
import PrivacyPage from './pages/PrivacyPage';
import FAQPage from './pages/FAQPage';
import SignupPage from './pages/SignupPage';
import LoginPage from './pages/LoginPage';
import UserCenterPage from './pages/UserCenterPage';
import OAuthAuthorizePage from './pages/OAuthAuthorizePage';
import SsoPage from './pages/SsoPage';
import { SessionProvider } from './contexts/SessionContext';

function AdfsRedirect() {
  useEffect(() => {
    window.location.href = `${__API_ENDPOINT__}/api/oauth/redirect/adfs`;
  }, []);
  return <div className="p-8 text-center text-slate-500">Redirecting to ADFS...</div>;
}

export default function App() {
  return (
    <SessionProvider>
      <Router>
        <Layout>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/verify" element={<VerificationPage />} />
            <Route path="/verify/discord/callback" element={<DiscordCallback />} />
            <Route path="/verify/github/callback" element={<GitHubCallback />} />
            <Route path="/verify/adfs/callback" element={<AdfsCallback />} />
            <Route path="/adfs" element={<AdfsRedirect />} />
            <Route path="/admin" element={<AdminPanel />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="/privacy" element={<PrivacyPage />} />
            <Route path="/faq" element={<FAQPage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/center" element={<UserCenterPage />} />
            <Route path="/oauth/authorize" element={<OAuthAuthorizePage />} />
            <Route path="/sso" element={<SsoPage />} />
          </Routes>
        </Layout>
      </Router>
    </SessionProvider>
  );
}
