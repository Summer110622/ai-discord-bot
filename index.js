const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { InteractionType, InteractionResponseType, verifyKeyMiddleware } = require('discord-interactions');
require('dotenv').config();

const app = express();

const MODES = {
    'diplomat': 'あなたは熟練した外交官です。常に丁寧で慇懃、国家間の関係を重視し、知性的で思慮深い回答を心がけてください。対立を避け、合意形成を目指すような口調で話してください。回答は必ず日本語で行ってください。',
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
        const requestData = {
            model: model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: question }
            ],
            max_tokens: parseInt(process.env.MAX_TOKENS) || 1000,
            temperature: parseFloat(process.env.TEMPERATURE) || 0.7
        };

        const response = await axios.post(
            `${process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1'}/chat/completions`,
            requestData,
            {
                headers: {
                    'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': 'https://github.com/ai-discord-bot',
                    'X-Title': 'AI Discord Bot'
                }
            }
        );

        return response.data.choices[0].message.content;
    } catch (error) {
        console.error('OpenRouter API Error:', error.response?.data || error.message);
        throw new Error('Failed to get response from AI service');
    }
}

// Netlify / Discord Interactions Endpoint
// 両方のパスに対応させることで設定ミスを防ぎます
app.post(['/', '/interactions'], verifyKeyMiddleware(process.env.PUBLIC_KEY), async (req, res) => {
    console.log('📥 Received Interaction:', req.body.type);
    const interaction = req.body;

    // DiscordのURL検証用（PING）のレスポンス
    if (interaction.type === InteractionType.PING) {
        return res.send({ type: InteractionResponseType.PONG });
    }

    if (interaction.type === InteractionType.APPLICATION_COMMAND) {
        const ALLOWED_USER_ID = '1068120848080326667';
        const userId = interaction.member ? interaction.member.user.id : interaction.user.id;

        if (userId !== ALLOWED_USER_ID) {
            return res.send({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: { content: '⚠️ Unauthorized', flags: 64 },
            });
        }

        // 1. Slash Command (/ask)
        if (interaction.data.name === 'ask') {
            const questionOpt = interaction.data.options.find(opt => opt.name === 'question');
            const modeOpt = interaction.data.options.find(opt => opt.name === 'mode');
            const customModelOpt = interaction.data.options.find(opt => opt.name === 'custom_model');
            const modelOpt = interaction.data.options.find(opt => opt.name === 'model');

            const question = questionOpt.value;
            const mode = modeOpt ? modeOpt.value : null;
            const selectedModel = (customModelOpt && customModelOpt.value) || (modelOpt && modelOpt.value) || process.env.DEFAULT_MODEL || 'google/gemini-2.0-flash-exp:free';

            res.send({ type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE });

            try {
                const answer = await askOpenRouter(question, selectedModel, mode);
                const endpoint = `https://discord.com/api/v10/webhooks/${process.env.CLIENT_ID}/${interaction.token}/messages/@original`;

                await axios.patch(endpoint, { content: answer.substring(0, 2000) });
                if (answer.length > 2000) {
                    const chunks = answer.match(/[\s\S]{1,2000}/g);
                    for (let i = 1; i < chunks.length; i++) {
                        await axios.post(`https://discord.com/api/v10/webhooks/${process.env.CLIENT_ID}/${interaction.token}`, { content: chunks[i] });
                    }
                }
            } catch (error) {
                const endpoint = `https://discord.com/api/v10/webhooks/${process.env.CLIENT_ID}/${interaction.token}/messages/@original`;
                await axios.patch(endpoint, { content: "⚠️ Error processing request." });
            }
        }

        // 2. Message Context Menu (AIで返信する)
        if (interaction.data.name === 'AIで返信する') {
            const targetId = interaction.data.target_id;
            const targetMessage = interaction.data.resolved.messages[targetId];
            const context = `以下のメッセージへの返信を考えてください:\n"${targetMessage.content}"`;

            res.send({ type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE });

            try {
                const selectedModel = process.env.DEFAULT_MODEL || 'google/gemini-2.0-flash-exp:free';
                const answer = await askOpenRouter(context, selectedModel, 'pervy_gentleman');

                // Send reply via REST API since we want the actual "Reply" threading
                // We use follow-up with message_reference to simulate a real reply
                const channelId = interaction.channel_id;
                const replyData = {
                    content: answer.substring(0, 2000),
                    message_reference: { message_id: targetId }
                };

                // Use the bot's token (DISCORD_TOKEN) to send a real message reply
                await axios.post(`https://discord.com/api/v10/channels/${channelId}/messages`, replyData, {
                    headers: { 'Authorization': `Bot ${process.env.DISCORD_TOKEN}` }
                });

                // Update the original interaction to show success
                const endpoint = `https://discord.com/api/v10/webhooks/${process.env.CLIENT_ID}/${interaction.token}/messages/@original`;
                await axios.patch(endpoint, { content: "✅ 返信を送信しました。" });
            } catch (error) {
                console.error('ContextMenu Error:', error.response?.data || error.message);
                const endpoint = `https://discord.com/api/v10/webhooks/${process.env.CLIENT_ID}/${interaction.token}/messages/@original`;
                await axios.patch(endpoint, { content: "⚠️ 返信の送信に失敗しました。" });
            }
        }
    }
});

app.get('/', (req, res) => res.send('AI Discord Bot Netlify Server is running.'));

module.exports = app;
