import { useState, useEffect } from 'react';
import {
  CalendarDays,
  Plus,
  Trash2,
  Sparkles,
  Zap,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Activity,
  Layers,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  FileText,
  BarChart2,
  Sun,
  ShieldCheck,
  X,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from 'recharts';
import MarkdownMessage from './MarkdownMessage';
import {
  loadSavedMonthlyBills,
  saveMonthlyBills,
  loadSavedMonthlyAnalysis,
  saveMonthlyAnalysis,
  DEFAULT_SAMPLE_MONTHS,
} from '../utils/sessionStorage';
import './MonthlyBills.css';

const API_BASE = 'http://127.0.0.1:5000/api';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export default function MonthlyBills({ clientKey }) {
  const [bills, setBills] = useState(() => loadSavedMonthlyBills());
  const [aiAnalysis, setAiAnalysis] = useState(() => loadSavedMonthlyAnalysis());
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState('');
  const [activeChartTab, setActiveChartTab] = useState('both'); // 'kwh' | 'cost' | 'both'

  // Modal for adding a bill
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [formMonth, setFormMonth] = useState('November');
  const [formYear, setFormYear] = useState('2026');
  const [formUnits, setFormUnits] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formDays, setFormDays] = useState('30');
  const [formNotes, setFormNotes] = useState('');

  // Persist bills whenever they change
  useEffect(() => {
    saveMonthlyBills(bills);
  }, [bills]);

  // Persist AI analysis
  useEffect(() => {
    saveMonthlyAnalysis(aiAnalysis);
  }, [aiAnalysis]);

  // Handle adding new bill
  const handleAddBill = (e) => {
    e.preventDefault();
    const units = parseFloat(formUnits);
    const amount = parseFloat(formAmount);
    const days = parseInt(formDays, 10) || 30;

    if (isNaN(units) || units < 0) {
      setError('Please enter a valid positive number for electricity units (kWh).');
      return;
    }
    if (isNaN(amount) || amount < 0) {
      setError('Please enter a valid positive bill amount ($).');
      return;
    }

    const monthLabel = `${formMonth.slice(0, 3)} ${formYear}`;

    // Check if month already exists
    const exists = bills.some((b) => b.month === monthLabel);
    if (exists) {
      setError(`A bill for ${monthLabel} already exists. Please remove it first or pick another month.`);
      return;
    }

    const newBill = {
      id: Date.now().toString(),
      month: monthLabel,
      units_kwh: units,
      amount: amount,
      billing_days: days,
      notes: formNotes.trim() || 'User uploaded record',
    };

    setBills((prev) => [...prev, newBill]);
    setIsAddModalOpen(false);
    setFormUnits('');
    setFormAmount('');
    setFormNotes('');
    setError('');
  };

  // Remove bill
  const handleRemoveBill = (id) => {
    setBills((prev) => prev.filter((b) => b.id !== id));
  };

  // Load sample data
  const handleLoadSample = () => {
    setBills(DEFAULT_SAMPLE_MONTHS);
    setAiAnalysis(null);
    setError('');
  };

  // Clear all bills
  const handleClearAll = () => {
    if (window.confirm('Are you sure you want to clear all monthly bill records?')) {
      setBills([]);
      setAiAnalysis(null);
    }
  };

  // Trigger Multi-Month AI Analysis
  const handleRunAiAudit = async () => {
    if (bills.length < 2) {
      setError('Please add at least 2 monthly bills to analyze trends and seasonal variance.');
      return;
    }

    setError('');
    setAnalyzing(true);

    try {
      const activeKey = clientKey || localStorage.getItem('wattwise_openrouter_key') || '';
      const res = await fetch(`${API_BASE}/bill/analyze-multi-month`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(activeKey ? { 'X-OpenRouter-Key': activeKey } : {}),
        },
        body: JSON.stringify({
          bills: bills,
          api_key: activeKey,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to analyze multi-month trends.');
      }

      setAiAnalysis(data);
    } catch (err) {
      setError(err.message || 'Error running multi-month analysis.');
    } finally {
      setAnalyzing(false);
    }
  };

  // Compute metrics
  const totalUnits = bills.reduce((acc, b) => acc + (parseFloat(b.units_kwh) || 0), 0);
  const totalSpend = bills.reduce((acc, b) => acc + (parseFloat(b.amount) || 0), 0);
  const count = bills.length;
  const avgUnits = count > 0 ? (totalUnits / count).toFixed(1) : '0';
  const avgSpend = count > 0 ? (totalSpend / count).toFixed(2) : '0.00';

  // Find peak and min
  let peakBill = null;
  let minBill = null;
  if (count > 0) {
    const sorted = [...bills].sort((a, b) => b.units_kwh - a.units_kwh);
    peakBill = sorted[0];
    minBill = sorted[sorted.length - 1];
  }

  // Format chart data with rate per kWh
  const chartData = bills.map((b, idx) => {
    const units = parseFloat(b.units_kwh) || 0;
    const amount = parseFloat(b.amount) || 0;
    const rate = units > 0 ? (amount / units).toFixed(3) : 0;
    
    // Calculate delta vs previous month
    let delta = null;
    if (idx > 0) {
      const prevUnits = parseFloat(bills[idx - 1].units_kwh) || 1;
      delta = (((units - prevUnits) / prevUnits) * 100).toFixed(1);
    }

    return {
      name: b.month,
      units,
      amount,
      rate: parseFloat(rate),
      delta,
      days: b.billing_days || 30,
      dailyKwh: (units / (b.billing_days || 30)).toFixed(2),
    };
  });

  return (
    <div className="monthly-bills-page">
      {/* Hero Banner */}
      <div className="monthly-hero">
        <div className="hero-text">
          <div className="hero-pill">
            <CalendarDays size={15} />
            <span>Multi-Month Utility Intelligence</span>
          </div>
          <h2>Monthly Electricity Bills & Seasonal Analysis</h2>
          <p>
            Track your household electricity bills across specific months, uncover season-over-season
            consumption shifts, and run multi-month AI audits to optimize your annual utility budget.
          </p>
        </div>

        <div className="hero-actions">
          <button
            type="button"
            className="btn-add-bill"
            onClick={() => setIsAddModalOpen(true)}
          >
            <Plus size={16} />
            <span>Add Month's Bill</span>
          </button>

          <button
            type="button"
            className="btn-sample"
            onClick={handleLoadSample}
            title="Load 6 months of sample bill data"
          >
            <Zap size={15} />
            <span>Load 6-Month Sample</span>
          </button>

          {bills.length > 0 && (
            <button
              type="button"
              className="btn-clear"
              onClick={handleClearAll}
              title="Clear all recorded bills"
            >
              <Trash2 size={15} />
              <span>Clear</span>
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="monthly-alert error">
          <AlertCircle size={18} />
          <span>{error}</span>
          <button onClick={() => setError('')} className="alert-dismiss">
            <X size={15} />
          </button>
        </div>
      )}

      {/* KPI Stat Cards */}
      <div className="monthly-stats-grid">
        <div className="monthly-stat-card">
          <div className="stat-top">
            <span className="stat-label">Total Consumption Tracked</span>
            <span className="stat-icon-wrap teal">
              <Zap size={18} />
            </span>
          </div>
          <div className="stat-value">
            {totalUnits.toLocaleString()}{' '}
            <span className="unit">kWh</span>
          </div>
          <div className="stat-sub">Across {count} billing month{count !== 1 ? 's' : ''}</div>
        </div>

        <div className="monthly-stat-card">
          <div className="stat-top">
            <span className="stat-label">Total Expenditure</span>
            <span className="stat-icon-wrap amber">
              <DollarSign size={18} />
            </span>
          </div>
          <div className="stat-value">
            ${totalSpend.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="stat-sub">Avg. ${avgSpend} / month</div>
        </div>

        <div className="monthly-stat-card">
          <div className="stat-top">
            <span className="stat-label">Monthly Average Usage</span>
            <span className="stat-icon-wrap blue">
              <Activity size={18} />
            </span>
          </div>
          <div className="stat-value">
            {avgUnits} <span className="unit">kWh/mo</span>
          </div>
          <div className="stat-sub">~{count > 0 ? (totalUnits / (count * 30)).toFixed(1) : 0} kWh daily average</div>
        </div>

        <div className="monthly-stat-card">
          <div className="stat-top">
            <span className="stat-label">Peak Usage Month</span>
            <span className="stat-icon-wrap purple">
              <TrendingUp size={18} />
            </span>
          </div>
          <div className="stat-value">
            {peakBill ? peakBill.month : '—'}
          </div>
          <div className="stat-sub">
            {peakBill ? `${peakBill.units_kwh} kWh · $${peakBill.amount}` : 'No bills recorded'}
          </div>
        </div>
      </div>

      {/* Visual Charts & Comparison Panel */}
      {bills.length > 0 ? (
        <div className="panel monthly-chart-panel">
          <div className="panel-heading">
            <div>
              <h3>Month-over-Month Trends</h3>
              <p>Visualizing energy demand and billing progression across seasons</p>
            </div>

            <div className="chart-tabs">
              <button
                type="button"
                className={`tab-btn ${activeChartTab === 'both' ? 'active' : ''}`}
                onClick={() => setActiveChartTab('both')}
              >
                Combined
              </button>
              <button
                type="button"
                className={`tab-btn ${activeChartTab === 'kwh' ? 'active' : ''}`}
                onClick={() => setActiveChartTab('kwh')}
              >
                Consumption (kWh)
              </button>
              <button
                type="button"
                className={`tab-btn ${activeChartTab === 'cost' ? 'active' : ''}`}
                onClick={() => setActiveChartTab('cost')}
              >
                Cost ($)
              </button>
            </div>
          </div>

          <div className="chart-wrapper">
            <ResponsiveContainer width="100%" height={320}>
              {activeChartTab === 'cost' ? (
                <LineChart data={chartData}>
                  <CartesianGrid stroke="rgba(20, 33, 61, 0.08)" strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fill: '#5D6B8A', fontSize: 13 }} />
                  <YAxis
                    tick={{ fill: '#5D6B8A', fontSize: 13 }}
                    tickFormatter={(val) => `$${val}`}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'rgba(255, 255, 255, 0.95)',
                      borderRadius: 12,
                      border: '1px solid rgba(20, 33, 61, 0.12)',
                      boxShadow: '0 12px 24px rgba(52, 64, 140, 0.2)',
                    }}
                    formatter={(val) => [`$${val}`, 'Monthly Cost']}
                  />
                  <Line
                    type="monotone"
                    dataKey="amount"
                    name="Bill Amount ($)"
                    stroke="#F5A524"
                    strokeWidth={3}
                    dot={{ fill: '#F5A524', r: 5 }}
                    activeDot={{ r: 8 }}
                  />
                </LineChart>
              ) : activeChartTab === 'kwh' ? (
                <BarChart data={chartData}>
                  <CartesianGrid stroke="rgba(20, 33, 61, 0.08)" strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fill: '#5D6B8A', fontSize: 13 }} />
                  <YAxis
                    tick={{ fill: '#5D6B8A', fontSize: 13 }}
                    tickFormatter={(val) => `${val} kWh`}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'rgba(255, 255, 255, 0.95)',
                      borderRadius: 12,
                      border: '1px solid rgba(20, 33, 61, 0.12)',
                      boxShadow: '0 12px 24px rgba(52, 64, 140, 0.2)',
                    }}
                    formatter={(val) => [`${val} kWh`, 'Consumption']}
                  />
                  <Bar
                    dataKey="units"
                    name="Consumption (kWh)"
                    fill="#0E9F8E"
                    radius={[8, 8, 0, 0]}
                  />
                </BarChart>
              ) : (
                <BarChart data={chartData}>
                  <CartesianGrid stroke="rgba(20, 33, 61, 0.08)" strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fill: '#5D6B8A', fontSize: 13 }} />
                  <YAxis
                    yAxisId="left"
                    tick={{ fill: '#0E9F8E', fontSize: 13 }}
                    tickFormatter={(val) => `${val}k`}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tick={{ fill: '#F5A524', fontSize: 13 }}
                    tickFormatter={(val) => `$${val}`}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'rgba(255, 255, 255, 0.95)',
                      borderRadius: 12,
                      border: '1px solid rgba(20, 33, 61, 0.12)',
                      boxShadow: '0 12px 24px rgba(52, 64, 140, 0.2)',
                    }}
                  />
                  <Legend />
                  <Bar
                    yAxisId="left"
                    dataKey="units"
                    name="Energy (kWh)"
                    fill="#0E9F8E"
                    radius={[6, 6, 0, 0]}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="amount"
                    name="Cost ($)"
                    stroke="#F5A524"
                    strokeWidth={3}
                  />
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>
      ) : (
        <div className="panel empty-panel">
          <CalendarDays size={48} color="#0E9F8E" />
          <h3>No Monthly Bills Recorded Yet</h3>
          <p>Add bills for individual months or load sample 6-month data to visualize seasonal trends.</p>
          <button type="button" className="btn-add-bill" onClick={handleLoadSample}>
            <Zap size={16} />
            <span>Load Sample 6-Month Data</span>
          </button>
        </div>
      )}

      {/* Month-by-Month Table and AI Trigger */}
      {bills.length > 0 && (
        <div className="panel monthly-table-panel">
          <div className="panel-heading">
            <div>
              <h3>Monthly Billing Records</h3>
              <p>Individual billing periods with effective unit tariffs</p>
            </div>

            <button
              type="button"
              className="btn-ai-audit"
              onClick={handleRunAiAudit}
              disabled={analyzing}
            >
              {analyzing ? (
                <>
                  <RefreshCw size={16} className="spin-icon" />
                  <span>Auditing Multi-Month Trends...</span>
                </>
              ) : (
                <>
                  <Sparkles size={16} />
                  <span>Audit Multi-Month Trends with AI</span>
                </>
              )}
            </button>
          </div>

          <div className="table-responsive">
            <table className="monthly-table">
              <thead>
                <tr>
                  <th>Billing Month</th>
                  <th>Consumption</th>
                  <th>Daily Avg</th>
                  <th>Total Cost</th>
                  <th>Effective Rate</th>
                  <th>Month-on-Month</th>
                  <th>Notes</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {chartData.map((row, idx) => (
                  <tr key={bills[idx]?.id || idx}>
                    <td className="month-col">
                      <strong>{row.name}</strong>
                    </td>
                    <td>
                      {row.units.toLocaleString()} <span className="muted-unit">kWh</span>
                    </td>
                    <td>{row.dailyKwh} kWh/d</td>
                    <td className="cost-col">${row.amount.toFixed(2)}</td>
                    <td>${row.rate.toFixed(3)} /kWh</td>
                    <td>
                      {row.delta !== null ? (
                        <span
                          className={`delta-tag ${parseFloat(row.delta) > 0 ? 'up' : 'down'}`}
                        >
                          {parseFloat(row.delta) > 0 ? (
                            <TrendingUp size={12} />
                          ) : (
                            <TrendingDown size={12} />
                          )}
                          {Math.abs(row.delta)}%
                        </span>
                      ) : (
                        <span className="delta-tag neutral">—</span>
                      )}
                    </td>
                    <td className="notes-col">{bills[idx]?.notes || '—'}</td>
                    <td>
                      <button
                        type="button"
                        className="btn-remove-row"
                        onClick={() => handleRemoveBill(bills[idx].id)}
                        title="Remove this month"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* AI Multi-Month Audit Results Section */}
      {aiAnalysis && (
        <div className="panel ai-audit-results">
          <div className="panel-heading">
            <div className="audit-header-left">
              <div className="sparkle-circle">
                <Sparkles size={20} />
              </div>
              <div>
                <h3>AI Multi-Month Trend & Seasonal Audit</h3>
                <p>Auditor insights computed across your {count} recorded months</p>
              </div>
            </div>

            <button
              type="button"
              className="btn-refresh-audit"
              onClick={handleRunAiAudit}
              disabled={analyzing}
            >
              <RefreshCw size={14} className={analyzing ? 'spin-icon' : ''} />
              <span>Re-audit</span>
            </button>
          </div>

          {/* Quick AI Observation Badges */}
          {aiAnalysis.key_trends?.length > 0 && (
            <div className="trends-badges-grid">
              {aiAnalysis.key_trends.map((tr, i) => (
                <div key={i} className="trend-badge-card">
                  <span className="trend-bullet">{i + 1}</span>
                  <p>{tr}</p>
                </div>
              ))}
            </div>
          )}

          {/* Seasonal Insights Card */}
          {aiAnalysis.seasonal_observations?.length > 0 && (
            <div className="seasonal-card">
              <div className="seasonal-head">
                <Sun size={18} color="#F5A524" />
                <h4>Seasonal Demand Fluctuations</h4>
              </div>
              <ul>
                {aiAnalysis.seasonal_observations.map((obs, i) => (
                  <li key={i}>{obs}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Annual Savings Roadmap */}
          {aiAnalysis.annual_savings_roadmap?.length > 0 && (
            <div className="roadmap-section">
              <div className="roadmap-head">
                <ShieldCheck size={20} color="#0E9F8E" />
                <h4>Annual Savings Roadmap</h4>
              </div>

              <div className="roadmap-grid">
                {aiAnalysis.annual_savings_roadmap.map((item, idx) => (
                  <div key={idx} className="roadmap-card">
                    <span className="roadmap-period">{item.target_months}</span>
                    <h5>{item.action}</h5>
                    <div className="roadmap-savings">
                      Potential Annual Savings:{' '}
                      <strong>{item.potential_annual_savings}</strong>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Complete Markdown Report */}
          {aiAnalysis.markdown_report && (
            <div className="full-report-box">
              <MarkdownMessage content={aiAnalysis.markdown_report} />
            </div>
          )}
        </div>
      )}

      {/* Add Month Modal */}
      {isAddModalOpen && (
        <div className="modal-backdrop" onClick={() => setIsAddModalOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-icon">
                <CalendarDays size={20} />
              </div>
              <div>
                <h3>Add Electricity Bill for a Month</h3>
                <p>Record consumption and charges for a specific billing cycle</p>
              </div>
              <button
                className="modal-close"
                onClick={() => setIsAddModalOpen(false)}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAddBill} className="modal-form">
              <div className="form-row">
                <div className="form-group">
                  <label>Billing Month</label>
                  <select
                    value={formMonth}
                    onChange={(e) => setFormMonth(e.target.value)}
                  >
                    {MONTH_NAMES.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>Billing Year</label>
                  <select
                    value={formYear}
                    onChange={(e) => setFormYear(e.target.value)}
                  >
                    <option value="2026">2026</option>
                    <option value="2025">2025</option>
                    <option value="2024">2024</option>
                  </select>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Total Units Consumed (kWh) *</label>
                  <input
                    type="number"
                    step="0.1"
                    placeholder="e.g. 420.5"
                    value={formUnits}
                    onChange={(e) => setFormUnits(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Total Bill Amount ($) *</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="e.g. 142.85"
                    value={formAmount}
                    onChange={(e) => setFormAmount(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Billing Days</label>
                  <input
                    type="number"
                    min="1"
                    max="35"
                    value={formDays}
                    onChange={(e) => setFormDays(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label>Notes / Appliance Context</label>
                  <input
                    type="text"
                    placeholder="e.g. AC used heavily, guests visited"
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                  />
                </div>
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setIsAddModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Add Month's Bill
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

