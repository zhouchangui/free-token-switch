import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const resources = {
  en: {
    translation: {
      "nav.sourceCode": "Source_Code",
      "hero.badge": "v3.15.6_STABLE_NODE_ACTIVE",
      "hero.title1": "Share your Token with Friends",
      "hero.title2": "Or Exchange Token for Money",
      "hero.desc": ">> TokensBuddy.com - Whether it's Claude Pro or Gemini subscription, stop wasting it. Securely share with friends via Nostr and exchange for USTC or JD Clawtip.",
      "hero.downloadMac": "macOS_Universal",
      "hero.downloadWin": "Windows_x64",
      "hero.downloadLinux": "Linux_AppImage",
      "hero.noticeTitle": "Developer_Notice // Unsigned_Binary",
      "hero.noticeDesc": "To keep the project $0 cost, binaries are unsigned.",
      "hero.macStep": "macOS: Right-click the app and select 'Open'.",
      "hero.winStep": "Windows: Click 'More Info' then 'Run Anyway'.",
      "f1.title": "P2P Token Sharing",
      "f1.desc": "Easily share your AI tokens with friends. No middleman, no central server, just peer-to-peer trust.",
      "f2.title": "Value Exchange",
      "f2.desc": "Turn your unused quotas into value. Exchange for USTC or JD Clawtip and get paid for every token shared.",
      "f3.title": "One-click Node",
      "f3.desc": "Built-in Cloudflare Tunnel. Turn your local proxy into a global AI sharing node with one click.",
      "f4.title": "Hot-Swap Engine",
      "f4.desc": "Switch between friend's tokens instantly. Your CLI stays online while the backend swaps routes.",
      "terminal.title": "System",
      "terminal.subtitle": "Integration",
      "terminal.host": "LOCAL_HOST_ACTIVE",
      "terminal.init": "[INIT] Loading protocol definition...",
      "terminal.proxyReady": "[OK] Local proxy active on port 15721",
      "terminal.handshake": "[OK] Connected to P2P network via Nostr.",
      "terminal.recv": "Recv:",
      "terminal.recvMsg": "System online. TokensBuddy protocol active. How can we help today?",
      "cta.title": "Start",
      "cta.subtitle": "Sharing_Journey",
      "cta.desc": "Join the decentralized AI revolution. Share your tokens, build the network, and earn value.",
      "cta.button": "Get_v3.15.6_Now",
      "footer.fork": "Powered by TokensBuddy | Decentralized for"
    }
  },
  zh: {
    translation: {
      "nav.sourceCode": "源代码",
      "hero.badge": "v3.15.6_稳定节点_在线",
      "hero.title1": "分享你的 Token 给好友",
      "hero.title2": "或者把 Token 直接换钱",
      "hero.desc": ">> TokensBuddy.com - 无论是 Claude 还是 Gemini 订阅，不再被闲置。通过 Nostr 安全地向好友分享，并可直接兑换 USTC 或国内京东 Clawtip。",
      "hero.downloadMac": "苹果版本_通用",
      "hero.downloadWin": "微软版本_x64",
      "hero.downloadLinux": "安卓/Linux版本",
      "hero.noticeTitle": "开发者告示 // 未签名镜像",
      "hero.noticeDesc": "为保持 $0 成本，安装包未经过苹果/微软签名。",
      "hero.macStep": "macOS: 请右键点击应用并选择“打开”。",
      "hero.winStep": "Windows: 点击“更多信息”然后选择“仍要运行”。",
      "f1.title": "P2P Token 共享",
      "f1.desc": "轻松将你的 AI 额度分享给好友。无需中心化服务器，真正的点对点信任互助。",
      "f2.title": "闲置额度变现",
      "f2.desc": "让你的闲置额度变现。支持兑换 USTC 或京东 Clawtip，确保你分享的每一个 Token 都能转化为实际价值。",
      "f3.title": "一键摆摊上线",
      "f3.desc": "内置 Cloudflare Tunnel。只需一个开关，就能将本地代理化身为全球共享的 AI 节点。",
      "f4.title": "热插拔引擎",
      "f4.desc": "在好友的 Token 之间无感切换。无需重启终端，后端流量路径自动秒级重定向。",
      "terminal.title": "全流程",
      "terminal.subtitle": "无缝集成",
      "terminal.host": "本地执行环境已就绪",
      "terminal.init": "[INIT] 正在加载协议定义...",
      "terminal.proxyReady": "[OK] 本地代理实例已在 15721 端口就绪",
      "terminal.handshake": "[OK] 握手成功。已通过 Nostr 接入共享网络。",
      "terminal.recv": "接收:",
      "terminal.recvMsg": "系统在线。Token 搭子协议已启动。今天我们想构建什么？",
      "cta.title": "立即开启",
      "cta.subtitle": "P2P_共享之旅",
      "cta.desc": "加入去中心化 AI 革命。分享你的 Token，构建互助网络，实现额度价值化。",
      "cta.button": "立刻下载_v3.15.6",
      "footer.fork": "技术驱动源自 TokensBuddy | 去中心化版"
    }
  }
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: "zh",
    fallbackLng: "en",
    interpolation: {
      escapeValue: false
    }
  });

export default i18n;
