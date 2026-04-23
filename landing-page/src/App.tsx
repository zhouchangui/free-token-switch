import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import './i18n'; // Import i18n configuration
import {
  Zap,
  Github,
  Download,
  Monitor,
  Globe,
  Network,
  Cloud,
  RefreshCw,
  ChevronRight,
  Cpu,
  Terminal,
  Languages
} from 'lucide-react';

export default function App() {
  return (
    <div className="min-h-screen bg-[#050505] text-zinc-300 font-sans selection:bg-cyan-500/30 selection:text-cyan-100">
      <div className="fixed inset-0 scanlines pointer-events-none z-50"></div>
      <Navbar />
      
      <main className="relative z-10 pt-24 font-sans text-balance">
        <Hero />
        <Features />
        <TerminalDemo />
        <CTA />
      </main>

      <Footer />
    </div>
  );
}

function Navbar() {
  const { i18n, t } = useTranslation();

  const toggleLanguage = () => {
    const newLang = i18n.language === 'zh' ? 'en' : 'zh';
    i18n.changeLanguage(newLang);
  };

  return (
    <nav className="fixed top-0 inset-x-0 z-40 bg-[#000000]/80 backdrop-blur-md border-b border-cyan-500/20">
      <div className="max-w-7xl mx-auto px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3 group cursor-pointer">
          <div className="w-8 h-8 bg-cyan-950/50 border border-cyan-500/50 flex items-center justify-center group-hover:bg-cyan-900/50 group-hover:border-cyan-400 transition-all shadow-[0_0_10px_rgba(6,182,212,0.2)]">
            <Zap className="w-4 h-4 text-cyan-400" />
          </div>
          <span className="font-bold text-lg tracking-wider text-white uppercase">FREE.TOKEN.SWITCH_<span className="animate-pulse text-cyan-400">[]</span></span>
        </div>
        <div className="flex items-center gap-4 sm:gap-6">
          <button
            onClick={toggleLanguage}
            className="flex items-center gap-2 px-3 py-1.5 border border-cyan-500/30 bg-cyan-950/20 hover:bg-cyan-900/40 text-cyan-400 text-xs font-mono transition-all rounded shadow-[0_0_10px_rgba(6,182,212,0.1)] active:scale-95"
          >
            <Languages className="w-3.5 h-3.5" />
            {i18n.language === 'zh' ? 'EN' : '中文'}
          </button>
          <a
            href="https://github.com/zhouchangui/free-token-switch"
            target="_blank"
            rel="noreferrer"
            className="font-mono text-xs text-cyan-500/70 hover:text-cyan-400 transition-colors flex items-center gap-2"
          >
            <Github className="w-4 h-4" />
            <span className="hidden sm:inline uppercase tracking-widest">{t('nav.sourceCode')}</span>
          </a>
        </div>
      </div>
    </nav>
  );
}

function Hero() {
  const { t } = useTranslation();

  return (
    <section className="relative px-6 pt-20 pb-32 flex flex-col items-center text-center overflow-hidden">
      <div className="absolute inset-0 cyber-grid pointer-events-none -z-10" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-cyan-500/10 blur-[100px] rounded-full pointer-events-none -z-10" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="inline-flex items-center gap-2 px-4 py-1.5 bg-black border border-cyan-500/30 text-cyan-400 font-mono text-xs uppercase tracking-widest mb-8 shadow-[0_0_15px_rgba(6,182,212,0.15)]"
      >
        <span className="w-2 h-2 bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse" />
        {t('hero.badge')}
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="text-4xl md:text-7xl lg:text-[80px] font-bold tracking-tighter text-white max-w-5xl leading-[1.05] uppercase"
      >
        {t('hero.title1')} <br className="hidden md:block" />
        <span className="text-gradient-cyber text-[0.8em]">{t('hero.title2')}</span>
      </motion.h1>

      <motion.p
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="mt-8 text-lg font-mono text-zinc-400 max-w-3xl leading-relaxed"
      >
        {t('hero.desc')}
      </motion.p>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.3 }}
        className="mt-12 flex flex-col items-center gap-6"
      >
        <div className="flex flex-wrap justify-center gap-4 text-balance">
          <a
            href="https://github.com/zhouchangui/free-token-switch/releases/download/v3.15.6/Free.Token.Switch_3.15.6_universal.dmg"
            className="group flex items-center gap-3 h-14 px-8 bg-white text-black font-bold transition-all hover:bg-cyan-400 shadow-[0_0_20px_rgba(255,255,255,0.2)]"
          >
            <Download className="w-4 h-4" />
            {t('hero.downloadMac')}
          </a>
          <a
            href="https://github.com/zhouchangui/free-token-switch/releases/download/v3.15.6/Free.Token.Switch_3.15.6_x64-setup.exe"
            className="group flex items-center gap-3 h-14 px-8 bg-black border border-cyan-500/40 text-cyan-400 hover:bg-cyan-950/30 hover:border-cyan-400 transition-all"
          >
            <Monitor className="w-4 h-4" />
            {t('hero.downloadWin')}
          </a>
          <a
            href="https://github.com/zhouchangui/free-token-switch/releases/download/v3.15.6/Free.Token.Switch_3.15.6_amd64.AppImage"
            className="group flex items-center gap-3 h-14 px-8 bg-black border border-emerald-500/40 text-emerald-400 hover:bg-emerald-950/30 hover:border-emerald-400 transition-all"
          >
            <Zap className="w-4 h-4" />
            {t('hero.downloadLinux')}
          </a>
        </div>

        <div className="flex items-center gap-6 text-[10px] font-mono text-zinc-500 uppercase tracking-[0.2em]">
          <span className="flex items-center gap-1.5"><ChevronRight className="w-3 h-3 text-cyan-500" /> Standalone_Binary</span>
          <span className="flex items-center gap-1.5"><ChevronRight className="w-3 h-3 text-cyan-500" /> Open_Source</span>
          <span className="flex items-center gap-1.5"><ChevronRight className="w-3 h-3 text-cyan-500" /> P2P_Protocol</span>
        </div>
      </motion.div>

      {/* Security/Installation Notice */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
        className="mt-12 p-4 max-w-2xl border border-yellow-500/20 bg-yellow-500/5 rounded-lg text-left"
      >
        <div className="flex gap-3">
          <div className="mt-0.5"><Cpu className="w-4 h-4 text-yellow-500" /></div>
          <div>
            <h4 className="text-xs font-bold text-yellow-500 uppercase mb-1 tracking-widest underline decoration-yellow-500/50">{t('hero.noticeTitle')}</h4>
            <p className="text-[11px] leading-relaxed text-yellow-500/70 font-mono text-balance">
              {t('hero.noticeDesc')} <br/>
              <span className="text-white font-bold underline decoration-white/20">{t('hero.macStep')}</span> <br/>
              <span className="text-white font-bold underline decoration-white/20">{t('hero.winStep')}</span>
            </p>
          </div>
        </div>
      </motion.div>

      {/* Abstract Tech Dashboard Graphic */}
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.4 }}
        className="w-full max-w-5xl mx-auto mt-24 relative"
      >
        <div className="absolute -inset-0.5 bg-gradient-to-r from-cyan-500 to-emerald-500 blur opacity-20" />
        <div className="bg-black border border-cyan-500/30 p-1 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-cyan-400" />
          <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-cyan-400" />
          <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-cyan-400" />
          <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-cyan-400" />
          
          <div className="bg-[#050A0F] min-h-[350px] p-8 flex flex-col items-center justify-center relative backdrop-blur-sm overflow-hidden">
            <Globe strokeWidth={1} className="w-24 h-24 text-cyan-500 mb-6 drop-shadow-[0_0_15px_rgba(6,182,212,0.5)] animate-[spin_10s_linear_infinite]" />
            <h3 className="text-emerald-400 font-mono text-lg mb-2 neon-text-glow uppercase tracking-widest">GLOBAL_NODE_TOPOLOGY</h3>
            <p className="text-cyan-500/60 text-xs font-mono tracking-widest animate-pulse">AWAITING_PROTOCOL_HANDSHAKE...</p>

            <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iMTAiIHZpZXdCb3g9IjAgMCA2MCAxMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cGF0aCBkPSJNMCAwTDEwIDEwSDYwVjBIMHoiIGZpbGw9IiMwNjQxNWEiIGZpbGwtb3BhY2l0eT0iMC4yIi8+PC9zdmc+')] opacity-30"></div>
          </div>
        </div>
      </motion.div>
    </section>
  );
}

function Features() {
  const { t } = useTranslation();
  
  const features = [
    {
      icon: Network,
      title: t('f1.title'),
      description: t('f1.desc')
    },
    {
      icon: Zap,
      title: t('f2.title'),
      description: t('f2.desc')
    },
    {
      icon: Cloud,
      title: t('f3.title'),
      description: t('f3.desc')
    },
    {
      icon: RefreshCw,
      title: t('f4.title'),
      description: t('f4.desc')
    }
  ];

  return (
    <section className="py-24 px-6 relative bg-black border-t border-cyan-500/20">
      <div className="max-w-7xl mx-auto">
        <div className="mb-16">
          <h2 className="text-3xl md:text-5xl font-bold text-white mb-4 uppercase tracking-tight">
            {t('features.title')} <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-cyan-700">{t('features.subtitle')}</span>
          </h2>
          <p className="font-mono text-zinc-500">{'>'}{'>'} {t('features.moduleCheck')}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((feature, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: idx * 0.1 }}
              className="bg-[#050A0F] border border-cyan-900 hover:border-cyan-400 shadow-[0_0_0_rgba(6,182,212,0)] hover:shadow-[0_0_15px_rgba(6,182,212,0.3)] transition-all group flex flex-col relative"
            >
              <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-cyan-700 group-hover:border-cyan-400" />
              <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-cyan-700 group-hover:border-cyan-400" />
              
              <div className="p-8">
                <div className="w-12 h-12 bg-cyan-950/40 border border-cyan-800 flex items-center justify-center mb-6 group-hover:bg-cyan-900 transition-colors">
                  <feature.icon className="w-6 h-6 text-cyan-400 group-hover:text-white" />
                </div>
                <h3 className="text-sm font-mono text-emerald-400 mb-3 tracking-wider neon-text-glow uppercase">{feature.title}</h3>
                <p className="text-zinc-400 text-sm leading-relaxed">
                  {feature.description}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

function TerminalDemo() {
  const { t } = useTranslation();

  return (
    <section id="terminal" className="py-24 px-6 relative bg-[#02050A]">
      <div className="max-w-4xl mx-auto text-balance">
        <div className="mb-12">
          <h2 className="text-3xl font-bold text-white mb-2 uppercase tracking-tight">
            {t('terminal.title')} <span className="text-cyan-400">{t('terminal.subtitle')}</span>
          </h2>
          <p className="font-mono text-zinc-500">{'>'}{'>'} {t('terminal.host')}</p>
        </div>

        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="relative bg-black border border-cyan-900 shadow-[0_0_30px_rgba(6,182,212,0.1)] p-1 overflow-hidden"
        >
          <div className="bg-[#0c0c0c] min-h-[300px] border border-cyan-950">
            <div className="h-10 bg-cyan-950/20 border-b border-cyan-900/50 flex items-center justify-between px-4">
              <div className="font-mono text-[10px] text-cyan-500 tracking-widest flex items-center gap-2">
                <Terminal className="w-3 h-3" />
                TTY1.SH
              </div>
              <div className="text-[10px] text-zinc-600 font-mono uppercase tracking-widest">ROOT@SYS_SHELL</div>
            </div>
            
            <div className="p-6 font-mono text-sm leading-8 text-zinc-300 overflow-x-auto whitespace-pre">
              <div>
                <span className="text-emerald-400 font-bold">sys@local</span><span className="text-zinc-500">:~#</span> <span className="text-white drop-shadow-[0_0_2px_rgba(255,255,255,0.8)]">cc-switch start</span>
              </div>
              <div className="text-cyan-400/80">
                {t('terminal.init')}
              </div>
              <div className="text-emerald-400/80 flex items-center gap-2">
                <span className="text-xs">[OK]</span> {t('terminal.proxyReady')}
              </div>
              <div className="text-emerald-400/80 flex items-center gap-2 mb-6">
                <span className="text-xs">[OK]</span> {t('terminal.handshake')}
              </div>

              <div>
                <span className="text-emerald-400 font-bold">sys@local</span><span className="text-zinc-500">:~#</span> <span className="text-white drop-shadow-[0_0_2px_rgba(255,255,255,0.8)]">claude code</span>
              </div>
              <div className="text-zinc-500 mb-2 italic">
                {'>'} Initializing connection to P2P node [claude-3-5-sonnet] @ 10 sats/1k
              </div>
              <div className="text-cyan-100/90 mb-2 flex flex-col md:flex-row md:items-start gap-2">
                <span className="bg-cyan-900/50 px-2 border border-cyan-500/30 text-cyan-300 text-[10px] tracking-widest uppercase mt-1 w-fit">{t('terminal.recv')}</span>
                <span className="text-emerald-300 font-sans tracking-wide">{t('terminal.recvMsg')}</span>
              </div>
              <div className="animate-pulse w-2.5 h-5 bg-cyan-400 inline-block align-middle mt-2" />
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function CTA() {
  const { t } = useTranslation();

  return (
    <section className="py-24 px-6 relative bg-black border-y border-cyan-500/20">
      <div className="absolute inset-0 bg-gradient-to-b from-cyan-900/10 to-transparent pointer-events-none" />
      <div className="max-w-3xl mx-auto text-center relative z-10 flex flex-col items-center">
        <Cpu className="w-12 h-12 text-cyan-500 mb-6 opacity-50" />
        <h2 className="text-4xl md:text-5xl font-bold text-white mb-6 uppercase tracking-tight">
          {t('cta.title')} <span className="text-cyan-400">{t('cta.subtitle')}</span>?
        </h2>
        <p className="text-zinc-400 font-mono text-sm mb-10 max-w-xl mx-auto leading-relaxed text-center text-balance">
          {t('cta.desc')}
        </p>
        <div className="flex flex-wrap justify-center gap-4">
          <a
            href="https://github.com/zhouchangui/free-token-switch/releases/tag/v3.15.6"
            target="_blank"
            rel="noreferrer"
            className="group relative inline-flex items-center justify-center gap-2 h-14 px-10 bg-cyan-500 text-black font-mono font-bold uppercase tracking-widest transition-all hover:bg-cyan-400 shadow-[0_0_20px_rgba(6,182,212,0.4)]"
          >
            <span className="absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-white mix-blend-difference" />
            <span className="absolute bottom-0 right-0 w-2 h-2 border-b-2 border-r-2 border-white mix-blend-difference" />
            {t('cta.button')}
            <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </a>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  const { t } = useTranslation();

  return (
    <footer className="py-12 px-6 bg-[#02050A]">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between text-center md:text-left gap-6 text-balance">
        <div className="flex items-center gap-3">
          <Zap className="text-cyan-500 w-5 h-5 drop-shadow-[0_0_10px_rgba(6,182,212,0.8)]" fill="currentColor" />
          <span className="font-bold font-mono tracking-widest text-white text-sm">FREE.TOKEN.SWITCH_<span className="text-emerald-500">V3</span></span>
        </div>
        <p className="text-zinc-600 font-mono text-[10px] uppercase tracking-widest">
          {t('footer.fork')} 
          <a href="https://github.com/farion1231/cc-switch" target="_blank" rel="noreferrer" className="text-cyan-500/70 hover:text-cyan-400 ml-2">CC-SWITCH</a>
          <br className="md:hidden"/> // MIT_LICENSE // OPEN_SOURCE
        </p>
        <div className="flex gap-4">
          <a
            href="https://github.com/zhouchangui/free-token-switch"
            target="_blank"
            rel="noreferrer"
            className="w-10 h-10 border border-cyan-900 bg-cyan-950/20 hover:bg-cyan-900/50 hover:border-cyan-500 flex items-center justify-center text-cyan-500 transition-all"
          >
            <Github className="w-4 h-4" />
          </a>
        </div>
      </div>
    </footer>
  );
}
