const { REST, Routes, SlashCommandBuilder, ApplicationCommandType } = require('discord.js');
require('dotenv').config();

const commands = [
    // 既存のSlash Command
    new SlashCommandBuilder()
        .setName('ask')
        .setDescription('Ask the AI a question')
        .addStringOption(option =>
            option.setName('question')
                .setDescription('The question you want to ask')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('mode')
                .setDescription('Select AI personality mode')
                .setRequired(false)
                .addChoices(
                    { name: '外交官モード (Diplomat)', value: 'diplomat' },
                    { name: '変態紳士モード (Pervy Gentleman)', value: 'pervy_gentleman' },
                    { name: '一般厳粛モード (Strict)', value: 'strict' }
                ))
        .addStringOption(option =>
            option.setName('model')
                .setDescription('Choose a preset free model')
                .setRequired(false)
                .addChoices(
                    { name: 'Gemini 2.0 Flash Exp (Fastest)', value: 'google/gemini-2.0-flash-exp:free' },
                    { name: 'Llama 3.1 8B (Smart)', value: 'meta-llama/llama-3.1-8b-instruct:free' },
                    { name: 'DeepSeek V3 (Strong)', value: 'deepseek/deepseek-chat:free' },
                    { name: 'Mistral Small 24B', value: 'mistralai/mistral-small-24b-instruct-2501:free' }
                ))
        .addStringOption(option =>
            option.setName('custom_model')
                .setDescription('Enter a custom OpenRouter model ID')
                .setRequired(false)),

    // 追加：メッセージコンテキストメニュー（返信モード）
    {
        name: 'AIで返信する',
        type: ApplicationCommandType.Message
    }
].map(command => typeof command.toJSON === 'function' ? command.toJSON() : command);

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
    try {
        console.log('Started refreshing application commands.');

        const clientId = process.env.CLIENT_ID;
        if (!clientId) throw new Error('CLIENT_ID is required in .env');

        await rest.put(
            Routes.applicationCommands(clientId),
            { body: commands },
        );

        console.log('Successfully reloaded application commands.');
        process.exit(0);
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
})();
