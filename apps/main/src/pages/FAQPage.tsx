import React from 'react';
import { motion } from 'motion/react';
import { HelpCircle, ChevronDown, Mail, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';

const faqs = [
  {
    question: "What is the primary purpose of this application?",
    answer: "ROwO Auth is a specialized platform designed for University of Waterloo students to authenticate their identities. By facilitating mutual verification, the application aims to safeguard the student community against unauthorized or malicious external access."
  },
  {
    question: "What is the procedure for updating my WeChat ID?",
    answer: "To modify your linked WeChat ID, you may re-verify your account using your original authentication method. However, if your account was verified through batch processing or manual administrative review, please contact our support team directly to facilitate the update."
  },
  {
    question: "How is my personal data managed and protected?",
    answer: (
      <>
        All personally identifiable information is stored within a secure environment and is utilized exclusively for identity verification purposes. For comprehensive details on our data handling practices, please refer to our <Link to="/privacy" className="text-indigo-600 hover:underline inline-flex items-center gap-1">Privacy Policy <ExternalLink className="w-3 h-3" /></Link>.
      </>
    )
  }
];

export default function FAQPage() {
  return (
    <div className="max-w-3xl mx-auto">
      <div className="text-center mb-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="inline-flex items-center justify-center p-3 bg-indigo-100 text-indigo-600 rounded-2xl mb-4"
        >
          <HelpCircle className="w-8 h-8" />
        </motion.div>
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 mb-4"
        >
          Frequently Asked Questions
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-lg text-slate-600"
        >
          Find answers to common inquiries regarding the ROwO Auth verification system.
        </motion.p>
      </div>

      <div className="space-y-4 mb-12">
        {faqs.map((faq, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 + index * 0.1 }}
            className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"
          >
            <div className="p-6">
              <h3 className="text-lg font-bold text-slate-900 mb-3 flex items-start gap-3">
                <span className="text-indigo-600">Q:</span>
                {faq.question}
              </h3>
              <div className="text-slate-600 leading-relaxed pl-7">
                {faq.answer}
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.6 }}
        className="bg-indigo-600 rounded-3xl p-8 text-center text-white shadow-lg shadow-indigo-200"
      >
        <h2 className="text-2xl font-bold mb-2">Still have questions?</h2>
        <p className="text-indigo-100 mb-6">
          Our support team is available to assist you with any further inquiries or technical issues.
        </p>
        <a
          href="mailto:dev@rowo.link"
          className="inline-flex items-center gap-2 px-6 py-3 bg-white text-indigo-600 font-bold rounded-xl hover:bg-indigo-50 transition-colors shadow-sm"
        >
          <Mail className="w-5 h-5" />
          Contact Support
        </a>
      </motion.div>
    </div>
  );
}
