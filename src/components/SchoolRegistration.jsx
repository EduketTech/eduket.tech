// ─── SchoolRegistration.jsx (Global Edition — AI-resolved academics & dynamic pricing) ────────
// Layout: flex-col card with scrollable middle section, sticky bottom nav.
// Curricula, provinces, districts, levels, phases, and subjects are resolved
// dynamically per-country/curriculum via Groq (academicResolver.js).
// Subscriptions use dynamic baseline & custom seat controls instead of hardcoded tiers.

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth, db, storage } from '../utils/firebase';
import {
    School, Palette, BookOpen, CheckCircle2, ArrowRight,
    Loader2, X, Image as ImageIcon, Layers, Search, ChevronDown, Save,
    AlertTriangle, RefreshCw, GraduationCap, MapPin, Users, CreditCard, ShieldCheck
} from 'lucide-react';
import PaymentManager from './PaymentManager';
import { COUNTRIES, getCountry, detectDefaultCountry } from '../utils/countries';
import { FREE_STUDENT_BASE, FREE_TEACHER_BASE, isFreeTrialBaseline } from '../utils/tierConfig';
import {
    fetchCountryCurriculumOptions,
    fetchProvinces,
    fetchDistricts,
    fetchLevels,
    fetchTeachingPhases,
    fetchSubjects,
} from '../utils/academicResolver';

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const PRESET_COLORS = [
    '#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444',
    '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#6366f1',
    '#1d4ed8', '#065f46', '#7c2d12', '#1e3a5f', '#4a1942',
];

const STEPS = [
    { num: 1, label: 'Identity', icon: School },
    { num: 2, label: 'Branding', icon: Palette },
    { num: 3, label: 'Academics', icon: BookOpen },
    { num: 4, label: 'Plan & Seats', icon: Layers },
];

// ─── GENERIC AI-FETCH HOOK ────────────────────────────────────────────────────

export function useAiList(fetchFn, deps, enabled = true) {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const depsKey = JSON.stringify(deps);

    useEffect(() => {
        if (!enabled || deps.some((d) => !d)) {
            setData([]);
            setError('');
            return;
        }
        let active = true;
        setLoading(true);
        setError('');

        fetchFn(...deps)
            .then((result) => {
                if (!active) return;
                if (!Array.isArray(result)) throw new Error('Malformed response');
                setData(result);
            })
            .catch((err) => {
                if (!active) return;
                console.error('[AI fetch failed]', err);
                setData([]);
                setError('Could not load suggestions. Please retry.');
            })
            .finally(() => { if (active) setLoading(false); });

        return () => { active = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [depsKey, enabled]);

    const retry = () => {
        if (deps.some((d) => !d)) return;
        let active = true;
        setLoading(true);
        setError('');
        fetchFn(...deps)
            .then((result) => {
                if (!active) return;
                if (!Array.isArray(result)) throw new Error('Malformed response');
                setData(result);
            })
            .catch((err) => {
                if (!active) return;
                console.error('[AI fetch retry failed]', err);
                setData([]);
                setError('Could not load suggestions. Please retry.');
            })
            .finally(() => { if (active) setLoading(false); });
    };

    return { data, loading, error, retry };
}

// ─── AI LIST STATUS ROW ───────────────────────────────────────────────────────

function AiListStatus({ loading, error, onRetry, loadingLabel }) {
    if (loading) {
        return (
            <div className="flex items-center gap-2 text-xs text-slate-400 font-bold py-2">
                <Loader2 size={13} className="animate-spin" /> {loadingLabel}
            </div>
        );
    }
    if (error) {
        return (
            <div className="flex items-center justify-between gap-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700">
                <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300 text-xs font-bold">
                    <AlertTriangle size={13} /> {error}
                </div>
                <button type="button" onClick={onRetry}
                    className="flex items-center gap-1 text-amber-700 dark:text-amber-300 text-xs font-black hover:opacity-70">
                    <RefreshCw size={12} /> Retry
                </button>
            </div>
        );
    }
    return null;
}

// ─── COUNTRY SEARCH DROPDOWN ──────────────────────────────────────────────────

function CountryPicker({ value, onChange }) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const wrapRef = useRef();
    const inputRef = useRef();
    const selected = getCountry(value);

    const filtered = useMemo(() =>
        COUNTRIES.filter((c) =>
            !query ||
            c.name.toLowerCase().includes(query.toLowerCase()) ||
            c.dial.includes(query) ||
            c.code.toLowerCase().includes(query.toLowerCase())
        ).slice(0, 80),
        [query]);

    useEffect(() => {
        const h = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', h);
        return () => document.removeEventListener('mousedown', h);
    }, []);

    return (
        <div ref={wrapRef} className="relative">
            <button
                type="button"
                onClick={() => { setOpen((o) => !o); setTimeout(() => inputRef.current?.focus(), 50); }}
                className="if flex items-center gap-3 cursor-pointer text-left w-full"
            >
                <span className="text-2xl leading-none">{selected?.flag || '🌍'}</span>
                <span className="flex-1 text-sm font-medium text-slate-800 dark:text-white">
                    {selected?.name || 'Select country'}
                </span>
                <span className="text-xs text-slate-400 font-bold">{selected?.dial}</span>
                <ChevronDown size={14} className={`text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>

            {open && (
                <div className="absolute z-50 top-full left-0 right-0 mt-2 bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                    <div className="p-3 border-b border-slate-100 dark:border-slate-700 flex items-center gap-2">
                        <Search size={14} className="text-slate-400 flex-shrink-0" />
                        <input
                            ref={inputRef}
                            type="text"
                            value={query}
                            placeholder="Search country..."
                            className="flex-1 bg-transparent text-sm outline-none text-slate-800 dark:text-white placeholder:text-slate-400"
                            onChange={(e) => setQuery(e.target.value)}
                        />
                        {query && <button type="button" onClick={() => setQuery('')}><X size={12} className="text-slate-400" /></button>}
                    </div>
                    <div className="max-h-56 overflow-y-auto">
                        {filtered.length === 0
                            ? <p className="text-xs text-slate-400 text-center py-6">No countries found</p>
                            : filtered.map((c) => (
                                <button key={c.code} type="button"
                                    onClick={() => { onChange(c.code); setOpen(false); setQuery(''); }}
                                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors ${value === c.code ? 'bg-indigo-50 dark:bg-indigo-900/30' : ''}`}>
                                    <span className="text-xl leading-none w-7 flex-shrink-0">{c.flag}</span>
                                    <span className="flex-1 text-sm text-slate-800 dark:text-white font-medium">{c.name}</span>
                                    <span className="text-xs text-slate-400 font-bold">{c.dial}</span>
                                    {value === c.code && <CheckCircle2 size={12} className="text-indigo-500 flex-shrink-0" />}
                                </button>
                            ))}
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── PHONE INPUT ──────────────────────────────────────────────────────────────

function PhoneInput({ countryCode, value, onChange }) {
    const country = getCountry(countryCode);
    return (
        <div className="flex gap-2">
            <div className="flex items-center gap-1.5 px-3 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 flex-shrink-0 select-none">
                <span className="text-base leading-none">{country?.flag || '🌍'}</span>
                <span className="text-xs font-black text-slate-600 dark:text-slate-300 whitespace-nowrap">{country?.dial || ''}</span>
            </div>
            <input
                type="tel"
                value={value}
                placeholder="Phone number"
                inputMode="numeric"
                className="if flex-1"
                onChange={(e) => onChange(e.target.value.replace(/[^\d\s\-()]/g, ''))}
            />
        </div>
    );
}

// ─── REGION FIELD ─────────────────────────────────────────────────────────────

function RegionField({ country, value, onChange }) {
    const label = country?.regionLabel || 'State / Region';
    const { data: provinces, loading, error, retry } = useAiList(
        fetchProvinces,
        [country?.name],
        !!country?.name
    );

    if (!country?.name) {
        return (
            <div>
                <label className="lx">{label}</label>
                <input type="text" value={value} placeholder="Select a country first" disabled className="if opacity-50" />
            </div>
        );
    }

    return (
        <div>
            <label className="lx flex items-center gap-1.5">
                <MapPin size={11} /> {label}
            </label>
            {loading && <AiListStatus loading loadingLabel={`Looking up ${label.toLowerCase()}s for ${country.name}...`} />}
            {!loading && error && <AiListStatus error={error} onRetry={retry} />}
            {!loading && !error && provinces.length > 0 && (
                <select value={value} className="if" onChange={(e) => onChange(e.target.value)}>
                    <option value="">Select {label}...</option>
                    {provinces.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
            )}
            {!loading && !error && provinces.length === 0 && (
                <input type="text" value={value} placeholder={`Enter ${label}`} className="if" onChange={(e) => onChange(e.target.value)} />
            )}
        </div>
    );
}

// ─── DISTRICT FIELD ───────────────────────────────────────────────────────────

function DistrictField({ country, province, value, onChange }) {
    const { data: districts, loading, error, retry } = useAiList(
        fetchDistricts,
        [country?.name, province],
        !!country?.name && !!province
    );

    if (!province) {
        return (
            <div>
                <label className="lx">District / City</label>
                <input type="text" value={value} placeholder="Select a province first" disabled className="if opacity-50" />
            </div>
        );
    }

    return (
        <div>
            <label className="lx">District / City</label>
            {loading && <AiListStatus loading loadingLabel={`Looking up districts in ${province}...`} />}
            {!loading && error && <AiListStatus error={error} onRetry={retry} />}
            {!loading && !error && districts.length > 0 && (
                <select value={value} className="if" onChange={(e) => onChange(e.target.value)}>
                    <option value="">Select District...</option>
                    {districts.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
            )}
            {!loading && !error && districts.length === 0 && (
                <input type="text" value={value} placeholder="Enter district / city" className="if" onChange={(e) => onChange(e.target.value)} />
            )}
        </div>
    );
}

// ─── CURRICULA PICKER ─────────────────────────────────────────────────────────

function CurriculaPicker({ country, selected, onToggle, primary, customCurriculum, setCustomCurriculum, addCustomCurriculum }) {
    const { data: curriculaOptions, loading, error, retry } = useAiList(
        fetchCountryCurriculumOptions,
        [country?.name],
        !!country?.name
    );

    if (!country?.name) {
        return <p className="text-xs text-slate-400 italic">Select a country in Step 1 to load curriculum options.</p>;
    }

    return (
        <div>
            <label className="lx">Curricula Offered * — select all that apply</label>

            {loading && <AiListStatus loading loadingLabel={`Finding curricula used in ${country.name}...`} />}
            {!loading && error && <AiListStatus error={error} onRetry={retry} />}

            {!loading && !error && (
                <div className="grid grid-cols-2 gap-2">
                    {curriculaOptions.map((c) => {
                        const active = selected.includes(c);
                        return (
                            <button key={c} type="button" onClick={() => onToggle(c)}
                                className={`p-3 rounded-2xl border-2 text-xs font-bold text-left transition-all ${active ? 'border-transparent text-white' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-slate-400'}`}
                                style={active ? { backgroundColor: primary, borderColor: primary } : {}}>
                                {active && '✓ '}{c}
                            </button>
                        );
                    })}
                    {curriculaOptions.length === 0 && (
                        <p className="text-xs text-slate-400 col-span-2">No suggestions found — add yours below.</p>
                    )}
                </div>
            )}

            <div className="mt-3 flex gap-2">
                <input
                    type="text" value={customCurriculum}
                    placeholder="Add custom curriculum..."
                    className="if flex-1 !py-3"
                    onChange={(e) => setCustomCurriculum(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomCurriculum(); } }}
                />
                <button type="button" onClick={addCustomCurriculum}
                    className="px-4 py-3 rounded-2xl text-white text-xs font-black whitespace-nowrap"
                    style={{ backgroundColor: primary }}>
                    + Add
                </button>
            </div>

            {selected.filter((c) => !curriculaOptions.includes(c)).length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                    {selected.filter((c) => !curriculaOptions.includes(c)).map((c) => (
                        <span key={c} className="flex items-center gap-1 px-3 py-1 rounded-full text-white text-xs font-bold" style={{ backgroundColor: primary }}>
                            {c}
                            <button type="button" onClick={() => onToggle(c)} className="ml-1 opacity-70 hover:opacity-100"><X size={10} /></button>
                        </span>
                    ))}
                </div>
            )}

            {!selected.length && (
                <p className="text-xs text-red-500 mt-2 font-bold">Please select or add at least one curriculum.</p>
            )}
        </div>
    );
}

// ─── TEACHING PHASE PICKER ────────────────────────────────────────────────────

function PhasePicker({ country, curriculum, selected, onToggle, primary }) {
    const { data: phases, loading, error, retry } = useAiList(
        fetchTeachingPhases,
        [country?.name, curriculum],
        !!country?.name && !!curriculum
    );

    if (!curriculum) {
        return <p className="text-xs text-slate-400 italic">Select a curriculum above to load teaching phases.</p>;
    }

    return (
        <div>
            <label className="lx">Teaching Phases Offered</label>
            {loading && <AiListStatus loading loadingLabel={`Finding teaching phases for ${curriculum}...`} />}
            {!loading && error && <AiListStatus error={error} onRetry={retry} />}
            {!loading && !error && (
                <div className="flex flex-wrap gap-2">
                    {phases.map((p) => {
                        const active = selected.includes(p);
                        return (
                            <button key={p} type="button" onClick={() => onToggle(p)}
                                className={`px-3 py-2 rounded-xl border-2 text-xs font-bold transition-all ${active ? 'border-transparent text-white' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-slate-400'}`}
                                style={active ? { backgroundColor: primary, borderColor: primary } : {}}>
                                {active && '✓ '}{p}
                            </button>
                        );
                    })}
                    {phases.length === 0 && <p className="text-xs text-slate-400">No phase suggestions available.</p>}
                </div>
            )}
        </div>
    );
}

// ─── ACADEMIC LEVELS PICKER ───────────────────────────────────────────────────

function LevelsPicker({ country, curriculum, selected, onToggle, primary }) {
    const { data: levels, loading, error, retry } = useAiList(
        fetchLevels,
        [country?.name, curriculum],
        !!country?.name && !!curriculum
    );

    if (!curriculum) {
        return <p className="text-xs text-slate-400 italic">Select a curriculum above to load academic levels.</p>;
    }

    return (
        <div>
            <label className="lx">Academic Levels Offered</label>
            {loading && <AiListStatus loading loadingLabel={`Finding academic levels for ${curriculum}...`} />}
            {!loading && error && <AiListStatus error={error} onRetry={retry} />}
            {!loading && !error && (
                <div className="max-h-40 overflow-y-auto grid grid-cols-2 gap-2 pr-1">
                    {levels.map((lvl) => {
                        const active = selected.includes(lvl);
                        return (
                            <button key={lvl} type="button" onClick={() => onToggle(lvl)}
                                className={`px-3 py-2 rounded-xl border-2 text-xs font-bold text-left transition-all ${active ? 'border-transparent text-white' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-slate-400'}`}
                                style={active ? { backgroundColor: primary, borderColor: primary } : {}}>
                                {active && '✓ '}{lvl}
                            </button>
                        );
                    })}
                    {levels.length === 0 && <p className="text-xs text-slate-400 col-span-2">No level suggestions available.</p>}
                </div>
            )}
        </div>
    );
}

// ─── SUBJECTS PICKER ──────────────────────────────────────────────────────────

function SubjectsPicker({ country, curriculum, phase, selected, onToggle, primary }) {
    const { data: subjects, loading, error, retry } = useAiList(
        fetchSubjects,
        [country?.name, curriculum, phase],
        !!country?.name && !!curriculum && !!phase
    );

    if (!phase) {
        return <p className="text-xs text-slate-400 italic">Select a teaching phase above to load subjects.</p>;
    }

    return (
        <div>
            <label className="lx">Subjects Offered — {phase}</label>
            {loading && <AiListStatus loading loadingLabel={`Finding subjects for ${phase}...`} />}
            {!loading && error && <AiListStatus error={error} onRetry={retry} />}
            {!loading && !error && (
                <div className="flex flex-wrap gap-2">
                    {subjects.map((s) => {
                        const active = selected.includes(s);
                        return (
                            <button key={s} type="button" onClick={() => onToggle(s)}
                                className={`px-3 py-2 rounded-xl border-2 text-xs font-bold transition-all ${active ? 'border-transparent text-white' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-slate-400'}`}
                                style={active ? { backgroundColor: primary, borderColor: primary } : {}}>
                                {active && '✓ '}{s}
                            </button>
                        );
                    })}
                    {subjects.length === 0 && <p className="text-xs text-slate-400">No subject suggestions available.</p>}
                </div>
            )}
        </div>
    );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export default function SchoolRegistration({ principalProfile, onComplete }) {
    const navigate = useNavigate();
    const { state } = useLocation();
    const seed = state?.seed || {};

    // Step 1
    const [countryCode, setCountryCode] = useState(seed.countryCode || detectDefaultCountry());
    const [schoolName, setSchoolName] = useState(seed.name || principalProfile?.school || '');
    const [motto, setMotto] = useState('');
    const [established, setEstablished] = useState('');
    const [region, setRegion] = useState(seed.province || principalProfile?.province || '');
    const [district, setDistrict] = useState(seed.district || principalProfile?.district || '');
    const [address, setAddress] = useState('');
    const [phone, setPhone] = useState('');
    const [email, setEmail] = useState(seed.principalEmail || principalProfile?.email || '');

    // Step 2
    const [primary, setPrimary] = useState('#4f46e5');
    const [logoFile, setLogoFile] = useState(null);
    const [logoPreview, setLogoPreview] = useState(null);
    const logoInputRef = useRef();

    // Step 3 — academics
    const [curricula, setCurricula] = useState(seed.curricula || []);
    const [customCurriculum, setCustomCurriculum] = useState('');
    const [primaryCurriculum, setPrimaryCurriculum] = useState('');
    const [phases, setPhases] = useState([]);
    const [primaryPhase, setPrimaryPhase] = useState('');
    const [levels, setLevels] = useState([]);
    const [subjects, setSubjects] = useState([]);

    // Step 4 — dynamic custom pricing inputs
    const [studentCount, setStudentCount] = useState(FREE_STUDENT_BASE);
    const [teacherCount, setTeacherCount] = useState(FREE_TEACHER_BASE);
    const [showPayment, setShowPayment] = useState(false);

    // UI State
    const [step, setStep] = useState(1);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSavingDraft, setIsSavingDraft] = useState(false);
    const [error, setError] = useState('');

    const country = getCountry(countryCode);
    const isBaseline = isFreeTrialBaseline(studentCount, teacherCount);

    // Dynamic state listeners & dependency resets
    useEffect(() => { setRegion(''); setDistrict(''); }, [countryCode]);
    useEffect(() => { setDistrict(''); }, [region]);
    useEffect(() => { setPhases([]); setPrimaryPhase(''); setLevels([]); setSubjects([]); }, [primaryCurriculum]);
    useEffect(() => { setSubjects([]); }, [primaryPhase]);

    useEffect(() => {
        if (primaryCurriculum && !curricula.includes(primaryCurriculum)) {
            setPrimaryCurriculum(curricula[0] || '');
        } else if (!primaryCurriculum && curricula.length > 0) {
            setPrimaryCurriculum(curricula[0]);
        }
    }, [curricula, primaryCurriculum]);

    useEffect(() => {
        if (primaryPhase && !phases.includes(primaryPhase)) {
            setPrimaryPhase('');
        }
    }, [phases, primaryPhase]);

    // ── Handlers ─────────────────────────────────────────────────────────────
    const handleLogoChange = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 2 * 1024 * 1024) { setError('Logo must be under 2 MB.'); return; }
        setLogoFile(file);
        const reader = new FileReader();
        reader.onloadend = () => setLogoPreview(reader.result);
        reader.readAsDataURL(file);
    };

    const removeLogo = () => {
        setLogoFile(null); setLogoPreview(null);
        if (logoInputRef.current) logoInputRef.current.value = '';
    };

    const toggleCurriculum = (c) =>
        setCurricula((prev) => prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]);

    const addCustomCurriculum = () => {
        const val = customCurriculum.trim();
        if (!val) return;
        if (!curricula.includes(val)) setCurricula((p) => [...p, val]);
        setCustomCurriculum('');
    };

    const togglePhase = (p) =>
        setPhases((prev) => {
            const next = prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p];
            if (!primaryPhase && next.includes(p)) setPrimaryPhase(p);
            return next;
        });

    const toggleLevel = (lvl) =>
        setLevels((prev) => prev.includes(lvl) ? prev.filter((x) => x !== lvl) : [...prev, lvl]);

    const toggleSubject = (s) =>
        setSubjects((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]);

    const canProceed = () => {
        if (step === 1) return schoolName.trim().length > 0 && !!countryCode;
        if (step === 3) return curricula.length > 0;
        return true;
    };

    const goNext = () => { if (canProceed()) setStep((s) => s + 1); };
    const goBack = () => setStep((s) => s - 1);

    const buildRegistrationPayload = async (uid) => {
        let logoUrl = null;
        if (logoFile && storage) {
            const lr = storageRef(storage, `schoolLogos/${uid}/${logoFile.name}`);
            const snap = await uploadBytes(lr, logoFile);
            logoUrl = await getDownloadURL(snap.ref);
        }

        const fullPhone = phone ? `${country?.dial || ''} ${phone}`.trim() : '';

        return {
            name: schoolName.trim(),
            motto: motto.trim(),
            established: established || null,
            countryCode,
            country: country?.name || '',
            countryFlag: country?.flag || '',
            region: region.trim(),
            district: district.trim(),
            address: address.trim(),
            phone: fullPhone,
            email: email.trim(),
            primary,
            logoUrl: logoUrl || logoPreview,
            curricula,
            primaryCurriculum,
            teachingPhases: phases,
            academicLevels: levels,
            subjects,
            studentLimit: Number(studentCount) || FREE_STUDENT_BASE,
            teacherLimit: Number(teacherCount) || FREE_TEACHER_BASE,
            tier: isBaseline ? 'free' : 'custom',
            tierUpdatedAt: serverTimestamp(),
            principalUid: uid,
            updatedAt: serverTimestamp(),
        };
    };

    const handleSaveAndCompleteLater = async () => {
        const uid = auth.currentUser?.uid || principalProfile?.uid || seed.principalUid;
        if (!uid) { setError('User state validation failed. Cannot save draft.'); return; }
        if (!schoolName.trim()) { setError('A School Name is required to save an application entry.'); return; }

        setIsSavingDraft(true);
        setError('');

        try {
            const draftPayload = await buildRegistrationPayload(uid);
            const partialData = {
                ...draftPayload,
                registrationStatus: 'DRAFT',
                createdAt: serverTimestamp()
            };

            await setDoc(doc(db, 'schools', uid), partialData, { merge: true });
            await setDoc(doc(db, 'principals', uid), { schoolId: uid, school: schoolName.trim(), updatedAt: serverTimestamp() }, { merge: true });

            navigate('/principal-dashboard');
        } catch (err) {
            console.error(err);
            setError('Failed to securely save setup progress.');
        } finally {
            setIsSavingDraft(false);
        }
    };

    const handleSubmit = async () => {
        if (!schoolName.trim()) { setError('School name is required.'); return; }
        if (!countryCode) { setError('Please select a country.'); return; }
        if (!curricula.length) { setError('Select at least one curriculum.'); return; }

        setIsSubmitting(true);
        setError('');

        try {
            const uid = auth.currentUser?.uid || principalProfile?.uid || seed.principalUid;
            const schoolData = await buildRegistrationPayload(uid);

            const finalPayload = {
                ...schoolData,
                registrationStatus: 'COMPLETED',
                createdAt: serverTimestamp()
            };

            await setDoc(doc(db, 'schools', uid), finalPayload);
            await setDoc(doc(db, 'principals', uid), { schoolId: uid, school: schoolName.trim(), updatedAt: serverTimestamp() }, { merge: true });
            await setDoc(doc(db, 'users', uid), { schoolId: uid }, { merge: true });

            if (onComplete) onComplete(uid);
            navigate('/principal-dashboard');
        } catch (err) {
            console.error(err);
            setError('Failed to register school. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <>
            {/* Full-page Background Container */}
            <div className="fixed inset-0 w-screen h-screen flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-md z-50 overflow-hidden">
                <div className="bg-white dark:bg-slate-900 w-full max-w-4xl h-full max-h-[92vh] rounded-[2.5rem] shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden">

                    {/* Header */}
                    <div className="px-8 py-5 bg-gradient-to-r from-indigo-600 via-indigo-700 to-purple-700 text-white flex justify-between items-center shrink-0">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center">
                                <School size={20} />
                            </div>
                            <div>
                                <h2 className="text-xl font-black">Register School Campus</h2>
                                <p className="text-xs text-indigo-100 font-medium">Configure identity, academics & system capacity</p>
                            </div>
                        </div>

                        {/* Step Navigation Indicators */}
                        <div className="hidden md:flex items-center gap-2 bg-white/10 px-4 py-2 rounded-2xl backdrop-blur-sm">
                            {STEPS.map((s) => {
                                const Icon = s.icon;
                                const isDone = step > s.num;
                                const isCurrent = step === s.num;
                                return (
                                    <div key={s.num} className="flex items-center gap-2">
                                        <div className={`w-7 h-7 rounded-xl flex items-center justify-center text-xs font-black transition-all ${isCurrent ? 'bg-white text-indigo-600 shadow' : isDone ? 'bg-emerald-400 text-slate-900' : 'bg-white/20 text-white'}`}>
                                            {isDone ? '✓' : s.num}
                                        </div>
                                        <span className={`text-xs font-bold ${isCurrent ? 'text-white' : 'text-indigo-200'}`}>{s.label}</span>
                                        {s.num < STEPS.length && <span className="text-indigo-300 mx-1">/</span>}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Scrollable Form Body */}
                    <div className="p-8 overflow-y-auto flex-1 space-y-6">
                        {error && (
                            <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 flex items-center gap-3 text-red-600 dark:text-red-300 text-xs font-bold">
                                <AlertTriangle size={16} className="shrink-0" />
                                <span>{error}</span>
                            </div>
                        )}

                        {/* STEP 1: IDENTITY */}
                        {step === 1 && (
                            <div className="space-y-4">
                                <h3 className="text-lg font-black text-slate-800 dark:text-white flex items-center gap-2">
                                    <School className="text-indigo-500" size={18} /> Basic Information
                                </h3>

                                <div>
                                    <label className="lx">Country *</label>
                                    <CountryPicker value={countryCode} onChange={setCountryCode} />
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <label className="lx">School Name *</label>
                                        <input type="text" value={schoolName} onChange={(e) => setSchoolName(e.target.value)} placeholder="e.g. St. Mark Academy" className="if" />
                                    </div>

                                    <div>
                                        <label className="lx">Motto / Slogan</label>
                                        <input type="text" value={motto} onChange={(e) => setMotto(e.target.value)} placeholder="e.g. Excellence in Action" className="if" />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <RegionField country={country} value={region} onChange={setRegion} />
                                    <DistrictField country={country} province={region} value={district} onChange={setDistrict} />
                                </div>

                                <div>
                                    <label className="lx">Physical Street Address</label>
                                    <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="123 Education Way, Campus Row" className="if" />
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <label className="lx">Contact Phone</label>
                                        <PhoneInput countryCode={countryCode} value={phone} onChange={setPhone} />
                                    </div>

                                    <div>
                                        <label className="lx">Official Administrative Email</label>
                                        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@school.edu" className="if" />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* STEP 2: BRANDING */}
                        {step === 2 && (
                            <div className="space-y-6">
                                <h3 className="text-lg font-black text-slate-800 dark:text-white flex items-center gap-2">
                                    <Palette className="text-indigo-500" size={18} /> Visual Identity & Branding
                                </h3>

                                <div>
                                    <label className="lx">Primary Theme Color</label>
                                    <div className="flex flex-wrap gap-3 mt-2">
                                        {PRESET_COLORS.map((c) => (
                                            <button
                                                key={c}
                                                type="button"
                                                onClick={() => setPrimary(c)}
                                                className={`w-9 h-9 rounded-2xl transition-all ${primary === c ? 'ring-4 ring-indigo-500 scale-110 shadow-lg' : 'hover:scale-105'}`}
                                                style={{ backgroundColor: c }}
                                            />
                                        ))}
                                    </div>
                                </div>

                                <div>
                                    <label className="lx">School Emblem / Logo</label>
                                    <div className="mt-2 flex items-center gap-4">
                                        {logoPreview ? (
                                            <div className="relative w-24 h-24 rounded-3xl border-2 border-dashed border-indigo-500 p-2 overflow-hidden flex items-center justify-center bg-slate-50 dark:bg-slate-800">
                                                <img src={logoPreview} alt="Logo preview" className="max-h-full max-w-full object-contain" />
                                                <button type="button" onClick={removeLogo} className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full shadow hover:bg-red-600">
                                                    <X size={12} />
                                                </button>
                                            </div>
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={() => logoInputRef.current?.click()}
                                                className="w-24 h-24 rounded-3xl border-2 border-dashed border-slate-300 dark:border-slate-700 flex flex-col items-center justify-center text-slate-400 hover:border-indigo-500 hover:text-indigo-500 transition-all bg-slate-50 dark:bg-slate-800/50"
                                            >
                                                <ImageIcon size={24} />
                                                <span className="text-[10px] font-bold mt-1">Upload</span>
                                            </button>
                                        )}
                                        <input ref={logoInputRef} type="file" accept="image/*" onChange={handleLogoChange} className="hidden" />
                                        <div className="text-xs text-slate-500 space-y-1">
                                            <p className="font-bold text-slate-700 dark:text-slate-300">PNG, JPG or SVG formats accepted</p>
                                            <p>Maximum size: 2MB. Transparent PNG recommended.</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* STEP 3: ACADEMICS */}
                        {step === 3 && (
                            <div className="space-y-6">
                                <h3 className="text-lg font-black text-slate-800 dark:text-white flex items-center gap-2">
                                    <BookOpen className="text-indigo-500" size={18} /> Academic Framework & Structure
                                </h3>

                                <CurriculaPicker
                                    country={country}
                                    selected={curricula}
                                    onToggle={toggleCurriculum}
                                    primary={primary}
                                    customCurriculum={customCurriculum}
                                    setCustomCurriculum={setCustomCurriculum}
                                    addCustomCurriculum={addCustomCurriculum}
                                />

                                {curricula.length > 0 && (
                                    <>
                                        <PhasePicker
                                            country={country}
                                            curriculum={primaryCurriculum}
                                            selected={phases}
                                            onToggle={togglePhase}
                                            primary={primary}
                                        />

                                        <LevelsPicker
                                            country={country}
                                            curriculum={primaryCurriculum}
                                            selected={levels}
                                            onToggle={toggleLevel}
                                            primary={primary}
                                        />

                                        <SubjectsPicker
                                            country={country}
                                            curriculum={primaryCurriculum}
                                            phase={primaryPhase}
                                            selected={subjects}
                                            onToggle={toggleSubject}
                                            primary={primary}
                                        />
                                    </>
                                )}
                            </div>
                        )}

                        {/* STEP 4: PLAN & SEATS (Dynamic Custom Controls) */}
                        {step === 4 && (
                            <div className="space-y-6">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <h3 className="text-lg font-black text-slate-800 dark:text-white flex items-center gap-2">
                                            <Layers className="text-indigo-500" size={18} /> Capacity & Subscription Setup
                                        </h3>
                                        <p className="text-xs text-slate-500 mt-0.5">Define your required student and educator seat quotas.</p>
                                    </div>
                                    <span className="text-xs font-black px-3 py-1 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400">
                                        {isBaseline ? 'Free Baseline' : 'Custom Active Scale'}
                                    </span>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    {/* Student Capacity Input */}
                                    <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                                        <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-bold text-xs">
                                            <GraduationCap size={16} /> Student Seats Quota
                                        </div>
                                        <div className="mt-3 flex items-center justify-between">
                                            <span className="text-xs text-slate-500">Includes {FREE_STUDENT_BASE} free seats</span>
                                            <input
                                                type="number"
                                                min={FREE_STUDENT_BASE}
                                                value={studentCount}
                                                onChange={(e) => setStudentCount(Math.max(1, parseInt(e.target.value) || 0))}
                                                className="if !w-28 text-center font-black text-lg"
                                            />
                                        </div>
                                    </div>

                                    {/* Teacher Capacity Input */}
                                    <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                                        <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-bold text-xs">
                                            <Users size={16} /> Teacher Seats Quota
                                        </div>
                                        <div className="mt-3 flex items-center justify-between">
                                            <span className="text-xs text-slate-500">Includes {FREE_TEACHER_BASE} free seats</span>
                                            <input
                                                type="number"
                                                min={FREE_TEACHER_BASE}
                                                value={teacherCount}
                                                onChange={(e) => setTeacherCount(Math.max(1, parseInt(e.target.value) || 0))}
                                                className="if !w-28 text-center font-black text-lg"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Billing Overview Action Card */}
                                <div className="p-6 rounded-3xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/40 flex flex-col sm:flex-row justify-between items-center gap-4">
                                    <div>
                                        <h4 className="text-sm font-black text-slate-800 dark:text-white">Selected Capacity Overview</h4>
                                        <p className="text-xs text-slate-500 mt-1">
                                            {isBaseline
                                                ? 'Standard baseline tier selected — 100% free account.'
                                                : `Custom setup configured for ${studentCount} students and ${teacherCount} teachers.`}
                                        </p>
                                    </div>

                                    {!isBaseline && (
                                        <button
                                            type="button"
                                            onClick={() => setShowPayment(true)}
                                            className="w-full sm:w-auto px-5 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2 transition-all whitespace-nowrap"
                                        >
                                            <CreditCard size={15} /> Calculate & Checkout
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Sticky Footer Action Bar */}
                    <div className="px-8 py-4 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-800 flex justify-between items-center shrink-0">
                        <button
                            type="button"
                            onClick={handleSaveAndCompleteLater}
                            disabled={isSavingDraft || isSubmitting}
                            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-bold transition-all disabled:opacity-50"
                        >
                            {isSavingDraft ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                            <span>Save & Exit</span>
                        </button>

                        <div className="flex gap-3">
                            {step > 1 && (
                                <button
                                    type="button"
                                    onClick={goBack}
                                    disabled={isSubmitting}
                                    className="px-5 py-2.5 rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-white text-xs font-black hover:opacity-80 transition-all"
                                >
                                    Back
                                </button>
                            )}

                            {step < 4 ? (
                                <button
                                    type="button"
                                    onClick={goNext}
                                    disabled={!canProceed()}
                                    className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-white text-xs font-black shadow-lg transition-all disabled:opacity-50"
                                    style={{ backgroundColor: primary }}
                                >
                                    <span>Next Step</span>
                                    <ArrowRight size={14} />
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    onClick={handleSubmit}
                                    disabled={isSubmitting}
                                    className="flex items-center gap-2 px-8 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black shadow-lg shadow-emerald-600/20 transition-all disabled:opacity-50"
                                >
                                    {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                                    <span>Complete Registration</span>
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Dynamic Custom Payment Manager Modal */}
            {showPayment && (
                <PaymentManager
                    schoolId={auth.currentUser?.uid || seed.principalUid}
                    schoolName={schoolName}
                    schoolData={{
                        studentCount: Number(studentCount),
                        teacherCount: Number(teacherCount),
                    }}
                    onClose={() => setShowPayment(false)}
                />
            )}
        </>
    );
}