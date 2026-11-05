import { useState } from 'react';
import { Key, X, CheckCircle, ExternalLink, ShieldAlert, Sparkles } from 'lucide-react';

export default function ApiKeyModal({
  isOpen,
  onClose,
  hasServerKey,
  clientKey,
  onSaveClientKey,
  onSaveServerKey,
}) {
  const [keyInput, setKeyInput] = useState(clientKey || '');
  const [saveToServer, setSaveToServer] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);

  if (!isOpen) return null;

  const handleSave = async (e) => {
    e.preventDefault();
    const trimmed = keyInput.trim();
    if (!trimmed) {
      setStatusMessage({ type: 'error', text: 'Please enter a valid OpenRouter API key.' });
      return;
    }

    setSaving(true);
    setStatusMessage(null);

    try {
      if (saveToServer) {
        await onSaveServerKey(trimmed);
      }
      onSaveClientKey(trimmed);
      setStatusMessage({
        type: 'success',
        text: saveToServer
          ? 'API key saved to backend and browser!'
          : 'API key saved to browser session!',
      });
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: err.message || 'Failed to save API key.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleClear = () => {
    setKeyInput('');
    onSaveClientKey('');
    setStatusMessage({ type: 'info', text: 'Client API key cleared.' });
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-icon">
            <Key size={20} />
          </div>
          <div>
            <h3>OpenRouter API Configuration</h3>
            <p>Connect your OpenRouter key for deep AI bill intelligence</p>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close modal">
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          <div className="api-info-box">
            <Sparkles size={18} className="sparkle-icon" />
            <div>
              <strong>Why OpenRouter?</strong>
              <p>
                OpenRouter provides access to fast multimodal vision models like{' '}
                <code>google/gemini-2.0-flash-001</code> and <code>openai/gpt-4o-mini</code> to
                audit bills, extract tariff tiers, and pinpoint savings.
              </p>
            </div>
          </div>

          {hasServerKey && (
            <div className="server-key-badge">
              <CheckCircle size={16} color="#0E9F8E" />
              <span>A valid OpenRouter API key is already configured on your backend server.</span>
            </div>
          )}

          <form onSubmit={handleSave}>
            <label className="input-label" htmlFor="apiKeyInput">
              OpenRouter API Key
            </label>
            <div className="input-wrap">
              <input
                id="apiKeyInput"
                type="password"
                placeholder="sk-or-v1-..."
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                autoComplete="off"
                spellCheck="false"
              />
              {keyInput && (
                <button
                  type="button"
                  className="clear-btn"
                  onClick={handleClear}
                  title="Clear key"
                >
                  Clear
                </button>
              )}
            </div>

            <div className="options-row">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={saveToServer}
                  onChange={(e) => setSaveToServer(e.target.checked)}
                />
                <span>Persist to backend <code>.env</code> file</span>
              </label>

              <a
                href="https://openrouter.ai/keys"
                target="_blank"
                rel="noreferrer"
                className="get-key-link"
              >
                Get API key from OpenRouter
                <ExternalLink size={13} />
              </a>
            </div>

            {statusMessage && (
              <div className={`status-banner ${statusMessage.type}`}>
                {statusMessage.type === 'error' ? (
                  <ShieldAlert size={16} />
                ) : (
                  <CheckCircle size={16} />
                )}
                <span>{statusMessage.text}</span>
              </div>
            )}

            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={onClose}>
                Cancel
              </button>
              <button
                type="submit"
                className="btn-primary"
                disabled={saving || !keyInput.trim()}
              >
                {saving ? 'Saving...' : 'Save API Key'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

