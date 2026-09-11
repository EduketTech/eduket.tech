export default function Footer() {
  return (
    <footer className="bg-[#0A0D14] border-t border-white/5 py-10 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="font-plex-sans text-xs text-[#AEB7C7]">
            &copy; {new Date().getFullYear()} Eduket OS &middot; Nextgen Skills Development
          </p>
          <div className="flex items-center gap-4">
            <a href="/privacy" className="font-plex-sans text-xs text-[#AEB7C7] hover:text-[#1EA1FE] transition-colors">
              Privacy Policy
            </a>
            <a href="/terms" className="font-plex-sans text-xs text-[#AEB7C7] hover:text-[#1EA1FE] transition-colors">
              Terms
            </a>
            <a href="/contact" className="font-plex-sans text-xs text-[#AEB7C7] hover:text-[#1EA1FE] transition-colors">
              Contact
            </a>
            <a href="/admin" className="font-plex-sans text-xs text-[#AEB7C7] hover:text-[#1EA1FE] transition-colors">المدير</a>
          </div>
        </div>
      </div>
    </footer>
  )
}
