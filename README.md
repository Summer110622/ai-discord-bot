# AI HTTP Bot

An HTTP service that uses the OpenRouter API to provide AI-powered responses to user questions via a simple JSON API.

## Features

- 🤖 AI-powered responses using OpenRouter API
- 📝 Customizable system prompt via XML file
- ⚡ Simple `/ask` POST endpoint for easy integration
- 🔧 Configurable AI model and parameters
- 🛡️ Basic error handling

## Prerequisites

- Node.js 16.9.0 or higher
- An OpenRouter API key

## Setup Instructions

### 1. Clone and Install Dependencies

```bash
git clone <your-repo-url>
cd ai-http-bot
npm install
```

### 2. Environment Configuration

1. Copy the example environment file:
   ```bash
   cp env.example .env
   ```

2. Edit `.env` and add your credentials:
   ```env
   # Server Configuration
   PORT=3000

   # OpenRouter API Configuration
   OPENROUTER_API_KEY=your_openrouter_api_key_here
   OPENROUTER_BASE_URL=https://openrouter.ai/api/v1

   # Bot Configuration
   DEFAULT_MODEL=anthropic/claude-3.5-sonnet
   MAX_TOKENS=1000
   TEMPERATURE=0.7
   ```

### 3. OpenRouter API Setup

1. Go to [OpenRouter](https://openrouter.ai/)
2. Create an account and get your API key
3. Add the API key to your `.env` file

### 4. Start the Server

```bash
npm start
```

For development with auto-restart:
```bash
npm run dev
```

The server will start on the port specified in your `.env` file (default: 3000).

## Usage

Once the server is running, you can send a POST request to the `/ask` endpoint with a JSON payload containing your question.

**Example using `curl`:**

```bash
curl -X POST http://localhost:3000/ask \
-H "Content-Type: application/json" \
-d '{"question": "What is the capital of France?"}'
```

The API will respond with a JSON object containing the AI-generated answer:

```json
{
  "response": "The capital of France is Paris."
}
```

## Configuration

### System Prompt

The bot's behavior is controlled by the `system-prompt.xml` file. You can customize:

- **Role**: The AI's primary function
- **Guidelines**: How the AI should behave
- **Limitations**: What the AI should not do

### Environment Variables

- `PORT`: The port for the HTTP server to listen on (default: 3000)
- `OPENROUTER_API_KEY`: Your OpenRouter API key
- `OPENROUTER_BASE_URL`: OpenRouter API base URL (usually doesn't need to change)
- `DEFAULT_MODEL`: The AI model to use (default: anthropic/claude-3.5-sonnet)
- `MAX_TOKENS`: Maximum tokens for AI responses (default: 1000)
- `TEMPERATURE`: AI response creativity (0.0-1.0, default: 0.7)

## Available Models

OpenRouter supports many AI models. Some popular options:

- `anthropic/claude-3.5-sonnet` (default)
- `openai/gpt-4`
- `openai/gpt-3.5-turbo`
- `google/gemini-pro`
- `meta-llama/llama-2-70b-chat`

## Troubleshooting

### Common Issues

1. **Server not starting**: Check the console for error messages. Ensure the port is not already in use.
2. **API errors**: Verify your OpenRouter API key is correct and you have sufficient credits. Check the server logs for detailed error messages from the API.
3. **Bad request (400)**: Make sure you are sending a POST request with `Content-Type: application/json` and your request body is valid JSON, like `{"question": "your question"}`.

### Logs

The application provides detailed console logs for debugging. Check the console output for any error messages.

## Contributing

Feel free to submit issues and enhancement requests!

## License

MIT License - see LICENSE file for details.
