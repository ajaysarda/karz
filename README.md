# 🎮 Karz - Educational Games Collection

A collection of educational games built with Go, featuring web interfaces and engaging gameplay.

## 🎯 Games

### 🎮 Puzzle Hub (NEW!)
**A unified web application combining both games in one interface!**

Features:
- 🏠 Beautiful home screen with game selection
- 🐝 **Spelling Bee Game**: AI-powered word generation with age-appropriate content
- 🧮 **Yohaku Math Puzzles**: Grid-based mathematical challenges
- 👤 Player profiles and progress tracking
- 📊 Statistics and achievements
- 🎨 Modern, responsive design
- ⚡ Fast startup with fallback mode

**Location**: `puzzle-hub/` - **⭐ Recommended way to play!**

### 🐝 Spelling Bee (Standalone)
An AI-powered spelling bee game with:
- Age-appropriate word generation using Perplexity API
- Timer functionality with visual countdown
- Progress tracking and difficulty adjustment
- Responsive web interface

**Location**: `spelling-bee/`

### 🧮 Yohaku (Standalone)
A mathematical puzzle game featuring:
- Addition, subtraction, multiplication operations
- Configurable number ranges
- Grid-based puzzle solving (2x2, 3x3, etc.)
- Timer functionality (30 seconds default)

**Location**: `yohaku/`

## 🚀 Quick Start

### 🎮 Puzzle Hub (Recommended)
The unified application with both games in one beautiful interface:

```bash
cd puzzle-hub/
./startup.sh 8995
# Or with API key for better content:
PERPLEXITY_API_KEY=your_key AI_PROVIDER=perplexity ./startup.sh 8995
```

Then visit: **http://localhost:8995**

### Individual Games
Each game is also available as a standalone application:

```bash
# For Spelling Bee
cd spelling-bee/
go run .

# For Yohaku
cd yohaku/
go run .
```

## 🛠️ Technology Stack

- **Backend**: Go (Golang)
- **Frontend**: HTML, CSS, JavaScript
- **Framework**: Gin Web Framework
- **Deployment**: Docker, Render

## 📁 Project Structure

```
karz/
├── puzzle-hub/           # 🎮 UNIFIED GAME HUB (Recommended!)
│   ├── main.go          # Combined server with both games
│   ├── startup.sh       # Easy startup script
│   ├── static/          # Unified CSS/JS
│   ├── templates/       # Beautiful game selection UI
│   ├── cache/           # AI-generated content cache
│   └── README.md
├── spelling-bee/         # 🐝 Standalone spelling bee game
│   ├── main.go
│   ├── static/
│   ├── templates/
│   └── README.md
├── yohaku/              # 🧮 Standalone mathematical puzzle game
│   ├── main.go
│   ├── static/
│   ├── templates/
│   └── README.md
└── README.md           # This file
```

## 🎮 Game Features

### Common Features
- ⏱️ Timer functionality
- 📱 Responsive design
- 🎯 Progress tracking
- 🔧 Configurable settings

### Spelling Bee Specific
- 🤖 AI-powered word generation
- 📚 Age-appropriate content
- 🎵 Pronunciation support
- 💾 Caching system

### Yohaku Specific
- 🧮 Multiple math operations
- 📊 Configurable difficulty
- 🎲 Random puzzle generation
- 🏆 Score tracking

## 🚀 Deployment

Both games support:
- Local development
- Docker containerization
- Cloud deployment (Render, Heroku, etc.)

See individual game READMEs for specific deployment instructions.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## 📝 License & Legal

This project is open source and available under the MIT License with AI-generated code disclosure.

### Important Legal Documents
- **[LICENSE](LICENSE)** - MIT License with AI code generation terms
- **[AI_CODE_DISCLOSURE.md](AI_CODE_DISCLOSURE.md)** - Detailed AI assistance disclosure
- **Third-party licenses** - See individual dependency documentation

### AI Code Generation Notice
⚠️ **This software contains code generated with AI assistance.** All AI-generated code has been reviewed, tested, and approved by human developers. The human author takes full responsibility for all code functionality and quality.

### Legal Compliance
- ✅ MIT License with AI disclosure clauses
- ✅ Full transparency about AI tool usage
- ✅ Human oversight and responsibility maintained
- ✅ Third-party dependency compliance
- ✅ Export control considerations addressed
