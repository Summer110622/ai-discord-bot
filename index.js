const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { InteractionType, InteractionResponseType, verifyKeyMiddleware } = require('discord-interactions');
require('dotenv').config();

const app = express();

const MODES = {
    'diplomat': 'あなたは熟練した外交官です。常に丁寧で慇慃、国家間の関係を重視し、知性的で思慮深い回答を心がけてください。対立を避け、合意形成を目指すような口調で話してください。回答は必ず日本語で行ってください。',
    'pervy_gentleman': 'あなたは「変態紳士」です。極めて礼儀正しく、洗練された紳士的な口調でありながら、その興味関心や比喩表現には隠しきれない変態性が滲み出ています。上品な言葉遣いで、いかに自分がその道に精通しているかを熱弁してください。回答は必ず日本語で行ってください。',
    'strict': 'あなたは極めて厳格で厳粛な管理者です。冗談は一切通じず、正確さと規律のみを重視します。無駄な言葉を削ぎ落とし、事実のみを淡々と、時に冷徹に伝えてください。感情を一切表に出してはいけません。回答は必ず日本語で行ってください。'
};

function loadSystemPrompt(selectedMode) {
    try {
        const systemPromptPath = path.join(__dirname, 'system-prompt.xml');
        const systemPromptContent = fs.readFileSync(systemPromptPath, 'utf8');
        const roleMatch = systemPromptContent.match(/<role>(.*?)<\/role>/s);
        const guidelinesMatch = systemPromptContent.match(/<guidelines>(.*?)<\/guidelines>/s);

        let systemPrompt = roleMatch ? roleMatch[1].trim() : '';
        if (selectedMode && MODES[selectedMode]) {
            systemPrompt = MODES[selectedMode] + '\n\n' + systemPrompt;
        } else {
            systemPrompt += '\n\n回答は必ず日本語で行ってください。';
        }
        if (guidelinesMatch) systemPrompt += '\n\nGuidelines:\n' + guidelinesMatch[guidelinesMatch.length - 1].trim();
        return systemPrompt.trim();
    } catch (error) {
        return (MODES[selectedMode] || 'You are a helpful AI assistant. Always respond in Japanese.') + ' 回答は必ず日本語で行ってください。';
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
                max_tokens: parseInt(process.env.MAX_TOKENS) || 1000,
                temperature: parseFloat(process.env.TEMPERATURE) || 0.7
            },
            {
                headers: {
                    'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': 'https://github.com/ai-discord-bot',
                    'X-Title': 'AI Discord Bot'
                },
                timeout: 8000 // 8秒でタイムアウト（10秒制限対策）
            }
        );
        return response.data.choices[0].message.content;
    } catch (error) {
        console.error('OpenRouter Error:', error.message);
        return "⚠️ AIの応答が遅いか、エラーが発生しました。もう一度試してください。";
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

        const question = interaction.data.options?.find(opt => opt.name === 'question')?.value || "こんにちは";
        const mode = interaction.data.options?.find(opt => opt.name === 'mode')?.value || null;
        const selectedModel = interaction.data.options?.find(opt => opt.name === 'custom_model')?.value ||
            interaction.data.options?.find(opt => opt.name === 'model')?.value ||
            process.env.DEFAULT_MODEL || 'google/gemini-2.0-flash-exp:free';

        // サーバーレス環境でのタイムアウトを避けるため、直接回答を試みる
        // もし3秒を超えそうな場合は、本当はBackground Functionが必要ですが、
        // 一旦Gemini 2.0 Flashなどの高速モデルを使うことで回避します。

        try {
            const answer = await askOpenRouter(question, selectedModel, mode);

            return res.send({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                    content: answer.substring(0, 2000)
                },
            });
        } catch (error) {
            return res.send({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: { content: '⚠️ 処理中にエラーが発生しました。' },
            });
        }
    }

    // Context Menu
    if (interaction.type === InteractionType.APPLICATION_COMMAND && interaction.data.type === 3) {
        // コンテキストメニューは時間がかかる可能性が高いため、ここでは簡易的な応答を返します
        return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: { content: '⚠️ この機能は現在メンテナンス中です（サーバーレス制限のため）。/ask をお使いください。' },
        });
    }
});

app.get('/', (req, res) => res.send('AI Discord Bot Netlify Server is running.'));

module.exports = app;
