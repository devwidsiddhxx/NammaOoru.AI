import React, { useState } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer 
} from 'recharts';
import { 
  Activity, AlertTriangle, CheckCircle2, 
  MapPin, Building2, Newspaper, Loader2, Play, Sparkles, Landmark
} from 'lucide-react';

const rawKey = import.meta.env.VITE_GROQ_API_KEY || "";
const API_KEY = rawKey.replace(/^["']|["']$/g, '');

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [news, setNews] = useState([]);
  const [analyzedData, setAnalyzedData] = useState([]);
  const [loadingNews, setLoadingNews] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [aiBrief, setAiBrief] = useState("");

  const fetchNews = async () => {
    setLoadingNews(true);
    try {
      // We specifically query multiple major districts to force geographic diversity in the news feed
      const rssUrl = encodeURIComponent('https://news.google.com/rss/search?q=Chennai+OR+Coimbatore+OR+Madurai+OR+Salem+OR+Trichy+civic+OR+government&hl=en-IN&gl=IN&ceid=IN:en');
      const response = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=${rssUrl}`);
      const data = await response.json();
      
      let articles = data.items || [];
      
      if (articles.length === 0) {
        alert("The news fetcher returned 0 articles. This might be a temporary rate-limit from the free RSS proxy. Please wait 10 seconds and try again.");
      }

      // Shuffle the daily news items and pick up to 15 to ensure a fresh dataset
      articles = articles.sort(() => 0.5 - Math.random());
      setNews(articles.slice(0, 15));
    } catch (err) {
      console.error("Error fetching news:", err);
    }
    setLoadingNews(false);
  };

  const analyzeWithGroq = async () => {
    if (news.length === 0) return;
    
    setAnalyzing(true);
    try {
      if (!API_KEY || API_KEY.trim() === "" || API_KEY.includes("your_groq_api_key")) {
        throw new Error("GROQ API Key is missing or invalid in .env.local. Make sure you restarted the server!");
      }

      const prompt = `
        Analyze the following news headlines.
        Return ONLY a JSON object with a single key "data", which is an array of objects.
        Each object in the array must have exactly these keys:
        - "title" (string): the exact headline
        - "sentiment" (string): "Positive", "Negative", or "Neutral"
        - "district" (string): Deeply analyze the headline to assign a specific district (e.g., Chennai, Coimbatore, Madurai, Salem, Trichy, Erode, Vellore, Tirunelveli). Strongly prefer assigning a specific city/district. Only use "Tamil Nadu (Statewide)" if it is purely a state-level policy with no local context.
        - "department" (string): Map strictly to: Healthcare, Transport, Police, Water Supply, Education, Electricity, or Municipal Admin.
        - "severity" (number): 1 to 5 (5 being highly critical/urgent)
        - "summary" (string): A crisp 5-word summary

        Headlines to analyze:
        ${news.map((n, i) => `${i+1}. ${n.title}`).join("\n")}
      `;

      // Make a direct fetch call to Groq's lightning-fast API (using Llama-3)
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "llama-3.1-8b-instant", // Fast, free, and incredibly intelligent
          messages: [
            { role: "system", content: "You are a civic analytics JSON engine. You only output pure JSON format." },
            { role: "user", content: prompt }
          ],
          response_format: { type: "json_object" }, // Forces strict JSON output
          temperature: 0.1 // Low temp for analytical accuracy
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error?.message || "Groq API request failed");
      }

      const result = await response.json();
      const textResponse = result.choices[0].message.content;
      
      const parsedData = JSON.parse(textResponse);
      const finalArray = parsedData.data || [];
      
      if (finalArray.length === 0) throw new Error("AI returned empty data array");
      
      setAnalyzedData(finalArray);

      // Generate the Executive Brief
      const briefPrompt = `Based on this structured civic data: ${JSON.stringify(finalArray)}, write a highly professional 2-sentence executive summary of the current public sentiment and top civic issues facing the government right now. Return ONLY a JSON object with a single key "summary" containing the 2 sentences.`;
      
      const briefResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "llama-3.1-8b-instant",
          messages: [
            { role: "system", content: "You are a professional AI summarizer. Output only JSON." },
            { role: "user", content: briefPrompt }
          ],
          response_format: { type: "json_object" },
          temperature: 0.3
        })
      });

      const briefResJson = await briefResponse.json();
      const briefData = JSON.parse(briefResJson.choices[0].message.content);
      setAiBrief(briefData.summary || "Summary generated successfully.");

    } catch (err) {
      console.error("Groq Error Details:", err);
      alert(`API Error: ${err.message}.\n\nNo fake data was loaded. Please ensure your GROQ API key is correct and active.`);
      setAnalyzedData([]);
      setAiBrief("Analysis failed. No data loaded.");
    }
    setAnalyzing(false);
  };

  const totalPosts = analyzedData.length;
  const negativePosts = analyzedData.filter(d => d.sentiment === 'Negative').length;
  const avgSeverity = totalPosts ? (analyzedData.reduce((acc, curr) => acc + curr.severity, 0) / totalPosts).toFixed(1) : 0;
  
  const deptCount = analyzedData.reduce((acc, curr) => {
    acc[curr.department] = (acc[curr.department] || 0) + 1;
    return acc;
  }, {});
  const chartData = Object.keys(deptCount).map(key => ({ name: key, count: deptCount[key] }));

  const districtCount = analyzedData.reduce((acc, curr) => {
    acc[curr.district] = (acc[curr.district] || 0) + 1;
    return acc;
  }, {});
  const districtChartData = Object.keys(districtCount).map(key => ({ name: key, count: districtCount[key] }));

  return (
    <div className="min-h-screen flex w-full bg-gray-50">
      {/* Sidebar */}
      <aside className="w-64 border-r border-gray-200 bg-white flex flex-col">
        <div className="h-16 flex items-center px-6 border-b border-gray-200">
          <div className="w-8 h-8 bg-black rounded mr-3 flex items-center justify-center">
            <Landmark className="w-4 h-4 text-white" />
          </div>
          <h1 className="font-bold text-xl tracking-tight text-gray-900">NammaOoru.AI</h1>
        </div>
        <nav className="p-4 flex flex-col gap-2 flex-grow">
          <button 
            onClick={() => setActiveTab('dashboard')}
            className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors w-full text-left ${activeTab === 'dashboard' ? 'bg-black text-white' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'}`}>
            <Activity className="w-4 h-4" /> Live Dashboard
          </button>
          <button 
            onClick={() => setActiveTab('districts')}
            className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors w-full text-left ${activeTab === 'districts' ? 'bg-black text-white' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'}`}>
            <MapPin className="w-4 h-4" /> District Analytics
          </button>
          <button 
            onClick={() => setActiveTab('departments')}
            className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors w-full text-left ${activeTab === 'departments' ? 'bg-black text-white' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'}`}>
            <Building2 className="w-4 h-4" /> Departments
          </button>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-16 border-b border-gray-200 flex items-center px-8 justify-between bg-white">
          <h2 className="text-lg font-semibold tracking-tight text-gray-900">
            {activeTab === 'dashboard' && 'Live Civic Intelligence'}
            {activeTab === 'districts' && 'District Analytics Hub'}
            {activeTab === 'departments' && 'Department Performance Overview'}
          </h2>
          <div className="flex gap-4">
            <button 
              onClick={fetchNews}
              disabled={loadingNews}
              className="flex items-center gap-2 text-sm font-medium border border-gray-200 bg-white text-gray-900 hover:bg-gray-50 px-4 py-2 rounded-md transition-colors"
            >
              {loadingNews ? <Loader2 className="w-4 h-4 animate-spin" /> : <Newspaper className="w-4 h-4" />}
              1. Fetch Live News
            </button>
            <button 
              onClick={analyzeWithGroq}
              disabled={analyzing || news.length === 0}
              className="flex items-center gap-2 text-sm font-medium bg-black text-white hover:opacity-90 px-4 py-2 rounded-md transition-opacity disabled:opacity-50"
            >
              {analyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              2. Run Groq AI Analysis
            </button>
          </div>
        </header>

        {/* Dynamic Content based on Tab */}
        <div className="p-8 flex-1 overflow-y-auto bg-gray-50">
          
          {activeTab === 'dashboard' && (
            <>
              {/* Top Stats */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                <StatCard title="Total Monitored" value={totalPosts || "-"} icon={<Newspaper className="w-4 h-4" />} />
                <StatCard title="Negative Sentiment" value={negativePosts || "-"} icon={<AlertTriangle className="w-4 h-4" />} />
                <StatCard title="Avg Issue Severity" value={avgSeverity || "-"} subtitle="Out of 5" icon={<Activity className="w-4 h-4" />} />
                <StatCard title="System Status" value={analyzedData.length > 0 ? "Active" : "Waiting"} icon={<CheckCircle2 className="w-4 h-4" />} />
              </div>

              {/* AI Summary Section */}
              <div className="border border-gray-200 bg-white p-6 rounded-xl mb-8 shadow-sm">
                <h3 className="font-semibold text-lg mb-4 flex items-center gap-2 text-gray-900">
                  <Sparkles className="w-5 h-5 text-gray-900" /> Executive Summary
                </h3>
                <p className="text-gray-700 leading-relaxed text-sm">
                  {aiBrief || "Click 'Fetch Live News' and then 'Run Groq AI Analysis' to generate real-time civic intelligence insights."}
                </p>
              </div>

              {/* Main Layout: News Feed + Analysis */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Live News Feed (Left) */}
                <div className="lg:col-span-1 border border-gray-200 bg-white rounded-xl shadow-sm flex flex-col h-[500px]">
                  <div className="p-4 border-b border-gray-200 font-semibold text-sm flex items-center justify-between text-gray-900">
                    Live Data Stream
                    <span className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-600">{news.length} items</span>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
                    {news.length === 0 && <p className="text-xs text-gray-500 text-center mt-10">No data. Fetch news to start.</p>}
                    {news.map((n, i) => (
                      <div key={i} className="text-sm border-b border-gray-100 pb-3 last:border-0">
                        <p className="font-medium line-clamp-2 leading-tight mb-1 text-gray-900">{n.title}</p>
                        <p className="text-xs text-gray-500">{new Date(n.pubDate).toLocaleString()}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* AI Results & Charts (Right) */}
                <div className="lg:col-span-2 flex flex-col gap-8">
                  {/* Chart */}
                  <div className="border border-gray-200 bg-white p-6 rounded-xl shadow-sm h-[250px] flex flex-col">
                    <h3 className="font-semibold mb-4 text-sm text-gray-900">Department Impact (AI Categorized)</h3>
                    <div className="flex-1">
                      {chartData.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={chartData}>
                            <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} />
                            <Tooltip cursor={{fill: 'transparent'}} contentStyle={{backgroundColor: '#fff', color: '#000', borderRadius: '8px', border: '1px solid #e5e5e5'}}/>
                            <Bar dataKey="count" fill="#000000" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="h-full flex items-center justify-center text-xs text-gray-400 border border-dashed border-gray-200 rounded">
                          Awaiting AI Processing...
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Analyzed Data Table */}
                  <div className="border border-gray-200 bg-white rounded-xl shadow-sm flex-1 flex flex-col min-h-[218px]">
                    <div className="p-4 border-b border-gray-200 font-semibold text-sm text-gray-900">
                      Intelligence Feed (Structured Data)
                    </div>
                    <div className="flex-1 overflow-y-auto p-0">
                      {analyzedData.length > 0 ? (
                        <table className="w-full text-sm text-left">
                          <thead className="bg-gray-50 text-xs uppercase text-gray-600 sticky top-0">
                            <tr>
                              <th className="px-4 py-3 font-medium">Issue Summary</th>
                              <th className="px-4 py-3 font-medium">District</th>
                              <th className="px-4 py-3 font-medium">Sentiment</th>
                              <th className="px-4 py-3 font-medium">Severity</th>
                            </tr>
                          </thead>
                          <tbody>
                            {analyzedData.map((row, idx) => (
                              <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                                <td className="px-4 py-3 font-medium text-gray-900">{row.summary}</td>
                                <td className="px-4 py-3 text-gray-700">{row.district}</td>
                                <td className="px-4 py-3">
                                  <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                    row.sentiment === 'Negative' ? 'bg-red-100 text-red-700' : 
                                    row.sentiment === 'Positive' ? 'bg-green-100 text-green-700' : 
                                    'bg-gray-200 text-gray-700'
                                  }`}>
                                    {row.sentiment}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-gray-900">
                                  <div className="flex items-center gap-1">
                                    {row.severity}/5
                                    {row.severity >= 4 && <AlertTriangle className="w-3 h-3 text-red-500" />}
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : (
                        <div className="h-full flex items-center justify-center text-xs text-gray-400 p-8">
                          Awaiting AI Processing...
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {activeTab === 'districts' && (
             <div className="border border-gray-200 bg-white p-6 rounded-xl shadow-sm h-[500px] flex flex-col">
               <h3 className="font-semibold mb-4 text-sm text-gray-900">Complaints & Intelligence by District</h3>
               <div className="flex-1 flex items-center justify-center">
                 {districtChartData.length > 0 ? (
                   <ResponsiveContainer width="80%" height="80%">
                     <BarChart data={districtChartData} layout="vertical">
                       <XAxis type="number" fontSize={12} tickLine={false} axisLine={false} />
                       <YAxis type="category" dataKey="name" fontSize={12} tickLine={false} axisLine={false} width={100} />
                       <Tooltip cursor={{fill: 'transparent'}} contentStyle={{backgroundColor: '#fff', color: '#000', borderRadius: '8px', border: '1px solid #e5e5e5'}}/>
                       <Bar dataKey="count" fill="#111827" radius={[0, 4, 4, 0]} />
                     </BarChart>
                   </ResponsiveContainer>
                 ) : (
                   <p className="text-gray-500 text-sm">No data available. Please fetch and analyze news first.</p>
                 )}
               </div>
             </div>
          )}

          {activeTab === 'departments' && (
             <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
               {Object.keys(deptCount).map((dept, i) => (
                 <div key={i} className="border border-gray-200 bg-white p-6 rounded-xl shadow-sm">
                   <h3 className="font-bold text-lg text-gray-900 mb-2">{dept}</h3>
                   <p className="text-gray-600 text-sm mb-4">Total monitored cases: {deptCount[dept]}</p>
                   <div className="bg-gray-50 p-4 rounded-lg border border-gray-100">
                     <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Recent Issues</p>
                     {analyzedData.filter(d => d.department === dept).slice(0,3).map((item, j) => (
                       <div key={j} className="text-sm mb-2 pb-2 border-b border-gray-200 last:border-0 last:mb-0 last:pb-0 text-gray-800">
                         • {item.summary} <span className="text-xs text-gray-500">({item.district})</span>
                       </div>
                     ))}
                   </div>
                 </div>
               ))}
               {Object.keys(deptCount).length === 0 && (
                 <p className="text-gray-500 text-sm col-span-2 text-center mt-10">No department data available. Please fetch and analyze news first.</p>
               )}
             </div>
          )}

        </div>
      </main>
    </div>
  )
}

function StatCard({ title, value, subtitle, icon }) {
  return (
    <div className="border border-gray-200 bg-white p-6 rounded-xl shadow-sm flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-medium text-gray-600 uppercase tracking-wider">{title}</h3>
        <div className="text-gray-400">{icon}</div>
      </div>
      <p className="text-3xl font-bold mb-1 tracking-tight text-gray-900">{value}</p>
      {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
    </div>
  )
}

export default App;
