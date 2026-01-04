const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { InteractionType, InteractionResponseType, verifyKeyMiddleware } = require('discord-interactions');
require('dotenv').config();

const app = express();

const MODES = {
    'diplomat': 'あなたは熟練した外交官です。丁寧で知的な日本語で回答してください。',
    'pervy_gentleman': 'あなたは洗練された「変態紳士」です。極めて上品な言葉遣いですが、内容が変態的な紳士として日本語で振る舞ってください。',
    'strict': 'あなたは極めて厳格な管理者です。冗談を排し、冷徹で正確な日本語で回答してください。'
};

function loadSystemPrompt(selectedMode) {
    try {
        const systemPromptPath = path.join(__dirname, 'system-prompt.xml');
        const systemPromptContent = fs.readFileSync(systemPromptPath, 'utf8');
        const roleMatch = systemPromptContent.match(/<role>(.*?)<\/role>/s);
        let systemPrompt = roleMatch ? roleMatch[1].trim() : '';
        if (selectedMode && MODES[selectedMode]) {
            systemPrompt = MODES[selectedMode] + '\n\n' + systemPrompt;
        }
        systemPrompt += '\n\n回答は必ず日本語で行ってください。';
        return systemPrompt.trim();
    } catch (error) {
        return (MODES[selectedMode] || 'Helpful AI.') + ' 必ず日本語で。';
    }
}

// Netlifyでのタイピング風（ストリーミング）処理
async function handleStreamingInteraction(interaction, question, model, mode) {
    const systemPrompt = loadSystemPrompt(mode);
    const endpoint = `https://discord.com/api/v10/webhooks/${process.env.CLIENT_ID}/${interaction.token}/messages/@original`;

    let currentContent = '';
    let lastUpdate = Date.now();
    let updatePending = false;

    try {
        const response = await fetch(`${process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1'}/chat/completions`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'https://github.com/ai-discord-bot',
                'X-Title': 'AI Discord Bot'
            },
            body: JSON.stringify({
                model: model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: question }
                ],
                stream: true,
                max_tokens: parseInt(process.env.MAX_TOKENS) || 1000,
            })
        });

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6);
                    if (data === '[DONE]') continue;
                    try {
                        const json = JSON.parse(data);
                        const content = json.choices[0]?.delta?.content || '';
                        if (content) {
                            currentContent += content;

                            // 1.5秒に1回更新（タイピング演出）
                            const now = Date.now();
                            if (now - lastUpdate > 1500 && !updatePending) {
                                updatePending = true;
                                await axios.patch(endpoint, { content: currentContent.substring(0, 1900) + ' ┃' });
                                lastUpdate = now;
                                updatePending = false;
                            }
                        }
                    } catch (e) { }
                }
            }
        }

        // 最終回答の更新
        await axios.patch(endpoint, { content: currentContent.substring(0, 2000) });

    } catch (error) {
        console.error('Streaming Error:', error);
        await axios.patch(endpoint, { content: '⚠️ 途中でエラーが発生しました（Netlifyの制限時間等）。' });
    }
}

app.post(['/', '/interactions'], verifyKeyMiddleware(process.env.PUBLIC_KEY), async (req, res) => {
    const interaction = req.body;

    if (interaction.type === InteractionType.PING) {
        return res.send({ type: InteractionResponseType.PONG });
    }

    if (interaction.type === InteractionType.APPLICATION_COMMAND) {
        const userId = interaction.member ? interaction.member.user.id : interaction.user.id;
        if (userId !== '1068120848080326667') {
            return res.send({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: { content: '⚠️ Unauthorized', flags: 64 },
            });
        }

        if (interaction.data.name === 'ask') {
            const question = interaction.data.options?.find(opt => opt.name === 'question')?.value;
            const mode = interaction.data.options?.find(opt => opt.name === 'mode')?.value || null;
            const selectedModel = interaction.data.options?.find(opt => opt.name === 'custom_model')?.value ||
                interaction.data.options?.find(opt => opt.name === 'model')?.value ||
                process.env.DEFAULT_MODEL || 'google/gemini-2.0-flash-exp:free';

            // 即座に「考え中...」状態を返す（DEFERRED）
            res.send({ type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE });

            // 非同期でタイピング風の処理を開始
            // 注意: Netlify Functionは10秒で停止するため、短い回答向きです
            handleStreamingInteraction(interaction, question, selectedModel, mode);
        }
    }
});

app.get('/', (req, res) => res.send('AI Discord Bot Netlify Server is running.'));

module.exports = app;
