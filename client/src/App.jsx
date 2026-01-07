import { useState } from 'react';
import './App.css'; 

function App() {
  const [content, setContent] = useState('');
  const [ttl, setTtl] = useState('');
  const [maxViews, setMaxViews] = useState('');
  const [resultUrl, setResultUrl] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  // --- CONFIGURATION ---
  // In Vercel, this will grab the real Backend URL.
  // Locally, if undefined, it falls back to "" which uses the vite proxy.
  const API_BASE = import.meta.env.VITE_API_URL || '';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setResultUrl(null);
    setLoading(true);

    try {
      // Use the API_BASE variable to ensure we hit the correct server
      const res = await fetch(`${API_BASE}/api/pastes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content,
          ttl_seconds: ttl ? parseInt(ttl) : undefined,
          max_views: maxViews ? parseInt(maxViews) : undefined
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create');
      setResultUrl(data.url);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container">
      <div className="header">
        <h1>Pastebin Lite</h1>
        <p className="subtitle">Share text securely with auto-expiration</p>
      </div>

      <div className="card">
        {resultUrl ? (
          <div className="result-box">
            <span className="success-icon">🚀</span>
            <h3>Paste Created Successfully!</h3>
            <p style={{ color: '#94a3b8', marginTop: '0.5rem' }}>Here is your unique link:</p>

            <a href={resultUrl} target="_blank" rel="noreferrer" className="result-link">
              {resultUrl}
            </a>

            <button className="reset-btn" onClick={() => {
              setResultUrl(null);
              setContent('');
              setTtl('');
              setMaxViews('');
            }}>
              Create Another
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Content</label>
              <textarea
                className="code-input"
                value={content}
                onChange={e => setContent(e.target.value)}
                placeholder="// Paste your code or text here..."
                rows={10}
                required
              />
            </div>

            <div className="controls-row">
              <div className="control-item">
                <div className="form-group">
                  <label>TTL (Seconds)</label>
                  <input
                    className="input-field"
                    type="number"
                    placeholder="e.g. 3600"
                    value={ttl}
                    onChange={e => setTtl(e.target.value)}
                  />
                </div>
              </div>
              <div className="control-item">
                <div className="form-group">
                  <label>Max Views</label>
                  <input
                    className="input-field"
                    type="number"
                    placeholder="e.g. 5"
                    value={maxViews}
                    onChange={e => setMaxViews(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <button type="submit" className="submit-btn" disabled={loading}>
              {loading ? 'Creating...' : 'Create Paste'}
            </button>

            {error && <div className="error-msg">⚠️ {error}</div>}
          </form>
        )}
      </div>
    </div>
  );
}

export default App;
