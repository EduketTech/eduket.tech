import React, { useEffect, useRef, useState } from 'react';
import {
    Download, Share2, MessageCircle, Mail, Printer,
    ClipboardCopy, Check, Loader2, Smartphone,
} from 'lucide-react';

/**
 * Export / share menu.
 *
 * @param buildPdf      () => jsPDF instance. Called lazily so the document is
 *                      only generated when an action actually needs it.
 * @param fileName      base name, without extension
 * @param summaryText   plain-text summary for WhatsApp / email / clipboard
 * @param onPrint       optional; defaults to window.print
 * @param onEmailReport optional async (blob, fileName) => void. Wire this to a
 *                      Netlify Function + Resend to send the PDF as a real
 *                      attachment. Without it, email falls back to mailto.
 * @param primary       accent colour
 */
export default function ExportShareMenu({
    buildPdf,
    fileName = 'report',
    summaryText = '',
    onPrint,
    onEmailReport,
    primary = '#4f46e5',
}) {
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(null);
    const [done, setDone] = useState(null);
    const [error, setError] = useState(null);
    const ref = useRef(null);

    const canNativeShare = typeof navigator !== 'undefined' && !!navigator.share;

    useEffect(() => {
        if (!open) return;
        const onClick = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        const onKey = e => e.key === 'Escape' && setOpen(false);
        document.addEventListener('mousedown', onClick);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onClick);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    const flash = (key) => {
        setDone(key);
        setTimeout(() => setDone(d => (d === key ? null : d)), 2000);
    };

    const run = async (key, fn) => {
        setBusy(key);
        setError(null);
        try {
            await fn();
            flash(key);
        } catch (err) {
            console.error('[share]', key, err);
            setError(err?.message || 'Something went wrong');
        } finally {
            setBusy(null);
        }
    };

    const stamped = `${fileName}_${new Date().toISOString().split('T')[0]}.pdf`;

    // ── Actions ────────────────────────────────────────────────────────────

    const handleDownload = () => run('download', async () => {
        buildPdf().save(stamped);
        setOpen(false);
    });

    const handleNativeShare = () => run('native', async () => {
        const blob = buildPdf().output('blob');
        const file = new File([blob], stamped, { type: 'application/pdf' });

        // Not every browser that has navigator.share can share files.
        if (navigator.canShare?.({ files: [file] })) {
            await navigator.share({ files: [file], title: fileName, text: summaryText });
        } else {
            await navigator.share({ title: fileName, text: summaryText });
        }
        setOpen(false);
    });

    const handleWhatsApp = () => run('whatsapp', async () => {
        // wa.me carries text only. Download the PDF first so the user has
        // something to attach in the WhatsApp compose window.
        buildPdf().save(stamped);
        const text = `${summaryText}\n\n(PDF downloaded to your device — attach it here.)`;
        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
        setOpen(false);
    });

    const handleEmail = () => run('email', async () => {
        if (onEmailReport) {
            const blob = buildPdf().output('blob');
            await onEmailReport(blob, stamped);   // real attachment via Resend
        } else {
            buildPdf().save(stamped);
            const subject = encodeURIComponent(fileName);
            const body = encodeURIComponent(`${summaryText}\n\n(PDF downloaded — please attach it.)`);
            window.location.href = `mailto:?subject=${subject}&body=${body}`;
        }
        setOpen(false);
    });

    const handleCopy = () => run('copy', async () => {
        await navigator.clipboard.writeText(summaryText);
    });

    const handlePrint = () => run('print', async () => {
        (onPrint || (() => window.print()))();
        setOpen(false);
    });

    // ── Menu config ────────────────────────────────────────────────────────

    const items = [
        { key: 'download', label: 'Download PDF', hint: 'Save to this device', icon: Download, onClick: handleDownload },
        canNativeShare && {
            key: 'native', label: 'Share…', hint: 'Sends the PDF itself', icon: Smartphone, onClick: handleNativeShare,
        },
        { key: 'whatsapp', label: 'WhatsApp', hint: 'Summary + downloaded file', icon: MessageCircle, onClick: handleWhatsApp, tone: 'text-emerald-600' },
        {
            key: 'email',
            label: onEmailReport ? 'Email report' : 'Email',
            hint: onEmailReport ? 'Sends with the PDF attached' : 'Summary + downloaded file',
            icon: Mail,
            onClick: handleEmail,
            tone: 'text-sky-600',
        },
        { key: 'copy', label: 'Copy summary', hint: 'Plain text to clipboard', icon: ClipboardCopy, onClick: handleCopy },
        { key: 'print', label: 'Print', hint: 'Opens the print dialog', icon: Printer, onClick: handlePrint },
    ].filter(Boolean);

    return (
        <div className="relative" ref={ref}>
            <button
                onClick={() => setOpen(o => !o)}
                aria-haspopup="menu"
                aria-expanded={open}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-black text-white bg-black hover:opacity-90 transition-opacity"
            >
                <Share2 size={12} />
                <span className="hidden sm:inline">Export</span>
            </button>

            {open && (
                <div
                    role="menu"
                    className="absolute right-0 mt-2 w-60 z-50 bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-2xl overflow-hidden"
                >
                    <p className="px-3 pt-3 pb-2 text-[9px] font-black text-slate-400 uppercase tracking-widest">
                        Export or share
                    </p>

                    {items.map(item => {
                        const Icon = item.icon;
                        const isBusy = busy === item.key;
                        const isDone = done === item.key;
                        return (
                            <button
                                key={item.key}
                                role="menuitem"
                                disabled={!!busy}
                                onClick={item.onClick}
                                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50 text-left"
                            >
                                <span className={`flex-shrink-0 ${item.tone || 'text-slate-400'}`}>
                                    {isBusy
                                        ? <Loader2 size={14} className="animate-spin" />
                                        : isDone
                                            ? <Check size={14} className="text-emerald-500" />
                                            : <Icon size={14} />}
                                </span>
                                <span className="flex-1 min-w-0">
                                    <span className="block text-[11px] font-black text-slate-700 dark:text-slate-100 truncate">
                                        {item.label}
                                    </span>
                                    <span className="block text-[9px] text-slate-400 truncate">
                                        {isDone ? 'Done' : item.hint}
                                    </span>
                                </span>
                            </button>
                        );
                    })}

                    {error && (
                        <p className="px-3 py-2 text-[10px] font-bold text-red-500 border-t border-slate-100 dark:border-slate-800">
                            {error}
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}