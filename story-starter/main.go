package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
)

// Story generation types
type StoryRequest struct {
	Genre       string   `json:"genre"`
	Elements    []string `json:"elements"`
	Tone        string   `json:"tone"`
	Length      string   `json:"length"`
	RequestType string   `json:"requestType"` // "prompt", "character", "plot", "twist", "setting"
}

type StoryResponse struct {
	Title       string    `json:"title"`
	Content     string    `json:"content"`
	Ideas       []string  `json:"ideas,omitempty"`
	Tips        []string  `json:"tips,omitempty"`
	Questions   []string  `json:"questions,omitempty"`
	GeneratedAt time.Time `json:"generated_at"`
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

// StoryGenerator handles story generation via Perplexity
type StoryGenerator struct {
	PerplexityKey string
	APIEndpoint   string
}

func NewStoryGenerator(perplexityKey string) *StoryGenerator {
	return &StoryGenerator{
		PerplexityKey: perplexityKey,
		APIEndpoint:   "https://api.perplexity.ai/chat/completions",
	}
}

// GenerateStory generates creative content based on request
func (sg *StoryGenerator) GenerateStory(req StoryRequest) (*StoryResponse, error) {
	prompt := sg.buildPrompt(req)

	perplexityReq := PerplexityRequest{
		Model: "llama-3.1-sonar-large-128k-online",
		Messages: []Message{
			{
				Role:    "system",
				Content: "You are a creative writing assistant for 4th grade students. Your job is to inspire young writers with fun, age-appropriate story ideas. Be enthusiastic, encouraging, and creative. Keep language simple but engaging.",
			},
			{
				Role:    "user",
				Content: prompt,
			},
		},
	}

	jsonData, err := json.Marshal(perplexityReq)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	httpReq, err := http.NewRequest("POST", sg.APIEndpoint, bytes.NewBuffer(jsonData))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	httpReq.Header.Set("Authorization", "Bearer "+sg.PerplexityKey)
	httpReq.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("failed to call API: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("API error (status %d): %s", resp.StatusCode, string(body))
	}

	var perplexityResp PerplexityResponse
	if err := json.Unmarshal(body, &perplexityResp); err != nil {
		return nil, fmt.Errorf("failed to unmarshal response: %w", err)
	}

	if len(perplexityResp.Choices) == 0 {
		return nil, fmt.Errorf("no response from API")
	}

	content := perplexityResp.Choices[0].Message.Content

	// Parse the response into structured format
	storyResp := &StoryResponse{
		Content:     content,
		GeneratedAt: time.Now(),
	}

	return storyResp, nil
}

// buildPrompt creates the appropriate prompt based on request type
func (sg *StoryGenerator) buildPrompt(req StoryRequest) string {
	elementsStr := ""
	if len(req.Elements) > 0 {
		elementsStr = fmt.Sprintf("Include these elements: %v. ", req.Elements)
	}

	genreStr := ""
	if req.Genre != "" {
		genreStr = fmt.Sprintf("Genre: %s. ", req.Genre)
	}

	toneStr := ""
	if req.Tone != "" {
		toneStr = fmt.Sprintf("Tone: %s. ", req.Tone)
	}

	switch req.RequestType {
	case "prompt":
		return fmt.Sprintf(`Generate a creative and exciting story starter for a 4th grader. %s%s%s

Format your response as:
TITLE: [Catchy story title]
OPENING: [2-3 sentence story beginning that hooks the reader]
IDEAS: [3 bullet points with "what happens next" ideas]
TIPS: [2 writing tips specific to this story]

Make it fun, imaginative, and age-appropriate!`, genreStr, toneStr, elementsStr)

	case "character":
		return fmt.Sprintf(`Create an interesting character for a 4th grader's story. %s%s%s

Format your response as:
NAME: [Character name]
DESCRIPTION: [Physical description and personality - 2-3 sentences]
BACKGROUND: [Brief backstory - 2 sentences]
SPECIAL TRAIT: [Something unique or interesting about them]
QUESTIONS: [3 questions to help develop the character further]

Make the character relatable and fun for a 10-year-old!`, genreStr, toneStr, elementsStr)

	case "plot":
		return fmt.Sprintf(`Create an exciting plot outline for a short story. %s%s%s

Format your response as:
BEGINNING: [How the story starts]
PROBLEM: [The main challenge or conflict]
MIDDLE: [3 key events that happen]
CLIMAX: [The most exciting part]
ENDING IDEAS: [2 different ways the story could end]

Make it engaging and appropriate for 4th grade reading level!`, genreStr, toneStr, elementsStr)

	case "twist":
		return fmt.Sprintf(`Generate a surprising plot twist for a story. %s%s%s

Format your response as:
TWIST: [The surprising turn of events - 2-3 sentences]
WHY IT WORKS: [Why this twist is interesting]
HOW TO BUILD UP: [2-3 tips for setting up this twist earlier in the story]
ALTERNATIVE TWISTS: [2 other possible twists]

Make it creative and fun, but not too scary for a 4th grader!`, genreStr, toneStr, elementsStr)

	case "setting":
		return fmt.Sprintf(`Create a vivid and interesting setting for a story. %s%s%s

Format your response as:
LOCATION: [Where the story takes place]
TIME: [When it takes place]
DESCRIPTION: [Vivid description using the 5 senses - 3-4 sentences]
MOOD: [The feeling this setting creates]
STORY POSSIBILITIES: [3 things that could happen in this setting]

Make it descriptive and imaginative for a 4th grader!`, genreStr, toneStr, elementsStr)

	default:
		return fmt.Sprintf(`Generate a creative story idea for a 4th grader. %s%s%s Make it exciting and fun!`, genreStr, toneStr, elementsStr)
	}
}

func main() {
	// Load environment variables
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found, using system environment variables")
	}

	perplexityKey := os.Getenv("PERPLEXITY_API_KEY")
	if perplexityKey == "" {
		log.Fatal("PERPLEXITY_API_KEY environment variable is required")
	}

	// Initialize generator
	generator := NewStoryGenerator(perplexityKey)

	// Set up Gin router
	router := gin.Default()

	// Serve static files
	router.Static("/static", "./static")
	router.LoadHTMLGlob("templates/*")

	// Routes
	router.GET("/", func(c *gin.Context) {
		c.HTML(http.StatusOK, "index.html", gin.H{
			"title": "Story Starter Generator",
		})
	})

	router.POST("/api/generate", func(c *gin.Context) {
		var req StoryRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
			return
		}

		story, err := generator.GenerateStory(req)
		if err != nil {
			log.Printf("Error generating story: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate story"})
			return
		}

		c.JSON(http.StatusOK, story)
	})

	// Health check
	router.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "healthy"})
	})

	// Start server
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("Story Starter Generator starting on port %s...", port)
	if err := router.Run(":" + port); err != nil {
		log.Fatal(err)
	}
}
