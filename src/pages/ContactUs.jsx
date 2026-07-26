/**
 * ContactUs.jsx — Eduket OS
 * ─────────────────────────────────────────────────────────────────────────────
 * Companion to PrivacyPolicy.jsx and TermsOfService.jsx — shares the same
 * design system so all three pages feel like one product.
 *
 * Route: /contact  (add to App.jsx as a public route with no auth required)
 *   <Route path="/contact" element={<ContactUs />} />
 *
 * This is a static contact hub (mailto: links) — no backend form submission,
 * so there's nothing to wire up server-side. Swap any card's `href` for a
 * real form action later if you add one.
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
    Mail, MessageCircle, Bug, Building2, ShieldCheck, Gavel,
    Globe, ArrowLeft, ChevronRight, Clock, CheckCircle2,
    Copy, Check, HelpCircle,
} from 'lucide-react';

// ── Update these to match your real channels ───────────────────────────────
const APP_NAME = 'Eduket OS';
const COMPANY_NAME = 'Nextgen Skills Development';
const WEBSITE = 'https://eduket.tech';
const EMAIL_ADDRESS = 'nextgenskills96@gmail.com';

const SUPPORT_EMAIL = [EMAIL_ADDRESS];
const SALES_EMAIL = [EMAIL_ADDRESS];
const LEGAL_EMAIL = [EMAIL_ADDRESS];
const PRIVACY_EMAIL = [EMAIL_ADDRESS];
const SECURITY_EMAIL = [EMAIL_ADDRESS];

const PHONE_NUMBER = '+27 65 656 4983'; // e.g. '+27 41 000 0000' — leave blank to hide the card
const WHATSAPP_NUMBER = '27656564983'; // e.g. '27820000000' (digits only, no +) — leave blank to hide
const OFFICE_ADDRESS = '33 Heatherbank, Gqeberha, South Africa'; // e.g. 'Gqeberha, Eastern Cape, South Africa' — leave blank to hide

const GITHUB_URL = ''; // e.g. 'https://github.com/yourorg/eduket' — leave blank to hide
const X_URL = ''; // leave blank to hide
const LINKEDIN_URL = ''; // leave blank to hide


// ══════════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS (mirrors PrivacyPolicy.jsx / TermsOfService.jsx — keep in sync)
// ══════════════════════════════════════════════════════════════════════════════

function SectionHeading({ id, icon: Icon, title, color = 'indigo' }) {
    const colors = {
        indigo: 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-400',
        violet: 'bg-violet-100 text-violet-600 dark:bg-violet-900/40 dark:text-violet-400',
        emerald: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400',
        amber: 'bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400',
        rose: 'bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-400',
    };
    return (
        <div id={id} className="flex items-center gap-3 mb-5 pt-8 scroll-mt-20">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center
                       flex-shrink-0 ${colors[color]}`}>
                <Icon size={18} />
            </div>
            <h2 className="text-xl font-black text-slate-800 dark:text-white tracking-tight">
                {title}
            </h2>
        </div>
    );
}

function Prose({ children }) {
    return (
        <div className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed
                    space-y-3">
            {children}
        </div>
    );
}

function TOCItem({ href, label }) {
    return (
        <a href={href}
            className="flex items-center gap-2 py-1.5 text-sm text-slate-600
                  dark:text-slate-400 hover:text-indigo-600
                  dark:hover:text-indigo-400 transition-colors">
            <ChevronRight size={13} className="text-slate-400 flex-shrink-0" />
            {label}
        </a>
    );
}

function Divider() {
    return <hr className="my-8 border-slate-200 dark:border-slate-800" />;
}

// Copy-to-clipboard button used on each contact card
function CopyButton({ value }) {
    const [copied, setCopied] = useState(false);

    const handleCopy = async (e) => {
        e.preventDefault();
        try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch {
            // Clipboard API unavailable — fail silently, mailto link still works
        }
    };

    return (
        <button
            onClick={handleCopy}
            aria-label={`Copy ${value}`}
            className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600
                 hover:bg-indigo-50 dark:hover:bg-indigo-900/30
                 transition-colors"
        >
            {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
        </button>
    );
}

// A single contact channel card: icon, title, value, response time, copy button
function ContactCard({ icon: Icon, title, description, value, href, responseTime, color = 'indigo' }) {
    const colors = {
        indigo: 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-400',
        violet: 'bg-violet-100 text-violet-600 dark:bg-violet-900/40 dark:text-violet-400',
        emerald: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400',
        amber: 'bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400',
        rose: 'bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-400',
        green: 'bg-green-100 text-green-600 dark:bg-green-900/40 dark:text-green-400',
    };
    return (
        <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/50
                    border border-slate-200 dark:border-slate-700
                    hover:border-indigo-200 dark:hover:border-indigo-800
                    transition-colors">
            <div className="flex items-start justify-between gap-2 mb-3">
                <div className="flex items-center gap-2.5">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center
                             flex-shrink-0 ${colors[color]}`}>
                        <Icon size={15} />
                    </div>
                    <p className="font-black text-sm text-slate-800 dark:text-white">
                        {title}
                    </p>
                </div>
                {value && <CopyButton value={value} />}
            </div>

            {description && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-3 leading-relaxed">
                    {description}
                </p>
            )}

            <a href={href}
                target={href?.startsWith('http') ? '_blank' : undefined}
                rel={href?.startsWith('http') ? 'noopener noreferrer' : undefined}
                className="text-sm text-indigo-600 hover:underline font-medium break-all">
                {value}
            </a>

            {responseTime && (
                <p className="text-xs text-slate-400 mt-2 flex items-center gap-1.5">
                    <Clock size={11} /> {responseTime}
                </p>
            )}
        </div>
    );
}


// ══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════════════════

export default function ContactUs() {

    useEffect(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }, []);

    const hasPhone = Boolean(PHONE_NUMBER);
    const hasWhatsApp = Boolean(WHATSAPP_NUMBER);
    const hasAddress = Boolean(OFFICE_ADDRESS);
    const hasSocial = Boolean(GITHUB_URL || X_URL || LINKEDIN_URL);

    return (
        <div className="min-h-screen bg-white dark:bg-slate-950">

            {/* ── Top bar ──────────────────────────────────────────────────────── */}
            <div className="sticky top-0 z-50 bg-white/90 dark:bg-slate-950/90
                      backdrop-blur-xl border-b border-slate-200 dark:border-slate-800
                      shadow-sm">
                <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14
                        flex items-center justify-between">
                    <Link to="/"
                        className="flex items-center gap-2 text-sm font-bold
                           text-slate-600 dark:text-slate-300
                           hover:text-indigo-600 transition-colors">
                        <ArrowLeft size={16} /> Back to {APP_NAME}
                    </Link>
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                        <CheckCircle2 size={13} className="text-green-500" />
                        We usually reply within 2 business days
                    </div>
                </div>
            </div>

            <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12">
                <div className="lg:grid lg:grid-cols-[260px_1fr] lg:gap-12">

                    {/* ── Sidebar table of contents (desktop) ───────────────────── */}
                    <aside className="hidden lg:block">
                        <div className="sticky top-20">
                            <p className="text-[10px] font-black uppercase tracking-widest
                             text-slate-400 mb-4 px-1">
                                Contents
                            </p>
                            <nav className="space-y-0.5">
                                <TOCItem href="#general" label="General support" />
                                <TOCItem href="#technical" label="Technical & bugs" />
                                <TOCItem href="#sales" label="Sales & billing" />
                                <TOCItem href="#trust" label="Trust & legal" />
                                {(hasPhone || hasWhatsApp || hasAddress) &&
                                    <TOCItem href="#other-channels" label="Other channels" />}
                                {hasSocial && <TOCItem href="#social" label="Social" />}
                                <TOCItem href="#faq" label="Before you write in" />
                            </nav>

                            <div className="mt-8 space-y-2">
                                {[
                                    { icon: Clock, label: '2 business day response' },
                                    { icon: ShieldCheck, label: 'Verified support channels' },
                                    { icon: MessageCircle, label: 'Role-specific routing' },
                                ].map(({ icon: Icon, label }) => (
                                    <div key={label}
                                        className="flex items-center gap-2 text-xs font-bold
                                  text-slate-500 dark:text-slate-400">
                                        <Icon size={13} className="text-green-500" />
                                        {label}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </aside>

                    {/* ── Main content ──────────────────────────────────────────── */}
                    <main>

                        {/* Header */}
                        <div className="mb-10">
                            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full
                              bg-indigo-50 dark:bg-indigo-900/30
                              border border-indigo-100 dark:border-indigo-800
                              text-xs font-bold text-indigo-600 dark:text-indigo-400 mb-6">
                                <MessageCircle size={13} /> Contact Us
                            </div>
                            <h1 className="text-3xl sm:text-4xl font-black
                             text-slate-900 dark:text-white tracking-tight mb-4">
                                Get in touch with {APP_NAME}
                            </h1>
                            <p className="text-sm text-slate-500 dark:text-slate-400 max-w-xl">
                                Choose the channel below that best matches your question — routing
                                it correctly gets you a faster answer. For account-specific issues,
                                write to us from the email address registered on your account.
                            </p>
                        </div>

                        <Divider />

                        {/* ── General support ─────────────────────────────────────── */}
                        <SectionHeading id="general" icon={Mail} title="General support" />
                        <Prose>
                            <p>
                                Questions about using the platform, your account, or a school
                                setup issue.
                            </p>
                        </Prose>
                        <div className="mt-4 grid sm:grid-cols-2 gap-4">
                            <ContactCard
                                icon={Mail}
                                title="Support email"
                                description="Account access, exam setup, general how-to questions."
                                value={SUPPORT_EMAIL}
                                href={`mailto:${SUPPORT_EMAIL}`}
                                responseTime="Response within 2 business days"
                                color="indigo"
                            />
                        </div>

                        <Divider />

                        {/* ── Technical & bugs ────────────────────────────────────── */}
                        <SectionHeading id="technical" icon={Bug}
                            title="Technical issues & bug reports" color="rose" />
                        <Prose>
                            <p>
                                Found something broken — a connection error, a grading mismatch, a
                                UI glitch? Include your role (Student/Teacher/Principal), the page
                                you were on, and what you expected to happen.
                            </p>
                        </Prose>
                        <div className="mt-4 grid sm:grid-cols-2 gap-4">
                            <ContactCard
                                icon={Bug}
                                title="Bug reports"
                                description="Errors, broken flows, unexpected behaviour."
                                value={SUPPORT_EMAIL}
                                href={`mailto:${SUPPORT_EMAIL}?subject=Bug%20report`}
                                responseTime="Response within 2 business days"
                                color="rose"
                            />
                            <ContactCard
                                icon={ShieldCheck}
                                title="Security disclosures"
                                description="Found a vulnerability? Report it responsibly here — do not test it against live student data."
                                value={SECURITY_EMAIL}
                                href={`mailto:${SECURITY_EMAIL}?subject=Security%20disclosure`}
                                responseTime="Response within 48 hours"
                                color="amber"
                            />
                        </div>

                        <Divider />

                        {/* ── Sales & billing ─────────────────────────────────────── */}
                        <SectionHeading id="sales" icon={Building2}
                            title="Sales & billing" color="emerald" />
                        <Prose>
                            <p>
                                Interested in a paid tier for your school, need an invoice, or have
                                a billing question.
                            </p>
                        </Prose>
                        <div className="mt-4 grid sm:grid-cols-2 gap-4">
                            <ContactCard
                                icon={Building2}
                                title="Sales & new schools"
                                description="Pricing, tier comparisons, onboarding a new school."
                                value={SALES_EMAIL}
                                href={`mailto:${SALES_EMAIL}`}
                                responseTime="Response within 1 business day"
                                color="emerald"
                            />
                            <ContactCard
                                icon={Mail}
                                title="Billing questions"
                                description="Invoices, payment issues, subscription changes."
                                value={SUPPORT_EMAIL}
                                href={`mailto:${SUPPORT_EMAIL}?subject=Billing%20question`}
                                responseTime="Response within 2 business days"
                                color="indigo"
                            />
                        </div>

                        <Divider />

                        {/* ── Trust & legal ───────────────────────────────────────── */}
                        <SectionHeading id="trust" icon={Gavel}
                            title="Trust & legal" color="violet" />
                        <Prose>
                            <p>
                                Privacy requests, data deletion, or legal/contractual questions.
                                See our{' '}
                                <Link to="/privacy" className="text-indigo-600 hover:underline">
                                    Privacy Policy
                                </Link>{' '}
                                and{' '}
                                <Link to="/terms" className="text-indigo-600 hover:underline">
                                    Terms of Service
                                </Link>{' '}
                                for full details.
                            </p>
                        </Prose>
                        <div className="mt-4 grid sm:grid-cols-2 gap-4">
                            <ContactCard
                                icon={ShieldCheck}
                                title="Privacy & data requests"
                                description="Access, correction, or deletion of personal information."
                                value={PRIVACY_EMAIL}
                                href={`mailto:${PRIVACY_EMAIL}`}
                                responseTime="Response within 30 days (POPIA)"
                                color="violet"
                            />
                            <ContactCard
                                icon={Gavel}
                                title="Legal enquiries"
                                description="Contracts, terms interpretation, compliance."
                                value={LEGAL_EMAIL}
                                href={`mailto:${LEGAL_EMAIL}`}
                                responseTime="Response within 5 business days"
                                color="rose"
                            />
                        </div>

                        {(hasPhone || hasWhatsApp || hasAddress) && (
                            <>
                                <Divider />
                                {/* ── Other channels ──────────────────────────────────── */}
                                <SectionHeading id="other-channels" icon={MessageCircle}
                                    title="Other ways to reach us" color="amber" />
                                <div className="mt-4 grid sm:grid-cols-2 gap-4">
                                    {hasPhone && (
                                        <ContactCard
                                            icon={MessageCircle}
                                            title="Phone"
                                            description="For urgent, time-sensitive issues only."
                                            value={PHONE_NUMBER}
                                            href={`tel:${PHONE_NUMBER.replace(/\s+/g, '')}`}
                                            responseTime="Business hours only"
                                            color="amber"
                                        />
                                    )}
                                    {hasWhatsApp && (
                                        <ContactCard
                                            icon={MessageCircle}
                                            title="WhatsApp"
                                            description="Quick questions during business hours."
                                            value={`+${WHATSAPP_NUMBER}`}
                                            href={`https://wa.me/${WHATSAPP_NUMBER}`}
                                            responseTime="Response within 1 business day"
                                            color="green"
                                        />
                                    )}
                                    {hasAddress && (
                                        <ContactCard
                                            icon={Building2}
                                            title="Registered office"
                                            description={`${COMPANY_NAME}`}
                                            value={OFFICE_ADDRESS}
                                            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(OFFICE_ADDRESS)}`}
                                            color="indigo"
                                        />
                                    )}
                                </div>
                            </>
                        )}

                        {hasSocial && (
                            <>
                                <Divider />
                                {/* ── Social ───────────────────────────────────────────── */}
                                <SectionHeading id="social" icon={Globe}
                                    title="Follow & connect" color="emerald" />
                                <div className="mt-4 flex flex-wrap gap-3">
                                    {GITHUB_URL && (
                                        <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer"
                                            className="px-4 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/50
                                 border border-slate-200 dark:border-slate-700
                                 text-sm font-bold text-slate-600 dark:text-slate-300
                                 hover:text-indigo-600 hover:border-indigo-200 transition-colors">
                                            GitHub
                                        </a>
                                    )}
                                    {X_URL && (
                                        <a href={X_URL} target="_blank" rel="noopener noreferrer"
                                            className="px-4 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/50
                                 border border-slate-200 dark:border-slate-700
                                 text-sm font-bold text-slate-600 dark:text-slate-300
                                 hover:text-indigo-600 hover:border-indigo-200 transition-colors">
                                            X (Twitter)
                                        </a>
                                    )}
                                    {LINKEDIN_URL && (
                                        <a href={LINKEDIN_URL} target="_blank" rel="noopener noreferrer"
                                            className="px-4 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/50
                                 border border-slate-200 dark:border-slate-700
                                 text-sm font-bold text-slate-600 dark:text-slate-300
                                 hover:text-indigo-600 hover:border-indigo-200 transition-colors">
                                            LinkedIn
                                        </a>
                                    )}
                                </div>
                            </>
                        )}

                        <Divider />

                        {/* ── FAQ nudge ────────────────────────────────────────────── */}
                        <SectionHeading id="faq" icon={HelpCircle}
                            title="Before you write in" />
                        <Prose>
                            <p>To help us respond faster, please include where relevant:</p>
                        </Prose>
                        <ul className="mt-2 space-y-2">
                            {[
                                'Your role (Student, Teacher, or Principal) and school name',
                                'The email address registered to your account',
                                'What you were trying to do, and what happened instead',
                                'Screenshots or the exact error message, if any',
                            ].map((item, i) => (
                                <li key={i} className="flex items-start gap-2.5 text-sm
                                    text-slate-600 dark:text-slate-400">
                                    <ChevronRight size={14}
                                        className="text-indigo-500 flex-shrink-0 mt-0.5" />
                                    <span>{item}</span>
                                </li>
                            ))}
                        </ul>

                        {/* Footer */}
                        <div className="mt-12 pt-8 border-t border-slate-200 dark:border-slate-800
                            flex flex-col sm:flex-row items-start sm:items-center
                            justify-between gap-4">
                            <div>
                                <p className="text-xs text-slate-400">
                                    © {new Date().getFullYear()} {COMPANY_NAME}. All rights reserved.
                                </p>
                                <p className="text-xs text-slate-400 mt-1">
                                    {APP_NAME} · {WEBSITE}
                                </p>
                            </div>
                            <div className="flex gap-3">
                                <Link to="/"
                                    className="text-xs text-slate-400 hover:text-indigo-500 transition-colors">
                                    Home
                                </Link>
                                <Link to="/terms"
                                    className="text-xs text-slate-400 hover:text-indigo-500 transition-colors">
                                    Terms of Service
                                </Link>
                                <Link to="/privacy"
                                    className="text-xs text-slate-400 hover:text-indigo-500 transition-colors">
                                    Privacy Policy
                                </Link>
                                <Link to="/contact"
                                    className="text-xs text-indigo-500 font-medium">
                                    Contact
                                </Link>
                            </div>
                        </div>

                    </main>
                </div>
            </div>
        </div>
    );
}