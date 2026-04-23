import { motion } from 'motion/react';
import {
  Zap,
  Github,
  Download,
  Monitor,
  Globe,
  Network,
  Cloud,
  RefreshCw,
  TerminalBox,
  ChevronRight,
  ChevronDown,
  Cpu,
  Terminal
} from 'lucide-react';

export default function App() {
  return (
    <div className="min-h-screen bg-[#050505] text-zinc-300 font-sans selection:bg-cyan-500/30 selection:text-cyan-100">
      <div className="fixed inset-0 scanlines pointer-events-none z-50"></div>
      <Navbar />
      
      <main className="relative z-10 pt-24 font-sans">
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
  return (
    <nav className="fixed top-0 inset-x-0 z-40 bg-[#000000]/80 backdrop-blur-md border-b border-cyan-500/20">
      <div className="max-w-7xl mx-auto px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3 group cursor-pointer">
          <div className="w-8 h-8 bg-cyan-950/50 border border-cyan-500/50 flex items-center justify-center group-hover:bg-cyan-900/50 group-hover:border-cyan-400 transition-all shadow-[0_0_10px_rgba(6,182,212,0.2)]">
            <Zap className="w-4 h-4 text-cyan-400" />
          </div>
          <span className="font-bold text-lg tracking-wider text-white">FREE.TOKEN.SWITCH_<span className="animate-pulse text-cyan-400">[]</span></span>
        </div>
        <div className="flex items-center gap-6">
          <a
            href="https://github.com/zhouchangui/free-token-switch"
            target="_blank"
            rel="noreferrer"
            className="font-mono text-xs text-cyan-500/70 hover:text-cyan-400 transition-colors flex items-center gap-2"
          >
            <Github className="w-4 h-4" />
            <span className="hidden sm:inline uppercase tracking-widest">Source_Code</span>
          </a>
        </div>
      </div>
    </nav>
  );
}

function Hero() {
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
        <span className="w-2 h-2 bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
        v3.15.1_NODE_ACTIVE
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="text-5xl md:text-7xl lg:text-[80px] font-bold tracking-tighter text-white max-w-5xl leading-[1.05] uppercase"
      >
        Decentralized <br className="hidden md:block" />
        <span className="text-gradient-cyber">AI Token Market</span>
      </motion.h1>

      <motion.p
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="mt-8 text-lg font-mono text-zinc-400 max-w-2xl leading-relaxed"
      >
        <span className="text-emerald-500">{'>'}{'>'}</span> Turn unused quotas into Lightning Network value. A unified CLI manager powered by <span className="text-cyan-300">Nostr</span> and <span className="text-cyan-300">LND</span>.
      </motion.p>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.3 }}
        className="mt-12 flex flex-col sm:flex-row items-center gap-4 font-mono text-sm uppercase tracking-wider"
      >
        <a
          href="https://github.com/zhouchangui/free-token-switch/releases/latest"
          target="_blank"
          rel="noreferrer"
          className="group flex items-center justify-center gap-3 h-14 w-full sm:w-auto px-8 bg-cyan-500 hover:bg-cyan-400 text-black font-bold transition-all shadow-[0_0_20px_rgba(6,182,212,0.4)]"
        >
          <Download className="w-4 h-4" />
          Download_PKG
        </a>
        <a
          href="#terminal"
          className="group flex items-center justify-center gap-3 h-14 w-full sm:w-auto px-8 bg-black border border-cyan-500/40 text-cyan-400 hover:bg-cyan-950/30 hover:border-cyan-400 transition-all"
        >
          <Terminal className="w-4 h-4" />
          View_Terminal
        </a>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.5 }}
        className="mt-10 flex flex-wrap justify-center items-center gap-4 font-mono text-xs text-zinc-500"
      >
        <span>[ DARWIN ]</span>
        <span>[ WINDOWS ]</span>
        <span>[ LINUX ]</span>
        <span className="text-cyan-900">|</span>
        <span className="text-emerald-500/80">STANDALONE_BINARY</span>
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
          {/* Corner accents */}
          <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-cyan-400" />
          <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-cyan-400" />
          <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-cyan-400" />
          <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-cyan-400" />
          
          <div className="bg-[#050A0F] min-h-[350px] p-8 flex flex-col items-center justify-center relative backdrop-blur-sm">
            <Globe strokeWidth={1} className="w-24 h-24 text-cyan-500 mb-6 drop-shadow-[0_0_15px_rgba(6,182,212,0.5)] animate-[spin_10s_linear_infinite]" />
            <h3 className="text-emerald-400 font-mono text-lg mb-2 neon-text-glow">GLOBAL_NODE_TOPOLOGY</h3>
            <p className="text-cyan-500/60 text-xs font-mono tracking-widest">AWAITING_PROTOCOL_HANDSHAKE...</p>

            <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iMTAiIHZpZXdCb3g9IjAgMCA2MCAxMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cGF0aCBkPSJNMCAwTDEwIDEwSDYwVjBIMHoiIGZpbGw9IiMwNjQxNWEiIGZpbGwtb3BhY2l0eT0iMC4yIi8+PC9zdmc+')] opacity-30"></div>
          </div>
        </div>
      </motion.div>
    </section>
  );
}

function Features() {
  const features = [
    {
      icon: Network,
      title: "NOSTR_RELAY",
      description: "Find global AI nodes instantly. Seller announcements broadcasted across decentralized relays."
    },
    {
      icon: Zap,
      title: "LND_X402",
      description: "Pay per token using the Lightning Network. Micro-transactions guarantee trustless settlements."
    },
    {
      icon: Cloud,
      title: "TNL_EXPOSE",
      description: "Built-in Cloudflare Tunnel integration securely exposes your proxy. Monetize unused quota."
    },
    {
      icon: RefreshCw,
      title: "HOT_SWAP",
      description: "CLI tools persist. Switch providers in the UI and traffic routes instantly without dropping."
    }
  ];

  return (
    <section className="py-24 px-6 relative bg-black border-t border-cyan-500/20">
      <div className="max-w-7xl mx-auto">
        <div className="mb-16">
          <h2 className="text-3xl md:text-5xl font-bold text-white mb-4 uppercase tracking-tight">
            System <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-cyan-700">Capabilities</span>
          </h2>
          <p className="font-mono text-zinc-500">{'>'}{'>'} MODULE_CHECK_INITIALIZED</p>
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
              {/* Target Brackets */}
              <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-cyan-700 group-hover:border-cyan-400" />
              <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-cyan-700 group-hover:border-cyan-400" />
              
              <div className="p-8">
                <div className="w-12 h-12 bg-cyan-950/40 border border-cyan-800 flex items-center justify-center mb-6 group-hover:bg-cyan-900 transition-colors">
                  <feature.icon className="w-6 h-6 text-cyan-400 group-hover:text-white" />
                </div>
                <h3 className="text-sm font-mono text-emerald-400 mb-3 tracking-wider neon-text-glow">{feature.title}</h3>
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
  return (
    <section id="terminal" className="py-24 px-6 relative bg-[#02050A]">
      <div className="max-w-4xl mx-auto">
        <div className="mb-12">
          <h2 className="text-3xl font-bold text-white mb-2 uppercase tracking-tight">
            Workflow <span className="text-cyan-400">Integration</span>
          </h2>
          <p className="font-mono text-zinc-500">{'>'}{'>'} EXECUTE_ON_LOCAL_HOST</p>
        </div>

        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="relative bg-black border border-cyan-900 shadow-[0_0_30px_rgba(6,182,212,0.1)] p-1 overflow-hidden"
        >
          {/* Terminal Inner Frame */}
          <div className="bg-[#0c0c0c] min-h-[300px] border border-cyan-950">
            {/* Terminal Header */}
            <div className="h-10 bg-cyan-950/20 border-b border-cyan-900/50 flex items-center justify-between px-4">
              <div className="font-mono text-[10px] text-cyan-500 tracking-widest flex items-center gap-2">
                <Terminal className="w-3 h-3" />
                TTY1.SH
              </div>
              <div className="text-[10px] text-zinc-600 font-mono">ROOT@SYS</div>
            </div>
            
            {/* Terminal Body */}
            <div className="p-6 font-mono text-sm leading-8 text-zinc-300 overflow-x-auto whitespace-pre">
              <div>
                <span className="text-emerald-400 font-bold">sys@local</span><span className="text-zinc-500">:~#</span> <span className="text-white drop-shadow-[0_0_2px_rgba(255,255,255,0.8)]">cc-switch start</span>
              </div>
              <div className="text-cyan-400/80">
                [INIT] Loading protocol definition...
              </div>
              <div className="text-emerald-400/80 flex items-center gap-2">
                <span className="text-xs">[OK]</span> Local proxy instance active on port 15721
              </div>
              <div className="text-emerald-400/80 flex items-center gap-2 mb-6">
                <span className="text-xs">[OK]</span> LND Handshake valid. Connected to Nostr.
              </div>

              <div>
                <span className="text-emerald-400 font-bold">sys@local</span><span className="text-zinc-500">:~#</span> <span className="text-white drop-shadow-[0_0_2px_rgba(255,255,255,0.8)]">claude code</span>
              </div>
              <div className="text-zinc-500 mb-2 italic">
                {'>'} Initializing connection to P2P node [claude-3-5-sonnet] @ 10 sats/1k
              </div>
              <div className="text-cyan-100/90 mb-2 flex flex-col md:flex-row md:items-start gap-2">
                <span className="bg-cyan-900/50 px-2 border border-cyan-500/30 text-cyan-300 text-[10px] tracking-widest uppercase mt-1 w-fit">Recv:</span>
                <span className="text-emerald-300 font-sans tracking-wide">System online. Architectural parameters loaded. How shall we construct today?</span>
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
  return (
    <section className="py-24 px-6 relative bg-black border-y border-cyan-500/20">
      <div className="absolute inset-0 bg-gradient-to-b from-cyan-900/10 to-transparent pointer-events-none" />
      <div className="max-w-3xl mx-auto text-center relative z-10 flex flex-col items-center">
        <Cpu className="w-12 h-12 text-cyan-500 mb-6 opacity-50" />
        <h2 className="text-4xl md:text-5xl font-bold text-white mb-6 uppercase tracking-tight">
          Initialize <span className="text-cyan-400">Connection</span>?
        </h2>
        <p className="text-zinc-400 font-mono text-sm mb-10 max-w-xl mx-auto leading-relaxed">
          It's 100% open source, free to use, and builds on the shoulders of giants. Turn your quota into reality.
        </p>
        <a
          href="https://github.com/zhouchangui/free-token-switch/releases/latest"
          target="_blank"
          rel="noreferrer"
          className="group relative inline-flex items-center justify-center gap-2 h-14 px-10 bg-cyan-500 text-black font-mono font-bold uppercase tracking-widest transition-all hover:bg-cyan-400 shadow-[0_0_20px_rgba(6,182,212,0.4)]"
        >
          <span className="absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-white mix-blend-difference" />
          <span className="absolute bottom-0 right-0 w-2 h-2 border-b-2 border-r-2 border-white mix-blend-difference" />
          Get_Software
          <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
        </a>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="py-12 px-6 bg-[#02050A]">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between text-center md:text-left gap-6">
        <div className="flex items-center gap-3">
          <Zap className="text-cyan-500 w-5 h-5 drop-shadow-[0_0_10px_rgba(6,182,212,0.8)]" fill="currentColor" />
          <span className="font-bold font-mono tracking-widest text-white text-sm">FREE.TOKEN.SWITCH_<span className="text-emerald-500">V3</span></span>
        </div>
        <p className="text-zinc-600 font-mono text-[10px] uppercase tracking-widest">
          Decentralized fork of 
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
