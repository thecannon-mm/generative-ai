/*
 * Copyright 2025 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

// Import the new Google Gen AI SDK
const { GoogleGenAI } = require('@google/genai');

require('dotenv').config();

const app = express();
const port = process.env.PORT || 8080;

// Middleware & Static File Serving
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname)));

// --- HELPER FUNCTIONS ---

// Function to get a fresh gcloud access token
function getAccessToken() {
    return new Promise((resolve, reject) => {
        exec('gcloud auth print-access-token', (error, stdout, stderr) => {
            if (error) {
                console.error(`Error executing gcloud: ${error.message}`);
                return reject(error);
            }
            if (stderr) {
                console.warn(`gcloud stderr: ${stderr}`);
            }
            resolve(stdout.trim());
        });
    });
}

// --- API ENDPOINTS ---

// 1. Endpoint to securely load the YouTube study data from a private file
app.get('/api/study/veo-youtube-study', (req, res) => {
    const filePath = path.join(__dirname, 'data', 'veo-youtube-study.json');
    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
            console.error("Error reading study file:", err);
            return res.status(500).json({ error: "Could not load the study data." });
        }
        try {
            const jsonData = JSON.parse(data);
            res.json(jsonData);
        } catch (parseErr) {
            console.error("Error parsing study JSON:", parseErr);
            return res.status(500).json({ error: "Study data is corrupted." });
        }
    });
});

// 2. Endpoint to proxy video URLs to avoid CORS issues
app.get('/api/proxy-video', async (req, res) => {
    const videoUrl = req.query.url;
    if (!videoUrl) {
        return res.status(400).json({ error: 'URL query parameter is required.' });
    }

    try {
        console.log(`Proxying video from: ${videoUrl}`);
        const videoResponse = await fetch(videoUrl);
        
        if (!videoResponse.ok) {
            throw new Error(`Failed to fetch video with status: ${videoResponse.statusText}`);
        }

        const contentType = videoResponse.headers.get('content-type');
        if (contentType) res.setHeader('Content-Type', contentType);
        
        videoResponse.body.pipe(res);
    } catch (error) {
        console.error('Error proxying video:', error.message);
        res.status(500).json({ error: `Failed to proxy video. Reason: ${error.message}` });
    }
});

// 3. Fast validation endpoint - DEPRECATED (Backend handles auth now)
app.post('/api/validate-token', (req, res) => {
    res.json({ valid: true, message: 'Backend automated authentication enabled.' });
});

// 4. Main Gemini API proxy endpoint using SDK
app.post('/api/generate', async (req, res) => {
    console.log('========== Generate endpoint called (Automated Auth) ==========');
    const { systemPrompt, contentParts, location } = req.body;
    const model = 'gemini-2.5-pro';
    const projectId = process.env.GOOGLE_CLOUD_PROJECT || 'g-monks-lab';
    const vertexLocation = location || 'us-central1';

    try {
        console.log('Fetching fresh access token...');
        const accessToken = await getAccessToken();
        
        // Store original value to restore later
        const originalAuthToken = process.env.GOOGLE_AUTH_TOKEN;
        
        try {
            process.env.GOOGLE_AUTH_TOKEN = accessToken;
            
            const ai = new GoogleGenAI({
                vertexai: true,
                project: projectId,
                location: vertexLocation
            });
            
            const parts = [];
            if (systemPrompt) parts.push({ text: systemPrompt });
            
            if (contentParts && contentParts.length > 0) {
                contentParts.forEach(part => {
                    if (part.inlineData && part.inlineData.data && part.inlineData.mimeType) {
                        parts.push({
                            inlineData: {
                                mimeType: part.inlineData.mimeType,
                                data: part.inlineData.data
                            }
                        });
                    }
                });
            }
            
            console.log(`Generating content for project ${projectId} in ${vertexLocation}`);
            const response = await ai.models.generateContent({
                model: model,
                contents: [{
                    role: "user",
                    parts: parts
                }]
            });
            
            res.json({ text: (response.text || "").trim() });
            
        } finally {
            if (originalAuthToken !== undefined) {
                process.env.GOOGLE_AUTH_TOKEN = originalAuthToken;
            } else {
                delete process.env.GOOGLE_AUTH_TOKEN;
            }
        }

    } catch (error) {
        console.error('Generation error:', error);
        res.status(500).json({ 
            error: 'Failed to generate content: ' + error.message 
        });
    }
});

// Test endpoint to verify server is running
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        endpoints: [
            '/api/health',
            '/api/validate-token',  
            '/api/generate',
            '/api/proxy-video',
            '/api/study/veo-youtube-study'
        ],
        sdkVersion: {
            '@google/genai': require('@google/genai/package.json').version
        }
    });
});

// Root route to serve index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// --- Server Start ---
app.listen(port, '0.0.0.0', () => {
    console.log(`Server listening at http://localhost:${port}`);
    console.log('Environment variables configured:');
    console.log('  GOOGLE_CLOUD_PROJECT:', process.env.GOOGLE_CLOUD_PROJECT || 'Not set');
    console.log('  GOOGLE_CLOUD_LOCATION:', process.env.GOOGLE_CLOUD_LOCATION || 'Not set (will use UI selection)');
});