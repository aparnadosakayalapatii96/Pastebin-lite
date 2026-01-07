require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectToDatabase = require('./lib/db'); // Requires the file above
const Paste = require('./models/Paste');

const app = express();

// --- MIDDLEWARE ---
app.use(express.json());

// Production CORS
// Update this with your actual frontend URL later for better security
app.use(cors({
    origin: process.env.CLIENT_URL || '*',
    methods: ['GET', 'POST'],
    credentials: true
}));

// --- DB CONNECTION MIDDLEWARE ---
app.use(async (req, res, next) => {
    try {
        await connectToDatabase();
        next();
    } catch (error) {
        console.error("Database connection failed:", error);
        res.status(500).json({ error: "Service Unavailable: Database Error" });
    }
});

// --- HELPER: Handle "Test Mode" Time Travel ---
const getCurrentTime = (req) => {
    if (process.env.TEST_MODE === '1' && req.headers['x-test-now-ms']) {
        return new Date(parseInt(req.headers['x-test-now-ms']));
    }
    return new Date();
};

// --- ROUTES ---

// 1. Health Check
app.get('/api/healthz', (req, res) => {
    res.json({
        ok: true,
        message: "Database is connected and Server is running"
    });
});

// 2. Create Paste
app.post('/api/pastes', async (req, res) => {
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
        console.error("Create Error:", err);
        res.status(500).json({ error: "Server Error creating paste" });
    }
});

// 3. Get Paste (JSON API)
app.get('/api/pastes/:id', async (req, res) => {
    try {
        const now = getCurrentTime(req);

        // FIX: Wrapped conditions in $and to prevent key overwriting
        const updatedPaste = await Paste.findOneAndUpdate(
            {
                _id: req.params.id,
                $and: [
                    {
                        $or: [
                            { expiresAt: { $eq: null } },
                            { expiresAt: { $gt: now } }
                        ]
                    },
                    {
                        $or: [
                            { maxViews: { $eq: null } },
                            { $expr: { $lt: ["$currentViews", "$maxViews"] } }
                        ]
                    }
                ]
            },
            { $inc: { currentViews: 1 } },
            { new: true }
        );

        if (!updatedPaste) return res.status(404).json({ error: "Not found, expired, or limit reached" });

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
    try {
        const now = getCurrentTime(req);

        // FIX: Use findOneAndUpdate here too for Atomic Safety (prevent race conditions)
        const paste = await Paste.findOneAndUpdate(
            {
                _id: req.params.id,
                $and: [
                    {
                        $or: [
                            { expiresAt: { $eq: null } },
                            { expiresAt: { $gt: now } }
                        ]
                    },
                    {
                        $or: [
                            { maxViews: { $eq: null } },
                            { $expr: { $lt: ["$currentViews", "$maxViews"] } }
                        ]
                    }
                ]
            },
            { $inc: { currentViews: 1 } },
            { new: true }
        );

        if (!paste) {
            return res.status(404).send("<h1>404 - Not Found or Expired</h1>");
        }

        const safeContent = paste.content
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");

        res.send(`
      <!DOCTYPE html><html><head><title>Paste</title></head>
      <body style="background:#0a0a0a;color:#ededed;padding:2rem;font-family:sans-serif;">
        <div style="max-width:800px;margin:0 auto;">
          <pre style="background:#171717;padding:1.5rem;border-radius:8px;overflow:auto;white-space:pre-wrap;">${safeContent}</pre>
        </div>
      </body></html>
    `);
    } catch (err) {
        res.status(404).send("Error");
    }
});

// --- SERVER STARTUP ---
if (require.main === module) {
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

module.exports = app;