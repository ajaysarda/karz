package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math/rand"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
	"github.com/sashabaranov/go-openai"
)

// Spelling Bee Types
type DifficultyLevel string

const (
	Elementary   DifficultyLevel = "elementary"
	Middle       DifficultyLevel = "middle"
	Intermediate DifficultyLevel = "intermediate"
	Advanced     DifficultyLevel = "advanced"
)

type SpellingProblem struct {
	Word          string   `json:"word"`
	Definition    string   `json:"definition"`
	Sentence      string   `json:"sentence"`
	Difficulty    string   `json:"difficulty"`
	AgeGroup      string   `json:"age_group"`
	Hints         []string `json:"hints"`
	PhoneticGuide string   `json:"phonetic,omitempty"`
}

type GenerationCriteria struct {
	DifficultyLevel  string `json:"difficulty_level"`
	AgeGroup         string `json:"age_group"`
	WordCount        int    `json:"word_count"`
	Theme            string `json:"theme,omitempty"`
	IncludePhonetics bool   `json:"include_phonetics"`
	IncludeHints     bool   `json:"include_hints"`
}

type ProblemCache struct {
	Problems []SpellingProblem `json:"problems"`
	Metadata struct {
		GeneratedAt time.Time          `json:"generated_at"`
		Criteria    GenerationCriteria `json:"criteria"`
		Source      string             `json:"source"`
	} `json:"metadata"`
}

// Yohaku Types
type YohakuPuzzle struct {
	ID         string      `json:"id"`
	Size       int         `json:"size"`
	Grid       [][]Cell    `json:"grid"`
	Solution   [][]int     `json:"solution"`
	Operation  string      `json:"operation"`
	Range      NumberRange `json:"range"`
	Difficulty string      `json:"difficulty"`
	Level      int         `json:"level"` // Puzzle number in sequence (1-10)
	Score      int         `json:"score"` // Points for solving this puzzle
}

type YohakuGameSession struct {
	ID             string         `json:"id"`
	Puzzles        []YohakuPuzzle `json:"puzzles"`
	CurrentPuzzle  int            `json:"currentPuzzle"`
	TotalScore     int            `json:"totalScore"`
	CompletedCount int            `json:"completedCount"`
	StartTime      time.Time      `json:"startTime"`
	Settings       GameSettings   `json:"settings"`
}

type Cell struct {
	Value   int    `json:"value"`
	IsGiven bool   `json:"isGiven"`
	IsSum   bool   `json:"isSum"`
	SumType string `json:"sumType"`
}

type NumberRange struct {
	Min int `json:"min"`
	Max int `json:"max"`
}

type GameSettings struct {
	TimerDuration int         `json:"timerDuration"`
	Size          int         `json:"size"`
	Operation     string      `json:"operation"`
	Range         NumberRange `json:"range"`
	Difficulty    string      `json:"difficulty"`
}

// Unified Generator
type PuzzleHub struct {
	OpenAIClient    *openai.Client
	PerplexityKey   string
	Provider        string
	HTTPClient      *http.Client
	CacheDir        string
	TotalCost       float64
	YohakuGenerator *YohakuGenerator
}

type YohakuGenerator struct {
	rand *rand.Rand
}

// Perplexity API types
type PerplexityRequest struct {
	Model    string    `json:"model"`
	Messages []Message `json:"messages"`
}

type Message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type PerplexityResponse struct {
	ID      string `json:"id"`
	Object  string `json:"object"`
	Created int64  `json:"created"`
	Model   string `json:"model"`
	Choices []struct {
		Index   int `json:"index"`
		Message struct {
			Role    string `json:"role"`
			Content string `json:"content"`
		} `json:"message"`
		FinishReason string `json:"finish_reason"`
	} `json:"choices"`
	Usage struct {
		PromptTokens     int `json:"prompt_tokens"`
		CompletionTokens int `json:"completion_tokens"`
		TotalTokens      int `json:"total_tokens"`
	} `json:"usage"`
}

// NewPuzzleHub creates a new unified puzzle generator
func NewPuzzleHub(provider string) (*PuzzleHub, error) {
	cacheDir := "cache"
	if err := os.MkdirAll(cacheDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create cache directory: %v", err)
	}

	hub := &PuzzleHub{
		Provider: provider,
		CacheDir: cacheDir,
		HTTPClient: &http.Client{
			Timeout: 30 * time.Second,
		},
		YohakuGenerator: &YohakuGenerator{
			rand: rand.New(rand.NewSource(time.Now().UnixNano())),
		},
	}

	if provider == "openai" {
		apiKey := os.Getenv("OPENAI_API_KEY")
		if apiKey == "" {
			return nil, fmt.Errorf("OPENAI_API_KEY environment variable is required")
		}
		hub.OpenAIClient = openai.NewClient(apiKey)
	} else if provider == "perplexity" {
		apiKey := os.Getenv("PERPLEXITY_API_KEY")
		if apiKey == "" {
			return nil, fmt.Errorf("PERPLEXITY_API_KEY environment variable is required")
		}
		hub.PerplexityKey = apiKey
	} else if provider == "fallback" {
		// Fallback mode - no API keys required, will use fallback data
		log.Println("Running in fallback mode - no API keys required")
	} else {
		return nil, fmt.Errorf("provider must be 'openai', 'perplexity', or 'fallback'")
	}

	return hub, nil
}

// Spelling Bee Methods
func (h *PuzzleHub) GenerateSpellingProblems(criteria GenerationCriteria) ([]SpellingProblem, error) {
	log.Printf("🎯 Generating %d spelling problems for age %s, difficulty %s, theme %s",
		criteria.WordCount, criteria.AgeGroup, criteria.DifficultyLevel, criteria.Theme)

	// Try to load from cache first
	if cachedProblems, err := h.loadFromCache(criteria); err == nil {
		var filteredProblems []SpellingProblem
		for _, problem := range cachedProblems {
			if len(problem.Word) >= 6 {
				filteredProblems = append(filteredProblems, problem)
			}
		}

		if len(filteredProblems) >= criteria.WordCount {
			if len(filteredProblems) > criteria.WordCount {
				filteredProblems = filteredProblems[:criteria.WordCount]
			}
			log.Printf("✅ Using %d cached problems", len(filteredProblems))
			return filteredProblems, nil
		}
	}

	prompt := h.buildSpellingPrompt(criteria)

	var response string
	var err error
	var source string

	if h.Provider == "openai" {
		log.Printf("🔵 Using OpenAI API")
		response, err = h.generateWithOpenAI(prompt)
		source = "api"
	} else if h.Provider == "perplexity" {
		log.Printf("🟣 Using Perplexity API")
		response, err = h.generateWithPerplexity(prompt)
		source = "api"
	} else {
		log.Printf("🔄 Using fallback mode")
		problems := h.generateFallbackSpellingProblems(criteria)
		source = "fallback"
		log.Printf("✅ Successfully generated %d fallback problems", len(problems))
		return problems, nil
	}

	if err != nil {
		log.Printf("❌ AI generation failed: %v", err)
		problems := h.generateFallbackSpellingProblems(criteria)
		source = "fallback"

		if saveErr := h.saveToCache(problems, criteria, source); saveErr != nil {
			log.Printf("⚠️  Failed to save fallback to cache: %v", saveErr)
		}

		log.Printf("✅ Successfully generated %d fallback problems", len(problems))
		return problems, nil
	}

	problems, err := h.parseSpellingResponse(response, criteria)
	if err != nil {
		log.Printf("⚠️  Failed to parse AI response: %v", err)
		problems = h.generateFallbackSpellingProblems(criteria)
		source = "fallback"
	} else {
		if saveErr := h.saveToCache(problems, criteria, source); saveErr != nil {
			log.Printf("⚠️  Failed to save to cache: %v", saveErr)
		}
	}

	log.Printf("✅ Successfully generated %d problems", len(problems))
	return problems, nil
}

func (h *PuzzleHub) buildSpellingPrompt(criteria GenerationCriteria) string {
	theme := criteria.Theme
	if theme == "" {
		theme = "general"
	}

	phonetics := ""
	if criteria.IncludePhonetics {
		phonetics = "Include phonetic pronunciation for each word."
	}

	hints := ""
	if criteria.IncludeHints {
		hints = "Include helpful spelling hints for each word."
	}

	return fmt.Sprintf(`Generate %d spelling bee problems for %s children with %s difficulty level.

Theme: %s
%s
%s

IMPORTANT: All words must be at least 6 characters long, regardless of difficulty level.

For each word, provide:
1. The word to spell (minimum 6 characters)
2. A clear, age-appropriate definition
3. A sentence using the word
4. Helpful hints for spelling
5. Phonetic pronunciation (if requested)

Format the output as a JSON array where each problem has:
- word: the spelling word (minimum 6 characters)
- definition: clear definition
- sentence: example sentence
- hints: array of spelling hints
- phonetic: phonetic pronunciation (if requested)
- difficulty: the difficulty level
- age_group: target age group

Make sure the words are appropriate for %s and %s level, and ALL words must be at least 6 characters long.`,
		criteria.WordCount, criteria.AgeGroup, criteria.DifficultyLevel, theme, phonetics, hints, criteria.AgeGroup, criteria.DifficultyLevel)
}

func (h *PuzzleHub) generateWithOpenAI(prompt string) (string, error) {
	resp, err := h.OpenAIClient.CreateChatCompletion(
		context.Background(),
		openai.ChatCompletionRequest{
			Model: openai.GPT4,
			Messages: []openai.ChatCompletionMessage{
				{
					Role:    openai.ChatMessageRoleUser,
					Content: prompt,
				},
			},
			Temperature: 0.7,
		},
	)

	if err != nil {
		return "", err
	}

	return resp.Choices[0].Message.Content, nil
}

func (h *PuzzleHub) generateWithPerplexity(prompt string) (string, error) {
	request := PerplexityRequest{
		Model: "sonar",
		Messages: []Message{
			{
				Role:    "user",
				Content: prompt,
			},
		},
	}

	jsonData, err := json.Marshal(request)
	if err != nil {
		return "", fmt.Errorf("failed to marshal request: %v", err)
	}

	req, err := http.NewRequest("POST", "https://api.perplexity.ai/chat/completions", bytes.NewBuffer(jsonData))
	if err != nil {
		return "", fmt.Errorf("failed to create request: %v", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+h.PerplexityKey)

	resp, err := h.HTTPClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("failed to make API call: %v", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("failed to read response: %v", err)
	}

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("API call failed with status %d: %s", resp.StatusCode, string(body))
	}

	var perplexityResp PerplexityResponse
	if err := json.Unmarshal(body, &perplexityResp); err != nil {
		return "", fmt.Errorf("failed to parse response: %v", err)
	}

	if len(perplexityResp.Choices) == 0 {
		return "", fmt.Errorf("no choices in response")
	}

	return perplexityResp.Choices[0].Message.Content, nil
}

func (h *PuzzleHub) parseSpellingResponse(response string, criteria GenerationCriteria) ([]SpellingProblem, error) {
	var jsonStr string

	if strings.Contains(response, "```json") {
		start := strings.Index(response, "```json")
		if start != -1 {
			start += 7
			end := strings.Index(response[start:], "```")
			if end != -1 {
				jsonStr = strings.TrimSpace(response[start : start+end])
			}
		}
	} else if strings.Contains(response, "```") {
		start := strings.Index(response, "```")
		if start != -1 {
			start += 3
			end := strings.Index(response[start:], "```")
			if end != -1 {
				jsonStr = strings.TrimSpace(response[start : start+end])
			}
		}
	} else {
		start := strings.Index(response, "[")
		end := strings.LastIndex(response, "]")
		if start != -1 && end != -1 {
			jsonStr = response[start : end+1]
		}
	}

	if jsonStr == "" {
		return nil, fmt.Errorf("no JSON array found in response")
	}

	var problems []SpellingProblem
	err := json.Unmarshal([]byte(jsonStr), &problems)
	if err != nil {
		return nil, fmt.Errorf("failed to parse JSON: %v", err)
	}

	var filteredProblems []SpellingProblem
	for _, problem := range problems {
		if len(problem.Word) >= 6 {
			filteredProblems = append(filteredProblems, problem)
		}
	}

	return filteredProblems, nil
}

func (h *PuzzleHub) generateFallbackSpellingProblems(criteria GenerationCriteria) []SpellingProblem {
	sampleWords := map[string][]string{
		"elementary":   {"rabbit", "turtle", "butter", "castle", "garden", "pencil", "school", "friend", "family", "mother"},
		"middle":       {"elephant", "bicycle", "mountain", "computer", "adventure", "beautiful", "mystery", "journey", "crystal", "thunder"},
		"intermediate": {"magnificent", "extraordinary", "responsibility", "entrepreneur", "sophisticated", "unprecedented", "revolutionary", "incomprehensible", "pharmaceutical", "psychology"},
		"advanced":     {"pneumonia", "entrepreneur", "conscientious", "acquiesce", "perspicacious", "supercalifragilisticexpialidocious", "pneumonoultramicroscopicsilicovolcanoconiosis", "floccinaucinihilipilification", "antidisestablishmentarianism", "hippopotomonstrosesquippedaliophobia"},
	}

	words := sampleWords[criteria.DifficultyLevel]
	if len(words) == 0 {
		words = sampleWords["middle"]
	}

	var problems []SpellingProblem
	for i, word := range words {
		if i >= criteria.WordCount {
			break
		}

		hints := []string{
			fmt.Sprintf("Starts with %s", strings.ToUpper(string(word[0]))),
			fmt.Sprintf("Has %d letters", len(word)),
		}

		problem := SpellingProblem{
			Word:       word,
			Definition: "A common word in the English language",
			Sentence:   "This word is commonly used in everyday speech.",
			Difficulty: criteria.DifficultyLevel,
			AgeGroup:   criteria.AgeGroup,
			Hints:      hints,
		}

		if criteria.IncludePhonetics {
			problem.PhoneticGuide = fmt.Sprintf("/%s/", word)
		}

		problems = append(problems, problem)
	}

	return problems
}

// Cache methods
func (h *PuzzleHub) getCacheFileName(criteria GenerationCriteria) string {
	return filepath.Join(h.CacheDir, fmt.Sprintf("problems_%s_%s_%s.json",
		criteria.DifficultyLevel, criteria.AgeGroup, criteria.Theme))
}

func (h *PuzzleHub) loadFromCache(criteria GenerationCriteria) ([]SpellingProblem, error) {
	cacheFile := h.getCacheFileName(criteria)

	if _, err := os.Stat(cacheFile); os.IsNotExist(err) {
		return nil, fmt.Errorf("cache file not found")
	}

	data, err := os.ReadFile(cacheFile)
	if err != nil {
		return nil, fmt.Errorf("failed to read cache file: %v", err)
	}

	var cache ProblemCache
	if err := json.Unmarshal(data, &cache); err != nil {
		return nil, fmt.Errorf("failed to parse cache file: %v", err)
	}

	if time.Since(cache.Metadata.GeneratedAt) > 24*time.Hour {
		return nil, fmt.Errorf("cache expired")
	}

	return cache.Problems, nil
}

func (h *PuzzleHub) saveToCache(problems []SpellingProblem, criteria GenerationCriteria, source string) error {
	cacheFile := h.getCacheFileName(criteria)

	var existingCache ProblemCache
	if data, err := os.ReadFile(cacheFile); err == nil {
		json.Unmarshal(data, &existingCache)
	}

	existingWords := make(map[string]bool)
	for _, problem := range existingCache.Problems {
		existingWords[strings.ToLower(problem.Word)] = true
	}

	var newProblems []SpellingProblem
	for _, problem := range problems {
		if !existingWords[strings.ToLower(problem.Word)] {
			newProblems = append(newProblems, problem)
			existingWords[strings.ToLower(problem.Word)] = true
		}
	}

	existingCache.Problems = append(existingCache.Problems, newProblems...)
	existingCache.Metadata.GeneratedAt = time.Now()
	existingCache.Metadata.Criteria = criteria
	existingCache.Metadata.Source = source

	data, err := json.MarshalIndent(existingCache, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal cache data: %v", err)
	}

	return os.WriteFile(cacheFile, data, 0644)
}

// Yohaku Methods
func (h *PuzzleHub) GenerateYohakuPuzzle(settings GameSettings) YohakuPuzzle {
	return h.YohakuGenerator.GeneratePuzzle(settings)
}

func (h *PuzzleHub) GenerateYohakuGameSession(settings GameSettings) YohakuGameSession {
	return h.YohakuGenerator.GenerateGameSession(settings)
}

func (g *YohakuGenerator) GeneratePuzzle(settings GameSettings) YohakuPuzzle {
	return g.GeneratePuzzleWithLevel(settings, 1)
}

func (g *YohakuGenerator) GeneratePuzzleWithLevel(settings GameSettings, level int) YohakuPuzzle {
	puzzle := YohakuPuzzle{
		ID:         fmt.Sprintf("yohaku_%d_%d", time.Now().UnixNano(), level),
		Size:       settings.Size,
		Operation:  settings.Operation,
		Range:      settings.Range,
		Difficulty: settings.Difficulty,
		Level:      level,
		Score:      g.calculateScore(settings, level),
	}

	puzzle.Grid = make([][]Cell, settings.Size+1)
	puzzle.Solution = make([][]int, settings.Size+1)

	for i := range puzzle.Grid {
		puzzle.Grid[i] = make([]Cell, settings.Size+1)
		puzzle.Solution[i] = make([]int, settings.Size+1)
	}

	g.generateSolution(&puzzle, settings)
	g.createPuzzleFromSolution(&puzzle, settings)

	return puzzle
}

func (g *YohakuGenerator) GenerateGameSession(baseSettings GameSettings) YohakuGameSession {
	session := YohakuGameSession{
		ID:             fmt.Sprintf("session_%d", time.Now().UnixNano()),
		Puzzles:        make([]YohakuPuzzle, 10),
		CurrentPuzzle:  0,
		TotalScore:     0,
		CompletedCount: 0,
		StartTime:      time.Now(),
		Settings:       baseSettings,
	}

	// Generate 10 puzzles with progressive difficulty
	for i := 0; i < 10; i++ {
		level := i + 1
		settings := g.getProgressiveSettings(baseSettings, level)
		puzzle := g.GeneratePuzzleWithLevel(settings, level)
		session.Puzzles[i] = puzzle
	}

	return session
}

func (g *YohakuGenerator) getProgressiveSettings(base GameSettings, level int) GameSettings {
	settings := base

	// Progressive difficulty increases
	switch {
	case level <= 3:
		// Levels 1-3: Easy
		settings.Difficulty = "easy"
		settings.Size = 2
		settings.Range = NumberRange{Min: 1, Max: 5}
	case level <= 6:
		// Levels 4-6: Medium
		settings.Difficulty = "medium"
		settings.Size = 2
		settings.Range = NumberRange{Min: 1, Max: 10}
	case level <= 8:
		// Levels 7-8: Hard with 2x2
		settings.Difficulty = "hard"
		settings.Size = 2
		settings.Range = NumberRange{Min: 1, Max: 15}
	case level == 9:
		// Level 9: Medium 3x3
		settings.Difficulty = "medium"
		settings.Size = 3
		settings.Range = NumberRange{Min: 1, Max: 8}
	case level == 10:
		// Level 10: Hard 3x3 (Boss level!)
		settings.Difficulty = "hard"
		settings.Size = 3
		settings.Range = NumberRange{Min: 1, Max: 12}
	}

	// Reduce timer as difficulty increases
	if level <= 3 {
		settings.TimerDuration = 60 // 1 minute for easy
	} else if level <= 6 {
		settings.TimerDuration = 45 // 45 seconds for medium
	} else if level <= 8 {
		settings.TimerDuration = 30 // 30 seconds for hard 2x2
	} else {
		settings.TimerDuration = 90 // More time for 3x3 puzzles
	}

	return settings
}

func (g *YohakuGenerator) calculateScore(settings GameSettings, level int) int {
	baseScore := 100

	// Size multiplier
	sizeMultiplier := settings.Size * settings.Size

	// Difficulty multiplier
	difficultyMultiplier := 1
	switch settings.Difficulty {
	case "easy":
		difficultyMultiplier = 1
	case "medium":
		difficultyMultiplier = 2
	case "hard":
		difficultyMultiplier = 3
	}

	// Level bonus
	levelBonus := level * 10

	return baseScore*sizeMultiplier*difficultyMultiplier + levelBonus
}

func (g *YohakuGenerator) generateSolution(puzzle *YohakuPuzzle, settings GameSettings) {
	size := settings.Size

	for i := 0; i < size; i++ {
		for j := 0; j < size; j++ {
			puzzle.Solution[i][j] = g.rand.Intn(settings.Range.Max-settings.Range.Min+1) + settings.Range.Min
		}
	}

	for i := 0; i < size; i++ {
		result := puzzle.Solution[i][0]
		for j := 1; j < size; j++ {
			switch settings.Operation {
			case "addition":
				result += puzzle.Solution[i][j]
			case "subtraction":
				result -= puzzle.Solution[i][j]
			case "multiplication":
				result *= puzzle.Solution[i][j]
			}
		}
		puzzle.Solution[i][size] = result
	}

	for j := 0; j < size; j++ {
		result := puzzle.Solution[0][j]
		for i := 1; i < size; i++ {
			switch settings.Operation {
			case "addition":
				result += puzzle.Solution[i][j]
			case "subtraction":
				result -= puzzle.Solution[i][j]
			case "multiplication":
				result *= puzzle.Solution[i][j]
			}
		}
		puzzle.Solution[size][j] = result
	}

	cornerResult := puzzle.Solution[size][0]
	for j := 1; j < size; j++ {
		switch settings.Operation {
		case "addition":
			cornerResult += puzzle.Solution[size][j]
		case "subtraction":
			cornerResult -= puzzle.Solution[size][j]
		case "multiplication":
			cornerResult *= puzzle.Solution[size][j]
		}
	}
	puzzle.Solution[size][size] = cornerResult
}

func (g *YohakuGenerator) createPuzzleFromSolution(puzzle *YohakuPuzzle, settings GameSettings) {
	size := settings.Size

	for i := 0; i <= size; i++ {
		for j := 0; j <= size; j++ {
			puzzle.Grid[i][j] = Cell{
				Value:   puzzle.Solution[i][j],
				IsGiven: true,
				IsSum:   i == size || j == size,
			}

			if i == size && j == size {
				puzzle.Grid[i][j].SumType = "total"
			} else if i == size {
				puzzle.Grid[i][j].SumType = "column"
			} else if j == size {
				puzzle.Grid[i][j].SumType = "row"
			} else {
				puzzle.Grid[i][j].SumType = "cell"
			}
		}
	}

	cellsToHide := g.getCellsToHide(settings.Difficulty, size)
	hiddenCount := 0

	for hiddenCount < cellsToHide {
		i := g.rand.Intn(size)
		j := g.rand.Intn(size)

		if puzzle.Grid[i][j].IsGiven && !puzzle.Grid[i][j].IsSum {
			puzzle.Grid[i][j].Value = 0
			puzzle.Grid[i][j].IsGiven = false
			hiddenCount++
		}
	}
}

func (g *YohakuGenerator) getCellsToHide(difficulty string, size int) int {
	totalCells := size * size

	switch difficulty {
	case "easy":
		return totalCells / 3
	case "medium":
		return totalCells / 2
	case "hard":
		return (totalCells * 2) / 3
	default:
		return totalCells / 2
	}
}

// Web server setup
func setupRoutes(hub *PuzzleHub) *gin.Engine {
	r := gin.Default()

	r.Static("/static", "./static")
	r.LoadHTMLGlob("templates/*")

	// Main page - puzzle selection
	r.GET("/", func(c *gin.Context) {
		c.HTML(http.StatusOK, "index.html", gin.H{
			"title": "Puzzle Hub - Choose Your Game",
		})
	})

	// Favicon
	r.GET("/favicon.ico", func(c *gin.Context) {
		c.Status(http.StatusNoContent)
	})

	// API routes
	api := r.Group("/api")
	{
		// Spelling Bee endpoints
		api.POST("/spelling/generate", func(c *gin.Context) {
			var criteria GenerationCriteria
			if err := c.ShouldBindJSON(&criteria); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}

			problems, err := hub.GenerateSpellingProblems(criteria)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
				return
			}

			c.JSON(http.StatusOK, gin.H{"problems": problems})
		})

		api.POST("/spelling/generate-for-age", func(c *gin.Context) {
			var request struct {
				Age          int    `json:"age" binding:"required"`
				Count        int    `json:"count"`
				Theme        string `json:"theme"`
				ForceRefresh bool   `json:"force_refresh"`
			}

			if err := c.ShouldBindJSON(&request); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}

			if request.Count == 0 {
				request.Count = 10
			}

			difficulty := determineDifficultyLevel(request.Age)
			criteria := GenerationCriteria{
				DifficultyLevel:  string(difficulty),
				AgeGroup:         fmt.Sprintf("%d years old", request.Age),
				WordCount:        request.Count,
				Theme:            request.Theme,
				IncludePhonetics: true,
				IncludeHints:     true,
			}

			problems, err := hub.GenerateSpellingProblems(criteria)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
				return
			}

			c.JSON(http.StatusOK, gin.H{"problems": problems})
		})

		// Yohaku endpoints
		api.POST("/yohaku/generate", func(c *gin.Context) {
			var settings GameSettings
			if err := c.ShouldBindJSON(&settings); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}

			if settings.TimerDuration == 0 {
				settings.TimerDuration = 30
			}
			if settings.Size == 0 {
				settings.Size = 2
			}
			if settings.Operation == "" {
				settings.Operation = "addition"
			}
			if settings.Range.Min == 0 && settings.Range.Max == 0 {
				settings.Range = NumberRange{Min: 1, Max: 10}
			}
			if settings.Difficulty == "" {
				settings.Difficulty = "easy"
			}

			puzzle := hub.GenerateYohakuPuzzle(settings)
			c.JSON(http.StatusOK, gin.H{
				"puzzle":   puzzle,
				"settings": settings,
			})
		})

		api.POST("/yohaku/start-game", func(c *gin.Context) {
			var settings GameSettings
			if err := c.ShouldBindJSON(&settings); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}

			// Set defaults
			if settings.Operation == "" {
				settings.Operation = "addition"
			}

			session := hub.GenerateYohakuGameSession(settings)
			c.JSON(http.StatusOK, gin.H{
				"session": session,
				"message": "Game session created with 10 progressive puzzles!",
			})
		})

		api.POST("/yohaku/validate", func(c *gin.Context) {
			var request struct {
				PuzzleID string   `json:"puzzleId"`
				Grid     [][]Cell `json:"grid"`
			}

			if err := c.ShouldBindJSON(&request); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}

			c.JSON(http.StatusOK, gin.H{
				"valid":   true,
				"message": "Puzzle solved correctly!",
			})
		})

		api.POST("/yohaku/hint", func(c *gin.Context) {
			var request struct {
				PuzzleID string `json:"puzzleId"`
			}

			if err := c.ShouldBindJSON(&request); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}

			c.JSON(http.StatusOK, gin.H{
				"hint": "Try focusing on the cells with the smallest possible values first!",
			})
		})
	}

	return r
}

func determineDifficultyLevel(age int) DifficultyLevel {
	switch {
	case age <= 8:
		return Elementary
	case age <= 11:
		return Middle
	case age <= 14:
		return Intermediate
	default:
		return Advanced
	}
}

func main() {
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found, using system environment variables")
	}

	provider := os.Getenv("AI_PROVIDER")
	if provider == "" {
		provider = "fallback"
	}

	hub, err := NewPuzzleHub(provider)
	if err != nil {
		log.Fatalf("Failed to create puzzle hub: %v", err)
	}

	r := setupRoutes(hub)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	fmt.Printf("🎮 Puzzle Hub starting on port %s\n", port)
	fmt.Printf("Using %s as AI provider\n", provider)
	fmt.Printf("Visit http://localhost:%s to choose your puzzle!\n", port)

	if err := r.Run(":" + port); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
