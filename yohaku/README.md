# 🧮 Yohaku - Mathematical Puzzle Game

A web-based mathematical puzzle game built with Go, featuring grid-based arithmetic challenges with configurable difficulty levels and timer functionality.

## 🎯 What is Yohaku?

Yohaku is a mathematical puzzle game where players fill in missing numbers in a grid so that each row and column equals the target sum shown at the edges. It's similar to Sudoku but focuses on arithmetic operations.

## ✨ Features

- **Multiple Operations**: Addition, subtraction, and multiplication puzzles
- **Configurable Grid Sizes**: 2x2, 3x3, and 4x4 grids
- **Difficulty Levels**: Easy, medium, and hard puzzles
- **Timer Functionality**: Configurable timer (10-300 seconds)
- **Number Range Control**: Set min/max numbers for puzzles
- **Responsive Design**: Works on desktop, tablet, and mobile
- **Real-time Validation**: Check your solution anytime
- **Hint System**: Get helpful hints when stuck

## 🚀 Quick Start

### Prerequisites
- Go 1.23 or higher

### Installation
```bash
# Navigate to the yohaku directory
cd yohaku/

# Install dependencies
go mod tidy

# Run the game
go run .
```

The game will be available at `http://localhost:8080`

## 🎮 How to Play

1. **Choose Settings**: Select grid size, operation, difficulty, and timer duration
2. **Start Game**: Click "New Game" to generate a puzzle
3. **Fill the Grid**: Enter numbers in the empty cells
4. **Check Solution**: Click "Check" to validate your answer
5. **Use Hints**: Click "Hint" if you need help

### Game Rules

- Fill empty cells with numbers within the specified range
- Each row must equal the sum shown at the right edge
- Each column must equal the sum shown at the bottom edge
- Use the specified operation (addition, subtraction, or multiplication)
- Complete the puzzle before time runs out

## 🛠️ Configuration

### Game Settings

| Setting | Options | Description |
|---------|---------|-------------|
| Grid Size | 2x2, 3x3, 4x4 | Size of the puzzle grid |
| Operation | Addition, Subtraction, Multiplication | Mathematical operation to use |
| Difficulty | Easy, Medium, Hard | Number of cells to hide |
| Timer | 10-300 seconds | Time limit for solving |
| Number Range | Min: 1-50, Max: 2-100 | Range of numbers in puzzle |

### Difficulty Levels

- **Easy**: 1/3 of cells hidden
- **Medium**: 1/2 of cells hidden  
- **Hard**: 2/3 of cells hidden

## 🏗️ Project Structure

```
yohaku/
├── main.go              # Main Go application
├── go.mod              # Go module dependencies
├── templates/          # HTML templates
│   └── index.html      # Main game interface
├── static/             # Static assets
│   ├── app.js          # Game logic JavaScript
│   └── style.css       # Game styles
└── README.md           # This file
```

## 🔧 API Endpoints

### POST /api/generate
Generate a new puzzle with specified settings.

**Request Body:**
```json
{
  "timerDuration": 30,
  "size": 2,
  "operation": "addition",
  "range": {"min": 1, "max": 10},
  "difficulty": "easy"
}
```

### POST /api/validate
Validate a puzzle solution.

**Request Body:**
```json
{
  "puzzleId": "yohaku_123456789",
  "grid": [[...], [...]]
}
```

### POST /api/hint
Get a hint for the current puzzle.

**Request Body:**
```json
{
  "puzzleId": "yohaku_123456789"
}
```

## 🎨 Customization

### Styling
Edit `static/style.css` to customize the game appearance:
- Colors and themes
- Grid cell sizes
- Timer appearance
- Responsive breakpoints

### Game Logic
Modify `main.go` to adjust:
- Puzzle generation algorithms
- Difficulty calculations
- Validation logic
- Hint system

## 🚀 Deployment

### Local Development
```bash
go run .
```

### Docker
```bash
# Build image
docker build -t yohaku .

# Run container
docker run -p 8080:8080 yohaku
```

### Cloud Deployment
The game can be deployed to any cloud platform that supports Go applications:
- Render
- Heroku
- Google Cloud Run
- AWS Lambda

## 🧪 Testing

### Manual Testing
1. Start the application
2. Try different grid sizes and operations
3. Test timer functionality
4. Validate solution checking
5. Test responsive design on mobile

### Automated Testing
```bash
go test ./...
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📝 License

This project is open source and available under the MIT License.

## 🎯 Future Enhancements

- [ ] Score tracking and leaderboards
- [ ] Multiple puzzle types (division, mixed operations)
- [ ] Puzzle sharing functionality
- [ ] Progressive difficulty system
- [ ] Achievement system
- [ ] Multiplayer mode
- [ ] Puzzle generator improvements
- [ ] Better hint system
- [ ] Sound effects and animations
- [ ] Dark mode theme

## 🐛 Known Issues

- Solution validation is currently simplified
- Hint system provides generic hints
- No persistent score tracking

## 📞 Support

For issues, questions, or contributions, please create an issue in the repository.
