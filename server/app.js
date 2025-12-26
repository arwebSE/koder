const express = require('express');
const { spawn } = require('child_process');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = 3000;

// Store sessions
const sessions = new Map();

app.use(express.json());
app.use(express.static('public'));

// Helper to execute claude command
function executeClaude(command, cwd, sessionId = null) {
    return new Promise((resolve, reject) => {
        const args = [];
        
        // Add session handling if we have a sessionId
        if (sessionId && sessions.has(sessionId)) {
            args.push('--session-id', sessionId);
        }

        const claude = spawn('claude', [...args, command], {
            cwd: cwd,
            env: { ...process.env }
        });

        let stdout = '';
        let stderr = '';

        claude.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        claude.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        claude.on('close', (code) => {
            if (code === 0) {
                resolve(stdout);
            } else {
                reject(new Error(stderr || `Command failed with code ${code}`));
            }
        });

        claude.on('error', (error) => {
            reject(error);
        });
    });
}

app.post('/api/chat', async (req, res) => {
    try {
        const { message, path: workingPath, sessionId } = req.body;

        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }

        if (!workingPath) {
            return res.status(400).json({ error: 'Working path is required' });
        }

        let currentSessionId = sessionId;
        
        // Create new session if needed
        if (!currentSessionId) {
            currentSessionId = crypto.randomUUID();
            sessions.set(currentSessionId, {
                createdAt: new Date(),
                path: workingPath
            });
        }

        // Execute claude command
        const response = await executeClaude(message, workingPath, currentSessionId);

        res.json({
            response: response,
            sessionId: currentSessionId
        });

    } catch (error) {
        console.error('Error executing claude:', error);
        res.status(500).json({ 
            error: 'Failed to execute command',
            details: error.message 
        });
    }
});

app.post('/api/session/:sessionId/end', (req, res) => {
    const { sessionId } = req.params;
    
    if (sessions.has(sessionId)) {
        sessions.delete(sessionId);
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'Session not found' });
    }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        activeSessions: sessions.size 
    });
});

// Cleanup old sessions (older than 30 minutes)
setInterval(() => {
    const now = new Date();
    for (const [sessionId, session] of sessions.entries()) {
        if (now - session.createdAt > 30 * 60 * 1000) {
            sessions.delete(sessionId);
        }
    }
}, 5 * 60 * 1000); // Check every 5 minutes

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Code CLI Server running on port ${PORT}`);
});