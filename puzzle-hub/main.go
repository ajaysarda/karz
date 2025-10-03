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
	"github.com/golang-jwt/jwt/v5"
	"github.com/gorilla/sessions"
	"github.com/joho/godotenv"
	"github.com/sashabaranov/go-openai"
	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"
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

// Writing App Types
type WritingAnalysisRequest struct {
	Text       string `json:"text" binding:"required"`
	GradeLevel int    `json:"gradeLevel" binding:"required"`
	Title      string `json:"title,omitempty"`
}

type WritingAnalysisResponse struct {
	OverallRating      int                 `json:"overallRating"`
	GrammarErrors      []GrammarError      `json:"grammarErrors"`
	VocabularyTips     []VocabularyTip     `json:"vocabularyTips"`
	ContextSuggestions []ContextSuggestion `json:"contextSuggestions"`
	NarrativeAnalysis  NarrativeAnalysis   `json:"narrativeAnalysis"`
	Summary            string              `json:"summary"`
}

type GrammarError struct {
	StartIndex  int    `json:"startIndex"`
	EndIndex    int    `json:"endIndex"`
	ErrorType   string `json:"errorType"`
	Original    string `json:"original"`
	Suggestion  string `json:"suggestion"`
	Explanation string `json:"explanation"`
}

type VocabularyTip struct {
	StartIndex  int      `json:"startIndex"`
	EndIndex    int      `json:"endIndex"`
	Original    string   `json:"original"`
	Suggestions []string `json:"suggestions"`
	Explanation string   `json:"explanation"`
}

type ContextSuggestion struct {
	ParagraphIndex int    `json:"paragraphIndex"`
	Suggestion     string `json:"suggestion"`
	Reason         string `json:"reason"`
}

type NarrativeAnalysis struct {
	Structure    NarrativeStructure `json:"structure"`
	Strengths    []string           `json:"strengths"`
	Improvements []string           `json:"improvements"`
	Rating       int                `json:"rating"`
}

type NarrativeStructure struct {
	HasIntroduction bool   `json:"hasIntroduction"`
	HasRisingAction bool   `json:"hasRisingAction"`
	HasClimax       bool   `json:"hasClimax"`
	HasResolution   bool   `json:"hasResolution"`
	Feedback        string `json:"feedback"`
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

// Authentication Types
type User struct {
	ID          string    `json:"id"`
	Email       string    `json:"email"`
	Name        string    `json:"name"`
	Picture     string    `json:"picture"`
	GoogleID    string    `json:"googleId"`
	CreatedAt   time.Time `json:"createdAt"`
	LastLoginAt time.Time `json:"lastLoginAt"`
}

type AuthConfig struct {
	GoogleOAuth  *oauth2.Config
	SessionStore *sessions.CookieStore
	JWTSecret    []byte
}

type GoogleUserInfo struct {
	ID      string `json:"id"`
	Email   string `json:"email"`
	Name    string `json:"name"`
	Picture string `json:"picture"`
}

type LoginResponse struct {
	Success bool   `json:"success"`
	User    *User  `json:"user,omitempty"`
	Token   string `json:"token,omitempty"`
	Message string `json:"message,omitempty"`
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
	AuthConfig      *AuthConfig
	Users           map[string]*User // Simple in-memory user store
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
			Timeout: 60 * time.Second, // Increased timeout for writing analysis
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
	} else {
		return nil, fmt.Errorf("AI_PROVIDER must be 'openai' or 'perplexity'. Please set PERPLEXITY_API_KEY or OPENAI_API_KEY environment variable")
	}

	// Initialize authentication
	authConfig, err := initializeAuth()
	if err != nil {
		return nil, fmt.Errorf("failed to initialize auth: %v", err)
	}
	hub.AuthConfig = authConfig
	hub.Users = make(map[string]*User)

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

	// Set default range if none provided
	if settings.Range.Min == 0 && settings.Range.Max == 0 {
		settings.Range = NumberRange{Min: 1, Max: 10}
	}

	// Progressive difficulty increases (but preserve user's range settings)
	switch {
	case level <= 3:
		// Levels 1-3: Easy
		settings.Difficulty = "easy"
		settings.Size = 2
	case level <= 6:
		// Levels 4-6: Medium
		settings.Difficulty = "medium"
		settings.Size = 2
	case level <= 8:
		// Levels 7-8: Hard with 2x2
		settings.Difficulty = "hard"
		settings.Size = 2
	case level == 9:
		// Level 9: Medium 3x3
		settings.Difficulty = "medium"
		settings.Size = 3
	case level == 10:
		// Level 10: Hard 3x3 (Boss level!)
		settings.Difficulty = "hard"
		settings.Size = 3
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

// Writing Analysis Methods
func (h *PuzzleHub) AnalyzeWriting(request WritingAnalysisRequest) (*WritingAnalysisResponse, error) {
	log.Printf("🖊️ Analyzing writing for grade level %d", request.GradeLevel)

	prompt := h.buildWritingAnalysisPrompt(request)

	var response string
	var err error
	maxRetries := 2

	for attempt := 1; attempt <= maxRetries; attempt++ {
		if attempt > 1 {
			log.Printf("🔄 Retry attempt %d/%d", attempt, maxRetries)
			time.Sleep(2 * time.Second) // Brief delay before retry
		}

		if h.Provider == "openai" {
			log.Printf("🔵 Using OpenAI for writing analysis")
			response, err = h.generateWithOpenAI(prompt)
		} else if h.Provider == "perplexity" {
			log.Printf("🟣 Using Perplexity for writing analysis")
			response, err = h.generateWithPerplexity(prompt)
		} else {
			return nil, fmt.Errorf("invalid AI provider: %s. Must be 'openai' or 'perplexity'", h.Provider)
		}

		// If successful, break out of retry loop
		if err == nil {
			break
		}

		// If it's the last attempt or not a timeout error, don't retry
		isTimeout := strings.Contains(err.Error(), "timeout") || strings.Contains(err.Error(), "deadline exceeded")
		if attempt == maxRetries || !isTimeout {
			break
		}

		log.Printf("⚠️ Attempt %d failed with timeout, retrying...", attempt)
	}

	if err != nil {
		log.Printf("❌ AI analysis failed after %d attempts: %v", maxRetries, err)

		// Check if it's a timeout error
		if strings.Contains(err.Error(), "timeout") || strings.Contains(err.Error(), "deadline exceeded") {
			return nil, fmt.Errorf("writing analysis timed out after %d attempts - %s is experiencing delays. Please try again with shorter text or wait a few minutes", maxRetries, h.Provider)
		}

		return nil, fmt.Errorf("writing analysis is not available right now due to API issues with %s. Please try again later", h.Provider)
	}

	analysis, err := h.parseWritingAnalysisResponse(response, request)
	if err != nil {
		log.Printf("⚠️ Failed to parse AI response: %v", err)
		return nil, fmt.Errorf("writing analysis is not available right now due to API response parsing issues. Please try again later")
	}

	log.Printf("✅ Successfully analyzed writing")
	return analysis, nil
}

func (h *PuzzleHub) buildWritingAnalysisPrompt(request WritingAnalysisRequest) string {
	return fmt.Sprintf(`Analyze the following piece of writing for a grade %d student. Provide comprehensive feedback including grammar errors, vocabulary improvements, context suggestions, and narrative analysis.

Title: %s
Grade Level: %d
Text: %s

Please provide a detailed analysis in the following JSON format:
{
  "overallRating": 1-5,
  "grammarErrors": [
    {
      "startIndex": 0,
      "endIndex": 10,
      "errorType": "subject-verb agreement",
      "original": "text with error",
      "suggestion": "corrected text",
      "explanation": "why this is wrong and how to fix it"
    }
  ],
  "vocabularyTips": [
    {
      "startIndex": 15,
      "endIndex": 20,
      "original": "simple word",
      "suggestions": ["better word 1", "better word 2"],
      "explanation": "why these alternatives are better"
    }
  ],
  "contextSuggestions": [
    {
      "paragraphIndex": 0,
      "suggestion": "Add more descriptive details about...",
      "reason": "This would help readers visualize the scene better"
    }
  ],
  "narrativeAnalysis": {
    "structure": {
      "hasIntroduction": true,
      "hasRisingAction": false,
      "hasClimax": true,
      "hasResolution": false,
      "feedback": "Your story has a good beginning and exciting moment, but needs more build-up and a proper ending."
    },
    "strengths": ["Good dialogue", "Creative characters"],
    "improvements": ["Add more descriptive language", "Develop the ending"],
    "rating": 3
  },
  "summary": "Overall feedback summary for the student"
}

Focus on:
1. Grammar and spelling errors with clear explanations
2. Vocabulary enhancement suggestions appropriate for grade %d
3. Ways to add more context and detail to each paragraph
4. Narrative structure analysis (introduction, rising action, climax, resolution)
5. Age-appropriate feedback that encourages improvement
6. Rate the writing from 1-5 (1=needs much work, 5=excellent)

Make sure all feedback is constructive, encouraging, and appropriate for a grade %d student.`,
		request.GradeLevel, request.Title, request.GradeLevel, request.Text, request.GradeLevel, request.GradeLevel)
}

func (h *PuzzleHub) parseWritingAnalysisResponse(response string, request WritingAnalysisRequest) (*WritingAnalysisResponse, error) {
	var jsonStr string

	// Extract JSON from response
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
		start := strings.Index(response, "{")
		end := strings.LastIndex(response, "}")
		if start != -1 && end != -1 {
			jsonStr = response[start : end+1]
		}
	}

	if jsonStr == "" {
		return nil, fmt.Errorf("no JSON found in response")
	}

	var analysis WritingAnalysisResponse
	err := json.Unmarshal([]byte(jsonStr), &analysis)
	if err != nil {
		return nil, fmt.Errorf("failed to parse JSON: %v", err)
	}

	return &analysis, nil
}

// Fallback method removed - Writing analysis now requires AI API keys

// Web server setup
func setupRoutes(hub *PuzzleHub) *gin.Engine {
	r := gin.Default()

	r.Static("/static", "./static")
	r.LoadHTMLGlob("templates/*")

	// Authentication routes (public)
	auth := r.Group("/auth")
	{
		auth.GET("/google", func(c *gin.Context) {
			if hub.AuthConfig.GoogleOAuth.ClientID == "" {
				c.JSON(http.StatusServiceUnavailable, gin.H{
					"error": "Google OAuth not configured. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables.",
				})
				return
			}

			state := fmt.Sprintf("state_%d", time.Now().UnixNano())
			url := hub.AuthConfig.GoogleOAuth.AuthCodeURL(state, oauth2.AccessTypeOffline)
			c.JSON(http.StatusOK, gin.H{"url": url})
		})

		auth.GET("/google/callback", func(c *gin.Context) {
			code := c.Query("code")
			if code == "" {
				c.HTML(http.StatusBadRequest, "callback.html", gin.H{
					"error": "Authorization code not provided",
				})
				return
			}

			// Exchange code for token
			token, err := hub.AuthConfig.GoogleOAuth.Exchange(context.Background(), code)
			if err != nil {
				log.Printf("Failed to exchange code for token: %v", err)
				c.HTML(http.StatusInternalServerError, "callback.html", gin.H{
					"error": "Failed to exchange authorization code",
				})
				return
			}

			// Get user info from Google
			googleUser, err := hub.getUserFromGoogle(token.AccessToken)
			if err != nil {
				log.Printf("Failed to get user info from Google: %v", err)
				c.HTML(http.StatusInternalServerError, "callback.html", gin.H{
					"error": "Failed to get user information",
				})
				return
			}

			// Create or update user
			user := hub.createOrUpdateUser(googleUser)

			// Generate JWT token
			jwtToken, err := hub.generateJWT(user)
			if err != nil {
				log.Printf("Failed to generate JWT: %v", err)
				c.HTML(http.StatusInternalServerError, "callback.html", gin.H{
					"error": "Failed to generate authentication token",
				})
				return
			}

			// Return success page that will communicate with parent window
			c.HTML(http.StatusOK, "callback.html", gin.H{
				"success": true,
				"result": LoginResponse{
					Success: true,
					User:    user,
					Token:   jwtToken,
					Message: "Login successful",
				},
			})
		})

		auth.POST("/logout", func(c *gin.Context) {
			// For JWT, logout is handled client-side by removing the token
			c.JSON(http.StatusOK, gin.H{"message": "Logged out successfully"})
		})

		auth.GET("/me", func(c *gin.Context) {
			authHeader := c.GetHeader("Authorization")
			if authHeader == "" {
				c.JSON(http.StatusUnauthorized, gin.H{"error": "No authorization token provided"})
				return
			}

			parts := strings.Split(authHeader, " ")
			if len(parts) != 2 || parts[0] != "Bearer" {
				c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid authorization header format"})
				return
			}

			user, err := hub.validateJWT(parts[1])
			if err != nil {
				c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid token"})
				return
			}

			c.JSON(http.StatusOK, gin.H{"user": user})
		})
	}

	// Main page - puzzle selection
	r.GET("/", func(c *gin.Context) {
		c.HTML(http.StatusOK, "index.html", gin.H{
			"title": "Puzzle Hub - Choose Your Game",
		})
	})

	// Legal pages (public)
	r.GET("/terms", func(c *gin.Context) {
		c.HTML(http.StatusOK, "terms.html", gin.H{
			"title": "Terms of Service - Puzzle Hub",
		})
	})

	r.GET("/privacy", func(c *gin.Context) {
		c.HTML(http.StatusOK, "privacy.html", gin.H{
			"title": "Privacy Policy - Puzzle Hub",
		})
	})

	// Favicon
	r.GET("/favicon.ico", func(c *gin.Context) {
		c.Status(http.StatusNoContent)
	})

	// API routes (protected)
	api := r.Group("/api")
	api.Use(hub.authMiddleware()) // Apply authentication middleware to all API routes
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

		// Writing Analysis endpoints
		api.POST("/writing/analyze", func(c *gin.Context) {
			var request WritingAnalysisRequest
			if err := c.ShouldBindJSON(&request); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}

			// Validate grade level
			if request.GradeLevel < 1 || request.GradeLevel > 12 {
				c.JSON(http.StatusBadRequest, gin.H{"error": "Grade level must be between 1 and 12"})
				return
			}

			// Validate text length
			if len(strings.TrimSpace(request.Text)) < 10 {
				c.JSON(http.StatusBadRequest, gin.H{"error": "Text must be at least 10 characters long"})
				return
			}

			analysis, err := hub.AnalyzeWriting(request)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
				return
			}

			c.JSON(http.StatusOK, gin.H{
				"analysis": analysis,
				"message":  "Writing analysis completed successfully!",
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

// Authentication Functions
func initializeAuth() (*AuthConfig, error) {
	// Get OAuth credentials from environment
	clientID := os.Getenv("GOOGLE_CLIENT_ID")
	clientSecret := os.Getenv("GOOGLE_CLIENT_SECRET")
	baseURL := os.Getenv("BASE_URL")

	// Auto-detect base URL based on environment
	if baseURL == "" {
		if os.Getenv("RENDER") != "" || os.Getenv("NODE_ENV") == "production" {
			baseURL = "https://karz.onrender.com"
		} else {
			baseURL = "http://localhost:8995"
		}
	}

	log.Printf("🔐 Initializing OAuth with base URL: %s", baseURL)

	// Generate JWT secret
	jwtSecret := make([]byte, 32)
	if _, err := rand.Read(jwtSecret); err != nil {
		return nil, fmt.Errorf("failed to generate JWT secret: %v", err)
	}

	// Configure Google OAuth
	googleOAuth := &oauth2.Config{
		ClientID:     clientID,
		ClientSecret: clientSecret,
		RedirectURL:  baseURL + "/auth/google/callback",
		Scopes:       []string{"openid", "profile", "email"},
		Endpoint:     google.Endpoint,
	}

	// Create session store
	sessionSecret := make([]byte, 32)
	if _, err := rand.Read(sessionSecret); err != nil {
		return nil, fmt.Errorf("failed to generate session secret: %v", err)
	}
	sessionStore := sessions.NewCookieStore(sessionSecret)

	return &AuthConfig{
		GoogleOAuth:  googleOAuth,
		SessionStore: sessionStore,
		JWTSecret:    jwtSecret,
	}, nil
}

func (h *PuzzleHub) generateJWT(user *User) (string, error) {
	claims := jwt.MapClaims{
		"user_id": user.ID,
		"email":   user.Email,
		"name":    user.Name,
		"exp":     time.Now().Add(24 * time.Hour).Unix(), // 24 hour expiration
		"iat":     time.Now().Unix(),
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(h.AuthConfig.JWTSecret)
}

func (h *PuzzleHub) validateJWT(tokenString string) (*User, error) {
	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return h.AuthConfig.JWTSecret, nil
	})

	if err != nil {
		return nil, err
	}

	if claims, ok := token.Claims.(jwt.MapClaims); ok && token.Valid {
		userID, ok := claims["user_id"].(string)
		if !ok {
			return nil, fmt.Errorf("invalid user_id in token")
		}

		user, exists := h.Users[userID]
		if !exists {
			return nil, fmt.Errorf("user not found")
		}

		return user, nil
	}

	return nil, fmt.Errorf("invalid token")
}

func (h *PuzzleHub) getUserFromGoogle(accessToken string) (*GoogleUserInfo, error) {
	resp, err := http.Get("https://www.googleapis.com/oauth2/v2/userinfo?access_token=" + accessToken)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var userInfo GoogleUserInfo
	if err := json.NewDecoder(resp.Body).Decode(&userInfo); err != nil {
		return nil, err
	}

	return &userInfo, nil
}

func (h *PuzzleHub) createOrUpdateUser(googleUser *GoogleUserInfo) *User {
	// Check if user already exists
	for _, user := range h.Users {
		if user.GoogleID == googleUser.ID {
			// Update last login
			user.LastLoginAt = time.Now()
			return user
		}
	}

	// Create new user
	user := &User{
		ID:          fmt.Sprintf("user_%d", time.Now().UnixNano()),
		Email:       googleUser.Email,
		Name:        googleUser.Name,
		Picture:     googleUser.Picture,
		GoogleID:    googleUser.ID,
		CreatedAt:   time.Now(),
		LastLoginAt: time.Now(),
	}

	h.Users[user.ID] = user
	return user
}

// Middleware for authentication
func (h *PuzzleHub) authMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Skip auth for public endpoints
		path := c.Request.URL.Path
		if strings.HasPrefix(path, "/static/") ||
			strings.HasPrefix(path, "/auth/") ||
			path == "/" ||
			path == "/favicon.ico" {
			c.Next()
			return
		}

		// Check for JWT token in Authorization header
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Authorization header required"})
			c.Abort()
			return
		}

		// Extract token from "Bearer <token>"
		parts := strings.Split(authHeader, " ")
		if len(parts) != 2 || parts[0] != "Bearer" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid authorization header format"})
			c.Abort()
			return
		}

		user, err := h.validateJWT(parts[1])
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid token"})
			c.Abort()
			return
		}

		// Add user to context
		c.Set("user", user)
		c.Next()
	}
}

func main() {
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found, using system environment variables")
	}

	provider := os.Getenv("AI_PROVIDER")
	if provider == "" {
		// Default to perplexity if no provider specified
		provider = "perplexity"
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
