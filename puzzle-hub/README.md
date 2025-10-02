# Puzzle Hub

A unified web application that combines both Spelling Bee and Yohaku mathematical puzzle games in one interface.

## Features

### 🐝 Spelling Bee Game
- Age-appropriate word generation (6-18 years)
- Audio pronunciation support
- Helpful hints and definitions
- Adaptive difficulty adjustment
- Timed challenges
- Progress tracking

### 🧮 Yohaku Math Puzzles
- Grid-based mathematical puzzles
- Multiple operations (addition, subtraction, multiplication)
- Adjustable grid sizes (2x2, 3x3, 4x4)
- Difficulty levels (Easy, Medium, Hard)
- Timer challenges
- Hint system

## Quick Start

1. **Clone and setup:**
   ```bash
   cd puzzle-hub
   go mod tidy
   ```

2. **Set up environment variables:**
   ```bash
   cp .env.example .env
   # Edit .env with your API keys
   ```

3. **Run the application:**
   ```bash
   go run main.go
   ```

4. **Open your browser:**
   ```
   http://localhost:8080
   ```

## Environment Variables

Create a `.env` file with the following variables:

```env
# AI Provider (openai or perplexity)
AI_PROVIDER=perplexity

# API Keys (only one needed based on provider)
OPENAI_API_KEY=your_openai_key_here
PERPLEXITY_API_KEY=your_perplexity_key_here

# Server Port (optional, defaults to 8080)
PORT=8080
```

## Game Selection Interface

The application features a beautiful home screen where users can:

- **Choose between Spelling Bee and Yohaku puzzles**
- **View game previews and features**
- **Track progress and statistics**
- **Manage player profiles**

### Spelling Bee Features:
- Interactive word spelling with audio
- Age-based difficulty adjustment
- Theme selection (animals, science, nature, etc.)
- Real-time scoring and streak tracking
- Progress visualization

### Yohaku Features:
- Mathematical grid puzzles
- Customizable settings (grid size, operation, difficulty)
- Timer-based challenges
- Hint system
- Solution validation

## Technology Stack

- **Backend:** Go with Gin framework
- **Frontend:** HTML5, CSS3, JavaScript (ES6+)
- **Styling:** Bootstrap 5 + Custom CSS
- **AI Integration:** OpenAI GPT-4 or Perplexity API
- **Storage:** Local storage for progress tracking

## File Structure

```
puzzle-hub/
├── main.go              # Main server application
├── templates/
│   └── index.html       # Unified HTML template
├── static/
│   ├── app.js          # Unified JavaScript
│   └── style.css       # Unified styling
├── cache/              # Generated puzzle cache
├── go.mod              # Go dependencies
├── .env.example        # Environment template
└── README.md           # This file
```

## API Endpoints

### Spelling Bee
- `POST /api/spelling/generate` - Generate spelling problems
- `POST /api/spelling/generate-for-age` - Generate age-appropriate problems

### Yohaku
- `POST /api/yohaku/generate` - Generate Yohaku puzzle
- `POST /api/yohaku/validate` - Validate puzzle solution
- `POST /api/yohaku/hint` - Get puzzle hint

## Development

To run in development mode:

```bash
# Install dependencies
go mod tidy

# Run with auto-reload (if you have air installed)
air

# Or run directly
go run main.go
```

## Deployment

The application can be deployed to any platform that supports Go applications:

- **Heroku:** Use the included Procfile
- **Railway:** Direct deployment from Git
- **Docker:** Build container with Go runtime
- **VPS:** Direct binary deployment

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is open source and available under the MIT License with AI-generated code disclosure.

**⚠️ AI Code Notice**: This software contains code generated with AI assistance (Claude/Anthropic). All AI-generated code has been reviewed and approved by human developers. See [LICENSE](../LICENSE) and [AI_CODE_DISCLOSURE.md](../AI_CODE_DISCLOSURE.md) for full legal details.
