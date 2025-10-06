# Story Starter Generator 📚✨

A creative writing app for 4th graders powered by Perplexity Pro AI! Generate story prompts, characters, plots, twists, and settings to inspire young writers.

## Features

🎨 **Story Starters** - Get exciting story openings with plot ideas and writing tips
👤 **Character Creator** - Generate unique, relatable characters with backstories
📖 **Plot Builder** - Create structured story outlines from beginning to end
🌪️ **Plot Twist Generator** - Add surprising twists to make stories more exciting
🗺️ **Setting Designer** - Build vivid, immersive story worlds
❤️ **Favorites** - Save your favorite ideas for later

## Tech Stack

- **Backend**: Go (Gin framework)
- **AI**: Perplexity Pro API
- **Frontend**: HTML5, CSS3, JavaScript (Bootstrap 5)
- **Storage**: LocalStorage for favorites

## Prerequisites

- Go 1.21 or higher
- Perplexity Pro API key

## Installation

1. **Clone the repository**
   ```bash
   cd story-starter
   ```

2. **Install dependencies**
   ```bash
   go mod download
   ```

3. **Set up environment variables**
   ```bash
   cp env.example .env
   ```
   
   Edit `.env` and add your Perplexity API key:
   ```
   PERPLEXITY_API_KEY=your_actual_api_key_here
   PORT=8080
   ```

4. **Run the application**
   ```bash
   go run main.go
   ```

5. **Open your browser**
   Navigate to `http://localhost:8080`

## Usage

### Story Starter
1. Select a genre (adventure, fantasy, mystery, etc.)
2. Choose a tone (funny, exciting, mysterious, etc.)
3. Click on element chips to add fun story elements
4. Click "Generate Story Starter!"

### Character Creator
1. Choose character type (hero, villain, magical creature, etc.)
2. Select personality traits
3. Generate your unique character!

### Plot Builder
1. Select genre and story length
2. Get a complete plot outline
3. Use it as a roadmap for your story

### Plot Twist
1. Choose your story genre
2. Get surprising twist ideas
3. Learn how to build up to the twist

### Setting Designer
1. Pick a setting type (magical forest, space station, etc.)
2. Choose the atmosphere
3. Get vivid descriptions using all 5 senses

### Favorites
- Click the ❤️ button on any generated content to save it
- Access all your favorites in the Favorites tab
- View, copy, or delete saved ideas anytime

## API Endpoints

- `GET /` - Main application page
- `POST /api/generate` - Generate story content
- `GET /health` - Health check endpoint

## Development

### Project Structure
```
story-starter/
├── main.go              # Main application and API handlers
├── templates/
│   └── index.html       # Main HTML template
├── static/
│   ├── app.js          # Frontend JavaScript
│   └── style.css       # Custom styling
├── cache/              # Cache directory (auto-created)
├── go.mod              # Go dependencies
├── .env               # Environment variables (create from env.example)
└── README.md          # This file
```

### Adding New Features

1. **New Generation Type**: 
   - Add case in `buildPrompt()` in `main.go`
   - Add tab in `index.html`
   - Add form handler in `app.js`

2. **New Story Elements**:
   - Add chips in the HTML template
   - They'll automatically be picked up by the JavaScript

## Tips for Young Writers

- **Be Creative**: Don't worry about being perfect - just have fun!
- **Mix and Match**: Combine different generated ideas to create something unique
- **Add Your Own Touch**: Use AI ideas as starting points, then make them your own
- **Practice Daily**: Try generating and writing something new every day
- **Share Your Stories**: Read your stories to family and friends

## Troubleshooting

**App won't start**
- Make sure Go is installed: `go version`
- Check that PERPLEXITY_API_KEY is set in .env
- Verify port 8080 is not in use

**No content generated**
- Check your Perplexity API key is valid
- Ensure you have internet connection
- Look at console logs for errors

**Favorites not saving**
- Check browser localStorage is enabled
- Try a different browser
- Clear browser cache and retry

## License

See the LICENSE file in the parent directory.

## Credits

Built with ❤️ for young writers everywhere!

Powered by:
- Perplexity Pro AI
- Go & Gin Framework
- Bootstrap 5
- Font Awesome Icons

## Future Enhancements

- [ ] Export stories to PDF
- [ ] Share stories with friends
- [ ] Story writing challenges
- [ ] Progress tracking and achievements
- [ ] Collaborative story writing
- [ ] Voice narration of prompts
- [ ] Illustration suggestions

---

**Happy Writing! 📝✨**

