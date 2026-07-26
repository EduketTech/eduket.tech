/**
 * TermsOfService.jsx — Eduket OS
 * ─────────────────────────────────────────────────────────────────────────────
 * Companion to PrivacyPolicy.jsx — shares the same design system, sub-components,
 * and layout conventions so the two legal pages feel like one product.
 *
 * Meets:
 *   • Google Play Store terms/EULA requirements
 *   • Apple App Store Review Guidelines §5.1
 *   • Standard SaaS ToS structure (registration, acceptable use, IP, liability,
 *     termination, governing law)
 *
 * Route: /terms  (add to App.jsx as a public route with no auth required)
 *   <Route path="/terms" element={<TermsOfService />} />
 *
 * Hosted URL submitted to Google Play Console:
 *   https://eduket.tech/terms
 */

import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
    ShieldCheck, Lock, KeyRound, Gavel, Ban, Copyright,
    Mail, Globe, FileText, AlertCircle, CheckCircle2,
    ChevronRight, ArrowLeft, UserCog,
} from 'lucide-react';

// ── Effective date — update whenever the terms change ─────────────────────
const EMAIL_ADDRESS = 'nextgenskills96@gmail.com';
const EFFECTIVE_DATE = '12 July 2026';
const LAST_REVIEWED = '12 July 2026';
const COMPANY_NAME = 'Nextgen Skills Development';
const APP_NAME = 'Eduket OS';
const CONTACT_EMAIL = [EMAIL_ADDRESS];
const LEGAL_EMAIL = [EMAIL_ADDRESS];
const WEBSITE = 'https://eduket.tech';
const JURISDICTION = 'South Africa';


// ══════════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS (mirrors PrivacyPolicy.jsx exactly — keep in sync)
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

export default function TermsOfService() {

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
                        <ShieldCheck size={13} className="text-green-500" />
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
                                <TOCItem href="#accounts" label="Accounts & roles" />
                                <TOCItem href="#acceptable-use" label="Acceptable use" />
                                <TOCItem href="#subscriptions" label="Subscriptions & billing" />
                                <TOCItem href="#content" label="Content & submissions" />
                                <TOCItem href="#ip" label="Intellectual property" />
                                <TOCItem href="#ai-disclaimer" label="AI-generated content" />
                                <TOCItem href="#termination" label="Suspension & termination" />
                                <TOCItem href="#disclaimers" label="Disclaimers" />
                                <TOCItem href="#liability" label="Limitation of liability" />
                                <TOCItem href="#indemnity" label="Indemnification" />
                                <TOCItem href="#governing-law" label="Governing law" />
                                <TOCItem href="#changes" label="Changes to these terms" />
                                <TOCItem href="#contact" label="Contact us" />
                            </nav>

                            {/* Trust seals */}
                            <div className="mt-8 space-y-2">
                                {[
                                    { icon: ShieldCheck, label: 'Role-based access control' },
                                    { icon: Lock, label: 'Firebase-secured data' },
                                    { icon: Ban, label: 'No unauthorised scraping' },
                                    { icon: CheckCircle2, label: 'Clear termination policy' },
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
                                <Gavel size={13} /> Terms of Service
                            </div>
                            <h1 className="text-3xl sm:text-4xl font-black
                             text-slate-900 dark:text-white tracking-tight mb-4">
                                {APP_NAME} Terms of Service
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
                            text={`These Terms govern your use of ${APP_NAME}, a school assessment platform. Access is role-based (students, teachers, principals), and attempting to alter or elevate your role is prohibited. We ask that you use the platform honestly, respect the security of the underlying systems, and understand the limits of our liability. Read the full terms below before using the Service.`}
                        />

                        <Divider />

                        {/* ── 1. Overview ─────────────────────────────────────────── */}
                        <SectionHeading id="overview" icon={FileText} title="1. Overview" />
                        <Prose>
                            <p>
                                Welcome to <strong>{APP_NAME}</strong> (the "Service"), operated by{' '}
                                <strong>{COMPANY_NAME}</strong> ("we", "us", "our"). These Terms of
                                Service ("Terms") govern your access to and use of our application,
                                website, and dashboard services at{' '}
                                <a href={WEBSITE} className="text-indigo-600 hover:underline"
                                    target="_blank" rel="noopener noreferrer">{WEBSITE}</a>.
                            </p>
                            <p>
                                By creating an account, accessing, or using the Service, you agree to
                                be bound by these Terms. If you do not agree, you may not use the
                                Service.
                            </p>
                            <p>
                                If you are accessing the Service on behalf of a school, you confirm
                                that you have the authority to bind that institution to these Terms.
                                If you are under 18, a parent, guardian, or your school must have
                                authorised your use of the Service in accordance with our{' '}
                                <Link to="/privacy" className="text-indigo-600 hover:underline">
                                    Privacy Policy
                                </Link>.
                            </p>
                        </Prose>

                        <Divider />

                        {/* ── 2. Accounts & roles ─────────────────────────────────── */}
                        <SectionHeading id="accounts" icon={UserCog}
                            title="2. Account registration and roles" color="violet" />
                        <Prose>
                            <p>
                                <strong>Account creation:</strong> You must provide accurate, complete,
                                and current information when creating an account, and keep that
                                information up to date.
                            </p>
                            <p>
                                <strong>Role classifications:</strong> Access levels on the Service are
                                defined by institutional roles — Students, Teachers, and Principals.
                                Each role is granted a specific scope of access to protect exam
                                integrity and student data.
                            </p>
                        </Prose>

                        <InfoCard
                            icon={KeyRound}
                            color="red"
                            title="Role elevation is strictly prohibited"
                            text="Attempting to alter, spoof, or elevate your account role — including modifying role attributes, tokens, or client-side state to gain access beyond what your role permits — constitutes a material breach of these Terms and will result in immediate account termination and may be reported to your school and, where applicable, law enforcement."
                        />

                        <Prose>
                            <p>
                                <strong>Security:</strong> You are responsible for safeguarding the
                                credentials used to access the Service and for any activity that
                                occurs under your account. Notify us immediately at{' '}
                                <a href={`mailto:${CONTACT_EMAIL}`}
                                    className="text-indigo-600 hover:underline">{CONTACT_EMAIL}</a>{' '}
                                if you suspect unauthorised use of your account.
                            </p>
                        </Prose>

                        <Divider />

                        {/* ── 3. Acceptable use ───────────────────────────────────── */}
                        <SectionHeading id="acceptable-use" icon={Ban}
                            title="3. Acceptable use & academic integrity" color="rose" />
                        <Prose>
                            <p>You agree that you will not, and will not attempt to:</p>
                        </Prose>

                        <BulletList items={[
                            'Exploit, intercept, reverse-engineer, or query the backend database framework (including Firestore security rules) to gain unauthorized access to exam structures, question banks, or student performance metrics.',
                            'Access, copy, or distribute exam content, marking memos, or question banks outside of your authorised role.',
                            'Engage in automated scraping, data harvesting, or systematic generation of fake data patterns.',
                            'Perform penetration testing, vulnerability scanning, or security research on the Service without our prior written authorization.',
                            'Impersonate another user, share exam credentials, or facilitate cheating during an assessment.',
                            'Upload malicious code, attempt to disrupt the Service, or interfere with other schools\' use of the platform.',
                            'Use the Service for any purpose that violates applicable law, including data protection law in your jurisdiction.',
                        ]} />

                        <InfoCard
                            icon={ShieldCheck}
                            color="green"
                            text="We actively monitor for the behaviors above through audit logging, rate limiting, and role-based Firestore security rules. Violations may result in immediate suspension without prior notice."
                        />

                        <Divider />

                        {/* ── 4. Subscriptions & billing ──────────────────────────── */}
                        <SectionHeading id="subscriptions" icon={Lock}
                            title="4. Subscriptions and billing" color="amber" />
                        <Prose>
                            <p>
                                The Service is offered under multiple subscription tiers (Free, Silver, Gold, Platinum and Diamond), each with defined usage limits.
                                Paid tiers are billed to the Principal account associated with a
                                school and processed through our third-party payment provider.
                            </p>
                            <BulletList items={[
                                'Subscription fees are billed in advance on a recurring basis unless otherwise agreed in writing.',
                                'Usage limits (students, exams, teachers, AI tutoring sessions) are enforced automatically; exceeding your tier\'s limits may require an upgrade to continue full functionality.',
                                'Fees are non-refundable except where required by law or expressly stated at the time of purchase.',
                                'We may change subscription pricing with at least 30 days\' notice to the account\'s registered email before the change takes effect.',
                                'Failure to pay may result in downgrade to the Free tier or suspension of paid features.',
                            ]} />
                        </Prose>

                        <Divider />

                        {/* ── 5. Content & submissions ────────────────────────────── */}
                        <SectionHeading id="content" icon={FileText}
                            title="5. Content and submissions" />
                        <Prose>
                            <p>
                                "User Content" means exam papers, marking memos, student answers, and
                                any other material uploaded or submitted to the Service by you or your
                                school.
                            </p>
                            <BulletList items={[
                                'You retain ownership of your User Content. You grant us a limited, non-exclusive license to host, process, and display it solely to operate and improve the Service.',
                                'You represent that you have the necessary rights to upload any exam papers, memos, or other materials submitted to the Service.',
                                'We may remove User Content that violates these Terms or applicable law.',
                                'Student-submitted answers remain the intellectual property of the student and/or their school, as further described in Section 6.',
                            ]} />
                        </Prose>

                        <Divider />

                        {/* ── 6. Intellectual property ────────────────────────────── */}
                        <SectionHeading id="ip" icon={Copyright}
                            title="6. Intellectual property" color="violet" />
                        <Prose>
                            <p>
                                The Service and its original content — excluding student-submitted
                                answers and school-owned exam materials — including all features,
                                functionality, software, design, and branding, are and will remain the
                                exclusive property of {COMPANY_NAME} and its licensors.
                            </p>
                            <p>
                                Nothing in these Terms grants you a right to use our trademarks,
                                logos, or branding without our prior written consent. The Service is
                                protected by copyright, trademark, and other applicable laws.
                            </p>
                        </Prose>

                        <Divider />

                        {/* ── 7. AI-generated content ─────────────────────────────── */}
                        <SectionHeading id="ai-disclaimer" icon={AlertCircle}
                            title="7. AI-generated content" color="amber" />
                        <Prose>
                            <p>
                                {APP_NAME} uses artificial intelligence to extract exam questions,
                                mark student answers, generate feedback, and power the AI study coach.
                                AI-generated marking, feedback, and study guidance are provided as an
                                educational aid and may contain errors or inaccuracies.
                            </p>
                            <BulletList items={[
                                'AI-generated marks and feedback should be reviewed by a teacher before being treated as final or official, particularly for high-stakes assessments.',
                                'We do not guarantee that AI-generated output is free of error, bias, or omission.',
                                'You should independently verify any AI-generated content that materially affects a student\'s academic record.',
                            ]} />
                        </Prose>

                        <Divider />

                        {/* ── 8. Termination ──────────────────────────────────────── */}
                        <SectionHeading id="termination" icon={Ban}
                            title="8. Suspension and termination" color="rose" />
                        <Prose>
                            <p>
                                We may suspend or terminate your account immediately, without prior
                                notice or liability, for any reason, including without limitation if
                                you breach these Terms — in particular the role-elevation and
                                acceptable-use provisions in Sections 2 and 3.
                            </p>
                            <p>
                                You may terminate your account at any time by contacting{' '}
                                <a href={`mailto:${CONTACT_EMAIL}`}
                                    className="text-indigo-600 hover:underline">{CONTACT_EMAIL}</a>.
                                Upon termination, your right to use the Service ceases immediately.
                                Data retention and deletion following termination are governed by our{' '}
                                <Link to="/privacy" className="text-indigo-600 hover:underline">
                                    Privacy Policy
                                </Link>.
                            </p>
                        </Prose>

                        <Divider />

                        {/* ── 9. Disclaimers ──────────────────────────────────────── */}
                        <SectionHeading id="disclaimers" icon={AlertCircle}
                            title="9. Disclaimers" />
                        <Prose>
                            <p>
                                The Service is provided on an <strong>"as is"</strong> and{' '}
                                <strong>"as available"</strong> basis, without warranties of any kind,
                                whether express, implied, or statutory, including but not limited to
                                implied warranties of merchantability, fitness for a particular
                                purpose, and non-infringement.
                            </p>
                            <p>
                                We do not warrant that the Service will be uninterrupted, error-free,
                                or completely secure, or that any AI-generated output will be accurate
                                or complete.
                            </p>
                        </Prose>

                        <Divider />

                        {/* ── 10. Limitation of liability ─────────────────────────── */}
                        <SectionHeading id="liability" icon={Gavel}
                            title="10. Limitation of liability" color="rose" />
                        <Prose>
                            <p>
                                To the fullest extent permitted by law, in no event shall{' '}
                                {COMPANY_NAME}, its directors, employees, or partners be liable for
                                any indirect, incidental, special, consequential, or punitive damages
                                resulting from your use of or inability to use the Service, even if
                                advised of the possibility of such damages.
                            </p>
                            <p>
                                Where liability cannot be excluded under applicable law, our total
                                liability arising out of or relating to these Terms or the Service
                                will not exceed the amount you paid us in the 12 months preceding the
                                claim.
                            </p>
                        </Prose>

                        <InfoCard
                            icon={AlertCircle}
                            color="amber"
                            title="A note on enforceability"
                            text={`Some jurisdictions do not allow the exclusion or limitation of certain warranties or liabilities, so parts of this section may not apply to you. This limitation is intended to apply to the fullest extent permitted under the laws of ${JURISDICTION} and does not affect rights that cannot be waived by law.`}
                        />

                        <Divider />

                        {/* ── 11. Indemnification ─────────────────────────────────── */}
                        <SectionHeading id="indemnity" icon={ShieldCheck}
                            title="11. Indemnification" color="emerald" />
                        <Prose>
                            <p>
                                You agree to indemnify and hold harmless {COMPANY_NAME} and its
                                officers, employees, and partners from any claim, demand, loss, or
                                damages, including reasonable legal fees, arising out of your breach
                                of these Terms, misuse of the Service, or violation of any law or the
                                rights of a third party.
                            </p>
                        </Prose>

                        <Divider />

                        {/* ── 12. Governing law ───────────────────────────────────── */}
                        <SectionHeading id="governing-law" icon={Globe}
                            title="12. Governing law" color="amber" />
                        <Prose>
                            <p>
                                These Terms shall be governed and construed in accordance with the
                                laws of <strong>{JURISDICTION}</strong>, without regard to its
                                conflict of law provisions. Any dispute arising from these Terms or
                                the Service will be subject to the exclusive jurisdiction of the
                                courts of {JURISDICTION}, unless otherwise required by applicable
                                consumer protection law.
                            </p>
                        </Prose>

                        <Divider />

                        {/* ── 13. Changes ─────────────────────────────────────────── */}
                        <SectionHeading id="changes" icon={FileText}
                            title="13. Changes to these terms" color="violet" />
                        <Prose>
                            <p>
                                We may update these Terms from time to time to reflect changes in our
                                practices, legal requirements, or the features of the Service. When we
                                make material changes we will:
                            </p>
                            <BulletList items={[
                                'Update the "Last reviewed" date at the top of this page',
                                'Send an email notification to all registered account holders',
                                'Display a notice in the platform for 30 days after the change takes effect',
                            ]} />
                            <p>
                                Your continued use of {APP_NAME} after the effective date of the
                                updated Terms constitutes acceptance of the changes. If you do not
                                agree with the changes, you should stop using the Service and may
                                close your account by contacting us.
                            </p>
                        </Prose>

                        <Divider />

                        {/* ── 14. Contact ─────────────────────────────────────────── */}
                        <SectionHeading id="contact" icon={Mail}
                            title="14. Contact us" color="emerald" />
                        <Prose>
                            <p>
                                If you have any questions about these Terms of Service, please
                                contact us:
                            </p>
                        </Prose>

                        <div className="mt-4 grid sm:grid-cols-2 gap-4">
                            <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/50
                              border border-slate-200 dark:border-slate-700">
                                <div className="flex items-center gap-2 mb-3">
                                    <Gavel size={16} className="text-indigo-500" />
                                    <p className="font-black text-sm text-slate-800 dark:text-white">
                                        Legal enquiries
                                    </p>
                                </div>
                                <a href={`mailto:${LEGAL_EMAIL}`}
                                    className="text-sm text-indigo-600 hover:underline font-medium">
                                    {LEGAL_EMAIL}
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
                                <a href={`mailto:${CONTACT_EMAIL}`}
                                    className="text-sm text-indigo-600 hover:underline font-medium">
                                    {CONTACT_EMAIL}
                                </a>
                                <p className="text-xs text-slate-400 mt-1">
                                    Response within 2 business days
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
                                <Link to="/terms"
                                    className="text-xs text-indigo-500 font-medium">
                                    Terms of Service
                                </Link>
                                <Link to="/privacy"
                                    className="text-xs text-slate-400 hover:text-indigo-500 transition-colors">
                                    Privacy Policy
                                </Link>
                                <a href={`mailto:${LEGAL_EMAIL}`}
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