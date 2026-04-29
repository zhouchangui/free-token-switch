import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { clawtipApi, marketApi } from "@/lib/api";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Globe,
  RefreshCw,
  ShoppingCart,
  Store,
  Zap,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";

interface MarketPaymentListing {
  provider: string;
  mode: string;
  amountFen: number;
  currency: string;
  skillSlug: string;
  indicator: string;
  payTo: string;
}

interface MarketListing {
  provider_id: string;
  model_name: string;
  price_per_1k_tokens: number;
  endpoint: string;
  seller_pubkey: string;
  timestamp: number;
  status?: "available" | "reserved" | "busy" | "offline";
  capacity?: number;
  payment?: MarketPaymentListing | null;
  resourceUrl?: string;
  amountFen?: number;
}

export const MarketPanel = () => {
  const { t } = useTranslation();
  const [listings, setListings] = useState<MarketListing[]>([]);
  const [isSelling, setIsSelling] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [price, setPrice] = useState(10);
  const [tunnelUrl, setTunnelUrl] = useState("");
  const [purchasePrompt, setPurchasePrompt] = useState("hello");

  const purchaseListing = async (seller: MarketListing) => {
    const payment = seller.payment;
    const amountFen = payment?.amountFen ?? seller.amountFen;
    const indicator = payment?.indicator;
    const payTo = payment?.payTo;
    const endpoint = seller.resourceUrl || seller.endpoint;

    if (!amountFen || !indicator || !payTo) {
      toast.error(t("market.purchaseMissingPayment"));
      return;
    }

    setIsLoading(true);
    try {
      const order = await clawtipApi.createOrder({
        listingId: seller.provider_id,
        prompt: purchasePrompt.trim() || seller.model_name,
        amountFen,
        payTo,
        indicator,
        endpoint,
      });

      toast.success(
        t("market.orderCreated", {
          orderNo: order.orderNo,
          amount: order.amountFen,
        }),
      );
    } catch (error) {
      toast.error(t("market.purchaseFailed", { message: String(error) }));
    } finally {
      setIsLoading(false);
    }
  };

  const refreshMarket = async () => {
    setIsLoading(true);
    try {
      const result = await marketApi.findAiSellers();
      setListings(result);
    } catch (error) {
      toast.error(t("market.loadFailed", { message: String(error) }));
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
        const url = await marketApi.startCloudflareTunnel(15721);
        setTunnelUrl(url);
        const accessToken = await marketApi.generateSellerAccessToken("claude-pro");
        // 2. 广播公告
        await marketApi.startSellingTokens({
          providerId: "claude-pro",
          modelName: "claude-3-5-sonnet",
          pricePer1kTokens: price,
          endpoint: url,
          amountFen: price,
          indicator: "tokens-buddy-claude-pro",
          payTo: "",
          accessToken,
        });
        setIsSelling(true);
        toast.success(t("market.sellerStarted"));
      } catch (error) {
        toast.error(t("market.sellerStartFailed", { message: String(error) }));
      } finally {
        setIsLoading(false);
      }
    } else {
      // 停止售卖 (实际应在后端关闭进程)
      setIsSelling(false);
      setTunnelUrl("");
      toast.info(t("market.sellerStopped"));
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
              {t("market.sellerTitle")}
            </CardTitle>
            <CardDescription>{t("market.sellerDescription")}</CardDescription>
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
              <span className="text-xs text-muted-foreground">
                {t("market.pricePerCall")}
              </span>
            </div>
            <Switch
              checked={isSelling}
              onCheckedChange={toggleSelling}
              disabled={isLoading}
            />
          </div>
        </CardHeader>
        <CardContent>
          {isSelling && (
            <div className="bg-muted p-3 rounded-lg flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-mono">
                <Globe className="w-3 h-3 text-emerald-500 animate-pulse" />
                {t("market.broadcasting")}{" "}
                <span className="text-emerald-500">{tunnelUrl}</span>
              </div>
              <Badge
                variant="outline"
                className="text-emerald-500 border-emerald-500/30"
              >
                {t("market.online")}
              </Badge>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 市场列表 */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <ShoppingCart className="w-5 h-5 text-blue-500" />
          {t("market.squareTitle")}
        </h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={refreshMarket}
          disabled={isLoading}
        >
          <RefreshCw
            className={`w-4 h-4 mr-2 ${isLoading ? "animate-spin" : ""}`}
          />
          {t("market.refresh")}
        </Button>
      </div>

      <Input
        value={purchasePrompt}
        onChange={(event) => setPurchasePrompt(event.target.value)}
        placeholder={t("market.promptPlaceholder")}
        className="max-w-xl"
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {listings.length === 0 ? (
          <div className="col-span-2 py-12 text-center text-muted-foreground border-2 border-dashed rounded-xl">
            {t("market.empty")}
          </div>
        ) : (
          listings.map((item, idx) => (
            <Card
              key={idx}
              onClick={() => purchaseListing(item)}
              className="hover:border-orange-500/50 transition-all cursor-pointer group active:scale-95 transform duration-150"
            >
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-orange-500/10 rounded-full flex items-center justify-center group-hover:bg-orange-500 group-hover:text-white transition-colors">
                    <Zap className="w-5 h-5 text-orange-500 group-hover:text-white" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm group-hover:text-orange-500 transition-colors">
                      {item.model_name}
                    </p>
                    <p className="text-xs text-muted-foreground truncate w-40">
                      {item.endpoint}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-orange-500 font-bold">
                    {item.payment?.amountFen ??
                      item.amountFen ??
                      item.price_per_1k_tokens}{" "}
                    {t("market.fenPerCall")}
                  </p>
                  <Badge variant="secondary" className="text-[10px] h-4">
                    {item.status ?? t("market.buy")}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <div className="flex flex-col gap-2 p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-xl text-xs text-emerald-600 dark:text-emerald-400">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4" />
          {t("market.clawtipNotice")}
        </div>
        <div className="mt-1 opacity-60 text-[10px] text-center italic">
          Core engine powered by the open-source{" "}
          <a
            href="https://github.com/zhouchangui/tokens-buddy"
            target="_blank"
            className="underline"
          >
            TokensBuddy
          </a>{" "}
          project.
        </div>
      </div>
    </div>
  );
};
