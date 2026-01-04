const { Client, GatewayIntentBits, Partials, REST, Routes, SlashCommandBuilder, MessageFlags, ApplicationCommandType } = require('discord.js');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
    ],
});

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
        console.log(`📡 Sending request [Model: ${model}, Mode: ${mode || 'default'}]`);
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
                }
            }
        );
        return response.data.choices[0].message.content;
    } catch (error) {
        throw new Error('⚠️ API Error');
    }
}

client.once('ready', () => {
    console.log(`✅ Logged in as ${client.user.tag}!`);
    console.log('🤖 Bot is ready.');
});

client.on('interactionCreate', async interaction => {
    const ALLOWED_USER_ID = '1068120848080326667';
    if (interaction.user.id !== ALLOWED_USER_ID) {
        return interaction.reply({ content: '⚠️ Unauthorized', flags: MessageFlags.Ephemeral });
    }

    // AIで返信する (Message Context Menu)
    if (interaction.isMessageContextMenuCommand() && interaction.commandName === 'AIで返信する') {
        const targetMessage = interaction.targetMessage;
        const context = `以下のメッセージへの返信を考えてください:\n"${targetMessage.content}"`;

        try {
            await interaction.deferReply();
            const selectedModel = process.env.DEFAULT_MODEL || 'google/gemini-2.0-flash-exp:free';
            const answer = await askOpenRouter(context, selectedModel, 'pervy_gentleman');

            // Discordの「返信フォーム」として回答を送る
            await targetMessage.reply({ content: answer });

            // 呼び出し元のインタラクションを完了（削除または成功メッセージ）
            await interaction.editReply({ content: '✅ 返信を送信しました。' });
            setTimeout(() => interaction.deleteReply(), 5000); // 5秒後に「成功しました」を消す

        } catch (error) {
            console.error('⚠️ Interaction Error:', error.message);
            await interaction.editReply({ content: "⚠️ 返信の生成に失敗しました。" });
        }
    }

    // 通常の /ask スラッシュコマンド
    if (interaction.isChatInputCommand() && interaction.commandName === 'ask') {
        const question = interaction.options.getString('question');
        const mode = interaction.options.getString('mode');
        const customModel = interaction.options.getString('custom_model');
        const selectedModel = customModel || interaction.options.getString('model') || process.env.DEFAULT_MODEL || 'google/gemini-2.0-flash-exp:free';

        try {
            await interaction.deferReply();
            const answer = await askOpenRouter(question, selectedModel, mode);

            if (answer.length > 2000) {
                const chunks = answer.match(/[\s\S]{1,2000}/g);
                await interaction.editReply({ content: chunks[0] });
                for (let i = 1; i < chunks.length; i++) await interaction.followUp({ content: chunks[i] });
            } else {
                await interaction.editReply({ content: answer });
            }
        } catch (error) {
            await interaction.editReply({ content: "⚠️ エラーが発生しました。" });
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
