import { useEffect, useState } from 'react';
import {
  Activity,
  Zap,
  TrendingUp,
  LayoutDashboard,
  BarChart3,
  BrainCircuit,
  ReceiptText,
  CalendarDays,
  Send,
  Menu,
  Clock3,
  ChevronRight,
  Sparkles,
  Sun,
  ShieldCheck,
  RefreshCw,
  Plus,
  Trash2,
  HelpCircle,
  FileText,
  Sliders,
  DollarSign,
  ArrowUpRight,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ComposedChart,
  LineChart,
  Line,
  ReferenceLine,
  Legend,
} from 'recharts';
import BillAnalyzer from './components/BillAnalyzer';
import MonthlyBills from './components/MonthlyBills';
import MarkdownMessage from './components/MarkdownMessage';
import {
  loadChatSessions,
  saveChatSessions,
  getDefaultChatSession,
} from './utils/sessionStorage';
import './App.css';

const API = 'http://127.0.0.1:5000/api';

const navigation = [
  { label: 'Overview', icon: LayoutDashboard },
  { label: 'Bill Analysis', icon: ReceiptText, badge: 'AI' },
  { label: 'Monthly Bills', icon: CalendarDays, badge: 'New' },
  { label: 'Forecasting', icon: TrendingUp },
  { label: 'Analytics', icon: BarChart3 },
  { label: 'AI Assistant', icon: BrainCircuit },
];

function App() {
  const [activePage, setActivePage] = useState('Overview');
  const [question, setQuestion] = useState('');
  const [summary, setSummary] = useState(null);
  const [chartData, setChartData] = useState([]);
  const [chartLimit, setChartLimit] = useState(168); // 168h = 7 days
  const [backendError, setBackendError] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  // Chat sessions state
  const [sessions, setSessions] = useState(() => loadChatSessions());
  const [activeSessionId, setActiveSessionIdState] = useState(() => {
    const loaded = loadChatSessions();
    return loaded[0]?.id || 'default-session';
  });

  const activeSession = sessions.find((s) => s.id === activeSessionId) || sessions[0] || getDefaultChatSession();
  const messages = activeSession.messages || [];

  const [forecast, setForecast] = useState(null);
  const [forecastLoading, setForecastLoading] = useState(true);
  const [forecastError, setForecastError] = useState('');
  const [modelMetrics, setModelMetrics] = useState(null);
  const [metricsError, setMetricsError] = useState('');

  // Persist sessions
  useEffect(() => {
    saveChatSessions(sessions);
  }, [sessions]);

  const updateActiveSessionMessages = (updater) => {
    setSessions((prev) =>
      prev.map((s) => {
        if (s.id === activeSession.id) {
          const nextMessages = typeof updater === 'function' ? updater(s.messages || []) : updater;
          return { ...s, messages: nextMessages };
        }
        return s;
      })
    );
  };

  const handleNewChatSession = () => {
    const newSession = {
      id: `session-${Date.now()}`,
      title: `Energy Chat ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
      createdAt: new Date().toISOString(),
      messages: [
        {
          role: 'assistant',
          text: '### Fresh Energy Session Started\nAsk anything about household power trends, next-hour forecasting with XGBoost, reducing peak charges, or solar feasibility!',
        },
      ],
    };
    setSessions((prev) => [newSession, ...prev]);
    setActiveSessionIdState(newSession.id);
  };

  const handleClearSession = () => {
    updateActiveSessionMessages([
      {
        role: 'assistant',
        text: '### Session Cleared\nHow can I help you optimize your power consumption today?',
      },
    ]);
  };

  const fetchForecast = async () => {
    try {
      setForecastLoading(true);
      setForecastError('');

      const response = await fetch(`${API}/forecast`);
      if (!response.ok) {
        throw new Error('Could not fetch forecast');
      }

      const data = await response.json();
      setForecast(data);
    } catch (error) {
      setForecastError(error.message);
    } finally {
      setForecastLoading(false);
    }
  };

  useEffect(() => {
    fetchForecast();
  }, []);

  // Load evaluation metrics exported from the trained models.
  useEffect(() => {
    async function loadMetrics() {
      try {
        const response = await fetch(`${API}/metrics`);
        if (!response.ok) {
          throw new Error('Could not fetch model metrics');
        }
        const data = await response.json();
        setModelMetrics(data);
        setMetricsError('');
      } catch {
        setMetricsError('Model metrics unavailable. Check the Flask backend.');
      }
    }

    loadMetrics();
  }, []);

  // Load dashboard data from Flask with selectable range limit
  useEffect(() => {
    async function loadDashboard() {
      try {
        setLoading(true);
        const [summaryResponse, consumptionResponse] = await Promise.all([
          fetch(`${API}/summary`),
          fetch(`${API}/consumption?limit=${chartLimit}`),
        ]);

        if (!summaryResponse.ok || !consumptionResponse.ok) {
          throw new Error('Failed to load dashboard data.');
        }

        const summaryData = await summaryResponse.json();
        const consumptionData = await consumptionResponse.json();

        setSummary(summaryData);
        setChartData(consumptionData);
        setBackendError('');
      } catch {
        setBackendError(
          'Unable to connect to Flask. Make sure your backend is running on port 5000.'
        );
      } finally {
        setLoading(false);
      }
    }

    loadDashboard();
  }, [chartLimit]);

  // Send a question to the Flask assistant endpoint.
  async function sendMessage(event) {
    event?.preventDefault();

    const trimmed = question.trim();
    if (!trimmed || sending) return;

    const userMessage = { role: 'user', text: trimmed };
    updateActiveSessionMessages((prev) => [...prev, userMessage]);
    setQuestion('');
    setSending(true);

    try {
      const clientKey = localStorage.getItem('wattwise_openrouter_key') || '';
      const response = await fetch(`${API}/assistant`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(clientKey ? { 'X-OpenRouter-Key': clientKey } : {}),
        },
        body: JSON.stringify({
          question: trimmed,
          chat_history: messages,
          api_key: clientKey,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'The request failed.');
      }

      const assistantMessage = {
        role: 'assistant',
        text: data.answer || 'The assistant returned an empty response.',
      };
      updateActiveSessionMessages((prev) => [...prev, assistantMessage]);
    } catch {
      updateActiveSessionMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: 'Could not reach the assistant backend. Please verify the Flask API is running on port 5000.',
        },
      ]);
    } finally {
      setSending(false);
    }
  }

  // Greeting by hour
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  const latestLoad = chartData.length > 0 ? chartData[chartData.length - 1].usage : null;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">
            <Zap size={23} />
          </div>

          <div>
            <h2>WattWise</h2>
            <span>ENERGY INTELLIGENCE</span>
          </div>
        </div>

        <div className="nav-label">WORKSPACE</div>

        <nav>
          {navigation.map(({ label, icon: Icon, badge }) => (
            <button
              key={label}
              className={`nav-item ${activePage === label ? 'active' : ''}`}
              onClick={() => setActivePage(label)}
            >
              <Icon size={19} />
              <span>{label}</span>
              {badge && <span className="nav-badge">{badge}</span>}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="status-dot" />
          <div>
            <strong>Project workspace</strong>
            <span>Energy forecasting</span>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb">
            <Menu size={19} />
            <span>Workspace</span>
            <span className="muted">/</span>
            <strong>{activePage}</strong>
          </div>

          <div className="topbar-right">
            <span className="live-indicator" />
            <span>
              {backendError
                ? 'Backend disconnected'
                : forecastError
                ? 'Forecast unavailable'
                : 'Backend connected'}
            </span>
          </div>
        </header>

        <section className="page-content">
          <div className="welcome-row">
            <div>
              <div className="eyebrow">
                {activePage === 'Bill Analysis'
                  ? 'AI TARIFF & UTILITY AUDITING'
                  : activePage === 'Monthly Bills'
                  ? 'MULTI-MONTH BILL INTELLIGENCE'
                  : activePage === 'Forecasting'
                  ? 'MACHINE LEARNING FORECAST HUB'
                  : activePage === 'Analytics'
                  ? 'HISTORICAL LOAD TELEMETRY'
                  : activePage === 'AI Assistant'
                  ? 'CONVERSATIONAL ENERGY ADVISOR'
                  : 'ENERGY MONITORING PLATFORM'}
              </div>

              <h1>
                {activePage === 'Overview'
                  ? `${getGreeting()}, Household Observer`
                  : activePage === 'Bill Analysis'
                  ? 'Electricity Bill Analysis'
                  : activePage === 'Monthly Bills'
                  ? 'Monthly Bills & Seasonal Variance'
                  : activePage === 'Forecasting'
                  ? 'Forecasting Laboratory'
                  : activePage === 'Analytics'
                  ? 'Historical Consumption Analytics'
                  : 'Energy AI Advisor'}
              </h1>

              <p>
                {activePage === 'Overview'
                  ? 'Real-time telemetry, predictive insights, and AI-powered bill audits in one unified hub.'
                  : activePage === 'Bill Analysis'
                  ? 'Upload a utility bill (PDF or camera snapshot) for deep tariff breakdown, efficiency scoring, and savings tips.'
                  : activePage === 'Monthly Bills'
                  ? 'Add bills for specific months to track multi-month trends, seasonal shifts, and annual budget optimization.'
                  : activePage === 'Forecasting'
                  ? 'Inspect XGBoost load predictions and compare evaluation benchmarks against Prophet and ARIMA.'
                  : activePage === 'Analytics'
                  ? 'Deep-dive into historical load duration curves, diurnal patterns, and consumption variance.'
                  : 'Chat directly with your energy assistant about tariffs, appliance savings, and load predictions.'}
              </p>
            </div>

            <div className="date-chip">
              <Clock3 size={16} />
              {activePage === 'Bill Analysis'
                ? 'Document Auditor'
                : activePage === 'Monthly Bills'
                ? 'Multi-Month View'
                : activePage === 'Forecasting'
                ? 'ML Model Engine'
                : activePage === 'Analytics'
                ? 'Telemetry Data'
                : 'Live Workspace'}
            </div>
          </div>

          {backendError && (
            <div className="notice" style={{ borderColor: 'rgba(180, 42, 74, 0.4)', background: 'rgba(180, 42, 74, 0.08)' }}>
              <Activity size={18} color="#B42A4A" />
              <span style={{ color: '#B42A4A' }}>
                <strong>Connection Error:</strong> {backendError} Make sure Flask is running on port 5000.
              </span>
            </div>
          )}

          {/* =========================================================
              PAGE 1: OVERVIEW (FRESH & INTERACTIVE HOME)
              ========================================================= */}
          {activePage === 'Overview' && (
            <>
              {/* Quick Action Navigation Cards */}
              <div className="quick-actions-grid">
                <div
                  className="action-card"
                  onClick={() => setActivePage('Bill Analysis')}
                >
                  <span className="card-badge">AI Vision</span>
                  <div className="action-icon teal">
                    <ReceiptText size={22} />
                  </div>
                  <div className="action-text">
                    <h4>Audit Utility Bill</h4>
                    <p>Upload a bill PDF or photo for instant tariff & savings analysis</p>
                  </div>
                  <ChevronRight size={18} className="action-arrow" />
                </div>

                <div
                  className="action-card"
                  onClick={() => setActivePage('Monthly Bills')}
                >
                  <span className="card-badge">New</span>
                  <div className="action-icon amber">
                    <CalendarDays size={22} />
                  </div>
                  <div className="action-text">
                    <h4>Monthly Bills Tracker</h4>
                    <p>Add specific months & analyze multi-month seasonal trends</p>
                  </div>
                  <ChevronRight size={18} className="action-arrow" />
                </div>

                <div
                  className="action-card"
                  onClick={() => setActivePage('Forecasting')}
                >
                  <div className="action-icon blue">
                    <TrendingUp size={22} />
                  </div>
                  <div className="action-text">
                    <h4>Forecasting Hub</h4>
                    <p>XGBoost next-hour predictions & model evaluation comparisons</p>
                  </div>
                  <ChevronRight size={18} className="action-arrow" />
                </div>

                <div
                  className="action-card"
                  onClick={() => setActivePage('AI Assistant')}
                >
                  <div className="action-icon violet">
                    <BrainCircuit size={22} />
                  </div>
                  <div className="action-text">
                    <h4>Ask Energy AI</h4>
                    <p>Conversational advisor for tips, tariffs, and appliance loads</p>
                  </div>
                  <ChevronRight size={18} className="action-arrow" />
                </div>
              </div>

              {/* Top 4 KPI Cards */}
              <div className="stats-grid">
                <StatCard
                  icon={<Activity size={20} />}
                  label="Latest active power"
                  value={latestLoad !== null ? latestLoad.toFixed(2) : '—'}
                  unit="kW"
                  caption={
                    chartData.length > 0
                      ? `Most recent hourly observation (${chartData[chartData.length - 1].time})`
                      : 'Waiting for telemetry'
                  }
                  color="mint"
                />

                <StatCard
                  icon={<TrendingUp size={20} />}
                  label="Next dataset-hour forecast"
                  value={
                    forecastLoading
                      ? '...'
                      : forecastError
                      ? '—'
                      : Number(
                          forecast?.prediction ??
                            forecast?.forecast ??
                            forecast?.predicted_consumption
                        ).toFixed(2)
                  }
                  unit={forecastLoading || forecastError ? '' : 'kW'}
                  caption={
                    forecastLoading
                      ? 'Running XGBoost regressor...'
                      : forecastError
                      ? 'Forecast unavailable'
                      : `Historical prediction: ${forecast?.timestamp || 'next hour'}`
                  }
                  color="blue"
                />

                <StatCard
                  icon={<Zap size={20} />}
                  label="Average consumption"
                  value={summary ? summary.average : '—'}
                  unit="kW"
                  caption={
                    summary
                      ? `Baseline across ${summary.observations?.toLocaleString()} observations`
                      : 'Waiting for backend'
                  }
                  color="purple"
                />

                <StatCard
                  icon={<Sun size={20} />}
                  label="Peak load recorded"
                  value={summary ? summary.maximum : '—'}
                  unit="kW"
                  caption="Maximum coincident demand recorded in history"
                  color="mint"
                />
              </div>

              {/* Main Content Grid: Chart + Assistant preview */}
              <div className="content-grid">
                <section className="panel chart-panel">
                  <div className="panel-heading">
                    <div>
                      <h3>Household Load Curve</h3>
                      <p>Active power draw (kW) across recent observations</p>
                    </div>

                    <div className="chart-range-pills">
                      <button
                        type="button"
                        className={`range-pill ${chartLimit === 24 ? 'active' : ''}`}
                        onClick={() => setChartLimit(24)}
                      >
                        24h
                      </button>
                      <button
                        type="button"
                        className={`range-pill ${chartLimit === 48 ? 'active' : ''}`}
                        onClick={() => setChartLimit(48)}
                      >
                        48h
                      </button>
                      <button
                        type="button"
                        className={`range-pill ${chartLimit === 168 ? 'active' : ''}`}
                        onClick={() => setChartLimit(168)}
                      >
                        7 Days
                      </button>
                    </div>
                  </div>

                  <div className="chart-legend">
                    <span className="legend-dot" />
                    Global Active Power (kW)
                  </div>

                  <div className="chart-container">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData}>
                        <defs>
                          <linearGradient
                            id="usageGradient"
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop
                              offset="0%"
                              stopColor="#0E9F8E"
                              stopOpacity={0.38}
                            />
                            <stop
                              offset="95%"
                              stopColor="#0E9F8E"
                              stopOpacity={0}
                            />
                          </linearGradient>
                        </defs>

                        <CartesianGrid
                          stroke="rgba(20, 33, 61, 0.1)"
                          strokeDasharray="3 6"
                        />

                        <XAxis
                          dataKey="time"
                          tick={{ fill: '#5D6B8A', fontSize: 12 }}
                          axisLine={false}
                          tickLine={false}
                        />

                        <YAxis
                          tick={{ fill: '#5D6B8A', fontSize: 12 }}
                          axisLine={false}
                          tickLine={false}
                          width={42}
                        />

                        <Tooltip
                          contentStyle={{
                            background: 'rgba(255, 255, 255, 0.95)',
                            border: '1px solid rgba(20, 33, 61, 0.12)',
                            borderRadius: 14,
                            color: '#14213D',
                            boxShadow: '0 16px 32px -16px rgba(52, 64, 140, 0.35)',
                            backdropFilter: 'blur(10px)',
                          }}
                        />

                        <Area
                          type="monotone"
                          dataKey="usage"
                          name="Active Power (kW)"
                          stroke="#0E9F8E"
                          strokeWidth={2.5}
                          fill="url(#usageGradient)"
                          connectNulls
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>

                  <p className="chart-footnote">
                    Displaying {chartData.length} observations from the UCI power dataset.
                  </p>
                </section>

                {/* AI Assistant Card with Markdown formatting */}
                <section className="panel assistant-panel">
                  <div className="panel-heading">
                    <div className="assistant-title">
                      <div className="assistant-icon">
                        <BrainCircuit size={20} />
                      </div>

                      <div>
                        <h3>Energy AI</h3>
                        <p>Powered by OpenRouter & Telemetry</p>
                      </div>
                    </div>

                    <button
                      type="button"
                      className="beta-tag"
                      onClick={() => setActivePage('AI Assistant')}
                      style={{ cursor: 'pointer', border: 'none' }}
                      title="Open full page assistant"
                    >
                      Expand
                    </button>
                  </div>

                  <div className="chat-messages" style={{ maxHeight: '340px' }}>
                    {messages.slice(-6).map((message, index) => (
                      <div
                        key={`${index}-${message.role}`}
                        className={`message ${message.role}`}
                      >
                        <MarkdownMessage content={message.text} />
                      </div>
                    ))}

                    {sending && (
                      <div className="message assistant">
                        <RefreshCw size={14} className="spin-icon" style={{ display: 'inline', marginRight: 6 }} />
                        Analyzing and consulting energy data...
                      </div>
                    )}
                  </div>

                  <div className="suggestions">
                    <button
                      type="button"
                      onClick={() => setQuestion('What is the average consumption?')}
                    >
                      Average power
                    </button>

                    <button
                      type="button"
                      onClick={() => setQuestion('Forecast energy usage for next hour')}
                    >
                      Next hour forecast
                    </button>

                    <button
                      type="button"
                      onClick={() => setQuestion('How can I reduce my electricity bill?')}
                    >
                      Saving tips
                    </button>
                  </div>

                  <form className="chat-form" onSubmit={sendMessage}>
                    <input
                      value={question}
                      onChange={(event) => setQuestion(event.target.value)}
                      placeholder="Ask about electricity usage, solar, savings..."
                      aria-label="Ask the energy assistant"
                      disabled={sending}
                    />

                    <button
                      type="submit"
                      aria-label="Send message"
                      disabled={sending || !question.trim()}
                    >
                      <Send size={17} />
                    </button>
                  </form>
                </section>
              </div>

              {/* Models Overview Snapshot */}
              <section className="panel model-panel">
                <div className="panel-heading">
                  <div>
                    <h3>Forecasting Models Evaluation</h3>
                    <p>Machine learning evaluation metrics exported from model training</p>
                  </div>

                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setActivePage('Forecasting')}
                    style={{ fontSize: '13px' }}
                  >
                    View Forecasting Hub
                    <ChevronRight size={15} />
                  </button>
                </div>

                <div className="model-grid">
                  {[
                    ['ARIMA', 'Statistical time-series autoregressive model'],
                    ['Prophet', 'Additive seasonal regression model'],
                    ['XGBoost', 'Gradient boosted decision trees with lag features'],
                  ].map(([name, description]) => {
                    const metrics = modelMetrics?.[name];
                    return (
                      <div className="model-card" key={name}>
                        <div className="model-card-top">
                          <span className="model-dot" />
                          <strong>{name}</strong>
                        </div>

                        <p>{description}</p>

                        {metrics ? (
                          <div className="model-metrics">
                            <div>
                              <span>MAE</span>
                              <strong>{Number(metrics.MAE).toFixed(3)}</strong>
                            </div>
                            <div>
                              <span>RMSE</span>
                              <strong>{Number(metrics.RMSE).toFixed(3)}</strong>
                            </div>
                            <div>
                              <span>R²</span>
                              <strong>{Number(metrics.R2).toFixed(3)}</strong>
                            </div>
                          </div>
                        ) : (
                          <span className="model-status">Loading metrics...</span>
                        )}

                        <span className="model-status">
                          {name === 'XGBoost'
                            ? 'Best metrics (lowest MAE & RMSE)'
                            : 'Baseline comparator'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </section>
            </>
          )}

          {/* =========================================================
              PAGE 2: BILL ANALYSIS (SINGLE BILL AUDITOR)
              ========================================================= */}
          {activePage === 'Bill Analysis' && <BillAnalyzer />}

          {/* =========================================================
              PAGE 3: MONTHLY BILLS (MULTI-MONTH TRACKER - NEW PAGE)
              ========================================================= */}
          {activePage === 'Monthly Bills' && <MonthlyBills />}

                    {/* =========================================================
              PAGE 4: FORECASTING (DEDICATED ML FORECAST HUB)
              ========================================================= */}
          {activePage === 'Forecasting' && (
            <div className="forecasting-view">

              {/* ── HERO PANEL: Next-hour prediction ── */}
              <div className="forecast-hero-panel">
                <div className="forecast-left">
                  <div className="hero-pill">
                    <Sparkles size={15} />
                    <span>XGBoost • Historical Dataset Extension</span>
                  </div>
                  <h2>Load Forecast Laboratory</h2>
                  <p>
                    Predictions generated by a trained <strong>XGBoost Regressor</strong> using 24
                    autoregressive lag features and calendar embeddings on the UCI HEPC dataset
                    (Sceaux, France • Dec 2006 – Nov 2010).
                  </p>
                  <div style={{ marginTop: '12px', fontSize: '13px', color: '#5D6B8A' }}>
                    Target: <code>Global_active_power (kW)</code> &nbsp;•&nbsp; XGBoost R²:{' '}
                    <strong style={{ color: '#0E9F8E' }}>
                      {modelMetrics?.XGBoost
                        ? Number(modelMetrics.XGBoost.R2).toFixed(3)
                        : forecast?.model_metrics?.XGBoost
                        ? Number(forecast.model_metrics.XGBoost.R2).toFixed(3)
                        : '0.589'}
                    </strong>
                  </div>
                  <div
                    style={{
                      marginTop: '10px',
                      padding: '8px 12px',
                      background: 'rgba(245,165,36,0.1)',
                      borderRadius: '8px',
                      border: '1px solid rgba(245,165,36,0.3)',
                      fontSize: '12px',
                      color: '#c8882a',
                    }}
                  >
                    ⚠️ <strong>Historical forecast:</strong> This model extends the 2006–2010 dataset
                    timeline — not live household consumption.
                  </div>
                </div>

                <div className="forecast-figure">
                  <div className="figure-val">
                    {forecastLoading
                      ? '...'
                      : forecastError
                      ? '—'
                      : Number(forecast?.next_hour?.forecast ?? forecast?.forecast ?? 0).toFixed(2)}
                    <span> kW</span>
                  </div>
                  <div className="figure-label">
                    {forecast?.next_hour?.timestamp
                      ? `Step 1 → ${forecast.next_hour.timestamp}`
                      : forecast?.timestamp
                      ? `Target: ${forecast.timestamp}`
                      : 'Next observation'}
                  </div>
                  <div style={{ marginTop: '6px', fontSize: '11px', color: '#5D6B8A' }}>
                    Last dataset point: 2010-11-26 21:00
                  </div>
                </div>
              </div>

              {/* ── KPI STAT STRIP ── */}
              <div className="forecast-stats-strip">
                <div className="forecast-kpi-card">
                  <div className="kpi-label">Next-Hour Prediction</div>
                  <div className="kpi-value teal">
                    {forecastLoading
                      ? '—'
                      : `${Number(forecast?.next_hour?.forecast ?? forecast?.forecast ?? 0).toFixed(3)} kW`}
                  </div>
                </div>
                <div className="forecast-kpi-card">
                  <div className="kpi-label">XGBoost R²</div>
                  <div className="kpi-value teal">
                    {modelMetrics?.XGBoost
                      ? Number(modelMetrics.XGBoost.R2).toFixed(3)
                      : forecast?.model_metrics?.XGBoost
                      ? Number(forecast.model_metrics.XGBoost.R2).toFixed(3)
                      : '0.589'}
                  </div>
                </div>
                <div className="forecast-kpi-card">
                  <div className="kpi-label">XGBoost MAE</div>
                  <div className="kpi-value amber">
                    {modelMetrics?.XGBoost
                      ? `${Number(modelMetrics.XGBoost.MAE).toFixed(3)} kW`
                      : forecast?.model_metrics?.XGBoost
                      ? `${Number(forecast.model_metrics.XGBoost.MAE).toFixed(3)} kW`
                      : '0.350 kW'}
                  </div>
                </div>
                <div className="forecast-kpi-card">
                  <div className="kpi-label">Dataset Observations</div>
                  <div className="kpi-value violet">34,168 hourly</div>
                </div>
                <div className="forecast-kpi-card">
                  <div className="kpi-label">Dataset Span</div>
                  <div className="kpi-value violet">Dec 2006 – Nov 2010</div>
                </div>
              </div>

              {/* ── 24-HOUR FORECAST CURVE ── */}
              {!forecastLoading && forecast?.forecast_curve?.length > 0 && (
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <h3>24-Hour Forecast Trajectory</h3>
                      <p>Recursive autoregressive XGBoost predictions with ±RMSE confidence band</p>
                    </div>
                    <TrendingUp size={20} color="#0E9F8E" />
                  </div>
                  <ResponsiveContainer width="100%" height={260}>
                    <ComposedChart
                      data={forecast.forecast_curve}
                      margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient id="forecastGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#0E9F8E" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="#0E9F8E" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                      <XAxis
                        dataKey="time"
                        tick={{ fontSize: 11, fill: '#5D6B8A' }}
                        interval={3}
                        stroke="rgba(255,255,255,0.1)"
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: '#5D6B8A' }}
                        unit=" kW"
                        stroke="rgba(255,255,255,0.1)"
                        width={58}
                      />
                      <Tooltip
                        contentStyle={{
                          background: 'rgba(20,33,61,0.95)',
                          border: '1px solid rgba(255,255,255,0.12)',
                          borderRadius: '10px',
                          fontSize: '12px',
                        }}
                        formatter={(v, name) => [
                          `${Number(v).toFixed(3)} kW`,
                          name === 'upper_bound'
                            ? 'Upper bound'
                            : name === 'lower_bound'
                            ? 'Lower bound'
                            : 'Forecast',
                        ]}
                      />
                      <Area
                        type="monotone"
                        dataKey="upper_bound"
                        stroke="none"
                        fill="#0E9F8E"
                        fillOpacity={0.12}
                        legendType="none"
                        dot={false}
                        activeDot={false}
                        name="upper_bound"
                      />
                      <Area
                        type="monotone"
                        dataKey="lower_bound"
                        stroke="none"
                        fill="#14213D"
                        fillOpacity={1}
                        legendType="none"
                        dot={false}
                        activeDot={false}
                        name="lower_bound"
                      />
                      <Line
                        type="monotone"
                        dataKey="forecast"
                        stroke="#0E9F8E"
                        strokeWidth={2.5}
                        dot={false}
                        activeDot={{ r: 5, fill: '#0E9F8E' }}
                        name="forecast"
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                  <div style={{ fontSize: '11px', color: '#5D6B8A', marginTop: '6px', textAlign: 'center' }}>
                    Shaded band = ±RMSE (0.501 kW) confidence interval &nbsp;•&nbsp; Extends from 2010-11-26 22:00
                  </div>
                </section>
              )}

              {/* ── ACTUAL vs PREDICTED VALIDATION ── */}
              {!forecastLoading && forecast?.evaluation_test_window?.length > 0 && (
                <section className="panel actual-pred-panel">
                  <div className="panel-heading validation-header">
                    <div>
                      <h3>Actual vs Predicted — Validation Window</h3>
                      <p>48-hour historical test window showing model performance on known data</p>
                    </div>
                    <div className="val-legend">
                      <div className="val-item">
                        <div className="val-line" style={{ background: '#0E9F8E' }} />
                        <span>Actual</span>
                      </div>
                      <div className="val-item">
                        <div className="val-line" style={{ borderTop: '2px dashed #F5A524', background: 'transparent' }} />
                        <span>Predicted</span>
                      </div>
                    </div>
                  </div>
                  <ResponsiveContainer width="100%" height={240}>
                    <LineChart
                      data={forecast.evaluation_test_window}
                      margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                      <XAxis
                        dataKey="time"
                        tick={{ fontSize: 10, fill: '#5D6B8A' }}
                        interval={5}
                        stroke="rgba(255,255,255,0.1)"
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: '#5D6B8A' }}
                        unit=" kW"
                        stroke="rgba(255,255,255,0.1)"
                        width={58}
                      />
                      <Tooltip
                        contentStyle={{
                          background: 'rgba(20,33,61,0.95)',
                          border: '1px solid rgba(255,255,255,0.12)',
                          borderRadius: '10px',
                          fontSize: '12px',
                        }}
                        formatter={(v, name) => [
                          `${Number(v).toFixed(3)} kW`,
                          name === 'actual' ? 'Actual' : 'Predicted',
                        ]}
                      />
                      <Line
                        type="monotone"
                        dataKey="actual"
                        stroke="#0E9F8E"
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4 }}
                        name="actual"
                      />
                      <Line
                        type="monotone"
                        dataKey="predicted"
                        stroke="#F5A524"
                        strokeWidth={2}
                        strokeDasharray="5 3"
                        dot={false}
                        activeDot={{ r: 4 }}
                        name="predicted"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                  <div style={{ fontSize: '11px', color: '#5D6B8A', marginTop: '6px', textAlign: 'center' }}>
                    Mean absolute error over this window: ~{
                      forecast.evaluation_test_window.length > 0
                        ? (forecast.evaluation_test_window.reduce((s, r) => s + r.error, 0) / forecast.evaluation_test_window.length).toFixed(3)
                        : '—'
                    } kW
                  </div>
                </section>
              )}

              {/* ── MODEL BENCHMARKS ── */}
              <section className="panel model-panel">
                <div className="panel-heading">
                  <div>
                    <h3>Model Architecture & Metric Benchmarks</h3>
                    <p>XGBoost champion vs Prophet and ARIMA statistical baselines</p>
                  </div>
                  <ShieldCheck size={20} color="#0E9F8E" />
                </div>

                <div className="model-grid">
                  {[
                    [
                      'XGBoost',
                      'Gradient Boosted Decision Trees trained on 24 autoregressive lag features and calendar signals.',
                      true,
                    ],
                    [
                      'Prophet',
                      'Additive decomposition model capturing weekly, monthly, and diurnal seasonalities with changepoints.',
                      false,
                    ],
                    [
                      'ARIMA',
                      'Classical AutoRegressive Integrated Moving Average (univariate time-series benchmark).',
                      false,
                    ],
                  ].map(([name, desc, isBest]) => {
                    const metrics =
                      modelMetrics?.[name] ||
                      forecast?.model_metrics?.[name] ||
                      forecast?.dataset_info?.evaluation_metrics?.[name];
                    return (
                      <div className="model-card" key={name}>
                        <div className="model-card-top">
                          <span
                            className="model-dot"
                            style={{ background: isBest ? '#0E9F8E' : '#5D6B8A' }}
                          />
                          <strong>{name}</strong>
                          {isBest && (
                            <span
                              style={{
                                marginLeft: 'auto',
                                fontSize: '10px',
                                background: 'rgba(14,159,142,0.15)',
                                color: '#0E9F8E',
                                padding: '2px 7px',
                                borderRadius: '20px',
                              }}
                            >
                              Champion
                            </span>
                          )}
                        </div>
                        <p>{desc}</p>
                        {metrics ? (
                          <div className="model-metrics">
                            <div>
                              <span>MAE</span>
                              <strong>{Number(metrics.MAE).toFixed(3)}</strong>
                            </div>
                            <div>
                              <span>RMSE</span>
                              <strong>{Number(metrics.RMSE).toFixed(3)}</strong>
                            </div>
                            <div>
                              <span>R²</span>
                              <strong
                                style={{
                                  color:
                                    Number(metrics.R2) > 0.5
                                      ? '#0E9F8E'
                                      : Number(metrics.R2) > 0
                                      ? '#F5A524'
                                      : '#B42A4A',
                                }}
                              >
                                {Number(metrics.R2).toFixed(3)}
                              </strong>
                            </div>
                          </div>
                        ) : (
                          <span className="model-status">Loading metrics...</span>
                        )}
                        <span className="model-status">
                          {isBest ? 'Champion Model — Best Performance' : 'Baseline Comparator'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* ── DATASET PROVENANCE ── */}
              <div className="dataset-provenance-panel">
                <div className="panel-heading" style={{ marginBottom: '16px' }}>
                  <div>
                    <h3>Dataset Provenance</h3>
                    <p>Full transparency on training data origin and characteristics</p>
                  </div>
                  <FileText size={20} color="#6C5CE7" />
                </div>
                <div className="provenance-grid">
                  <div className="provenance-item">
                    <span className="prov-label">Dataset</span>
                    <span className="prov-val">UCI HEPC (Individual Household Electric Power Consumption)</span>
                  </div>
                  <div className="provenance-item">
                    <span className="prov-label">Source</span>
                    <span className="prov-val">UCI Machine Learning Repository &amp; Kaggle</span>
                  </div>
                  <div className="provenance-item">
                    <span className="prov-label">Location</span>
                    <span className="prov-val">Sceaux, France — suburban household, 7 km south of Paris</span>
                  </div>
                  <div className="provenance-item">
                    <span className="prov-label">Period</span>
                    <span className="prov-val">Dec 16 2006 – Nov 26 2010 (47 months)</span>
                  </div>
                  <div className="provenance-item">
                    <span className="prov-label">Raw Observations</span>
                    <span className="prov-val">2,075,259 minute-level readings → resampled to hourly</span>
                  </div>
                  <div className="provenance-item">
                    <span className="prov-label">Hourly Records</span>
                    <span className="prov-val">34,168 observations used for training &amp; evaluation</span>
                  </div>
                  <div className="provenance-item">
                    <span className="prov-label">Load Range</span>
                    <span className="prov-val">0.124 – 6.561 kW &nbsp;|&nbsp; Mean: 1.092 kW</span>
                  </div>
                  <div className="provenance-item">
                    <span className="prov-label">Feature Schema</span>
                    <span className="prov-val">28 features: 24 hourly lags (lag_1 → lag_24) + hour, day, weekday, month</span>
                  </div>
                </div>
                <div
                  style={{
                    marginTop: '14px',
                    padding: '10px 14px',
                    background: 'rgba(108,92,231,0.08)',
                    borderRadius: '8px',
                    border: '1px solid rgba(108,92,231,0.2)',
                    fontSize: '12px',
                    color: '#8b80d1',
                    lineHeight: '1.6',
                  }}
                >
                  ℹ️ <strong>Important:</strong> This model was trained on a French suburban household from 2006–2010.
                  Forecasts extend the historical timeline — they do <em>not</em> represent your live household consumption.
                  For real-time insights, upload your electricity bills in the <strong>Bill Analysis</strong> or{' '}
                  <strong>Monthly Bills</strong> tab.
                </div>
              </div>

              {/* ── METHODOLOGY ── */}
              <div className="methodology-box">
                <h4>Why XGBoost Outperforms Univariate Models on Power Data</h4>
                <div className="methodology-grid">
                  <div className="method-card">
                    <h5>1. Multi-Lag Memory Structure</h5>
                    <p>
                      Rather than assuming linear autoregressive decay, XGBoost inspects all 24
                      hourly lag features simultaneously to detect non-linear morning and evening load curves.
                    </p>
                  </div>
                  <div className="method-card">
                    <h5>2. Physical Feasibility Guardrails</h5>
                    <p>
                      Predictions are clipped at 0.0 kW to prevent physically impossible negative energy values.
                      Prophet and ARIMA lack this domain constraint.
                    </p>
                  </div>
                  <div className="method-card">
                    <h5>3. Calendar Feature Conditioning</h5>
                    <p>
                      Hour-of-day, weekday, and month embeddings let the model distinguish weekend
                      occupancy patterns from weekday commute dips and seasonal heating cycles.
                    </p>
                  </div>
                </div>
              </div>

            </div>
          )}

{/* =========================================================
              PAGE 5: ANALYTICS (HISTORICAL TELEMETRY & PATTERNS)
              ========================================================= */}
          {activePage === 'Analytics' && (
            <div className="analytics-view">
              {/* Diurnal Pattern Highlights */}
              <div className="diurnal-grid">
                <div className="diurnal-card">
                  <div className="diurnal-head">
                    <Sun size={18} color="#F5A524" />
                    <span>Daytime Active Window (9 AM – 5 PM)</span>
                  </div>
                  <div className="diurnal-val">~1.24 kW</div>
                  <p>Baseline occupant activity, work-from-home appliances, and ambient HVAC load.</p>
                </div>

                <div className="diurnal-card">
                  <div className="diurnal-head">
                    <Zap size={18} color="#B42A4A" />
                    <span>Evening Peak Surge (6 PM – 9 PM)</span>
                  </div>
                  <div className="diurnal-val">~2.85 kW</div>
                  <p>Coincident cooking, entertainment systems, hot water heating, and lighting.</p>
                </div>

                <div className="diurnal-card">
                  <div className="diurnal-head">
                    <Activity size={18} color="#34408C" />
                    <span>Night Standby / Idle (11 PM – 6 AM)</span>
                  </div>
                  <div className="diurnal-val">~0.48 kW</div>
                  <p>Unavoidable vampire load: refrigerator compressors, Wi-Fi router, and standby adapters.</p>
                </div>

                <div className="diurnal-card">
                  <div className="diurnal-head">
                    <Sliders size={18} color="#0E9F8E" />
                    <span>Load Factor (Avg / Peak)</span>
                  </div>
                  <div className="diurnal-val">
                    {summary ? ((summary.average / summary.maximum) * 100).toFixed(1) : '—'}%
                  </div>
                  <p>A lower load factor indicates high peakiness with brief, expensive spikes.</p>
                </div>
              </div>

              {/* Extended Chart with flexible range */}
              <section className="panel chart-panel">
                <div className="panel-heading">
                  <div>
                    <h3>Extended Historical Telemetry</h3>
                    <p>Inspect power fluctuations across broader historical intervals</p>
                  </div>

                  <div className="chart-range-pills">
                    <button
                      type="button"
                      className={`range-pill ${chartLimit === 24 ? 'active' : ''}`}
                      onClick={() => setChartLimit(24)}
                    >
                      24h
                    </button>
                    <button
                      type="button"
                      className={`range-pill ${chartLimit === 72 ? 'active' : ''}`}
                      onClick={() => setChartLimit(72)}
                    >
                      72h
                    </button>
                    <button
                      type="button"
                      className={`range-pill ${chartLimit === 168 ? 'active' : ''}`}
                      onClick={() => setChartLimit(168)}
                    >
                      7 Days
                    </button>
                    <button
                      type="button"
                      className={`range-pill ${chartLimit === 720 ? 'active' : ''}`}
                      onClick={() => setChartLimit(720)}
                    >
                      30 Days
                    </button>
                  </div>
                </div>

                <div className="chart-container" style={{ height: '360px' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient
                          id="usageGradient2"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="0%"
                            stopColor="#0E9F8E"
                            stopOpacity={0.4}
                          />
                          <stop
                            offset="95%"
                            stopColor="#0E9F8E"
                            stopOpacity={0}
                          />
                        </linearGradient>
                      </defs>
                      <CartesianGrid
                        stroke="rgba(20, 33, 61, 0.08)"
                        strokeDasharray="3 4"
                      />
                      <XAxis
                        dataKey="time"
                        tick={{ fill: '#5D6B8A', fontSize: 11 }}
                      />
                      <YAxis
                        tick={{ fill: '#5D6B8A', fontSize: 11 }}
                        width={42}
                      />
                      <Tooltip
                        contentStyle={{
                          background: 'rgba(255, 255, 255, 0.95)',
                          borderRadius: 12,
                          border: '1px solid rgba(20, 33, 61, 0.12)',
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="usage"
                        name="Active Power (kW)"
                        stroke="#0E9F8E"
                        strokeWidth={2}
                        fill="url(#usageGradient2)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </section>
            </div>
          )}

          {/* =========================================================
              PAGE 6: AI ASSISTANT (DEDICATED CONVERSATIONAL HUB)
              ========================================================= */}
          {activePage === 'AI Assistant' && (
            <div className="ai-assistant-full">
              <div className="assistant-header-bar">
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div className="assistant-icon">
                    <BrainCircuit size={20} />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '18px' }}>Energy AI Consultant</h3>
                    <span style={{ fontSize: '13px', color: '#5D6B8A' }}>
                      Context: {summary?.observations?.toLocaleString() || '10,000+'} telemetry hours loaded • OpenRouter Ready
                    </span>
                  </div>
                </div>

                <div className="assistant-session-actions">
                  <button
                    type="button"
                    className="btn-new-chat"
                    onClick={handleNewChatSession}
                  >
                    <Plus size={15} />
                    <span>New Chat Session</span>
                  </button>
                  <button
                    type="button"
                    className="btn-clear-chat"
                    onClick={handleClearSession}
                  >
                    <Trash2 size={14} />
                    <span>Clear Messages</span>
                  </button>
                </div>
              </div>

              {/* Chat Message Stream with MarkdownMessage */}
              <div className="full-chat-messages">
                {messages.map((msg, idx) => (
                  <div key={idx} className={`chat-bubble ${msg.role}`}>
                    <MarkdownMessage content={msg.text} />
                  </div>
                ))}

                {sending && (
                  <div className="chat-bubble assistant loading">
                    <RefreshCw size={16} className="spin-icon" />
                    <span>Consulting energy intelligence engine...</span>
                  </div>
                )}
              </div>

              {/* Quick suggestions */}
              <div className="chat-quick-queries">
                <button
                  type="button"
                  onClick={() => {
                    setQuestion('What is the average and peak power in my dataset?');
                  }}
                >
                  What is my average and peak power?
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setQuestion('How much would a 4 kW rooftop solar array save me?');
                  }}
                >
                  Solar savings for 4 kW system
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setQuestion('Which household appliances consume the most electricity during peak hours?');
                  }}
                >
                  High consumption appliances
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setQuestion('Explain the XGBoost forecasting accuracy versus ARIMA and Prophet.');
                  }}
                >
                  Compare forecasting models
                </button>
              </div>

              {/* Chat input form */}
              <form onSubmit={sendMessage} className="full-chat-form">
                <input
                  type="text"
                  placeholder="Ask any question about household power, tariffs, forecasting, or appliance efficiency..."
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  disabled={sending}
                />
                <button
                  type="submit"
                  disabled={sending || !question.trim()}
                  aria-label="Send message"
                >
                  <Send size={18} />
                </button>
              </form>
            </div>
          )}

          <footer>
            WattWise · Household Energy Consumption Intelligence & Tariff Auditing
          </footer>
        </section>
      </main>
    </div>
  );
}

function StatCard({ icon, label, value, unit, caption, color }) {
  return (
    <div className="stat-card">
      <div className={`stat-icon ${color}`}>{icon}</div>
      <p>{label}</p>
      <div className="stat-value">
        {value} <span>{unit}</span>
      </div>
      <div className="stat-caption">{caption}</div>
    </div>
  );
}

export default App;
