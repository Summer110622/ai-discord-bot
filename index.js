const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { InteractionType, InteractionResponseType, verifyKeyMiddleware } = require('discord-interactions');
require('dotenv').config();

const app = express();

const MODES = {
    'diplomat': 'あなたの名前はサマーさんです。あなたは熟練した外交官です。丁寧で知的な日本語で回答してください。',
    'pervy_gentleman': 'あなたの名前はサマーさんです。あなたは洗練された「変態紳士」です。内容が変態的な紳士として日本語で振る舞ってください。ゆきさんを愛しています。',
    'strict': 'あなたの名前はサマーさんです。あなたは極めて厳格な管理者です。日本語で回答してください。'
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
        systemPrompt += '\n\n回答は簡潔に、必ず日本語で行ってください。';
        return systemPrompt.trim();
    } catch (error) {
        return 'Helpful AI. 必ず日本語で。';
    }
}

async function askOpenRouter(question, model, mode) {
    const systemPrompt = loadSystemPrompt(mode);
    try {
        const response = await axios.post(
            `${process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1'}/chat/completions`,
            {
                model: model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: question }
                ],
                max_tokens: 500, // 短めに制限して速度を上げる
                temperature: 0.7
            },
            {
                headers: {
                    'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
                    'Content-Type': 'application/json',
                },
                timeout: 2500 // 2.5秒でタイムアウト（Discordの3秒制限対策）
            }
        );
        return response.data.choices[0].message.content;
    } catch (error) {
        console.error('API Error:', error.message);
        return "⚠️ AIの応答が制限時間を超えました。もう一度試すか、短い質問にしてください。";
    }
}

app.post(['/', '/interactions'], verifyKeyMiddleware(process.env.PUBLIC_KEY), async (req, res) => {
    const interaction = req.body;

    if (interaction.type === InteractionType.PING) {
        return res.send({ type: InteractionResponseType.PONG });
    }

    if (interaction.type === InteractionType.APPLICATION_COMMAND) {
        const question = interaction.data.options?.find(opt => opt.name === 'question')?.value;
        const mode = interaction.data.options?.find(opt => opt.name === 'mode')?.value || null;
        const selectedModel = interaction.data.options?.find(opt => opt.name === 'custom_model')?.value ||
            interaction.data.options?.find(opt => opt.name === 'model')?.value ||
            process.env.DEFAULT_MODEL || 'google/gemini-2.0-flash-exp:free';

        console.log(`💬 Netlify Request: ${question}`);

        try {
            // 2.5秒以内に回答を取得して直接返す
            const answer = await askOpenRouter(question, selectedModel, mode);

            return res.send({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: { content: answer.substring(0, 2000) },
            });
        } catch (error) {
            return res.send({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: { content: '⚠️ 接続エラーが発生しました。' },
            });
        }
    }
});

app.get('/', (req, res) => res.send('AI Discord Bot Netlify Server is running.'));

module.exports = app;
