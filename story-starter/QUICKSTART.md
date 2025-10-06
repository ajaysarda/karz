# Story Starter Generator - Quick Start Guide 🚀

Get your creative writing app up and running in 5 minutes!

## Step 1: Get Your Perplexity API Key 🔑

1. Go to [Perplexity AI](https://www.perplexity.ai/)
2. Sign up or log in
3. Navigate to API settings
4. Generate a new API key
5. Copy the key (you'll need it in Step 3)

## Step 2: Set Up the App 📦

```bash
cd story-starter
```

## Step 3: Configure Your API Key 🔧

**Option A: Use the start script (Easiest)**
```bash
./start.sh
```
The script will create a `.env` file and prompt you to add your API key.

**Option B: Manual setup**
```bash
# Copy the example environment file
cp env.example .env

# Edit the .env file and add your API key
# Change this line:
# PERPLEXITY_API_KEY=your_perplexity_api_key_here
# To:
# PERPLEXITY_API_KEY=your_actual_key_here
```

## Step 4: Run the App 🎨

**Option A: Using the start script**
```bash
./start.sh
```

**Option B: Using Go directly**
```bash
go run main.go
```

## Step 5: Open in Browser 🌐

Open your web browser and go to:
```
http://localhost:8080
```

## What You Can Do Now 🎉

### Generate Story Starters
1. Click on "Story Starter" tab
2. Choose a genre (adventure, fantasy, mystery, etc.)
3. Pick a tone (funny, exciting, mysterious)
4. Click on fun elements like "🐉 Dragon" or "✨ Magic"
5. Click "Generate Story Starter!"

### Create Characters
1. Click on "Character" tab
2. Choose character type (hero, villain, magical creature)
3. Pick personality traits
4. Generate your character!

### Build Plots
1. Click on "Plot" tab
2. Select genre and story length
3. Get a complete story outline!

### Generate Twists
1. Click on "Twist" tab
2. Choose your genre
3. Get surprising plot twist ideas!

### Design Settings
1. Click on "Setting" tab
2. Pick a location type
3. Choose the atmosphere
4. Get vivid world descriptions!

### Save Favorites
- Click the ❤️ button on any generated content
- Access your favorites in the "Favorites" tab
- View, copy, or delete saved ideas

## Tips for Best Results 💡

1. **Mix and Match**: Combine different elements for unique stories
2. **Be Specific**: The more details you provide, the better the results
3. **Save Everything**: Save ideas you like - you never know when you'll use them!
4. **Experiment**: Try different genres and combinations
5. **Have Fun**: There's no wrong way to be creative!

## Troubleshooting 🔧

### App won't start
- Make sure Go is installed: `go version`
- Check that your API key is correctly set in `.env`
- Verify port 8080 is not already in use

### No content appears
- Check your internet connection
- Verify your API key is valid
- Look at the terminal for error messages

### Can't save favorites
- Make sure your browser allows localStorage
- Try a different browser (Chrome, Firefox, Safari)

## Next Steps 🎯

1. **Start Writing**: Use the prompts to begin your story!
2. **Customize**: Edit the generated ideas to make them your own
3. **Share**: Read your stories to family and friends
4. **Keep Creating**: Generate new ideas every day!

## Need Help? 🆘

- Check the main [README.md](README.md) for detailed documentation
- Look at the terminal output for error messages
- Make sure all prerequisites are installed

## Have Fun Writing! ✨

Remember: The AI is here to help you be MORE creative, not less! Use these ideas as starting points, then add your own imagination to make them uniquely yours!

Happy storytelling! 📚✨

