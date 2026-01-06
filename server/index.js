require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const Paste = require('./models/Paste');

const app = express();

// Middleware
app.use(express.json());
app.use(cors()); // Allow frontend to talk to backend

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('MongoDB Connected'))
    .catch(err => console.log(err));

// --- HELPER: Handle "Test Mode" Time Travel ---
// This is required for the automated tests to function correctly
const getCurrentTime = (req) => {
    if (process.env.TEST_MODE === '1' && req.headers['x-test-now-ms']) {
        return new Date(parseInt(req.headers['x-test-now-ms']));
    }
    return new Date();
};

// --- ROUTES ---

// 1. Health Check
app.get('/api/healthz', (req, res) => {
    const isDbConnected = mongoose.connection.readyState === 1;
    if (isDbConnected) {
        res.json({ ok: true });
    } else {
        res.status(500).json({ ok: false });
    }
});

// 2. Create Paste
app.post('/api/pastes', async (req, res) => {
    try {
        const { content, ttl_seconds, max_views } = req.body;
        if (!content) return res.status(400).json({ error: "Content is required" });

        // Calculate Expiry
        let expiresAt = null;
        if (ttl_seconds && ttl_seconds > 0) {
            const now = getCurrentTime(req);
            expiresAt = new Date(now.getTime() + (ttl_seconds * 1000));
        }

        const paste = await Paste.create({
            content,
            maxViews: max_views ? parseInt(max_views) : null,
            expiresAt
        });

        // Detect environment (Vercel vs Local) to build the URL
        const protocol = req.headers['x-forwarded-proto'] || 'http';
        const host = req.headers.host;

        res.json({
            id: paste._id,
            url: `${protocol}://${host}/p/${paste._id}`
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server Error" });
    }
});

// 3. Get Paste (JSON API)
app.get('/api/pastes/:id', async (req, res) => {
    try {
        const now = getCurrentTime(req);

        // 1. Find and validate constraints BEFORE incrementing
        const paste = await Paste.findOne({ _id: req.params.id });

        if (!paste) return res.status(404).json({ error: "Not found" });

        // Check Time Expiry
        if (paste.expiresAt && paste.expiresAt < now) {
            return res.status(404).json({ error: "Paste expired" });
        }

        // Check View Limit (Before Increment)
        if (paste.maxViews !== null && paste.currentViews >= paste.maxViews) {
            return res.status(404).json({ error: "View limit reached" });
        }

        // 2. Atomic Increment
        const updatedPaste = await Paste.findOneAndUpdate(
            {
                _id: req.params.id,
                $or: [
                    { maxViews: null },
                    { $expr: { $lt: ["$currentViews", "$maxViews"] } }
                ]
            },
            { $inc: { currentViews: 1 } },
            { new: true }
        );

        if (!updatedPaste) {
            return res.status(404).json({ error: "View limit reached" });
        }

        // Return Data
        res.json({
            content: updatedPaste.content,
            remaining_views: updatedPaste.maxViews ? updatedPaste.maxViews - updatedPaste.currentViews : null,
            expires_at: updatedPaste.expiresAt
        });

    } catch (err) {
        res.status(404).json({ error: "Not found or invalid ID" });
    }
});

// 4. View Paste (HTML Return - PROFESSIONAL THEME)
app.get('/p/:id', async (req, res) => {
    try {
        const now = getCurrentTime(req);
        const paste = await Paste.findOne({ _id: req.params.id });

        // Validate Constraints
        if (!paste ||
            (paste.expiresAt && paste.expiresAt < now) ||
            (paste.maxViews !== null && paste.currentViews >= paste.maxViews)) {

            // Professional 404 Page
            return res.status(404).send(`
         <body style="background:#0a0a0a; color:#ededed; font-family:-apple-system, sans-serif; display:flex; align-items:center; justify-content:center; height:100vh; margin:0;">
           <div style="text-align:center;">
             <h1 style="font-size:3rem; margin-bottom:1rem; color:#333;">404</h1>
             <p style="color:#666;">This paste is either expired or does not exist.</p>
           </div>
         </body>
       `);
        }

        // Increment View Count
        await Paste.updateOne({ _id: req.params.id }, { $inc: { currentViews: 1 } });

        // Sanitize Content (Prevent XSS)
        const safeContent = paste.content
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");

        // Serve Professional HTML
        res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>View Paste</title>
          <style>
            body {
              background-color: #0a0a0a;
              color: #ededed;
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
              display: flex;
              justify-content: center;
              padding: 4rem 1rem;
              margin: 0;
            }
            .container {
              width: 100%;
              max-width: 800px;
            }
            .meta {
              display: flex;
              justify-content: space-between;
              align-items: center;
              margin-bottom: 1rem;
              padding-bottom: 1rem;
              border-bottom: 1px solid #262626;
            }
            .brand {
              font-weight: 600;
              color: #a1a1aa;
              font-size: 0.9rem;
            }
            .id-badge {
              background: #262626;
              padding: 4px 8px;
              border-radius: 4px;
              font-size: 0.8rem;
              font-family: monospace;
              color: #a1a1aa;
            }
            pre {
              background-color: #171717;
              border: 1px solid #262626;
              border-radius: 8px;
              padding: 1.5rem;
              white-space: pre-wrap;
              word-wrap: break-word;
              font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
              font-size: 0.95rem;
              line-height: 1.6;
              color: #e5e5e5;
              overflow-x: auto;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="meta">
              <span class="brand">Pastebin Lite</span>
              <span class="id-badge">${paste._id}</span>
            </div>
            <pre>${safeContent}</pre>
          </div>
        </body>
      </html>
    `);
    } catch (err) {
        res.status(404).send("Error");
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

module.exports = app;