const mongoose = require('mongoose');

const pasteSchema = new mongoose.Schema({
    content: { type: String, required: true },
    maxViews: { type: Number, default: null },
    currentViews: { type: Number, default: 0 },
    expiresAt: { type: Date, default: null }
}, { timestamps: true });

// Index for auto-deletion (optional but good practice)
pasteSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Paste', pasteSchema);