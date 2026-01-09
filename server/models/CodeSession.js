const mongoose = require('mongoose');

const codeSessionSchema = new mongoose.Schema({
    roomId: {
        type: String,
        required: true,
        unique: true
    },
    code: {
        type: String,
        default: ''
    },
    language: {
        type: String,
        default: 'javascript'
    },
    versions: [
        {
            code: String,
            timestamp: { type: Date, default: Date.now }
        }
    ]
}, { timestamps: true });

module.exports = mongoose.model('CodeSession', codeSessionSchema);
