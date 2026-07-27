import { KeyRound } from 'lucide-react'
import { useState } from 'react';

export default function VideoSection({ onOpenModal }) {
  const [activeVideo, setActiveVideo] = useState(null);

  const DEMO_VIDEOS = [
    {
      id: 'principal',
      label: 'Principal',
      icon: '🏫',
      desc: 'School setup & approvals',
      ytId: 'F45fmq-0Ixc',
      color: 'from-purple-500 to-indigo-600',
      badge: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
    },
    {
      id: 'teacher',
      label: 'Teacher',
      icon: '📚',
      desc: 'Upload exams & mark',
      ytId: '2vrrqZoqm0U',
      color: 'from-emerald-500 to-teal-600',
      badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    },
    {
      id: 'student',
      label: 'Student',
      icon: '🎓',
      desc: 'Take exams & see results',
      ytId: 'KeGRuD6MIsE',
      color: 'from-blue-500 to-cyan-600',
      badge: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    },
  ];

  return (
    <section className="py-16 sm:py-24 px-4 bg-[#10141C] text-center border-t border-b border-white/5">
      <div className="max-w-[920px] mx-auto">

        <span className="font-plex-mono text-[13px] font-semibold uppercase tracking-[0.15em] text-[#1EA1FE] block mb-4">
          • BE INSPIRED
        </span>

        <h2 className="font-zilla text-[28px] sm:text-[34px] font-bold text-[#F3F6FB] leading-[1.2] mb-4">
          Watch Eduket{' '}
          <span className="font-caveat text-[#4BB8FF]" style={{ fontSize: '1.18em', transform: 'rotate(-2deg)' }}>
            mark a paper
          </span>
          , start to finish.
        </h2>

        <div className="flex flex-col sm:flex-row items-center justify-center
                  gap-4 mb-10 px-4">
          {DEMO_VIDEOS.map(v => (
            <button
              key={v.id}
              onClick={() => setActiveVideo(v)}
              className="group relative flex items-center gap-3 px-5 py-4
                   bg-white/5 hover:bg-white/10 border border-white/10
                   hover:border-white/20 rounded-2xl transition-all
                   duration-200 w-full sm:w-auto min-w-[180px]
                   hover:scale-105 hover:shadow-xl"
            >
              {/* Play icon */}
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${v.color}
                         flex items-center justify-center flex-shrink-0
                         shadow-lg group-hover:shadow-xl transition-shadow`}>
                <svg className="w-4 h-4 text-white ml-0.5" fill="currentColor"
                  viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>

              {/* Text */}
              <div className="text-left">
                <div className="flex items-center gap-2">
                  <span className="text-white font-bold text-sm">{v.label}</span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full
                              border ${v.badge}`}>
                    {v.icon}
                  </span>
                </div>
                <p className="text-[11px] text-[#AEB7C7] mt-0.5">{v.desc}</p>
              </div>
            </button>
          ))}
        </div>

        {/* Video modal */}
        {activeVideo && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center
                 bg-black/85 backdrop-blur-md p-4"
            onClick={() => setActiveVideo(null)}
          >
            <div
              className="relative w-full max-w-3xl"
              onClick={e => e.stopPropagation()}
            >
              {/* Modal header */}
              <div className="flex items-center justify-between mb-3 px-1">
                <div className="flex items-center gap-2">
                  <div className={`w-7 h-7 rounded-lg bg-gradient-to-br
                             ${activeVideo.color} flex items-center
                             justify-center text-sm`}>
                    {activeVideo.icon}
                  </div>
                  <span className="text-white font-bold text-sm">
                    {activeVideo.label} Walkthrough
                  </span>
                </div>
                <button
                  onClick={() => setActiveVideo(null)}
                  className="text-white/60 hover:text-white font-bold text-sm
                       flex items-center gap-1 transition-colors"
                >
                  ✕ Close
                </button>
              </div>

              {/* YouTube embed */}
              <div className="w-full aspect-video rounded-2xl overflow-hidden
                        shadow-2xl border border-white/10">
                <iframe
                  key={activeVideo.ytId}
                  src={`https://www.youtube.com/embed/${activeVideo.ytId}?autoplay=1&rel=0&modestbranding=1`}
                  className="w-full h-full"
                  allow="autoplay; fullscreen; picture-in-picture"
                  allowFullScreen
                  title={`${activeVideo.label} walkthrough`}
                />
              </div>

              {/* Switch to another video */}
              <div className="flex items-center justify-center gap-3 mt-4">
                {DEMO_VIDEOS.filter(v => v.id !== activeVideo.id).map(v => (
                  <button
                    key={v.id}
                    onClick={() => setActiveVideo(v)}
                    className="flex items-center gap-2 px-4 py-2 bg-white/10
                         hover:bg-white/20 border border-white/10
                         rounded-xl text-white text-xs font-bold
                         transition-colors"
                  >
                    {v.icon} Watch {v.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="relative rounded-2xl sm:rounded-[2rem] overflow-hidden border border-slate-200 dark:border-slate-800 shadow-2xl shadow-indigo-500/10 bg-slate-900">
          <div className="absolute top-0 left-0 right-0 h-1 z-10 bg-[#1EA1FE]" />
          <div style={{ position: 'relative', overflow: 'hidden', aspectRatio: '1920/1080' }}>
            <iframe
              src="https://share.synthesia.io/embeds/videos/9c45a63c-5bd7-4767-b288-a7938f9d7c5a"
              loading="lazy"
              title="Eduket OS — Smart learning for Africa"
              allowFullScreen
              allow="encrypted-media; fullscreen; microphone; screen-wake-lock;"
              style={{ position: 'absolute', width: '100%', height: '100%', top: 0, left: 0, border: 'none', padding: 0, margin: 0, overflow: 'hidden' }}
            />
          </div>
        </div>

        <p className="font-plex-sans text-[14px] text-[#AEB7C7] mt-[22px] max-w-[600px] mx-auto leading-relaxed">
          2-minute intro to Africa's Future Education System &middot;
        </p>

        <div className="flex justify-center mt-8">
          <button
            onClick={onOpenModal}
            className="flex items-center gap-2 px-7 py-3.5 rounded-xl bg-[#1EA1FE] hover:bg-[#4BB8FF] text-[#0A0D14] font-bold text-sm shadow-lg shadow-[#1EA1FE]/20 transition-all"
          >
            <KeyRound size={15} /> Access Portal
          </button>
        </div>
      </div>
    </section>
  )
}
