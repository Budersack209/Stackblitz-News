import React, { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertCircle, Bell, Building2, Factory, GraduationCap, Landmark, Leaf, Lightbulb, Loader2, Newspaper, Settings, ShieldAlert, TrendingDown, TrendingUp } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip as RTooltip, ResponsiveContainer } from "recharts";

/**
 * UK Construction Intelligence Dashboard (single-file React app)
 * --------------------------------------------------------------
 * What this does:
 * - Pulls near-real-time news from configurable RSS feeds (Reuters UK, PBCToday, etc.)
 * - Tracks insolvency risk signals (Companies House search – requires API key, with mock fallback)
 * - Shows headline indicators (S&P Global/CIPS UK Construction PMI, ONS Construction Output – optional live endpoints)
 * - Sector pipeline watch via planning feeds (add your local authority or vendor feeds)
 * - Alert rules (simple keyword & threshold triggers) with on-screen notifications
 *
 * How to use:
 * 1) Drop this file into a Vite/Next.js app. It assumes Tailwind + shadcn/ui are set up.
 * 2) Open the Settings panel (top-right) to add API keys and tweak feeds.
 * 3) By default, the app uses safe mock data if a live endpoint is missing or blocked by CORS.
 * 4) For production, route external calls through a tiny serverless proxy (examples in comments below).
 *
 * Notes:
 * - Many news/official endpoints block browser CORS. Use a proxy (Cloudflare Worker / Netlify function) to fetch and return JSON to the client.
 * - Companies House API: https://developer.company-information.service.gov.uk/ (free, key required).
 * - ONS API (Construction Output): https://api.beta.ons.gov.uk/ (no key; consider proxy for CORS).
 * - S&P Global PMI requires licensed access; you can store values manually or via paid API if available.
 */

// ======== CONFIG =========
const DEFAULT_CONFIG = {
  pollingMinutes: 10,
  corsProxy: "", // e.g. "https://your-proxy.example.com/fetch?url=" (leave blank to fetch directly)
  feeds: {
    news: [
      { name: "Reuters UK Business", url: "https://www.reuters.com/markets/europe/rss" },
      { name: "PBC Today – Construction", url: "https://www.pbctoday.co.uk/news/construction-news/feed/" },
      { name: "Construction Enquirer", url: "https://www.constructionenquirer.com/feed/" },
      { name: "ICE News", url: "https://www.ice.org.uk/feeds/news" },
      { name: "BEIS/DBT Press", url: "https://www.gov.uk/government/organisations/department-for-business-and-trade.atom" }
    ],
    planning: [
      // Add local authority planning RSS feeds or vendor webhooks here
      // { name: "Birmingham City Planning", url: "https://example.gov.uk/planning/rss" },
    ],
  },
  sectors: [
    { id: "industrial", label: "Industrial/Commercial", icon: <Factory className="h-4 w-4" /> },
    { id: "health", label: "Hospitals/Healthcare", icon: <Leaf className="h-4 w-4" /> },
    { id: "education", label: "Schools/Education", icon: <GraduationCap className="h-4 w-4" /> },
    { id: "residential", label: "Residential", icon: <Building2 className="h-4 w-4" /> },
    { id: "retail", label: "Retail", icon: <Lightbulb className="h-4 w-4" /> },
    { id: "energy", label: "Energy & Utilities", icon: <Landmark className="h-4 w-4" /> },
  ],
  alerts: {
    // Simple keyword triggers for news headlines
    keywords: ["administration", "insolvency", "liquidation", "PMI", "output", "construction"],
    // Example numeric thresholds (manual/ONS/PMI)
    thresholds: {
      pmi: 50, // alert if PMI < 50 (contraction)
      outputChangeYoY: -5, // alert if YoY output change falls below -5%
    },
  },
  endpoints: {
    companiesHouseSearch: "", // your proxy to Companies House search (q param)
    onsConstructionOutput: "", // your proxy to ONS monthly construction output time series
    pmiLatest: "", // your proxy or manual entry endpoint for UK Construction PMI
  },
};

// ======== UTIL =========
const useLocalStorage = (key, initial) => {
  const [val, setVal] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
  }, [key, val]);
  return [val, setVal];
};

const fetchJSON = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
};

// naive RSS -> JSON via rss2json.org or your own proxy (set corsProxy above). For production, replace.
const fetchRSS = async (url, corsProxy = "") => {
  try {
    const target = corsProxy ? `${corsProxy}${encodeURIComponent(url)}` : url;
    // If endpoint returns XML, use a free RSS-to-JSON proxy in your serverless layer.
    const res = await fetch(target);
    const text = await res.text();
    // Very light XML parse: extract <item><title>,<link>,<pubDate>
    const items = Array.from(text.matchAll(/<item>([\s\S]*?)<\/item>/g)).slice(0, 20).map(m => {
      const item = m[1];
      const title = /<title>([\s\S]*?)<\/title>/i.exec(item)?.[1]?.replace(/<!\[CDATA\[|\]\]>/g, "");
      const link = /<link>([\s\S]*?)<\/link>/i.exec(item)?.[1];
      const pubDate = /<pubDate>([\s\S]*?)<\/pubDate>/i.exec(item)?.[1];
      return { title, link, pubDate };
    });
    return items;
  } catch (e) {
    console.warn("RSS fetch failed", e);
    return [];
  }
};

// ======== MOCKS =========
const mockPMI = { label: "UK Construction PMI", value: 45.6, date: "2025-09-04" };
const mockONS = [
  { date: "2025-01", yoy: -3.2 },
  { date: "2025-02", yoy: -4.5 },
  { date: "2025-03", yoy: -5.1 },
  { date: "2025-04", yoy: -2.9 },
  { date: "2025-05", yoy: -1.4 },
  { date: "2025-06", yoy: -3.7 },
  { date: "2025-07", yoy: -4.8 },
];
const mockInsolvencies = [
  { name: "Example Civils Ltd", number: "01234567", status: "liquidation", updated: "2025-08-28" },
  { name: "Northern Build Co", number: "07654321", status: "administration", updated: "2025-08-30" },
];

// ======== COMPONENTS =========
function KPI({ label, value, suffix, help, trend }) {
  const positive = typeof value === "number" && value >= 50 && label.includes("PMI");
  const negative = typeof value === "number" && value < 50 && label.includes("PMI");
  const TrendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : null;
  return (
    <Card className="shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between py-4">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger>
              <AlertCircle className="h-4 w-4 text-muted-foreground" />
            </TooltipTrigger>
            <TooltipContent className="max-w-xs text-xs">{help}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </CardHeader>
      <CardContent className="pb-4">
        <div className="flex items-baseline gap-2">
          <div className={`text-3xl font-semibold ${positive ? "text-emerald-600" : negative ? "text-red-600" : ""}`}>
            {typeof value === "number" ? value.toFixed(1) : value}
            {suffix && <span className="text-base text-muted-foreground ml-1">{suffix}</span>}
          </div>
          {TrendIcon && <TrendIcon className={`h-5 w-5 ${trend === "up" ? "text-emerald-600" : "text-red-600"}`} />}
        </div>
      </CardContent>
    </Card>
  );
}

function Sparkline({ data }) {
  return (
    <ResponsiveContainer width="100%" height={120}>
      <LineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <XAxis dataKey="date" hide />
        <YAxis hide domain={["auto", "auto"]} />
        <RTooltip />
        <Line type="monotone" dataKey="yoy" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function NewsList({ items, title, onKeywordHit }) {
  return (
    <Card className="shadow-sm h-full">
      <CardHeader className="py-4">
        <CardTitle className="text-base flex items-center gap-2"><Newspaper className="h-4 w-4" /> {title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 max-h-[520px] overflow-auto">
        {items?.length ? items.map((n, i) => (
          <div key={i} className="grid gap-1 border-b pb-3">
            <a className="font-medium hover:underline" href={n.link} target="_blank" rel="noreferrer">{n.title}</a>
            <div className="text-xs text-muted-foreground">{new Date(n.pubDate || Date.now()).toLocaleString()}</div>
            {n._hit && <Badge variant="destructive" className="w-fit">Alert keyword</Badge>}
          </div>
        )) : <div className="text-sm text-muted-foreground">No items yet.</div>}
      </CardContent>
    </Card>
  );
}

function InsolvencyTable({ rows }) {
  return (
    <Card className="shadow-sm h-full">
      <CardHeader className="py-4">
        <CardTitle className="text-base flex items-center gap-2"><ShieldAlert className="h-4 w-4" /> Insolvency watch (Companies House)</CardTitle>
      </CardHeader>
      <CardContent className="max-h-[520px] overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="py-2">Company</th>
              <th className="py-2">Number</th>
              <th className="py-2">Status</th>
              <th className="py-2">Updated</th>
            </tr>
          </thead>
          <tbody>
            {rows?.length ? rows.map((r, i) => (
              <tr key={i} className="border-t">
                <td className="py-2 font-medium">{r.name}</td>
                <td className="py-2">{r.number}</td>
                <td className="py-2">
                  <Badge variant={r.status?.includes("admin") ? "destructive" : "secondary"}>{r.status}</Badge>
                </td>
                <td className="py-2 text-muted-foreground">{r.updated}</td>
              </tr>
            )) : (
              <tr>
                <td className="py-2 text-muted-foreground" colSpan={4}>No recent events.</td>
              </tr>
            )}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function SettingsPanel({ open, onClose, config, setConfig }) {
  const [draft, setDraft] = useState(JSON.stringify(config, null, 2));
  const [err, setErr] = useState("");
  useEffect(() => setDraft(JSON.stringify(config, null, 2)), [config]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex">
      <div className="m-auto w-[720px] bg-white rounded-2xl shadow-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold flex items-center gap-2"><Settings className="h-5 w-5" /> Settings (JSON)</h2>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
        <p className="text-sm text-muted-foreground">Edit feeds, polling, thresholds, and endpoints. Invalid JSON will be rejected.</p>
        <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} className="h-80 font-mono text-xs" />
        {err && <div className="text-sm text-red-600">{err}</div>}
        <div className="flex justify-end gap-2">
          <Button onClick={() => setDraft(JSON.stringify(DEFAULT_CONFIG, null, 2))} variant="secondary">Reset to defaults</Button>
          <Button onClick={() => {
            try {
              const next = JSON.parse(draft);
              setConfig(next);
              setErr("");
              onClose();
            } catch (e) { setErr(String(e)); }
          }}>Save</Button>
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [config, setConfig] = useLocalStorage("geo2-dashboard-config", DEFAULT_CONFIG);
  const [news, setNews] = useState([]);
  const [planning, setPlanning] = useState([]);
  const [pmi, setPmi] = useState(null);
  const [onsSeries, setOnsSeries] = useState([]);
  const [insolvencies, setInsolvencies] = useState([]);
  const [sector, setSector] = useState("all");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef(null);

  // ===== Fetchers =====
  const loadNews = async () => {
    const items = [];
    for (const f of config.feeds.news) {
      const data = await fetchRSS(f.url, config.corsProxy);
      data.forEach(d => items.push({ ...d, source: f.name }));
    }
    // Keyword tagging
    const keywords = (config.alerts?.keywords || []).map(k => k.toLowerCase());
    items.forEach(i => {
      const t = (i.title || "").toLowerCase();
      i._hit = keywords.some(k => t.includes(k));
    });
    // Sort by date desc
    items.sort((a,b) => new Date(b.pubDate || 0) - new Date(a.pubDate || 0));
    setNews(items);
  };

  const loadPlanning = async () => {
    const items = [];
    for (const f of config.feeds.planning) {
      const data = await fetchRSS(f.url, config.corsProxy);
      data.forEach(d => items.push({ ...d, source: f.name }));
    }
    items.sort((a,b) => new Date(b.pubDate || 0) - new Date(a.pubDate || 0));
    setPlanning(items);
  };

  const loadPMI = async () => {
    try {
      if (config.endpoints.pmiLatest) {
        const data = await fetchJSON(config.endpoints.pmiLatest);
        setPmi(data);
      } else {
        setPmi(mockPMI);
      }
    } catch {
      setPmi(mockPMI);
    }
  };

  const loadONS = async () => {
    try {
      if (config.endpoints.onsConstructionOutput) {
        const data = await fetchJSON(config.endpoints.onsConstructionOutput);
        setOnsSeries(data);
      } else {
        setOnsSeries(mockONS);
      }
    } catch {
      setOnsSeries(mockONS);
    }
  };

  const loadInsolvencies = async () => {
    try {
      if (config.endpoints.companiesHouseSearch) {
        const data = await fetchJSON(config.endpoints.companiesHouseSearch);
        setInsolvencies(data);
      } else {
        setInsolvencies(mockInsolvencies);
      }
    } catch {
      setInsolvencies(mockInsolvencies);
    }
  };

  const pollAll = async () => {
    setLoading(true);
    await Promise.all([loadNews(), loadPlanning(), loadPMI(), loadONS(), loadInsolvencies()]);
    setLoading(false);
  };

  useEffect(() => {
    pollAll();
    if (timerRef.current) clearInterval(timerRef.current);
    const ms = Math.max(1, config.pollingMinutes) * 60 * 1000;
    timerRef.current = setInterval(() => pollAll(), ms);
    return () => clearInterval(timerRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(config)]);

  // Alerts
  const showPMIAlert = pmi && typeof pmi.value === "number" && pmi.value < (config.alerts?.thresholds?.pmi ?? 50);
  const latestYoY = onsSeries?.[onsSeries.length - 1]?.yoy ?? null;
  const showOutputAlert = typeof latestYoY === "number" && latestYoY < (config.alerts?.thresholds?.outputChangeYoY ?? -5);
  const headlineHits = news.filter(n => n._hit).slice(0, 5);

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">UK Construction Intelligence Dashboard</h1>
          <p className="text-sm text-muted-foreground">Live market signals for Geo-Environmental decisions (news • PMI • ONS output • planning • insolvency).</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={sector} onValueChange={setSector}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="All sectors" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sectors</SelectItem>
              {config.sectors.map(s => (
                <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => pollAll()} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Refresh"}
          </Button>
          <Button onClick={() => setSettingsOpen(true)} variant="secondary"><Settings className="h-4 w-4 mr-1" /> Settings</Button>
        </div>
      </div>

      {/* Alerts */}
      {(showPMIAlert || showOutputAlert || headlineHits.length > 0) && (
        <Card className="border-red-200">
          <CardHeader className="py-4">
            <CardTitle className="text-base flex items-center gap-2"><Bell className="h-4 w-4" /> Alerts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {showPMIAlert && (
              <div className="flex items-center gap-2 text-sm">
                <Badge variant="destructive">PMI</Badge>
                Construction PMI dipped below {config.alerts?.thresholds?.pmi ?? 50}: <span className="font-medium">{pmi.value}</span> ({pmi.date}).
              </div>
            )}
            {showOutputAlert && (
              <div className="flex items-center gap-2 text-sm">
                <Badge variant="destructive">Output</Badge>
                ONS construction output YoY below {config.alerts?.thresholds?.outputChangeYoY ?? -5}%: <span className="font-medium">{latestYoY}%</span>.
              </div>
            )}
            {headlineHits.map((n, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <Badge variant="destructive">News</Badge>
                <a className="hover:underline" href={n.link} target="_blank" rel="noreferrer">{n.title}</a>
                <span className="text-muted-foreground">({n.source})</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* KPIs */}
      <div className="grid md:grid-cols-3 gap-4">
        <KPI label={pmi?.label || "UK Construction PMI"} value={pmi?.value ?? "--"} help="S&P Global/CIPS PMI – <50 = contraction, >50 = expansion." trend={pmi?.value && pmi.value >= 50 ? "up" : "down"} />
        <Card className="shadow-sm">
          <CardHeader className="py-4">
            <CardTitle className="text-sm font-medium text-muted-foreground">ONS Construction Output (YoY)</CardTitle>
          </CardHeader>
          <CardContent>
            <Sparkline data={onsSeries} />
            <div className="text-xs text-muted-foreground text-right mt-1">Latest: {latestYoY ?? "--"}%</div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardHeader className="py-4">
            <CardTitle className="text-sm font-medium text-muted-foreground">Geo2 Focus Sector</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm">Filtering: <span className="font-medium">{sector === "all" ? "All sectors" : (config.sectors.find(s => s.id === sector)?.label || sector)}</span></div>
            <div className="text-xs text-muted-foreground mt-2">Use this to visually focus pipeline/news cards (does not filter feeds server-side).</div>
          </CardContent>
        </Card>
      </div>

      {/* Feeds */}
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <NewsList items={news} title="Market & Sector News" />
        </div>
        <div className="space-y-4">
          <InsolvencyTable rows={insolvencies} />
          <NewsList items={planning} title="Planning & Pipeline (new applications)" />
        </div>
      </div>

      {/* Footer / Setup help */}
      <Card>
        <CardContent className="py-4 text-sm text-muted-foreground">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <div className="font-medium mb-1">Live endpoints (recommended via proxy)</div>
              <ul className="list-disc pl-4 space-y-1">
                <li><span className="font-medium">Companies House search</span> → set <code>endpoints.companiesHouseSearch</code> to a proxy that calls <code>/search/companies?q=construction</code> and maps results to {{ name, number, status, updated }}.</li>
                <li><span className="font-medium">ONS Construction Output</span> → set <code>endpoints.onsConstructionOutput</code> to a proxy returning [{'{'}date, yoy{'}'}] for monthly series.</li>
                <li><span className="font-medium">PMI</span> → set <code>endpoints.pmiLatest</code> to your data source or manually update value/date.</li>
                <li><span className="font-medium">Feeds</span> → add planning/news RSS in Settings; set <code>corsProxy</code> if CORS blocks.</li>
              </ul>
            </div>
            <div>
              <div className="font-medium mb-1">Tiny serverless proxy (example)</div>
              <pre className="text-xs bg-muted p-2 rounded-lg overflow-auto">{`// Cloudflare Worker (TypeScript)
export default {
  async fetch(req: Request): Promise<Response> {
    const { searchParams } = new URL(req.url);
    const url = searchParams.get('url');
    if (!url) return new Response('Missing url', { status: 400 });
    const r = await fetch(url, { headers: { 'User-Agent': 'Geo2-Dashboard/1.0' }});
    const body = await r.text();
    return new Response(body, { headers: { 'content-type': r.headers.get('content-type') || 'text/plain', 'Access-Control-Allow-Origin': '*' }});
  }
};`}</pre>
            </div>
          </div>
        </CardContent>
      </Card>

      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} config={config} setConfig={setConfig} />
    </div>
  );
}

