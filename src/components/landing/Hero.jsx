import { ArrowRight, KeyRound, Shield, Lock, Eye, CheckCircle2, Sparkles, HeartHandshake, Users, GraduationCap, Building2, TrendingUp } from 'lucide-react'
import EditorCard from './EditorCard'

const trustItems = [
  { icon: Shield, label: 'reCAPTCHA protected' },
  { icon: Lock, label: 'Firebase encrypted' },
  { icon: Eye, label: 'POPIA compliant' },
  { icon: CheckCircle2, label: 'No credit card required' },
]

const targetAudience = [
  { icon: GraduationCap, label: 'For Teachers', text: 'Instant Auto-Marking' },
  { icon: HeartHandshake, label: 'For Parents', text: 'Real-time Progress' },
  { icon: Users, label: 'For Schools', text: 'Custom Seat Capacity' },
]

export default function Hero({ onOpenModal }) {
  return (
    <section className="pt-[120px] pb-10 px-4 relative overflow-hidden">
      <div className="grid grid-cols-[1.05fr_0.95fr] gap-14 max-w-[1160px] mx-auto items-center max-[920px]:grid-cols-1">



        {/* Left column — text */}
        <div className="text-left">


          {/* 🌟 New Faint Pulsing Pilot / Trial Card for Schools */}
          <div className="mb-4 inline-flex items-center gap-3 px-3.5 py-2 rounded-2xl bg-[#1EA1FE]/[0.06] border border-[#1EA1FE]/20 backdrop-blur-md animate-pulse">
            <div className="w-7 h-7 rounded-xl bg-[#1EA1FE]/15 flex items-center justify-center text-[#1EA1FE] shrink-0">
              <Building2 size={15} />
            </div>
            <div className="text-left pr-1">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-black uppercase tracking-wider text-[#1EA1FE]">School Trial Access</span>
                <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-[#1EA1FE]/20 font-bold text-[#F3F6FB] border border-[#1EA1FE]/30">Zero Risk</span>
              </div>
              <p className="text-xs text-[#AEB7C7] font-medium leading-tight mt-0.5">
                Start with <strong className="text-white font-semibold">1 class batch</strong> today. Scale across your school when satisfied!
              </p>
            </div>
            <TrendingUp size={14} className="text-[#1EA1FE] shrink-0 hidden sm:block" />
          </div>

          {/* Main Badge */}


          {/* Heading */}
          <h1
            className="font-zilla font-bold text-[#F3F6FB] leading-[1.05] tracking-tight mt-3"
            style={{ fontSize: 'clamp(40px,6vw,64px)' }}
          >
            Empowering teachers.
            <br />
            <span
              className="font-caveat font-bold text-[#1EA1FE]"
              style={{ display: 'inline-block', transform: 'rotate(-2deg)' }}
            >
              Connecting parents.
            </span>
          </h1>

          {/* Description */}
          <p className="font-plex-sans text-[17px] text-[#AEB7C7] leading-relaxed mt-5 max-w-[540px]">
            <span className="text-[#1EA1FE] font-semibold">Eduket OS</span> bridges the gap between classroom and home. Teachers automate marking in seconds while parents get real-time visibility into their child's academic progress, diagnostic feedback, and subject mastery.
          </p>

          {/* Stakeholder Highlights (Teachers, Parents, Schools) */}
          <div className="grid grid-cols-3 gap-2.5 mt-6 max-w-[540px] max-[500px]:grid-cols-1">
            {targetAudience.map(({ icon: Icon, label, text }) => (
              <div
                key={label}
                className="p-3 rounded-2xl bg-[#141822]/80 border border-white/5 backdrop-blur-sm flex flex-col justify-between"
              >
                <div className="flex items-center gap-1.5 text-[#1EA1FE]">
                  <Icon size={14} />
                  <span className="text-[11px] font-bold tracking-wide uppercase">{label}</span>
                </div>
                <p className="text-xs font-semibold text-[#F3F6FB] mt-1 truncate">{text}</p>
              </div>
            ))}
          </div>

          {/* Buttons */}
          <div className="flex flex-wrap gap-3 mt-8">
            <button
              onClick={onOpenModal}
              className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl bg-[#1EA1FE] hover:bg-[#4BB8FF] text-[#0A0D14] font-bold text-[15px] shadow-lg shadow-[#1EA1FE]/20 transition-all hover:-translate-y-0.5"
            >
              Start Batch Trial <ArrowRight size={16} />
            </button>
            <button
              onClick={onOpenModal}
              className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl border border-[#1EA1FE]/40 text-[#F3F6FB] font-semibold text-[15px] hover:border-[#1EA1FE] hover:bg-[#1EA1FE]/5 transition-all"
            >
              <KeyRound size={15} className="text-[#1EA1FE]" /> Access Portal
            </button>
          </div>

          {/* Trust badges */}
          <div className="flex flex-wrap gap-2 mt-8">
            {trustItems.map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-[#141822] border border-white/5 text-[#AEB7C7]"
              >
                <Icon size={12} className="text-[#1EA1FE]" />
                {label}
              </div>
            ))}
          </div>
        </div>

        {/* Right column — editor card + parent floating badge */}
        <div className="flex flex-col justify-center items-center max-[920px]:mt-8 relative">

          {/* Floating Parent Live Insight Tag */}
          <div className="absolute -top-4 -left-2 z-20 bg-[#10141E] border border-[#1EA1FE]/30 p-2.5 px-4 rounded-2xl shadow-xl flex items-center gap-3 backdrop-blur-md animate-bounce-slow max-[500px]:hidden">
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-xs">
              <HeartHandshake size={16} />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Parent Portal</p>
              <p className="text-xs font-bold text-[#F3F6FB]">Live Child Assessment Updates</p>
            </div>
          </div>

          <EditorCard />
        </div>

      </div>
    </section>
  )
}