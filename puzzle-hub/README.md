# Puzzle Hub

A unified web application that combines Spelling Bee, Yohaku mathematical puzzles, and an AI-powered Writing Coach in one comprehensive learning platform.

## 🎮 Features

### 🐝 Spelling Bee Game
- **Age-appropriate word generation** (6-18 years)
- **Audio pronunciation support** with text-to-speech
- **Helpful hints and definitions** powered by AI
- **Adaptive difficulty adjustment** based on performance
- **Timed challenges** with customizable durations
- **Progress tracking** and streak counters
- **Theme selection** (animals, science, nature, etc.)

### 🧮 Yohaku Math Puzzles
- **Progressive difficulty system** with 10 levels per game
- **Customizable number ranges** (user-defined min/max values)
- **Multiple operations** (addition, subtraction, multiplication)
- **Dynamic grid sizes** (2x2 for levels 1-8, 3x3 for levels 9-10)
- **Smart timer system** (adjusts based on difficulty)
- **Comprehensive scoring** with level bonuses
- **Hint system** for stuck players
- **Real-time validation** with immediate feedback

### ✍️ Writing Coach (NEW!)
- **AI-powered writing analysis** using Perplexity or OpenAI
- **Grammar error detection** with one-click fixes
- **Vocabulary enhancement** suggestions
- **Context improvement** recommendations
- **Narrative structure analysis** with detailed feedback
- **Grade-level appropriate** feedback (1-12)
- **Visual highlighting** of applied fixes in the text
- **Persistent fix tracking** across navigation
- **Overall writing rating** (1-5 scale)
- **Comprehensive summary** with actionable insights

## 🚀 Quick Start

1. **Clone and setup:**
   ```bash
   cd puzzle-hub
   go mod tidy
   ```

2. **Set up environment variables:**
   ```bash
   # Set your API key and provider
   export PERPLEXITY_API_KEY=your_perplexity_key_here
   export AI_PROVIDER=perplexity
   export PORT=8995
   ```

3. **Run the application:**
   ```bash
   go run main.go
   ```
   
   Or use the startup script:
   ```bash
   ./startup.sh 8995
   ```

4. **Open your browser:**
   ```
   http://localhost:8995
   ```

## 🔧 Environment Variables

Create a `.env` file or set environment variables:

```env
# AI Provider (openai or perplexity) - REQUIRED
AI_PROVIDER=perplexity

# API Keys (one required based on provider)
OPENAI_API_KEY=your_openai_key_here
PERPLEXITY_API_KEY=your_perplexity_key_here

# Server Port (optional, defaults to 8080)
PORT=8995

# Gin Mode (optional, defaults to debug)
GIN_MODE=release
```

## 🎯 Game Selection Interface

The application features a beautiful home screen where users can:

- **Choose between three learning tools**: Spelling Bee, Yohaku puzzles, and Writing Coach
- **View interactive previews** and feature highlights
- **Access comprehensive settings** for each tool
- **Track progress** and view statistics
- **Seamless navigation** between different learning modes

### 🐝 Spelling Bee Features:
- Interactive word spelling with audio pronunciation
- Age-based difficulty adjustment (6-18 years)
- Theme selection (animals, science, nature, geography, etc.)
- Real-time scoring and streak tracking
- Progress visualization with performance metrics
- Hint system with definitions and usage examples

### 🧮 Yohaku Features:
- Mathematical grid puzzles with progressive difficulty
- **NEW**: User-customizable number ranges (e.g., 11-20, 50-100)
- **NEW**: 10-puzzle game sessions with increasing challenge
- Timer-based challenges with adaptive durations
- Comprehensive hint system with step-by-step guidance
- Solution validation with detailed feedback
- Scoring system with level and difficulty bonuses

### ✍️ Writing Coach Features:
- **AI-powered analysis** for grammar, vocabulary, and style
- **Visual highlighting** of applied grammar fixes
- **Persistent improvements** that stay highlighted across navigation
- **Grade-level targeting** (1st-12th grade appropriate feedback)
- **Narrative structure analysis** with story arc feedback
- **One-click grammar fixes** that update your text instantly
- **Comprehensive reporting** with overall ratings and suggestions

## 🛠 Technology Stack

- **Backend:** Go 1.21+ with Gin framework
- **Frontend:** HTML5, CSS3, JavaScript (ES6+)
- **Styling:** Bootstrap 5 + Custom CSS with animations
- **AI Integration:** OpenAI GPT-4 or Perplexity API
- **Storage:** Local file-based caching + browser localStorage
- **Deployment:** Render, Heroku, or any Go-compatible platform

## 📁 File Structure

```
puzzle-hub/
├── main.go              # Main server application with unified logic
├── templates/
│   └── index.html       # Unified HTML template with all games
├── static/
│   ├── app.js          # Unified JavaScript with all game logic
│   └── style.css       # Unified styling with game-specific themes
├── cache/              # Generated puzzle cache directory
├── startup.sh          # Deployment startup script
├── Procfile           # Heroku/Render deployment config
├── go.mod             # Go dependencies
├── go.sum             # Go dependency checksums
├── .env.example       # Environment template
└── README.md          # This file
```

## 🔌 API Endpoints

### Spelling Bee
- `POST /api/spelling/generate` - Generate spelling problems
- `POST /api/spelling/generate-for-age` - Generate age-appropriate problems

### Yohaku
- `POST /api/yohaku/generate` - Generate single Yohaku puzzle
- `POST /api/yohaku/start-game` - **NEW**: Start 10-puzzle progressive game
- `POST /api/yohaku/validate` - Validate puzzle solution
- `POST /api/yohaku/hint` - Get puzzle hint

### Writing Coach
- `POST /api/writing/analyze` - **NEW**: Analyze writing with AI feedback

## 🎨 New Features Highlights

### 🔥 Writing Coach Improvements
- **Visual Fix Highlighting**: Applied grammar fixes are highlighted in green with smooth animations
- **Persistent Highlights**: Fixes remain highlighted when navigating between form and results
- **Smart Navigation**: "Back to Form" preserves your fixes, "Show Previous Analysis" button for easy access
- **Enhanced Error Handling**: Robust timeout handling and retry logic for AI API calls
- **Grade-Level Targeting**: Feedback tailored to specific grade levels (1-12)

### 🎯 Yohaku Enhancements
- **Custom Number Ranges**: Set your own min/max values (e.g., 11-20, 50-100) that persist across all 10 puzzles
- **Progressive Game Sessions**: 10 puzzles with increasing difficulty and grid sizes
- **Smart Difficulty Scaling**: Automatic progression from 2x2 to 3x3 grids
- **Enhanced Scoring**: Level bonuses and difficulty multipliers
- **Improved Timer System**: Adaptive timing based on puzzle complexity

### 🐝 Spelling Bee Refinements
- **Better Audio Integration**: Improved text-to-speech pronunciation
- **Enhanced Hint System**: More contextual and helpful hints
- **Performance Optimizations**: Faster loading and smoother gameplay

## 🚀 Development

To run in development mode:

```bash
# Install dependencies
go mod tidy

# Run with environment variables
PERPLEXITY_API_KEY=your_key AI_PROVIDER=perplexity PORT=8995 go run main.go

# Or use the startup script
chmod +x startup.sh
./startup.sh 8995
```

### Development Tips:
- Use `GIN_MODE=debug` for detailed request logging
- The application supports hot-reloading with tools like `air`
- All static files are served from the `/static` directory
- Template changes require server restart

## 🌐 Deployment

### Render Deployment:
1. Connect your GitHub repository
2. Set build command: `go build -o main .`
3. Set start command: `./startup.sh`
4. Add environment variables in Render dashboard

### Heroku Deployment:
```bash
# Use the included Procfile
git push heroku main
```

### Manual Deployment:
```bash
# Build binary
go build -o puzzle-hub main.go

# Run with environment variables
PERPLEXITY_API_KEY=your_key ./puzzle-hub
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Test thoroughly across all three games
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Submit a pull request

### Development Guidelines:
- Follow Go best practices and conventions
- Maintain consistent JavaScript coding style
- Test all features across different browsers
- Ensure mobile responsiveness
- Add appropriate error handling

## 📄 License

This project is open source and available under the MIT License with AI-generated code disclosure.

**⚠️ AI Code Notice**: This software contains code generated with AI assistance (Claude/Anthropic). All AI-generated code has been reviewed and approved by human developers. See [LICENSE](../LICENSE) and [AI_CODE_DISCLOSURE.md](../AI_CODE_DISCLOSURE.md) for full legal details.

## 🎯 Roadmap

### Upcoming Features:
- **Multi-language support** for international users
- **User accounts and progress sync** across devices
- **Advanced analytics** and learning insights
- **Collaborative features** for classroom use
- **Mobile app** versions for iOS and Android
- **Additional puzzle types** and learning games

### Technical Improvements:
- **Database integration** for persistent storage
- **Real-time multiplayer** capabilities
- **Advanced caching** strategies
- **Performance optimizations** for large-scale deployment
- **Comprehensive testing** suite with automated CI/CD

---

**Built with ❤️ using Go, JavaScript, and AI assistance**