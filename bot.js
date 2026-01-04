const { Client, GatewayIntentBits, MessageFlags } = require('discord.js');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const client = new Client({
    intents: [GatewayIntentBits.Guilds],
});

const MODES = {
    'diplomat': 'あなたの名前はサマーさんです。あなたは熟練した外交官です。丁寧で知的な日本語で回答してください。',
    'pervy_gentleman': 'あなたの名前はサマーさんです。あなたは洗練された「変態紳士」です。内容が変態的な紳士として日本語で振る舞ってください。ゆき',
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
        systemPrompt += '\n\n回答は必ず日本語で行ってください。';
        return systemPrompt.trim();
    } catch (error) {
        return (MODES[selectedMode] || 'Helpful AI.') + ' 必ず日本語で。';
    }
}

// ストリーミング対応のOpenRouterリクエスト
async function streamOpenRouter(question, model, mode, onChunk) {
    const systemPrompt = loadSystemPrompt(mode);
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
        let fullText = '';

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
                            fullText += content;
                            onChunk(fullText);
                        }
                    } catch (e) {
                        // ignore empty or partial json
                    }
                }
            }
        }
        return fullText;
    } catch (error) {
        console.error('Stream Error:', error);
        throw error;
    }
}

client.once('ready', () => console.log(`✅ ${client.user.tag} Online!`));

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand() || interaction.commandName !== 'ask') return;

    if (interaction.user.id !== '1068120848080326667') {
        return interaction.reply({ content: '⚠️ Unauthorized', flags: MessageFlags.Ephemeral });
    }

    const question = interaction.options.getString('question');
    const mode = interaction.options.getString('mode');
    const selectedModel = interaction.options.getString('custom_model') ||
        interaction.options.getString('model') ||
        process.env.DEFAULT_MODEL || 'google/gemini-2.0-flash-exp:free';

    try {
        await interaction.deferReply();

        let currentContent = '';
        let lastUpdate = Date.now();
        let updatePending = false;

        // タイピングアニメーションの管理
        const updateMessage = async (isFinal = false) => {
            const now = Date.now();
            // 1.5秒に1回以上の更新を制限（Discordのレートリミット対策）
            if (isFinal || (now - lastUpdate > 1500 && !updatePending)) {
                updatePending = true;
                const displayContent = currentContent + (isFinal ? '' : ' ┃');
                await interaction.editReply({ content: displayContent.substring(0, 2000) });
                lastUpdate = now;
                updatePending = false;
            }
        };

        await streamOpenRouter(question, selectedModel, mode, (text) => {
            currentContent = text;
            updateMessage();
        });

        // 最終確定
        await updateMessage(true);

    } catch (error) {
        console.error('Interaction Error:', error);
        await interaction.editReply({ content: '⚠️ エラーが発生しました。' });
    }
});

client.on('error', console.error);
client.login(process.env.DISCORD_TOKEN);
