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

// 3. Validation endpoint
app.post('/api/validate-token', async (req, res) => {
    const { accessToken, projectId } = req.body;
    
    if (!accessToken) {
        return res.json({ valid: false, message: 'No access token provided.' });
    }

    try {
        // Simple validation call to check if the token works
        const response = await fetch(`https://aiplatform.googleapis.com/v1/projects/${projectId}/locations/us-central1/publishers/google/models`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        
        if (response.ok) {
            res.json({ valid: true });
        } else {
            res.json({ valid: false });
        }
    } catch (error) {
        res.json({ valid: false, error: error.message });
    }
});

// 4. Main Gemini API proxy endpoint using SDK
app.post('/api/generate', async (req, res) => {
    const { systemPrompt, contentParts, location, authMethod, accessToken: clientAccessToken, projectId: clientProjectId } = req.body;
    
    console.log(`========== Generate endpoint called (Method: ${authMethod || 'auto'}) ==========`);
    
    const model = 'gemini-2.5-pro';
    const vertexLocation = location || 'us-central1';
    
    try {
        let finalAccessToken;
        let finalProjectId;
        let isVertexAi = true;

        if (authMethod === 'api-key') {
            // Priority: client key (if we ever add it back to UI) > server key
            const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
            if (!apiKey) throw new Error('API Key not configured on server.');
            
            const ai = new GoogleGenAI(apiKey);
            const geminiModel = ai.getGenerativeModel({ model: "gemini-2.0-flash-exp" }); // Defaulting to flash for API Key path

            const parts = [];
            if (systemPrompt) parts.push({ text: systemPrompt });
            if (contentParts) {
                contentParts.forEach(part => {
                    if (part.text) parts.push({ text: part.text });
                    if (part.inlineData) parts.push({ inlineData: part.inlineData });
                });
            }

            const result = await geminiModel.generateContent({ contents: [{ role: "user", parts }] });
            const response = await result.response;
            return res.json({ text: response.text().trim() });
        }

        // Access Token Path (Manual or Auto)
        if (authMethod === 'access-token' && clientAccessToken) {
            finalAccessToken = clientAccessToken;
            finalProjectId = clientProjectId || process.env.GOOGLE_CLOUD_PROJECT;
        } else {
            // Automated path
            console.log('Using automated gcloud auth...');
            finalAccessToken = await getAccessToken();
            finalProjectId = clientProjectId || process.env.GOOGLE_CLOUD_PROJECT || 'g-monks-lab';
        }

        // Use Vertex AI SDK for Access Token paths
        process.env.GOOGLE_AUTH_TOKEN = finalAccessToken;
        
        try {
            const ai = new GoogleGenAI({
                vertexai: true,
                project: finalProjectId,
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
                    } else if (part.text) {
                        parts.push({ text: part.text });
                    }
                });
            }
            
            console.log(`Generating content for project ${finalProjectId} in ${vertexLocation}`);
            const response = await ai.models.generateContent({
                model: model,
                contents: [{
                    role: "user",
                    parts: parts
                }]
            });
            
            res.json({ text: (response.text || "").trim() });
            
        } finally {
            delete process.env.GOOGLE_AUTH_TOKEN;
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