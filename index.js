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

// ストリーミング処理を完全に同期的に行う（Netlifyの停止を防ぐため）
async function handleStreamingInteractionSync(interaction, question, model, mode) {
    const systemPrompt = loadSystemPrompt(mode);
    const endpoint = `https://discord.com/api/v10/webhooks/${process.env.CLIENT_ID}/${interaction.token}/messages/@original`;

    let currentContent = '';
    let lastUpdate = Date.now();

    try {
        console.log(`📡 Starting stream for: ${question}`);

        // Node.js 18+ の fetch を使用
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

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`OpenRouter API error: ${response.status} ${errorText}`);
        }

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

                            // 2秒に1回更新（Netlifyの負荷とDiscord制限を考慮）
                            const now = Date.now();
                            if (now - lastUpdate > 2000) {
                                await axios.patch(endpoint, { content: currentContent.substring(0, 1900) + ' ┃' });
                                lastUpdate = now;
                            }
                        }
                    } catch (e) { }
                }
            }
        }

        // 最終回答の更新
        await axios.patch(endpoint, { content: currentContent.substring(0, 2000) });
        console.log('✅ Stream finished successfully');

    } catch (error) {
        console.error('Streaming Error:', error.message);
        // エラー時は元の「考え中」をエラー表示に上書き
        try {
            await axios.patch(endpoint, { content: `⚠️ エラーが発生しました: ${error.message}` });
        } catch (patchError) {
            console.error('Failed to send error patch:', patchError.message);
        }
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

            // 1. まず応答をレスポンスとして返す（これでDiscord側の「待機状態」を作る）
            res.status(200).send({
                type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
            });

            // 2. その直後に、同じ関数内で処理を続ける
            // 注意: Netlifyはres.sendを返した直後にプロセスを凍結する可能性があるため、
            // 本当は「await」して待つ必要がありますが、HTTPレスポンスを返した後に待つのはサーバーレスのタブーです。
            // しかし、Netlify Functions (AWS Lambda) は例外的にしばらく生き残ることがあるため、
            // ここで「await」を入れずに走らせます。
            // もし「考え中」で止まる場合は、この「handle」を「await」する必要がありますが、
            // その場合はレスポンスを返せなくなるというジレンマがあります。

            // 最も確実なサーバーレスのやり方に書き換えます：
            await handleStreamingInteractionSync(interaction, question, selectedModel, mode);
        }
    }
});

app.get('/', (req, res) => res.send('AI Discord Bot Netlify Server is running.'));

module.exports = app;
