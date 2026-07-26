/**
 * PrivacyPolicy.jsx — Eduket OS
 * ─────────────────────────────────────────────────────────────────────────────
 * Meets:
 *   • Google Play Store privacy policy requirements
 *   • Apple App Store Review Guidelines §5.1
 *   • POPIA (Protection of Personal Information Act, South Africa)
 *   • GDPR Article 13/14 disclosure standards
 *   • COPPA considerations (learners may be under 13)
 *
 * Route: /privacy  (add to App.jsx as a public route with no auth required)
 *   <Route path="/privacy" element={<PrivacyPolicy />} />
 *
 * Hosted URL submitted to Google Play Console:
 *   https://eduket.tech/privacy
 */

import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
    Shield, Lock, Eye, Database, Users, Globe,
    Mail, Phone, FileText, AlertCircle, CheckCircle2,
    ChevronRight, ArrowLeft,
} from 'lucide-react';
const EMAIL_ADDRESS = 'nextgenskills96@gmail.com';
// ── Effective date — update whenever the policy changes ───────────────────
const EFFECTIVE_DATE = '12 July 2026';
const LAST_REVIEWED = '12 July 2026';
const COMPANY_NAME = 'Nextgen Skills Development';
const APP_NAME = 'Eduket OS';
const CONTACT_EMAIL = EMAIL_ADDRESS;
const SUPPORT_EMAIL = EMAIL_ADDRESS;
const COMPANY_ADDRESS = 'South Africa';
const WEBSITE = 'https://eduket.tech';
const INFO_REGULATOR_URL = 'https://inforegulator.org.za';


// ══════════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
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

function BulletList({ items }) {
    return (
        <ul className="space-y-2 mt-2">
            {items.map((item, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm
                                text-slate-600 dark:text-slate-400">
                    <ChevronRight size={14}
                        className="text-indigo-500 flex-shrink-0 mt-0.5" />
                    <span>{item}</span>
                </li>
            ))}
        </ul>
    );
}

function DataTable({ rows }) {
    return (
        <div className="mt-4 overflow-x-auto rounded-2xl border
                    border-slate-200 dark:border-slate-700">
            <table className="w-full text-sm">
                <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/50">
                        {rows[0].map((h, i) => (
                            <th key={i}
                                className="px-4 py-3 text-left text-xs font-black uppercase
                             tracking-widest text-slate-500 dark:text-slate-400">
                                {h}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                    {rows.slice(1).map((row, i) => (
                        <tr key={i}
                            className="bg-white dark:bg-slate-900 hover:bg-slate-50
                           dark:hover:bg-slate-800/30 transition-colors">
                            {row.map((cell, j) => (
                                <td key={j}
                                    className="px-4 py-3 text-slate-700 dark:text-slate-300">
                                    {cell}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function InfoCard({ icon: Icon, title, text, color = 'blue' }) {
    const colors = {
        blue: 'bg-blue-50  dark:bg-blue-950/30  border-blue-100  dark:border-blue-900  text-blue-700  dark:text-blue-300',
        amber: 'bg-amber-50 dark:bg-amber-950/30 border-amber-100 dark:border-amber-900 text-amber-700 dark:text-amber-300',
        green: 'bg-green-50 dark:bg-green-950/30 border-green-100 dark:border-green-900 text-green-700 dark:text-green-300',
        red: 'bg-red-50   dark:bg-red-950/30   border-red-100   dark:border-red-900   text-red-700   dark:text-red-300',
    };
    return (
        <div className={`flex gap-3 p-4 rounded-2xl border ${colors[color]} my-4`}>
            <Icon size={18} className="flex-shrink-0 mt-0.5" />
            <div>
                {title && <p className="font-black text-sm mb-1">{title}</p>}
                <p className="text-sm leading-relaxed">{text}</p>
            </div>
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


// ══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════════════════

export default function PrivacyPolicy() {

    // Scroll to top on mount
    useEffect(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }, []);

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
                        <Shield size={13} className="text-green-500" />
                        Last updated: {LAST_REVIEWED}
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
                                <TOCItem href="#overview" label="Overview" />
                                <TOCItem href="#data" label="Data we collect" />
                                <TOCItem href="#purpose" label="How we use it" />
                                <TOCItem href="#ai" label="AI processing" />
                                <TOCItem href="#sharing" label="Data sharing" />
                                <TOCItem href="#children" label="Children's privacy" />
                                <TOCItem href="#retention" label="Retention & deletion" />
                                <TOCItem href="#transfer" label="International transfers" />
                                <TOCItem href="#security" label="Security" />
                                <TOCItem href="#rights" label="Your rights" />
                                <TOCItem href="#popia" label="POPIA (South Africa)" />
                                <TOCItem href="#cookies" label="Cookies & tracking" />
                                <TOCItem href="#payments" label="Payments" />
                                <TOCItem href="#changes" label="Policy changes" />
                                <TOCItem href="#contact" label="Contact us" />
                            </nav>

                            {/* Trust seals */}
                            <div className="mt-8 space-y-2">
                                {[
                                    { icon: Shield, label: 'POPIA compliant' },
                                    { icon: Lock, label: 'Firebase encrypted' },
                                    { icon: Eye, label: 'No ad tracking' },
                                    { icon: CheckCircle2, label: 'No data sold' },
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
                                <Shield size={13} /> Privacy Policy
                            </div>
                            <h1 className="text-3xl sm:text-4xl font-black
                             text-slate-900 dark:text-white tracking-tight mb-4">
                                {APP_NAME} Privacy Policy
                            </h1>
                            <div className="flex flex-wrap gap-4 text-xs text-slate-400">
                                <span><strong className="text-slate-600 dark:text-slate-300">Effective:</strong>{' '}{EFFECTIVE_DATE}</span>
                                <span><strong className="text-slate-600 dark:text-slate-300">Last reviewed:</strong>{' '}{LAST_REVIEWED}</span>
                                <span><strong className="text-slate-600 dark:text-slate-300">Operated by:</strong>{' '}{COMPANY_NAME}</span>
                            </div>
                        </div>

                        <InfoCard
                            icon={AlertCircle}
                            color="blue"
                            title="Plain-language summary"
                            text={`${APP_NAME} is a school assessment platform. We collect the minimum information needed to run your school's exams and mark them with AI. We do not sell your data, show you advertisements, or share your information with anyone except the service providers listed in this policy. Learner data is treated with the highest level of care.`}
                        />

                        <Divider />

                        {/* ── 1. Overview ─────────────────────────────────────────── */}
                        <SectionHeading id="overview" icon={FileText} title="1. Overview" />
                        <Prose>
                            <p>
                                This Privacy Policy describes how <strong>{COMPANY_NAME}</strong> ("we",
                                "us", "our") collects, uses, and protects personal information through
                                the <strong>{APP_NAME}</strong> platform, available at{' '}
                                <a href={WEBSITE} className="text-indigo-600 hover:underline"
                                    target="_blank" rel="noopener noreferrer">{WEBSITE}</a> and
                                associated mobile applications.
                            </p>
                            <p>
                                This policy applies to all users of the platform including school
                                administrators (principals), teachers, and students. By accessing or
                                using {APP_NAME} you confirm that you have read, understood, and agreed
                                to this policy.
                            </p>
                            <p>
                                If you are under 18 years of age, please read this policy with a parent
                                or guardian. If you are under 13, your school or guardian must have
                                consented on your behalf before you use the platform.
                            </p>
                        </Prose>

                        <Divider />

                        {/* ── 2. Data we collect ──────────────────────────────────── */}
                        <SectionHeading id="data" icon={Database}
                            title="2. Data we collect" color="violet" />
                        <Prose>
                            <p>We collect the following categories of personal information:</p>
                        </Prose>

                        <DataTable rows={[
                            ['Category', 'Examples', 'Who it applies to', 'Required?'],
                            ['Identity',
                                'Full name, display name, profile photo',
                                'All users',
                                'Required'],
                            ['Contact',
                                'Email address',
                                'All users',
                                'Required'],
                            ['Academic profile',
                                'Grade, subjects, school name, curriculum',
                                'Students, teachers',
                                'Required'],
                            ['School profile',
                                'Institution name, country, curriculum, institution type, contact number',
                                'Principals',
                                'Required'],
                            ['Exam content',
                                'Uploaded exam papers, marking memos, extracted questions',
                                'Teachers (upload) / Students (attempt)',
                                'Required to use the service'],
                            ['Assessment responses',
                                'Student answers, marks, AI-generated feedback, concept gap analysis',
                                'Students',
                                'Required to use the service'],
                            ['Usage data',
                                'Pages visited, features used, session duration, device type',
                                'All users',
                                'Automatic'],
                            ['Payment data',
                                'Transaction ID, tier selected, amount — processed by PayFast',
                                'Principals only',
                                'Required for paid tiers'],
                            ['Technical data',
                                'IP address, browser type, operating system, reCAPTCHA score',
                                'All users',
                                'Automatic'],
                        ]} />

                        <InfoCard
                            icon={CheckCircle2}
                            color="green"
                            title="What we do NOT collect"
                            text="We do not collect government ID numbers, biometric data, financial account details, location data, contact lists, media files outside of exam papers, or any data from device sensors."
                        />

                        <Divider />

                        {/* ── 3. Purpose ──────────────────────────────────────────── */}
                        <SectionHeading id="purpose" icon={Eye}
                            title="3. How we use your information" color="emerald" />
                        <Prose>
                            <p>We use personal information only for the following purposes:</p>
                        </Prose>

                        <DataTable rows={[
                            ['Purpose', 'Legal basis (POPIA)', 'Data used'],
                            ['Create and manage your account',
                                'Contract performance',
                                'Name, email, role'],
                            ['Authenticate sign-in via Google or email/password',
                                'Contract performance',
                                'Email, Firebase Auth token'],
                            ['Extract and mark exam questions using AI',
                                'Contract performance',
                                'Exam files, student answers'],
                            ['Generate personalised learning feedback and study plans',
                                'Contract performance',
                                'Exam responses, performance history'],
                            ['Provide the AI study coach',
                                'Contract performance / Legitimate interest',
                                'Chat messages, results history'],
                            ['Process subscription payments',
                                'Contract performance',
                                'Transaction data — via PayFast'],
                            ['Send transactional communications (account confirmation, receipts)',
                                'Contract performance',
                                'Email address'],
                            ['Prevent fraud and enforce platform security',
                                'Legitimate interest',
                                'IP address, reCAPTCHA score, usage patterns'],
                            ['Comply with legal obligations (POPIA, tax records)',
                                'Legal obligation',
                                'Billing data, access logs'],
                            ['Improve the platform',
                                'Legitimate interest',
                                'Aggregated, anonymised usage data only'],
                        ]} />

                        <InfoCard
                            icon={Shield}
                            color="blue"
                            text="We never use student data for advertising, profiling for non-educational purposes, training public AI models, or any purpose beyond delivering the educational service to your school."
                        />

                        <Divider />

                        {/* ── 4. AI Processing ────────────────────────────────────── */}
                        <SectionHeading id="ai" icon={Sparkle}
                            title="4. AI processing and third-party models" color="amber" />
                        <Prose>
                            <p>
                                {APP_NAME} uses artificial intelligence to extract exam questions from
                                uploaded documents, mark student answers, identify concept gaps, and
                                power the AI study coach. The following AI providers may process
                                content submitted to the platform:
                            </p>
                        </Prose>

                        <DataTable rows={[
                            ['Provider', 'Purpose', 'Data sent', 'Privacy policy'],
                            ['Groq (primary)',
                                'Question extraction, marking, analysis',
                                'Exam text, student answers (sanitised)',
                                'groq.com/privacy'],
                            ['Google Gemini (fallback)',
                                'Question extraction, marking — used if Groq is unavailable',
                                'Exam text, student answers (sanitised)',
                                'ai.google.dev/terms'],
                            ['Google reCAPTCHA v2 / v3',
                                'Bot and fraud prevention on sign-in',
                                'Browser fingerprint, interaction patterns',
                                'policies.google.com/privacy'],
                        ]} />

                        <Prose>
                            <p>
                                <strong>Important:</strong> Student answers and exam content are sent to
                                AI providers only to complete the marking and analysis task. We apply
                                input sanitisation to remove any personal identifiers before content
                                reaches the AI. We do not permit AI providers to use submitted content
                                to train their public models, and our use of these services is governed
                                by API terms that restrict data use to the requested service only.
                            </p>
                            <p>
                                No student's name, email, school identity, or other direct identifiers
                                are included in prompts sent to AI providers. The AI receives only the
                                question text and the answer text.
                            </p>
                        </Prose>

                        <Divider />

                        {/* ── 5. Sharing ──────────────────────────────────────────── */}
                        <SectionHeading id="sharing" icon={Users}
                            title="5. Data sharing" color="rose" />
                        <Prose>
                            <p>
                                We do not sell personal information. We share information only with the
                                following categories of recipients, and only to the extent necessary:
                            </p>
                        </Prose>

                        <BulletList items={[
                            'Google Firebase — authentication, Firestore database, Cloud Storage, App Check. Data is processed under Google\'s Data Processing Addendum.',
                            'Groq / Google Gemini — AI inference for exam processing (see Section 4). Input data only; no results stored by these providers.',
                            'PayFast — payment processing for subscription upgrades. We share transaction details only. PayFast is PCI DSS compliant.',
                            'Netlify — static frontend hosting. Netlify processes IP addresses and request metadata under their DPA.',
                            'Render.com — backend API hosting. Processes request data and environment variables under their DPA.',
                            'Your school — teachers and principals at your registered school can view your exam results and performance data. This access is role-restricted.',
                            'Legal authorities — if required by law, court order, or to protect the safety of users or the public.',
                        ]} />

                        <InfoCard
                            icon={Shield}
                            color="green"
                            text="We do not share personal information with advertisers, data brokers, marketing companies, social media platforms, or any party not listed above."
                        />

                        <Divider />

                        {/* ── 6. Children ─────────────────────────────────────────── */}
                        <SectionHeading id="children" icon={Shield}
                            title="6. Children's privacy" color="violet" />
                        <Prose>
                            <p>
                                {APP_NAME} is designed for use by schools and their learners. We recognise
                                that many users may be children, including children under 13 years of age.
                            </p>
                            <p>
                                <strong>School-based consent model:</strong> Schools that register on
                                the platform confirm that they have obtained appropriate consent from
                                parents or guardians for learners to use educational technology services,
                                in accordance with their jurisdiction's laws and school policies. The school
                                acts as the responsible party for learner data within its account.
                            </p>
                            <p>
                                <strong>Minimum data:</strong> We collect only the information necessary
                                for the educational service (name, grade, school, exam responses). We do
                                not ask children for detailed personal profiles, contact information beyond
                                email, or any information unrelated to their academic work.
                            </p>
                            <p>
                                <strong>No advertising:</strong> Learner accounts are never shown
                                advertisements and learner data is never used for advertising or commercial
                                profiling of any kind.
                            </p>
                            <p>
                                If you believe a child is using the platform without proper consent, or
                                if you are a parent who wishes to access or delete your child's data,
                                please contact us at{' '}
                                <a href={`mailto:${CONTACT_EMAIL}`}
                                    className="text-indigo-600 hover:underline">{CONTACT_EMAIL}</a>.
                            </p>
                        </Prose>

                        <Divider />

                        {/* ── 7. Retention ────────────────────────────────────────── */}
                        <SectionHeading id="retention" icon={Database}
                            title="7. Data retention and deletion" />

                        <DataTable rows={[
                            ['Data type', 'Retention period', 'Deletion'],
                            ['User account (active)',
                                'Duration of account + 90 days after deletion request',
                                'User-initiated via email request'],
                            ['Exam results and attempts',
                                '3 years from the date of submission',
                                'Deleted with account or on school request'],
                            ['Uploaded exam files (DOCX/PDF)',
                                '2 years from upload date',
                                'Deleted with account or on school request'],
                            ['Rendered page images',
                                '1 year from upload date',
                                'Automatic scheduled deletion'],
                            ['Payment transaction records',
                                '5 years (South African tax law requirement)',
                                'Not deletable — legal obligation'],
                            ['Audit logs',
                                '2 years',
                                'Not deletable — security requirement'],
                            ['AI chat history',
                                '90 days',
                                'Automatic rolling deletion'],
                        ]} />

                        <Prose>
                            <p>
                                To request deletion of your account and associated data, email{' '}
                                <a href={`mailto:${CONTACT_EMAIL}`}
                                    className="text-indigo-600 hover:underline">{CONTACT_EMAIL}</a>{' '}
                                from the email address registered to your account. We will process the
                                request within 30 days and confirm when deletion is complete.
                            </p>
                        </Prose>

                        <Divider />

                        {/* ── 8. International transfers ──────────────────────────── */}
                        <SectionHeading id="transfer" icon={Globe}
                            title="8. International data transfers" color="amber" />
                        <Prose>
                            <p>
                                {APP_NAME} is built on cloud infrastructure operated by companies
                                headquartered in the United States. When you use the platform, your
                                personal information may be transferred to and processed in the
                                United States and other countries outside of South Africa.
                            </p>
                            <p>
                                These transfers occur when data is:
                            </p>
                            <BulletList items={[
                                'Stored in Google Firebase (Google LLC — United States)',
                                'Processed by Groq AI servers (Groq Inc. — United States)',
                                'Processed by Google Gemini (Google LLC — United States)',
                                'Hosted on Netlify (Netlify Inc. — United States)',
                                'Processed on Render (Render Services Inc. — United States)',
                            ]} />
                            <p>
                                We ensure appropriate safeguards are in place for these transfers by
                                using only providers who maintain standard contractual clauses, data
                                processing agreements, and comply with international data protection
                                standards including SOC 2 and ISO 27001.
                            </p>
                        </Prose>

                        <Divider />

                        {/* ── 9. Security ─────────────────────────────────────────── */}
                        <SectionHeading id="security" icon={Lock}
                            title="9. Security measures" color="emerald" />
                        <Prose>
                            <p>
                                We implement the following technical and organisational security measures
                                to protect your personal information:
                            </p>
                        </Prose>

                        <BulletList items={[
                            'All data in transit is encrypted using TLS 1.3',
                            'All data at rest is encrypted using AES-256 (Google Firebase default encryption)',
                            'Authentication is handled by Firebase Authentication — passwords are never stored in plain text',
                            'Google reCAPTCHA v2 and v3 protect sign-in and registration from automated attacks',
                            'Firebase App Check restricts database access to verified instances of the app only',
                            'Role-based access control — students cannot access teacher or principal data',
                            'School-level isolation — school A cannot access school B\'s data',
                            'Rate limiting on all API endpoints prevents brute-force and denial-of-service attacks',
                            'All admin actions are recorded in a tamper-evident audit log',
                            'Firebase Storage rules restrict exam file access to users from the same school only',
                            'Backend API uses Firebase ID token verification on every request',
                            'PayFast payment notifications are verified using MD5 signature + passphrase before any action is taken',
                        ]} />

                        <InfoCard
                            icon={AlertCircle}
                            color="amber"
                            title="Security incident notification"
                            text={`If we become aware of a security breach that affects your personal information, we will notify you and the Information Regulator (if required by POPIA) within 72 hours of becoming aware of the breach. Notification will be sent to your registered email address and posted on ${WEBSITE}.`}
                        />

                        <Divider />

                        {/* ── 10. Your rights ─────────────────────────────────────── */}
                        <SectionHeading id="rights" icon={CheckCircle2}
                            title="10. Your rights" color="violet" />
                        <Prose>
                            <p>
                                Depending on your location and applicable law, you may have the following
                                rights regarding your personal information:
                            </p>
                        </Prose>

                        <DataTable rows={[
                            ['Right', 'What it means', 'How to exercise'],
                            ['Access',
                                'Receive a copy of the personal information we hold about you',
                                `Email ${CONTACT_EMAIL}`],
                            ['Correction',
                                'Correct inaccurate or incomplete information',
                                'Via account settings or email'],
                            ['Deletion',
                                'Request deletion of your personal information (subject to retention obligations)',
                                `Email ${CONTACT_EMAIL}`],
                            ['Portability',
                                'Receive your data in a machine-readable format',
                                `Email ${CONTACT_EMAIL}`],
                            ['Objection',
                                'Object to processing based on legitimate interest',
                                `Email ${CONTACT_EMAIL}`],
                            ['Restriction',
                                'Request that we restrict processing while a dispute is resolved',
                                `Email ${CONTACT_EMAIL}`],
                            ['Withdraw consent',
                                'Where processing is based on consent, withdraw it at any time',
                                'Via account settings or email'],
                            ['Lodge a complaint',
                                'Lodge a complaint with the Information Regulator of South Africa',
                                'inforegulator.org.za'],
                        ]} />

                        <Prose>
                            <p>
                                We will respond to all rights requests within 30 days. If we are unable
                                to fulfil a request, we will explain why. There is no charge for
                                exercising your rights.
                            </p>
                        </Prose>

                        <Divider />

                        {/* ── 11. POPIA ───────────────────────────────────────────── */}
                        <SectionHeading id="popia" icon={FileText}
                            title="11. POPIA — South African users" color="rose" />
                        <Prose>
                            <p>
                                {COMPANY_NAME} is registered and operates in South Africa and is
                                subject to the Protection of Personal Information Act, 4 of 2013 (POPIA).
                            </p>

                            <p><strong>Responsible Party:</strong></p>
                            <BulletList items={[
                                `Organisation: ${COMPANY_NAME}`,
                                `Platform: ${APP_NAME}`,
                                `Information Officer email: ${CONTACT_EMAIL}`,
                                `Country of operation: South Africa`,
                            ]} />

                            <p><strong>Lawful basis for processing:</strong></p>
                            <BulletList items={[
                                'Contract performance — to provide the assessment service your school has registered for',
                                'Legitimate interest — platform security, fraud prevention, service improvement',
                                'Legal obligation — tax records, regulatory compliance',
                                'Consent — where specifically requested (e.g. optional communications)',
                            ]} />

                            <p><strong>Special personal information:</strong></p>
                            <p>
                                We do not intentionally collect special personal information as defined
                                by POPIA Section 26 (race, religion, health, biometric, criminal, or
                                political information). If any such information appears in uploaded exam
                                content, it is processed solely for the purpose of marking that exam
                                and is not stored or used for any other purpose.
                            </p>

                            <p><strong>Cross-border information transfers:</strong></p>
                            <p>
                                As described in Section 8, personal information is transferred to
                                servers in the United States. These transfers are made under standard
                                contractual clauses and data processing agreements that provide
                                equivalent protection to POPIA requirements.
                            </p>

                            <p><strong>Complaints to the Information Regulator:</strong></p>
                            <p>
                                If you believe your POPIA rights have been violated and we have not
                                adequately addressed your concern, you may lodge a complaint with the
                                Information Regulator of South Africa at{' '}
                                <a href={INFO_REGULATOR_URL}
                                    className="text-indigo-600 hover:underline"
                                    target="_blank" rel="noopener noreferrer">
                                    {INFO_REGULATOR_URL}
                                </a>.
                            </p>
                        </Prose>

                        <Divider />

                        {/* ── 12. Cookies ─────────────────────────────────────────── */}
                        <SectionHeading id="cookies" icon={Eye}
                            title="12. Cookies and tracking" color="amber" />
                        <Prose>
                            <p>
                                {APP_NAME} uses the following cookies and client-side storage:
                            </p>
                        </Prose>

                        <DataTable rows={[
                            ['Name / Type', 'Purpose', 'Duration', 'Essential?'],
                            ['Firebase Auth session',
                                'Maintains your signed-in session',
                                'Until sign-out or token expiry',
                                'Yes'],
                            ['user-session (localStorage)',
                                'Persists student profile for exam continuity between pages',
                                'Until sign-out',
                                'Yes'],
                            ['reCAPTCHA (_ga, _gcl_*)',
                                'Google reCAPTCHA bot detection — set by Google on sign-in',
                                'Session / 2 years',
                                'Yes (security)'],
                            ['Firebase App Check token',
                                'Verifies requests originate from the legitimate app',
                                'Session',
                                'Yes (security)'],
                        ]} />

                        <Prose>
                            <p>
                                We do not use advertising cookies, third-party tracking cookies,
                                or analytics cookies that build profiles across websites. The
                                cookies we use are strictly necessary for the platform to function
                                securely.
                            </p>
                        </Prose>

                        <Divider />

                        {/* ── 13. Payments ────────────────────────────────────────── */}
                        <SectionHeading id="payments" icon={Lock}
                            title="13. Payments and billing" />
                        <Prose>
                            <p>
                                Subscription payments are processed by <strong>PayFast</strong>, a
                                South African payment service provider. When you make a payment:
                            </p>
                            <BulletList items={[
                                'You are redirected from Eduket OS to PayFast\'s secure payment page',
                                'Your card details are entered directly on PayFast\'s servers — we never see or store your full card number',
                                'PayFast notifies us of successful payment via a digitally signed webhook (ITN)',
                                'We store only the transaction ID, tier selected, and amount — not any card data',
                                'PayFast is PCI DSS Level 1 compliant',
                            ]} />
                            <p>
                                PayFast's privacy policy is available at{' '}
                                <a href="https://payfast.io/legal/privacy-policy"
                                    className="text-indigo-600 hover:underline"
                                    target="_blank" rel="noopener noreferrer">
                                    payfast.io/legal/privacy-policy
                                </a>.
                            </p>
                        </Prose>

                        <Divider />

                        {/* ── 14. Changes ─────────────────────────────────────────── */}
                        <SectionHeading id="changes" icon={FileText}
                            title="14. Changes to this policy" color="violet" />
                        <Prose>
                            <p>
                                We may update this Privacy Policy from time to time to reflect changes
                                in our practices, legal requirements, or the features of the platform.
                                When we make material changes we will:
                            </p>
                            <BulletList items={[
                                'Update the "Last reviewed" date at the top of this page',
                                'Send an email notification to all registered account holders',
                                'Display a notice in the platform for 30 days after the change takes effect',
                            ]} />
                            <p>
                                Your continued use of {APP_NAME} after the effective date of the
                                updated policy constitutes acceptance of the changes. If you do not
                                agree with the changes, you may close your account by contacting us.
                            </p>
                        </Prose>

                        <Divider />

                        {/* ── 15. Contact ─────────────────────────────────────────── */}
                        <SectionHeading id="contact" icon={Mail}
                            title="15. Contact us" color="emerald" />
                        <Prose>
                            <p>
                                If you have any questions, concerns, or requests related to this
                                Privacy Policy or the processing of your personal information, please
                                contact our Information Officer:
                            </p>
                        </Prose>

                        <div className="mt-4 grid sm:grid-cols-2 gap-4">
                            <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/50
                              border border-slate-200 dark:border-slate-700">
                                <div className="flex items-center gap-2 mb-3">
                                    <Mail size={16} className="text-indigo-500" />
                                    <p className="font-black text-sm text-slate-800 dark:text-white">
                                        Privacy enquiries
                                    </p>
                                </div>
                                <a href={`mailto:${CONTACT_EMAIL}`}
                                    className="text-sm text-indigo-600 hover:underline font-medium">
                                    {CONTACT_EMAIL}
                                </a>
                                <p className="text-xs text-slate-400 mt-1">
                                    Response within 5 business days
                                </p>
                            </div>

                            <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/50
                              border border-slate-200 dark:border-slate-700">
                                <div className="flex items-center gap-2 mb-3">
                                    <Mail size={16} className="text-indigo-500" />
                                    <p className="font-black text-sm text-slate-800 dark:text-white">
                                        General support
                                    </p>
                                </div>
                                <a href={`mailto:${SUPPORT_EMAIL}`}
                                    className="text-sm text-indigo-600 hover:underline font-medium">
                                    {SUPPORT_EMAIL}
                                </a>
                                <p className="text-xs text-slate-400 mt-1">
                                    Response within 2 business days
                                </p>
                            </div>

                            <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/50
                              border border-slate-200 dark:border-slate-700 sm:col-span-2">
                                <div className="flex items-center gap-2 mb-3">
                                    <Globe size={16} className="text-indigo-500" />
                                    <p className="font-black text-sm text-slate-800 dark:text-white">
                                        Information Regulator of South Africa
                                    </p>
                                </div>
                                <a href={INFO_REGULATOR_URL}
                                    target="_blank" rel="noopener noreferrer"
                                    className="text-sm text-indigo-600 hover:underline font-medium">
                                    {INFO_REGULATOR_URL}
                                </a>
                                <p className="text-xs text-slate-400 mt-1">
                                    For POPIA complaints not resolved by us
                                </p>
                            </div>
                        </div>

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
                                <Link to="/privacy"
                                    className="text-xs text-indigo-500 font-medium">
                                    Privacy Policy
                                </Link>
                                <a href={`mailto:${CONTACT_EMAIL}`}
                                    className="text-xs text-slate-400 hover:text-indigo-500 transition-colors">
                                    Contact
                                </a>
                            </div>
                        </div>

                    </main>
                </div>
            </div>
        </div>
    );
}

// Inline icon since lucide-react doesn't export Sparkle directly
function Sparkle({ size = 18, className = '' }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round"
            strokeLinejoin="round" className={className}>
            <path d="M12 3v1m0 16v1M4.22 4.22l.71.71m12.73 12.73.71.71M3 12h1m16 0h1M4.22 19.78l.71-.71M18.36 5.64l.71-.71" />
            <circle cx="12" cy="12" r="3" />
        </svg>
    );
}