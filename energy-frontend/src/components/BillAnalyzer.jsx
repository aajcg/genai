import { useState, useRef, useEffect } from 'react';
import {
  UploadCloud,
  FileText,
  Image as ImageIcon,
  Sparkles,
  Zap,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  DollarSign,
  Sun,
  Leaf,
  Layers,
  HelpCircle,
  Send,
  RefreshCw,
  X,
  ExternalLink,
  ChevronRight,
  ShieldCheck,
  Building2,
  Calendar,
  Hash,
  Activity,
  Key,
} from 'lucide-react';
import ApiKeyModal from './ApiKeyModal';
import './BillAnalyzer.css';

const API_BASE = 'http://127.0.0.1:5000/api';

export default function BillAnalyzer() {
  const [file, setFile] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedModel, setSelectedModel] = useState('google/gemini-2.0-flash-001');
  const [availableModels, setAvailableModels] = useState([]);
  const [hasServerKey, setHasServerKey] = useState(false);
  const [clientKey, setClientKey] = useState(() => localStorage.getItem('wattwise_openrouter_key') || '');
  const [isKeyModalOpen, setIsKeyModalOpen] = useState(false);

  const [analyzing, setAnalyzing] = useState(false);
  const [analysisStep, setAnalysisStep] = useState(1);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [error, setError] = useState('');

  // Bill Assistant Chat
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);

  const fileInputRef = useRef(null);

  // Fetch backend API key config and models
  const fetchConfig = async () => {
    try {
      const res = await fetch(`${API_BASE}/bill/config`);
      if (res.ok) {
        const data = await res.json();
        setHasServerKey(Boolean(data.has_api_key));
        if (data.available_models) {
          setAvailableModels(data.available_models);
        }
        if (data.default_model) {
          setSelectedModel(data.default_model);
        }
      }
    } catch {
      // Backend may be offline or starting up
    }
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  const handleSaveClientKey = (newKey) => {
    setClientKey(newKey);
    if (newKey) {
      localStorage.setItem('wattwise_openrouter_key', newKey);
    } else {
      localStorage.removeItem('wattwise_openrouter_key');
    }
  };

  const handleSaveServerKey = async (newKey) => {
    const res = await fetch(`${API_BASE}/bill/save-key`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: newKey }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to save key on backend.');
    }
    setHasServerKey(true);
  };

  const handleFileSelect = (selectedFile) => {
    if (!selectedFile) return;

    setError('');
    const validTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    if (!validTypes.includes(selectedFile.type) && !selectedFile.name.match(/\.(pdf|jpe?g|png|webp)$/i)) {
      setError('Please upload a PDF document or image file (JPG, PNG, WEBP).');
      return;
    }

    if (selectedFile.size > 15 * 1024 * 1024) {
      setError('File is too large. Please upload a file under 15MB.');
      return;
    }

    setFile(selectedFile);

    if (selectedFile.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => setFilePreview(e.target.result);
      reader.readAsDataURL(selectedFile);
    } else {
      setFilePreview(null);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const clearFile = () => {
    setFile(null);
    setFilePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Run Bill Analysis
  const runAnalysis = async (useSample = false) => {
    setError('');

    // Check key availability if not using sample
    const activeKey = clientKey || (hasServerKey ? 'server' : null);
    if (!useSample && !activeKey) {
      setIsKeyModalOpen(true);
      setError('Please provide your OpenRouter API key to analyze real bills.');
      return;
    }

    setAnalyzing(true);
    setAnalysisStep(1);

    // Progressive step indicator
    const stepTimer1 = setTimeout(() => setAnalysisStep(2), 2200);
    const stepTimer2 = setTimeout(() => setAnalysisStep(3), 4800);

    try {
      let res;
      if (useSample) {
        res = await fetch(`${API_BASE}/bill/analyze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sample: true }),
        });
      } else {
        const formData = new FormData();
        formData.append('file', file);
        if (clientKey) {
          formData.append('api_key', clientKey);
        }
        if (selectedModel) {
          formData.append('model', selectedModel);
        }

        const headers = {};
        if (clientKey) {
          headers['X-OpenRouter-Key'] = clientKey;
        }

        res = await fetch(`${API_BASE}/bill/analyze`, {
          method: 'POST',
          headers,
          body: formData,
        });
      }

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to analyze bill.');
      }

      setAnalysisResult(data);
      // Initialize chat with greeting referencing bill
      setChatMessages([
        {
          role: 'assistant',
          text: `I've audited your bill for ${data.utility_provider || 'your utility provider'}. Total consumption is ${data.total_units_kwh || '—'} kWh for ${data.currency || '$'}${data.total_amount || '—'}. Feel free to ask me anything about your rate slabs, high-usage periods, or how to reduce this bill!`,
        },
      ]);
    } catch (err) {
      setError(err.message || 'Analysis failed. Please check backend connection.');
    } finally {
      clearTimeout(stepTimer1);
      clearTimeout(stepTimer2);
      setAnalyzing(false);
    }
  };

  // Ask Follow-up Question
  const handleSendChat = async (e) => {
    e.preventDefault();
    const query = chatInput.trim();
    if (!query || chatLoading || !analysisResult) return;

    setChatMessages((prev) => [...prev, { role: 'user', text: query }]);
    setChatInput('');
    setChatLoading(true);

    try {
      const activeKey = clientKey || '';
      const res = await fetch(`${API_BASE}/bill/ask`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(activeKey ? { 'X-OpenRouter-Key': activeKey } : {}),
        },
        body: JSON.stringify({
          question: query,
          bill_context: analysisResult,
          api_key: activeKey,
          model: selectedModel,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Could not get an answer.');
      }

      setChatMessages((prev) => [
        ...prev,
        { role: 'assistant', text: data.answer },
      ]);
    } catch (err) {
      setChatMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: `Sorry, I couldn't process your question: ${err.message}. Make sure your OpenRouter API key is configured.`,
        },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  const getEfficiencyBadge = (score, rating) => {
    if (score >= 80) {
      return { class: 'efficient', label: rating || 'Highly Efficient', color: '#0E9F8E' };
    }
    if (score >= 60) {
      return { class: 'moderate', label: rating || 'Moderate Consumption', color: '#F5A524' };
    }
    return { class: 'heavy', label: rating || 'High Consumption', color: '#B42A4A' };
  };

  return (
    <div className="bill-analyzer-container">
      {/* Top Header Card */}
      <div className="bill-hero-card">
        <div className="bill-hero-content">
          <div className="hero-pill">
            <Sparkles size={15} />
            <span>AI Electricity Bill Intelligence</span>
          </div>
          <h2>Upload & Analyze Your Electricity Bill</h2>
          <p>
            Extract meter readings, audit tariff slabs, uncover hidden surcharges, and receive personalized
            energy-saving recommendations tailored to your exact bill.
          </p>
        </div>

        <div className="bill-hero-actions">
          <button
            type="button"
            className={`key-badge-btn ${hasServerKey || clientKey ? 'configured' : 'unconfigured'}`}
            onClick={() => setIsKeyModalOpen(true)}
          >
            <Key size={15} />
            <span>
              {hasServerKey || clientKey ? 'OpenRouter API Ready' : 'Configure OpenRouter Key'}
            </span>
          </button>

          <button
            type="button"
            className="sample-bill-btn"
            onClick={() => runAnalysis(true)}
            disabled={analyzing}
          >
            <Zap size={16} />
            <span>Try Sample Bill Analysis</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="bill-alert-box error">
          <AlertTriangle size={18} />
          <div>
            <strong>Notice:</strong> {error}
          </div>
          <button className="alert-close" onClick={() => setError('')}>
            <X size={15} />
          </button>
        </div>
      )}

      {/* Main Upload / Input Panel if no result or if user wants to upload again */}
      {!analysisResult && (
        <div className="panel upload-panel">
          <div
            className={`dropzone ${isDragging ? 'dragging' : ''} ${file ? 'has-file' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => !file && fileInputRef.current?.click()}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={(e) => handleFileSelect(e.target.files?.[0])}
              accept=".pdf,.png,.jpg,.jpeg,.webp,image/*,application/pdf"
              style={{ display: 'none' }}
            />

            {!file ? (
              <div className="dropzone-empty">
                <div className="dropzone-icon">
                  <UploadCloud size={38} />
                </div>
                <h3>Drag & drop your electricity bill here</h3>
                <p>Supports PDF bills, JPG, PNG, or mobile camera snapshots (up to 15MB)</p>
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="browse-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      fileInputRef.current?.click();
                    }}
                  >
                    Browse Files
                  </button>
                  <a
                    href="/sample_electricity_bill.pdf"
                    download="sample_electricity_bill.pdf"
                    className="browse-btn"
                    style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <FileText size={15} color="#0E9F8E" />
                    <span>Download Sample PDF</span>
                  </a>
                </div>
              </div>
            ) : (
              <div className="file-preview-card" onClick={(e) => e.stopPropagation()}>
                <div className="file-thumb">
                  {filePreview ? (
                    <img src={filePreview} alt="Bill Preview" />
                  ) : (
                    <FileText size={42} color="#0E9F8E" />
                  )}
                </div>

                <div className="file-details">
                  <div className="file-name">{file.name}</div>
                  <div className="file-meta">
                    <span>{(file.size / 1024).toFixed(1)} KB</span>
                    <span className="dot">•</span>
                    <span>{file.type || 'Document'}</span>
                  </div>
                </div>

                <button
                  type="button"
                  className="remove-file-btn"
                  onClick={clearFile}
                  title="Remove file"
                >
                  <X size={18} />
                </button>
              </div>
            )}
          </div>

          {/* Model selection & action */}
          <div className="upload-options-bar">
            <div className="model-select-group">
              <label htmlFor="modelSelect">AI Model:</label>
              <select
                id="modelSelect"
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
              >
                {availableModels.length > 0 ? (
                  availableModels.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))
                ) : (
                  <>
                    <option value="google/gemini-2.0-flash-001">
                      Gemini 2.0 Flash (Recommended & Fast)
                    </option>
                    <option value="openai/gpt-4o-mini">GPT-4o Mini</option>
                    <option value="meta-llama/llama-3.2-11b-vision-instruct">
                      Llama 3.2 11B Vision
                    </option>
                  </>
                )}
              </select>
            </div>

            <div className="action-buttons">
              <button
                type="button"
                className="btn-analyze"
                disabled={!file || analyzing}
                onClick={() => runAnalysis(false)}
              >
                {analyzing ? (
                  <>
                    <RefreshCw size={18} className="spin-icon" />
                    <span>Analyzing Bill...</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={18} />
                    <span>Audit Bill with AI</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Analyzing Progress overlay */}
          {analyzing && (
            <div className="analyzing-progress">
              <div className="progress-spinner">
                <RefreshCw size={36} className="spin-icon" color="#0E9F8E" />
              </div>
              <div className="progress-steps">
                <div className={`step-item ${analysisStep >= 1 ? 'active' : ''}`}>
                  <span className="step-num">1</span>
                  <span>Extracting bill data, account details & meter readings...</span>
                </div>
                <div className={`step-item ${analysisStep >= 2 ? 'active' : ''}`}>
                  <span className="step-num">2</span>
                  <span>Auditing rate slabs, fixed charges, fuel surcharges & taxes...</span>
                </div>
                <div className={`step-item ${analysisStep >= 3 ? 'active' : ''}`}>
                  <span className="step-num">3</span>
                  <span>Computing efficiency score & personalized savings recommendations...</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Analysis Results View */}
      {analysisResult && (
        <div className="analysis-results">
          {/* Header Action Row */}
          <div className="results-topbar">
            <div className="utility-badge">
              <Building2 size={20} color="#0E9F8E" />
              <div>
                <h3>{analysisResult.utility_provider || 'Utility Provider'}</h3>
                <span>
                  {analysisResult.tariff_category || 'Residential Tariff'} • Sanctioned Load:{' '}
                  {analysisResult.sanctioned_load || 'N/A'}
                </span>
              </div>
            </div>

            <div className="results-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setAnalysisResult(null);
                  clearFile();
                }}
              >
                <RefreshCw size={15} />
                <span>Audit Another Bill</span>
              </button>
            </div>
          </div>

          {/* Stat Cards Grid */}
          <div className="bill-stats-grid">
            <div className="bill-stat-card bill-amount">
              <div className="stat-head">
                <span className="stat-label">Total Amount Due</span>
                <span className="stat-icon-wrap amber">
                  <DollarSign size={18} />
                </span>
              </div>
              <div className="stat-main">
                {analysisResult.currency || '$'}
                {Number(analysisResult.total_amount || 0).toFixed(2)}
              </div>
              <div className="stat-sub">
                <Calendar size={13} />
                <span>Due Date: {analysisResult.due_date || 'Prompt Payment'}</span>
              </div>
            </div>

            <div className="bill-stat-card bill-units">
              <div className="stat-head">
                <span className="stat-label">Total Consumption</span>
                <span className="stat-icon-wrap teal">
                  <Zap size={18} />
                </span>
              </div>
              <div className="stat-main">
                {Number(analysisResult.total_units_kwh || 0).toLocaleString()}
                <span className="unit"> kWh</span>
              </div>
              <div className="stat-sub">
                <Activity size={13} />
                <span>Period: {analysisResult.billing_period || 'Monthly'}</span>
              </div>
            </div>

            <div className="bill-stat-card bill-daily">
              <div className="stat-head">
                <span className="stat-label">Daily Average</span>
                <span className="stat-icon-wrap blue">
                  <Activity size={18} />
                </span>
              </div>
              <div className="stat-main">
                {Number(analysisResult.average_daily_units || 0).toFixed(2)}
                <span className="unit"> kWh/day</span>
              </div>
              <div className="stat-sub">
                <span>{analysisResult.billing_days || 30} billing days</span>
              </div>
            </div>

            <div className="bill-stat-card bill-rate">
              <div className="stat-head">
                <span className="stat-label">Effective Unit Rate</span>
                <span className="stat-icon-wrap purple">
                  <TrendingDown size={18} />
                </span>
              </div>
              <div className="stat-main">
                {analysisResult.currency || '$'}
                {Number(analysisResult.effective_cost_per_kwh || 0).toFixed(3)}
                <span className="unit"> /kWh</span>
              </div>
              <div className="stat-sub">
                <span>Includes all fixed & tax surcharges</span>
              </div>
            </div>

            <div className="bill-stat-card bill-efficiency">
              <div className="stat-head">
                <span className="stat-label">Efficiency Score</span>
                <span className="stat-icon-wrap green">
                  <Leaf size={18} />
                </span>
              </div>
              <div className="stat-main">
                {analysisResult.efficiency_score || 75}
                <span className="unit">/100</span>
              </div>
              <div className="stat-sub">
                <span
                  className={`efficiency-tag ${
                    getEfficiencyBadge(
                      analysisResult.efficiency_score || 75,
                      analysisResult.efficiency_rating
                    ).class
                  }`}
                >
                  {analysisResult.efficiency_rating || 'Moderate'}
                </span>
              </div>
            </div>
          </div>

          {/* Metadata Bar */}
          <div className="bill-meta-strip">
            <div className="meta-item">
              <Hash size={14} />
              <span>
                Account No: <strong>{analysisResult.account_number || 'N/A'}</strong>
              </span>
            </div>
            <div className="meta-item">
              <Building2 size={14} />
              <span>
                Consumer: <strong>{analysisResult.consumer_name || 'Household User'}</strong>
              </span>
            </div>
            {analysisResult.meter_number && (
              <div className="meta-item">
                <Zap size={14} />
                <span>
                  Meter: <strong>{analysisResult.meter_number}</strong>
                </span>
              </div>
            )}
            {analysisResult.estimated_carbon_kg > 0 && (
              <div className="meta-item">
                <Leaf size={14} />
                <span>
                  Est. Carbon: <strong>{analysisResult.estimated_carbon_kg} kg CO₂</strong>
                </span>
              </div>
            )}
          </div>

          {/* Summary notes banner */}
          {analysisResult.summary_notes && (
            <div className="summary-notes-card">
              <div className="summary-icon">
                <Sparkles size={20} />
              </div>
              <div>
                <h4>Executive Auditor Summary</h4>
                <p>{analysisResult.summary_notes}</p>
              </div>
            </div>
          )}

          {/* Anomalies and Alerts */}
          {analysisResult.anomalies_or_alerts?.length > 0 && (
            <div className="panel alerts-panel">
              <div className="panel-heading">
                <div className="alert-title">
                  <AlertTriangle size={20} color="#B42A4A" />
                  <h4>Billing Alerts & Potential Anomalies</h4>
                </div>
                <span className="tag-warning">{analysisResult.anomalies_or_alerts.length} Flagged</span>
              </div>
              <div className="alerts-list">
                {analysisResult.anomalies_or_alerts.map((item, idx) => (
                  <div key={idx} className="alert-item">
                    <span className="alert-dot" />
                    <p>{item}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Two-column layout: Cost Breakdown + Slab Breakdown */}
          <div className="breakdown-grid">
            {/* Cost Breakdown */}
            <div className="panel breakdown-panel">
              <div className="panel-heading">
                <div>
                  <h4>Cost & Charge Breakdown</h4>
                  <p>Detailed component analysis of your total bill amount</p>
                </div>
                <DollarSign size={20} color="#0E9F8E" />
              </div>

              {analysisResult.cost_breakdown && (
                <div className="cost-bars">
                  {Object.entries(analysisResult.cost_breakdown).map(([key, val]) => {
                    const numVal = Number(val) || 0;
                    const total = Number(analysisResult.total_amount) || 1;
                    const pct = Math.min(100, Math.max(0, (numVal / total) * 100));
                    const cleanLabel = key
                      .replace(/_/g, ' ')
                      .replace(/\b\w/g, (c) => c.toUpperCase());

                    return (
                      <div key={key} className="cost-bar-item">
                        <div className="cost-bar-labels">
                          <span className="cost-name">{cleanLabel}</span>
                          <span className="cost-amt">
                            {analysisResult.currency || '$'}
                            {numVal.toFixed(2)}{' '}
                            <small className="pct">({pct.toFixed(1)}%)</small>
                          </span>
                        </div>
                        <div className="cost-bar-track">
                          <div
                            className={`cost-bar-fill ${key}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Tariff Slab Analysis */}
            <div className="panel slabs-panel">
              <div className="panel-heading">
                <div>
                  <h4>Tariff Slab & Tier Structure</h4>
                  <p>How your energy was categorized across progressive pricing tiers</p>
                </div>
                <Layers size={20} color="#6C5CE7" />
              </div>

              {analysisResult.slab_breakdown?.length > 0 ? (
                <div className="slabs-table-wrap">
                  <table className="slabs-table">
                    <thead>
                      <tr>
                        <th>Tier / Slab</th>
                        <th>Units (kWh)</th>
                        <th>Rate/kWh</th>
                        <th>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analysisResult.slab_breakdown.map((slab, i) => (
                        <tr key={i}>
                          <td className="slab-title">{slab.slab}</td>
                          <td>{Number(slab.units).toFixed(1)}</td>
                          <td>
                            {analysisResult.currency || '$'}
                            {Number(slab.rate).toFixed(3)}
                          </td>
                          <td className="slab-amount">
                            {analysisResult.currency || '$'}
                            {Number(slab.amount).toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="slab-empty">
                  <p>Single flat-rate tariff or slab breakdown not broken into distinct line items.</p>
                </div>
              )}
            </div>
          </div>

          {/* Key Observations */}
          {analysisResult.key_observations?.length > 0 && (
            <div className="panel observations-panel">
              <div className="panel-heading">
                <div>
                  <h4>Auditor Observations</h4>
                  <p>Patterns detected from your consumption history and utility billing metrics</p>
                </div>
                <ShieldCheck size={20} color="#0E9F8E" />
              </div>

              <div className="observations-grid">
                {analysisResult.key_observations.map((obs, idx) => (
                  <div key={idx} className="observation-card">
                    <span className="obs-num">{idx + 1}</span>
                    <p>{obs}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actionable Savings Recommendations */}
          <div className="panel recommendations-panel">
            <div className="panel-heading">
              <div>
                <h4>Personalized Savings Recommendations</h4>
                <p>
                  Calculated opportunities to reduce consumption and avoid higher tariff tiers
                </p>
              </div>
              {analysisResult.potential_total_savings_pct && (
                <div className="savings-highlight">
                  <TrendingDown size={18} />
                  <span>Up to {analysisResult.potential_total_savings_pct}% Bill Reduction</span>
                </div>
              )}
            </div>

            <div className="recommendations-grid">
              {analysisResult.savings_recommendations?.map((rec, i) => (
                <div key={i} className="rec-card">
                  <div className="rec-top">
                    <span className={`impact-badge ${rec.impact?.toLowerCase()}`}>
                      {rec.impact || 'Medium'} Impact
                    </span>
                    <span className="rec-savings">{rec.estimated_monthly_savings}</span>
                  </div>
                  <h5>{rec.title}</h5>
                  <p>{rec.description}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Solar & Clean Energy Feasibility */}
          {analysisResult.solar_potential && (
            <div className="panel solar-panel">
              <div className="solar-banner">
                <div className="solar-icon">
                  <Sun size={28} />
                </div>
                <div>
                  <h4>Rooftop Solar & Net-Metering Feasibility</h4>
                  <p>Estimated clean energy potential based on your monthly {analysisResult.total_units_kwh} kWh requirement</p>
                </div>
              </div>

              <div className="solar-stats-grid">
                <div className="solar-stat">
                  <span className="label">Recommended PV Capacity</span>
                  <strong>{analysisResult.solar_potential.recommended_capacity_kw}</strong>
                </div>
                <div className="solar-stat">
                  <span className="label">Est. Annual Generation</span>
                  <strong>{analysisResult.solar_potential.estimated_annual_generation_kwh}</strong>
                </div>
                <div className="solar-stat">
                  <span className="label">Estimated Annual Offset</span>
                  <strong className="green-text">
                    {analysisResult.solar_potential.estimated_annual_savings}
                  </strong>
                </div>
              </div>
            </div>
          )}

          {/* Interactive Bill Q&A Assistant */}
          <div className="panel bill-chat-panel">
            <div className="panel-heading">
              <div className="assistant-title">
                <div className="assistant-icon">
                  <HelpCircle size={20} />
                </div>
                <div>
                  <h4>Ask Questions About This Bill</h4>
                  <p>Inquire about rate hikes, appliances, or specific tariff rules with OpenRouter AI</p>
                </div>
              </div>
            </div>

            <div className="bill-chat-messages">
              {chatMessages.map((msg, i) => (
                <div key={i} className={`chat-bubble ${msg.role}`}>
                  <p>{msg.text}</p>
                </div>
              ))}
              {chatLoading && (
                <div className="chat-bubble assistant loading">
                  <RefreshCw size={15} className="spin-icon" />
                  <span>Thinking & analyzing your bill...</span>
                </div>
              )}
            </div>

            {/* Quick suggested questions */}
            <div className="chat-quick-queries">
              <button
                type="button"
                onClick={() => setChatInput('How can I reduce my electricity bill by 20%?')}
              >
                How can I cut 20% off this bill?
              </button>
              <button
                type="button"
                onClick={() => setChatInput('Which appliances are likely responsible for most of this usage?')}
              >
                Likely high-consumption appliances?
              </button>
              <button
                type="button"
                onClick={() => setChatInput('Explain how the tariff tiers work on this bill.')}
              >
                Explain my tariff tiers
              </button>
            </div>

            <form onSubmit={handleSendChat} className="bill-chat-form">
              <input
                type="text"
                placeholder="Ask anything about your bill (e.g. 'Why did my rate change?')"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                disabled={chatLoading}
              />
              <button
                type="submit"
                disabled={chatLoading || !chatInput.trim()}
                aria-label="Send query"
              >
                <Send size={16} />
              </button>
            </form>
          </div>
        </div>
      )}

      {/* API Key Modal */}
      <ApiKeyModal
        isOpen={isKeyModalOpen}
        onClose={() => setIsKeyModalOpen(false)}
        hasServerKey={hasServerKey}
        clientKey={clientKey}
        onSaveClientKey={handleSaveClientKey}
        onSaveServerKey={handleSaveServerKey}
      />
    </div>
  );
}
