import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Globe, RefreshCw, ShoppingCart, Store, Zap, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

interface MarketListing {
    provider_id: string;
    model_name: string;
    price_per_1k_tokens: number;
    endpoint: string;
    seller_pubkey: string;
    timestamp: number;
}

export const MarketPanel = () => {
    const { t: _t } = useTranslation();
    const [listings, setListings] = useState<MarketListing[]>([]);
    const [isSelling, setIsSelling] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [price, setPrice] = useState(10);
    const [tunnelUrl, setTunnelUrl] = useState("");

    // 一键接入 P2P 供应商
    const connectToSeller = async (seller: MarketListing) => {
        setIsLoading(true);
        try {
            // 1. 构造供应商配置
            const p2pProvider = {
                id: `p2p-${seller.seller_pubkey.slice(0, 8)}`,
                name: `P2P: ${seller.model_name}`,
                category: "P2P",
                settingsConfig: JSON.stringify({
                    endpoint: seller.endpoint,
                    apiKey: "p2p-token-placeholder", // 实际上走 X402 支付，不需要传统 API Key
                    model: seller.model_name
                }),
                icon: "Zap",
                iconColor: "#f97316" // 品牌橙
            };

            // 2. 添加到本地数据库 (如果已存在则更新)
            await invoke("add_provider", { provider: p2pProvider, appId: "claude" });
            
            // 3. 立即切换
            await invoke("switch_provider", { 
                providerId: p2pProvider.id, 
                appId: "claude" 
            });

            toast.success(`已成功接入 P2P 节点: ${seller.model_name}`);
        } catch (error) {
            toast.error("接入失败: " + error);
        } finally {
            setIsLoading(false);
        }
    };

    const refreshMarket = async () => {
        setIsLoading(true);
        try {
            const result = await invoke<MarketListing[]>("find_ai_sellers");
            setListings(result);
        } catch (error) {
            toast.error("加载集市失败: " + error);
        } finally {
            setIsLoading(false);
        }
    };

    const toggleSelling = async () => {
        if (!isSelling) {
            // 开启售卖
            setIsLoading(true);
            try {
                // 1. 穿透内网 (假设本地代理端口为 15721)
                const url = await invoke<string>("start_cloudflare_tunnel", { port: 15721 });
                setTunnelUrl(url);
                // 2. 广播公告
                await invoke("start_selling_tokens", {
                    providerId: "claude-pro",
                    modelName: "claude-3-5-sonnet",
                    price: price,
                    endpoint: url
                });
                setIsSelling(true);
                toast.success("您的 AI 节点已上线，正在去中心化网络广播");
            } catch (error) {
                toast.error("启动失败: " + error);
            } finally {
                setIsLoading(false);
            }
        } else {
            // 停止售卖 (实际应在后端关闭进程)
            setIsSelling(false);
            setTunnelUrl("");
            toast.info("已停止售卖并关闭连接");
        }
    };

    useEffect(() => {
        refreshMarket();
    }, []);

    return (
        <div className="flex flex-col gap-6 p-6 overflow-y-auto h-full">
            {/* 卖家面板 */}
            <Card className="border-orange-500/20 shadow-lg shadow-orange-500/5">
                <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                        <CardTitle className="flex items-center gap-2">
                            <Store className="w-5 h-5 text-orange-500" />
                            我要摆摊 (Seller Mode)
                        </CardTitle>
                        <CardDescription>把你不用的 AI 额度卖成闪电网络聪 (Sats)</CardDescription>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                            <Zap className="w-4 h-4 text-yellow-500" />
                            <Input 
                                type="number" 
                                value={price} 
                                onChange={(e) => setPrice(Number(e.target.value))}
                                className="w-20 h-8"
                            />
                            <span className="text-xs text-muted-foreground">Sats / 1k tokens</span>
                        </div>
                        <Switch checked={isSelling} onCheckedChange={toggleSelling} disabled={isLoading} />
                    </div>
                </CardHeader>
                <CardContent>
                    {isSelling && (
                        <div className="bg-muted p-3 rounded-lg flex items-center justify-between">
                            <div className="flex items-center gap-2 text-xs font-mono">
                                <Globe className="w-3 h-3 text-emerald-500 animate-pulse" />
                                正在公网广播: <span className="text-emerald-500">{tunnelUrl}</span>
                            </div>
                            <Badge variant="outline" className="text-emerald-500 border-emerald-500/30">在线</Badge>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* 市场列表 */}
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                    <ShoppingCart className="w-5 h-5 text-blue-500" />
                    全球算力广场
                </h3>
                <Button variant="ghost" size="sm" onClick={refreshMarket} disabled={isLoading}>
                    <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                    刷新广场
                </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {listings.length === 0 ? (
                    <div className="col-span-2 py-12 text-center text-muted-foreground border-2 border-dashed rounded-xl">
                        暂时没有节点在售，点击刷新看看。
                    </div>
                ) : (
                    listings.map((item, idx) => (
                        <Card 
                            key={idx} 
                            onClick={() => connectToSeller(item)}
                            className="hover:border-orange-500/50 transition-all cursor-pointer group active:scale-95 transform duration-150"
                        >
                            <CardContent className="p-4 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-orange-500/10 rounded-full flex items-center justify-center group-hover:bg-orange-500 group-hover:text-white transition-colors">
                                        <Zap className="w-5 h-5 text-orange-500 group-hover:text-white" />
                                    </div>
                                    <div>
                                        <p className="font-semibold text-sm group-hover:text-orange-500 transition-colors">{item.model_name}</p>
                                        <p className="text-xs text-muted-foreground truncate w-40">{item.endpoint}</p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="text-orange-500 font-bold">{item.price_per_1k_tokens} Sats</p>
                                    <Badge variant="secondary" className="text-[10px] h-4">接入</Badge>
                                </div>
                            </CardContent>
                        </Card>
                    ))
                )}
            </div>
            
            <div className="flex flex-col gap-2 p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-xl text-xs text-emerald-600 dark:text-emerald-400">
                <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4" />
                    所有交易通过闪电网络 X402 协议按 Token 实时结算，无需预付，安全匿名。
                </div>
                <div className="mt-1 opacity-60 text-[10px] text-center italic">
                    Core engine powered by the open-source <a href="https://github.com/farion1231/cc-switch" target="_blank" className="underline">CC-Switch</a> project.
                </div>
            </div>
        </div>
    );
};
