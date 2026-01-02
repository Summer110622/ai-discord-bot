const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(express.json()); // Middleware to parse JSON bodies

// Load system prompt
function loadSystemPrompt() {
    try {
        const systemPromptPath = path.join(__dirname, 'system-prompt.xml');
        const systemPromptContent = fs.readFileSync(systemPromptPath, 'utf8');

        // Extract the text content from XML tags
        const roleMatch = systemPromptContent.match(/<role>(.*?)<\/role>/s);
        const guidelinesMatch = systemPromptContent.match(/<guidelines>(.*?)<\/guidelines>/s);
        const limitationsMatch = systemPromptContent.match(/<limitations>(.*?)<\/limitations>/s);

        let systemPrompt = '';
        if (roleMatch) systemPrompt += roleMatch[1].trim() + '\n\n';
        if (guidelinesMatch) systemPrompt += 'Guidelines:\n' + guidelinesMatch[1].trim() + '\n\n';
        if (limitationsMatch) systemPrompt += 'Limitations:\n' + limitationsMatch[1].trim() + '\n\n';

        return systemPrompt.trim();
    } catch (error) {
        console.error('Error loading system prompt:', error);
        return 'You are a helpful AI assistant. Provide accurate, informative, and engaging responses to user questions.';
    }
}

// OpenRouter API function
async function askOpenRouter(question, systemPrompt) {
    try {
        const response = await axios.post(
            `${process.env.OPENROUTER_BASE_URL}/v1/chat/completions`,
            {
                model: process.env.DEFAULT_MODEL || 'anthropic/claude-3.5-sonnet',
                messages: [
                    {
                        role: 'system',
                        content: systemPrompt
                    },
                    {
                        role: 'user',
                        content: question
                    }
                ],
                max_tokens: parseInt(process.env.MAX_TOKENS) || 1000,
                temperature: parseFloat(process.env.TEMPERATURE) || 0.7
            },
            {
                headers: {
                    'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': 'https://liamgrant.com',
                    'X-Title': 'AI HTTP Bot'
                }
            }
        );

        console.log('OpenRouter Response:', JSON.stringify(response.data, null, 2));

        if (!response.data.choices || !response.data.choices[0] || !response.data.choices[0].message) {
            throw new Error('Invalid response structure from OpenRouter API');
        }

        return response.data.choices[0].message.content;
    } catch (error) {
        console.error('OpenRouter API Error:', error.response?.data || error.message);
        throw new Error('Failed to get response from AI service');
    }
}

// Simple route for testing if the server is up
app.get('/', (req, res) => {
    res.send('AI Bot server is running.');
});

// Endpoint to handle AI questions
app.post('/ask', async (req, res) => {
    const { question } = req.body;

    if (!question) {
        return res.status(400).json({ error: 'Please provide a question.' });
    }

    try {
        const systemPrompt = loadSystemPrompt();
        const aiResponse = await askOpenRouter(question, systemPrompt);
        res.json({ response: aiResponse });
    } catch (error) {
        console.error('Error processing ask command:', error);
        res.status(500).json({ error: `Sorry, couldn't answer '${question}'. Please try again later.` });
    }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
});

// Error handling for unhandled promise rejections
process.on('unhandledRejection', error => {
    console.error('Unhandled promise rejection:', error);
});
