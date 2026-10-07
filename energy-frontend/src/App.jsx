import { useEffect, useState } from 'react';
import {
  Activity,
  Zap,
  TrendingUp,
  MessageCircle,
  LayoutDashboard,
  BarChart3,
  BrainCircuit,
  Send,
  Menu,
  Clock3,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts';
import './App.css';

const API = 'http://127.0.0.1:5000/api';

const navigation = [
  { label: 'Overview', icon: LayoutDashboard },
  { label: 'Forecasting', icon: TrendingUp },
  { label: 'Analytics', icon: BarChart3 },
  { label: 'AI Assistant', icon: BrainCircuit },
];

function App() {
  const [activePage, setActivePage] = useState('Overview');
  const [question, setQuestion] = useState('');
  const [summary, setSummary] = useState(null);
  const [chartData, setChartData] = useState([]);
  const [backendError, setBackendError] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      text: 'Hi! I can help you explore energy consumption and forecasting. What would you like to know?',
    },
  ]);

  const [forecast, setForecast] = useState(null);
  const [forecastLoading, setForecastLoading] = useState(true);
  const [forecastError, setForecastError] = useState("");
  const [modelMetrics, setModelMetrics] = useState(null);
  const [metricsError, setMetricsError] = useState("");

  const fetchForecast = async () => {
    try {
      setForecastLoading(true);
      setForecastError("");

      const response = await fetch(
        `${API}/forecast`
      );

      if (!response.ok) {
        throw new Error("Could not fetch forecast");
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
          throw new Error("Could not fetch model metrics");
        }
        const data = await response.json();
        setModelMetrics(data);
        setMetricsError("");
      } catch (error) {
        setMetricsError("Model metrics unavailable. Check the Flask backend.");
      }
    }

    loadMetrics();
  }, []);

  // Load dashboard data from Flask.
  useEffect(() => {
    async function loadDashboard() {
      try {
        const [summaryResponse, consumptionResponse] =
          await Promise.all([
            fetch(`${API}/summary`),
            fetch(`${API}/consumption`),
          ]);

        if (!summaryResponse.ok || !consumptionResponse.ok) {
          throw new Error('Failed to load dashboard data.');
        }

        const summaryData = await summaryResponse.json();
        const consumptionData = await consumptionResponse.json();

        setSummary(summaryData);
        setChartData(consumptionData);
        setBackendError('');
      } catch (error) {
        setBackendError(
          'Unable to connect to Flask. Make sure your backend is running on port 5000.'
        );
      } finally {
        setLoading(false);
      }
    }

    loadDashboard();
  }, []);

  // Send a question to the Flask assistant endpoint.
  async function sendMessage(event) {
    event.preventDefault();

    const trimmed = question.trim();

    if (!trimmed || sending) return;

    setMessages((previous) => [
      ...previous,
      { role: 'user', text: trimmed },
    ]);

    setQuestion('');
    setSending(true);

    try {
      const response = await fetch(`${API}/assistant`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ question: trimmed }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'The request failed.');
      }

      setMessages((previous) => [
        ...previous,
        {
          role: 'assistant',
          text: data.answer || 'The assistant returned an empty response.',
        },
      ]);
    } catch (error) {
      setMessages((previous) => [
        ...previous,
        {
          role: 'assistant',
          text: 'Could not reach the assistant backend. Please check that Flask is running.',
        },
      ]);
    } finally {
      setSending(false);
    }
  }

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
          {navigation.map(({ label, icon: Icon }) => (
            <button
              key={label}
              className={`nav-item ${
                activePage === label ? 'active' : ''
              }`}
              onClick={() => setActivePage(label)}
            >
              <Icon size={19} />
              <span>{label}</span>
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
              {backendError ? 'Backend disconnected' : forecastError ? 'Forecast unavailable' : 'Backend connected'}
            </span>
          </div>
        </header>

        <section className="page-content">
          <div className="welcome-row">
            <div>
              <div className="eyebrow">
                ENERGY MONITORING PLATFORM
              </div>

              <h1>
                {activePage === 'Overview'
                  ? 'Energy Overview'
                  : activePage}
              </h1>

              <p>
                Understand consumption patterns and explore predictive
                insights.
              </p>
            </div>

            <div className="date-chip">
              <Clock3 size={16} />
              Hourly view
            </div>
          </div>

          <div className="notice">
            <Activity size={18} />
            <span>
              <strong>Backend connection:</strong>{' '}
              {loading
                ? 'Loading dashboard data...'
                : backendError
                  ? 'Using unavailable data until the connection is restored.'
                  : 'Dashboard data loaded from the Flask API.'}
            </span>
          </div>

          <div className="data-notice">
            Historical-data note: this model forecasts the next hour after the dataset's final observation. It is not a live prediction for today's household consumption.
          </div>

          {backendError && (
            <p
              style={{
                color: '#B42A4A',
                margin: '0 0 16px',
                fontSize: '14px',
              }}
            >
              {backendError}
            </p>
          )}

          <div className="stats-grid">
            <StatCard
              icon={<Activity size={20} />}
              label="Average consumption"
              value={summary ? summary.average : '—'}
              unit="kW"
              caption={
                summary
                  ? 'Average across available observations'
                  : 'Waiting for backend data'
              }
              color="mint"
            />

            <StatCard
              icon={<TrendingUp size={20} />}
              label="Next dataset-hour forecast"
              value={
                forecastLoading
                  ? "Loading..."
                  : forecastError
                    ? "—"
                    : Number(
                        forecast?.prediction ??
                        forecast?.forecast ??
                        forecast?.predicted_consumption
                      ).toFixed(2)
              }
              unit={forecastLoading || forecastError ? "" : "kW"}
              caption={
                forecastLoading
                  ? "Getting prediction from XGBoost"
                  : forecastError
                    ? "Forecast unavailable — check Flask"
                    : `Historical XGBoost forecast${forecast?.timestamp ? ` · ${forecast.timestamp}` : ""}`
              }
              color="blue"
            />

            <StatCard
              icon={<Zap size={20} />}
              label="Peak consumption"
              value={summary ? summary.maximum : '—'}
              unit="kW"
              caption={
                summary
                  ? 'Maximum across available observations'
                  : 'Waiting for backend data'
              }
              color="purple"
            />
          </div>

          <div className="content-grid">
            <section className="panel chart-panel">
              <div className="panel-heading">
                <div>
                  <h3>Consumption trends</h3>
                  <p>
                    {chartData.length > 0
                      ? 'Consumption data received from the backend'
                      : 'Waiting for consumption data'}
                  </p>
                </div>

                <span className="chart-tag">CONSUMPTION</span>
              </div>

              <div className="chart-legend">
                <span className="legend-dot" />
                Energy consumption
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
                        background: 'rgba(255, 255, 255, 0.88)',
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
                      name="Consumption"
                      stroke="#0E9F8E"
                      strokeWidth={2.5}
                      fill="url(#usageGradient)"
                      connectNulls
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              <p className="chart-footnote">
                {chartData.length > 0
                  ? `${chartData.length} observations loaded. Values currently come from the Flask backend.`
                  : 'No chart data available. Check your Flask connection.'}
              </p>
            </section>

            <section className="panel assistant-panel">
              <div className="panel-heading">
                <div className="assistant-title">
                  <div className="assistant-icon">
                    <BrainCircuit size={20} />
                  </div>

                  <div>
                    <h3>Energy AI</h3>
                    <p>Natural-language assistant</p>
                  </div>
                </div>

                <span className="beta-tag">BETA</span>
              </div>

              <div className="chat-messages">
                {messages.map((message, index) => (
                  <div
                    key={`${index}-${message.role}`}
                    className={`message ${message.role}`}
                  >
                    {message.text}
                  </div>
                ))}

                {sending && (
                  <div className="message assistant">
                    Sending your question...
                  </div>
                )}
              </div>

              <div className="suggestions">
                <button
                  type="button"
                  onClick={() =>
                    setQuestion('What is the average consumption?')
                  }
                >
                  Average consumption
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setQuestion('Forecast energy usage for tomorrow')
                  }
                >
                  Tomorrow&apos;s forecast
                </button>
              </div>

              <form className="chat-form" onSubmit={sendMessage}>
                <input
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  placeholder="Ask about energy usage..."
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

              <p className="chat-disclaimer">
                DistilBART intent classification · fallback available
              </p>
            </section>
          </div>

          <section className="panel model-panel">
            <div className="panel-heading">
              <div>
                <h3>Forecasting models</h3>
                <p>
                  Compare evaluation metrics from your exported model results.
                </p>
              </div>

              <BrainCircuit size={20} color="#0E9F8E" />
            </div>

            {metricsError && (
              <p style={{ color: "#B42A4A", fontSize: "14px" }}>
                {metricsError}
              </p>
            )}

            <div className="model-grid">
              {[
                ["ARIMA", "Statistical time-series model"],
                ["Prophet", "Trend and seasonality forecasting"],
                ["XGBoost", "Machine-learning regression"],
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
                      <span className="model-status">
                        {modelMetrics ? "Metrics not provided" : "Loading metrics..."}
                      </span>
                    )}

                    <span className="model-status">
                      {name === "XGBoost"
                        ? "Best metrics in this evaluation"
                        : "Evaluation results loaded"}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>

          <footer>
            WattWise · Household Energy Consumption Forecasting
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