require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const Paste = require('./models/Paste');

const app = express();

// Middleware
app.use(express.json());
app.use(cors());

// --- DATABASE CONNECTION (Crash Proof) ---
const connectDB = async () => {
    try {
        const connStr = process.env.MONGO_URI;

        // DEBUG: Log if the variable exists (Don't log the actual password)
        console.log("--- DEBUG START ---");
        console.log("MONGO_URI Type:", typeof connStr);
        console.log("MONGO_URI Length:", connStr ? connStr.length : "0 (MISSING)");
        console.log("TEST_MODE:", process.env.TEST_MODE);
        console.log("--- DEBUG END ---");

        if (!connStr) {
            throw new Error("MONGO_URI is missing in Environment Variables!");
        }

        await mongoose.connect(connStr);
        console.log('MongoDB Connected Successfully');

    } catch (err) {
        console.error("❌ MONGODB CONNECTION ERROR:");
        console.error(err.message);
        // We do NOT exit process here, so the health check can still report the error
    }
};

// Connect immediately
connectDB();

// --- HELPER: Handle "Test Mode" Time Travel ---
const getCurrentTime = (req) => {
    if (process.env.TEST_MODE === '1' && req.headers['x-test-now-ms']) {
        return new Date(parseInt(req.headers['x-test-now-ms']));
    }
    return new Date();
};

// --- ROUTES ---

// 1. Health Check (Now gives details instead of crashing)
app.get('/api/healthz', (req, res) => {
    const state = mongoose.connection.readyState;
    const statusNames = ["Disconnected", "Connected", "Connecting", "Disconnecting"];

    if (state === 1) {
        res.json({ ok: true });
    } else {
        // Return 500 but with JSON details so we know WHY
        res.status(500).json({
            ok: false,
            status: statusNames[state],
            error: "Database not connected. Check Vercel Logs."
        });
    }
});

// 2. Create Paste
app.post('/api/pastes', async (req, res) => {
    if (mongoose.connection.readyState !== 1) {
        return res.status(500).json({ error: "Database Disconnected" });
    }
    try {
        const { content, ttl_seconds, max_views } = req.body;
        if (!content) return res.status(400).json({ error: "Content is required" });

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
    if (mongoose.connection.readyState !== 1) return res.status(500).json({ error: "DB Error" });

    try {
        const now = getCurrentTime(req);
        const paste = await Paste.findOne({ _id: req.params.id });

        if (!paste) return res.status(404).json({ error: "Not found" });
        if (paste.expiresAt && paste.expiresAt < now) return res.status(404).json({ error: "Expired" });
        if (paste.maxViews !== null && paste.currentViews >= paste.maxViews) return res.status(404).json({ error: "Limit reached" });

        const updatedPaste = await Paste.findOneAndUpdate(
            {
                _id: req.params.id,
                $or: [{ maxViews: null }, { $expr: { $lt: ["$currentViews", "$maxViews"] } }]
            },
            { $inc: { currentViews: 1 } },
            { new: true }
        );

        if (!updatedPaste) return res.status(404).json({ error: "Limit reached" });

        res.json({
            content: updatedPaste.content,
            remaining_views: updatedPaste.maxViews ? updatedPaste.maxViews - updatedPaste.currentViews : null,
            expires_at: updatedPaste.expiresAt
        });
    } catch (err) {
        res.status(404).json({ error: "Not found" });
    }
});

// 4. View Paste (HTML)
app.get('/p/:id', async (req, res) => {
    if (mongoose.connection.readyState !== 1) return res.status(500).send("Database Disconnected");

    try {
        const now = getCurrentTime(req);
        const paste = await Paste.findOne({ _id: req.params.id });

        if (!paste ||
            (paste.expiresAt && paste.expiresAt < now) ||
            (paste.maxViews !== null && paste.currentViews >= paste.maxViews)) {
            return res.status(404).send("<h1>404 - Not Found or Expired</h1>");
        }

        await Paste.updateOne({ _id: req.params.id }, { $inc: { currentViews: 1 } });

        const safeContent = paste.content.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

        res.send(`
      <!DOCTYPE html><html><head><title>Paste</title></head>
      <body style="background:#0a0a0a;color:#ededed;padding:2rem;font-family:sans-serif;">
        <div style="max-width:800px;margin:0 auto;">
          <pre style="background:#171717;padding:1.5rem;border-radius:8px;overflow:auto;">${safeContent}</pre>
        </div>
      </body></html>
    `);
    } catch (err) {
        res.status(404).send("Error");
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

module.exports = app;