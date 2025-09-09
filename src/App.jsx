import React, { useEffect, useState } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip as RTooltip, ResponsiveContainer } from "recharts";
import { TrendingUp, TrendingDown, Newspaper, Factory, GraduationCap, Building, Lightbulb, Leaf, AlertCircle } from "lucide-react";

// CONFIG
const sectors = [
  { id: "industrial", label: "Industrial/Commercial", icon: <Factory className="w-5 h-5" /> },
  { id: "health", label: "Hospitals/Healthcare", icon: <Leaf className="w-5 h-5" /> },
  { id: "education", label: "Schools/Education", icon: <GraduationCap className="w-5 h-5" /> },
  { id: "residential", label: "Residential", icon: <Building className="w-5 h-5" /> },
  { id: "retail", label: "Retail", icon: <Lightbulb className="w-5 h-5" /> },
  { id: "energy", label: "Energy & Utilities", icon: <Leaf className="w-5 h-5" /> },
];

const mockPMI = { label: "UK Construction PMI", value: 45.6, date: "2025-09-04" };
const mockONS = [
  { date: "Jan", yoy: -3.2 },
  { date: "Feb", yoy: -4.5 },
  { date: "Mar", yoy: -5.1 },
  { date: "Apr", yoy: -2.9 },
  { date: "May", yoy: -1.4 },
  { date: "Jun", yoy: -3.7 },
  { date: "Jul", yoy: -4.8 },
];

const mockInsolvencies = [
  { name: "Example Civils Ltd", status: "liquidation", updated: "2025-08-28" },
  { name: "Northern Build Co", status: "administration", updated: "2025-08-30" },
];

const mockNews = [
  { title: "Construction starts rise in UK", link: "#", pubDate: "2025-09-05" },
  { title: "Developers report supply chain issues", link: "#", pubDate: "2025-09-03" },
];

// COMPONENTS
function Card({ title, children }) {
  return (
    <div className="bg-white rounded-lg shadow p-4 mb-4">
      <h3 className="font-bold mb-2">{title}</h3>
      {children}
    </div>
  );
}

function KPI({ label, value, trend }) {
  const TrendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : null;
  const color = trend === "up" ? "text-green-600" : trend === "down" ? "text-red-600" : "text-gray-800";
  return (
    <div className="flex items-center justify-between p-3 bg-gray-50 rounded shadow">
      <span>{label}</span>
      <div className="flex items-center space-x-1 font-bold">
        <span className={color}>{value}</span>
        {TrendIcon && <TrendIcon className={`w-5 h-5 ${color}`} />}
      </div>
    </div>
  );
}

// MAIN APP
export default function App() {
  const [news, setNews] = useState(mockNews);
  const [insolvencies, setInsolvencies] = useState(mockInsolvencies);

  // Simulate fetching RSS/insolvency every 10s
  useEffect(() => {
    const interval = setInterval(() => {
      setNews((prev) => [...prev]); // placeholder for real fetch
      setInsolvencies((prev) => [...prev]); // placeholder for real fetch
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="p-6 bg-gray-100 min-h-screen">
      <h1 className="text-2xl font-bold mb-6">Geo2 Construction Dashboard</h1>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <KPI label={mockPMI.label} value={mockPMI.value} trend="down" />
      </div>

      {/* Sectors */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
        {sectors.map((s) => (
          <div key={s.id} className="flex flex-col items-center bg-white p-4 rounded shadow">
            {s.icon}
            <span className="mt-2 text-sm text-center">{s.label}</span>
          </div>
        ))}
      </div>

      {/* Construction Output Chart */}
      <Card title="Construction Output YoY (%)">
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={mockONS}>
              <XAxis dataKey="date" />
              <YAxis />
              <RTooltip />
              <Line type="monotone" dataKey="yoy" stroke="#4ade80" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Insolvencies */}
      <Card title="Recent Insolvencies">
        {insolvencies.map((i, idx) => (
          <div key={idx} className="flex justify-between p-2 border-b last:border-b-0">
            <span>{i.name}</span>
            <span className="font-bold text-red-600">{i.status}</span>
          </div>
        ))}
      </Card>

      {/* News */}
      <Card title="Latest Construction News">
        {news.map((n, idx) => (
          <div key={idx} className="flex flex-col p-2 border-b last:border-b-0">
            <a href={n.link} className="font-semibold hover:underline">
              {n.title}
            </a>
            <span className="text-sm text-gray-500">{n.pubDate}</span>
          </div>
        ))}
      </Card>
    </div>
  );
}
