import React from 'react';
import { motion } from 'motion/react';
import { ShieldCheck, Lock, Users, Server, Github, ExternalLink, Shield, Mail } from 'lucide-react';

export default function AboutPage() {
  const commitHash = (__GIT_COMMIT_HASH__ || 'unknown').trim();
  const commitUrl = commitHash !== 'unknown' ? `https://github.com/Pitrick3141/rowo-auth/commit/${commitHash}` : '';

  return (
    <div className="max-w-3xl mx-auto py-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-12"
      >
        <div className="w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-sm border border-slate-200 overflow-hidden">
          <img src={__ICON_URL__} alt="ROwO Auth Logo" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
        </div>
        <h1 className="text-4xl font-bold tracking-tight text-slate-900 mb-4">
          About ROwO Auth
        </h1>
        <p className="text-lg text-slate-600 max-w-2xl mx-auto mb-6">
          A secure, centralized identity verification system designed to streamline student authentication across multiple platforms and services.
        </p>
        <a
          href="mailto:dev@rowo.link"
          className="inline-flex items-center gap-2 px-6 py-3 bg-slate-900 text-white rounded-xl font-medium hover:bg-slate-800 transition-colors shadow-sm"
        >
          <Mail className="w-5 h-5" />
          Contact Developer
        </a>
      </motion.div>

      <div className="space-y-12">
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-3xl p-8 shadow-sm border border-slate-200"
        >
          <h2 className="text-2xl font-bold text-slate-900 mb-6 flex items-center gap-3">
            <Lock className="w-6 h-6 text-indigo-600" />
            Our Mission
          </h2>
          <p className="text-slate-600 leading-relaxed mb-4">
            ROwO Auth was created to solve the fragmented identity problem within student communities. By providing a single source of truth for student verification, we enable community organizers, developers, and administrators to easily verify user identities without building custom authentication flows from scratch.
          </p>
          <p className="text-slate-600 leading-relaxed">
            Our goal is to protect student-only spaces from unauthorized access while maintaining a frictionless experience for legitimate users.
          </p>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-3xl p-8 shadow-sm border border-slate-200"
        >
          <h2 className="text-2xl font-bold text-slate-900 mb-6 flex items-center gap-3">
            <Users className="w-6 h-6 text-emerald-600" />
            For Users
          </h2>
          <ul className="space-y-4 text-slate-600">
            <li className="flex items-start gap-3">
              <div className="w-2 h-2 rounded-full bg-emerald-500 mt-2.5 shrink-0" />
              <span className="text-lg">Verify your student status once, use it everywhere.</span>
            </li>
            <li className="flex items-start gap-3">
              <div className="w-2 h-2 rounded-full bg-emerald-500 mt-2.5 shrink-0" />
              <span className="text-lg">Multiple verification methods (ADFS, Email, Discord, Manual).</span>
            </li>
            <li className="flex items-start gap-3">
              <div className="w-2 h-2 rounded-full bg-emerald-500 mt-2.5 shrink-0" />
              <span className="text-lg">Privacy-first approach to data handling.</span>
            </li>
          </ul>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white rounded-3xl p-8 shadow-sm border border-slate-200"
        >
          <h2 className="text-2xl font-bold text-slate-900 mb-6 flex items-center gap-3">
            <Shield className="w-6 h-6 text-purple-600" />
            For Group Owners
          </h2>
          <ul className="space-y-4 text-slate-600">
            <li className="flex items-start gap-3">
              <div className="w-2 h-2 rounded-full bg-purple-500 mt-2.5 shrink-0" />
              <span className="text-lg">Use this service to verify student status before they join your group.</span>
            </li>
            <li className="flex items-start gap-3">
              <div className="w-2 h-2 rounded-full bg-purple-500 mt-2.5 shrink-0" />
              <span className="text-lg">Discord server owners can contact the developer to set up their server as a trusted verification source.</span>
            </li>
            <li className="flex items-start gap-3">
              <div className="w-2 h-2 rounded-full bg-purple-500 mt-2.5 shrink-0" />
              <span className="text-lg">Members with a verified role in a trusted server can be verified easily.</span>
            </li>
          </ul>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="bg-indigo-50 rounded-3xl p-8 shadow-sm border border-indigo-100"
        >
          <h2 className="text-2xl font-bold text-slate-900 mb-4 flex items-center gap-3">
            <ShieldCheck className="w-6 h-6 text-indigo-600" />
            Not in UWaterloo?
          </h2>
          <p className="text-slate-700 leading-relaxed mb-6">
            If you are affiliated with another university or run a student community of another university, you can contact support to add authentication of your home institution.
          </p>
          <a
            href="mailto:dev@rowo.link"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition-colors shadow-sm"
          >
            <Mail className="w-5 h-5" />
            Contact Developer
          </a>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-slate-900 rounded-3xl p-8 shadow-2xl border border-slate-800 relative overflow-hidden group"
        >
          {/* Tech background elements */}
          <div className="absolute top-0 right-0 -mt-8 -mr-8 w-64 h-64 bg-blue-600/10 rounded-full blur-3xl group-hover:bg-blue-600/20 transition-colors duration-500" />
          <div className="absolute bottom-0 left-0 -mb-8 -ml-8 w-64 h-64 bg-indigo-600/10 rounded-full blur-3xl group-hover:bg-indigo-600/20 transition-colors duration-500" />
          <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)', backgroundSize: '24px 24px' }} />

          <div className="relative z-10">
            <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
              <Server className="w-6 h-6 text-blue-400" />
              For Developers
            </h2>
            <ul className="space-y-4 text-slate-300 mb-8">
              <li className="flex items-start gap-3">
                <div className="w-2 h-2 rounded-full bg-blue-400 mt-2.5 shrink-0 shadow-[0_0_8px_rgba(96,165,250,0.6)]" />
                <span className="text-lg">Simple API for querying verification status.</span>
              </li>
              <li className="flex items-start gap-3">
                <div className="w-2 h-2 rounded-full bg-blue-400 mt-2.5 shrink-0 shadow-[0_0_8px_rgba(96,165,250,0.6)]" />
                <span className="text-lg">Reduce duplicate verification efforts.</span>
              </li>
              <li className="flex items-start gap-3">
                <div className="w-2 h-2 rounded-full bg-blue-400 mt-2.5 shrink-0 shadow-[0_0_8px_rgba(96,165,250,0.6)]" />
                <span className="text-lg">Reliable infrastructure backed by PiTrick Technology.</span>
              </li>
            </ul>
            
            <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-2xl p-5 mb-8">
              <p className="text-sm text-blue-200 leading-relaxed">
                <strong className="text-blue-400">Open Source:</strong> ROwO Auth is now open source. You can review the codebase, report issues, and contribute improvements through our public GitHub repository.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <a
                href="https://github.com/Pitrick3141/rowo-auth"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-6 py-3 bg-blue-500 text-white rounded-xl font-medium hover:bg-blue-400 transition-all shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transform hover:-translate-y-0.5"
              >
                <Github className="w-5 h-5" />
                View on GitHub
                <ExternalLink className="w-4 h-4" />
              </a>
              <a
                href="mailto:dev@rowo.link"
                className="inline-flex items-center gap-2 px-6 py-3 bg-slate-700 text-white rounded-xl font-medium hover:bg-slate-600 transition-colors"
              >
                <Mail className="w-5 h-5" />
                Contact Developer
              </a>
            </div>
            <p className="mt-4 text-xs text-slate-400">
              Current Build: {' '}
              {commitUrl ? (
                <a
                  href={commitUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-blue-300 hover:text-blue-200 underline underline-offset-2"
                >
                  {commitHash}
                </a>
              ) : (
                <span className="font-mono">{commitHash}</span>
              )}
            </p>
          </div>
        </motion.section>
      </div>
    </div>
  );
}
