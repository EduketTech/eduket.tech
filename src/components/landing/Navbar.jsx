import { useState, useEffect } from 'react'
import { KeyRound, Menu, X, Sparkles } from 'lucide-react'
import logoSrc from '../../img/eduket.png'


export default function Navbar({ profile, onOpenModal, onDashboard, onSignOut }) {
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', fn, { passive: true })
    return () => window.removeEventListener('scroll', fn)
  }, [])

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled
        ? 'bg-[#0A0D14]/90 backdrop-blur-xl border-b border-white/5 shadow-lg shadow-black/20'
        : 'bg-transparent'
        }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <a href="/" className="flex items-center gap-2.5 group">
          <img
            src={logoSrc}
            alt="Eduket"
            className="h-9 w-auto rounded-xl shadow-sm group-hover:scale-105 transition-transform"
          />

        </a>

        <div className="inline-flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-1 sm:py-2 rounded-full bg-[#1EA1FE]/10 border border-[#1EA1FE]/20 mb-2 max-w-full">
          <span className="relative flex h-1.5 w-1.5 sm:h-2 sm:w-2 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#1EA1FE] opacity-75" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 sm:h-2 sm:w-2 bg-[#1EA1FE]" />
          </span>
          <Sparkles size={10} className="text-[#1EA1FE] shrink-0 sm:hidden" />
          <Sparkles size={12} className="text-[#1EA1FE] shrink-0 hidden sm:block" />
          <span className="font-plex-sans text-[10px] sm:text-xs font-semibold text-[#1EA1FE] leading-tight truncate sm:whitespace-normal">
            Africa's 1st AI-powered OS
          </span>
        </div>

        <div className="hidden md:flex items-center gap-3">
          {profile ? (
            <div className="flex items-center gap-3">
              <button
                onClick={onDashboard}
                className="text-sm font-semibold text-[#AEB7C7] hover:text-[#F3F6FB] px-3 py-2 transition-colors"
              >
                Dashboard
              </button>
              <button
                onClick={onSignOut}
                className="text-sm font-semibold text-[#AEB7C7] hover:text-[#FF3B5C] px-3 py-2 transition-colors"
              >
                Sign out
              </button>
            </div>
          ) : (
            <>
              <button
                onClick={onOpenModal}
                className="text-sm font-semibold text-[#AEB7C7] hover:text-[#F3F6FB] px-3 py-2 transition-colors"
              >
                Sign in
              </button>
              <button
                onClick={onOpenModal}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#1EA1FE] hover:bg-[#4BB8FF] text-[#0A0D14] font-bold text-sm shadow-lg shadow-[#1EA1FE]/20 transition-all"
              >
                <KeyRound size={15} /> Access Portal
              </button>
            </>
          )}
        </div>

        <button
          onClick={() => setMobileOpen((v) => !v)}
          className="md:hidden p-2 rounded-xl text-[#AEB7C7] hover:bg-white/5 transition-colors"
        >
          {mobileOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {mobileOpen && (
        <div className="md:hidden bg-[#0A0D14] border-t border-white/5 px-4 py-4 space-y-3">
          {profile ? (
            <>
              <button
                onClick={() => { setMobileOpen(false); onDashboard() }}
                className="w-full py-3 px-4 rounded-xl bg-[#1EA1FE] text-[#0A0D14] font-bold text-sm text-center"
              >
                Dashboard
              </button>
              <button
                onClick={() => { setMobileOpen(false); onSignOut() }}
                className="w-full py-3 px-4 rounded-xl border border-white/10 text-[#AEB7C7] font-semibold text-sm text-center"
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => { setMobileOpen(false); onOpenModal() }}
                className="w-full py-3.5 px-4 rounded-xl bg-[#1EA1FE] text-[#0A0D14] font-bold text-sm flex items-center justify-center gap-2"
              >
                <KeyRound size={15} /> Access Portal
              </button>
              <button
                onClick={() => { setMobileOpen(false); onOpenModal() }}
                className="w-full py-3 px-4 rounded-xl border border-white/10 text-[#AEB7C7] font-semibold text-sm text-center"
              >
                Sign in
              </button>
            </>
          )}
        </div>
      )}
    </header>
  )
}
