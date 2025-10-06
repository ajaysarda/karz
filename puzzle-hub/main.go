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

	"github.com/aws/aws-sdk-go/aws"
	"github.com/aws/aws-sdk-go/aws/credentials"
	"github.com/aws/aws-sdk-go/aws/session"
	"github.com/aws/aws-sdk-go/service/dynamodb"
	"github.com/aws/aws-sdk-go/service/dynamodb/dynamodbattribute"
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

// Story Starter Types
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

// Feedback System Types
type FeedbackType string

const (
	FeedbackTypeAppFeedback    FeedbackType = "app_feedback"
	FeedbackTypeSuggestion     FeedbackType = "suggestion"
	FeedbackTypeBugReport      FeedbackType = "bug_report"
	FeedbackTypeFeatureRequest FeedbackType = "feature_request"
)

type Feedback struct {
	ID          string       `json:"id" dynamodbav:"id"`
	UserID      string       `json:"user_id" dynamodbav:"user_id"`
	UserEmail   string       `json:"user_email" dynamodbav:"user_email"`
	UserName    string       `json:"user_name" dynamodbav:"user_name"`
	Type        FeedbackType `json:"type" dynamodbav:"type"`
	AppName     string       `json:"app_name,omitempty" dynamodbav:"app_name"` // For app feedback
	Rating      int          `json:"rating,omitempty" dynamodbav:"rating"`     // 1-5 stars
	Title       string       `json:"title" dynamodbav:"title"`
	Description string       `json:"description" dynamodbav:"description"`
	AIAppIdea   string       `json:"ai_app_idea,omitempty" dynamodbav:"ai_app_idea"` // For suggestions
	UseCase     string       `json:"use_case,omitempty" dynamodbav:"use_case"`       // Why they want it
	CreatedAt   time.Time    `json:"created_at" dynamodbav:"created_at"`
	Status      string       `json:"status" dynamodbav:"status"` // "new", "reviewed", "in-progress", "completed"
}

type FeedbackSubmission struct {
	Type        FeedbackType `json:"type" binding:"required"`
	AppName     string       `json:"app_name,omitempty"`
	Rating      int          `json:"rating,omitempty"`
	Title       string       `json:"title" binding:"required"`
	Description string       `json:"description" binding:"required"`
	AIAppIdea   string       `json:"ai_app_idea,omitempty"`
	UseCase     string       `json:"use_case,omitempty"`
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

// Custom Logging System Types
type LogType struct {
	ID          string     `json:"id" dynamodbav:"id"`
	UserID      string     `json:"user_id" dynamodbav:"user_id"`
	Name        string     `json:"name" dynamodbav:"name"`
	Description string     `json:"description" dynamodbav:"description"`
	Color       string     `json:"color" dynamodbav:"color"`
	Icon        string     `json:"icon" dynamodbav:"icon"`
	CreatedAt   time.Time  `json:"created_at" dynamodbav:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at" dynamodbav:"updated_at"`
	Fields      []LogField `json:"fields,omitempty" dynamodbav:"fields"`
}

type FieldType string

const (
	FieldTypeText     FieldType = "text"
	FieldTypeNumber   FieldType = "number"
	FieldTypeDate     FieldType = "date"
	FieldTypeTime     FieldType = "time"
	FieldTypeSelect   FieldType = "select"
	FieldTypeCheckbox FieldType = "checkbox"
	FieldTypeTextarea FieldType = "textarea"
)

type LogField struct {
	ID           string    `json:"id" dynamodbav:"id"`
	LogTypeID    string    `json:"log_type_id" dynamodbav:"log_type_id"`
	FieldName    string    `json:"field_name" dynamodbav:"field_name"`
	FieldType    FieldType `json:"field_type" dynamodbav:"field_type"`
	Required     bool      `json:"required" dynamodbav:"required"`
	Options      string    `json:"options" dynamodbav:"options"` // JSON string for select options
	DefaultValue string    `json:"default_value" dynamodbav:"default_value"`
	DisplayOrder int       `json:"display_order" dynamodbav:"display_order"`
}

type LogEntry struct {
	ID        string                 `json:"id" dynamodbav:"id"`
	LogTypeID string                 `json:"log_type_id" dynamodbav:"log_type_id"`
	UserID    string                 `json:"user_id" dynamodbav:"user_id"`
	EntryDate string                 `json:"entry_date" dynamodbav:"entry_date"` // Store as YYYY-MM-DD string
	CreatedAt time.Time              `json:"created_at" dynamodbav:"created_at"`
	UpdatedAt time.Time              `json:"updated_at" dynamodbav:"updated_at"`
	Values    map[string]interface{} `json:"values,omitempty" dynamodbav:"values"`
	LogType   *LogType               `json:"log_type,omitempty" dynamodbav:"-"`
}

// EntryValue is no longer needed with DynamoDB as we store values directly in LogEntry

type LogAnalytics struct {
	LogTypeID     string                 `json:"log_type_id"`
	LogTypeName   string                 `json:"log_type_name"`
	TotalEntries  int                    `json:"total_entries"`
	ThisMonth     int                    `json:"this_month"`
	ThisWeek      int                    `json:"this_week"`
	DailyActivity map[string]interface{} `json:"daily_activity"` // Date -> summary data
	MonthlyTrend  []MonthlyData          `json:"monthly_trend"`
}

type MonthlyData struct {
	Month   string      `json:"month"`
	Count   int         `json:"count"`
	Summary interface{} `json:"summary"` // Aggregated data (sum, avg, etc.)
}

type CreateLogFieldRequest struct {
	FieldName    string `json:"field_name" binding:"required"`
	FieldType    string `json:"field_type" binding:"required"`
	Required     bool   `json:"required"`
	DefaultValue string `json:"default_value"`
	Options      string `json:"options"`
}

type CreateLogTypeRequest struct {
	Name        string                  `json:"name" binding:"required"`
	Description string                  `json:"description"`
	Color       string                  `json:"color"`
	Icon        string                  `json:"icon"`
	Fields      []CreateLogFieldRequest `json:"fields"`
}

type CreateLogEntryRequest struct {
	LogTypeID string                 `json:"log_type_id" binding:"required"`
	EntryDate string                 `json:"entry_date" binding:"required"` // YYYY-MM-DD format
	Values    map[string]interface{} `json:"values" binding:"required"`
}

type SuggestFieldsRequest struct {
	LogTypeName string `json:"log_type_name" binding:"required"`
	Description string `json:"description"`
}

type SuggestedField struct {
	FieldName    string `json:"field_name"`
	FieldType    string `json:"field_type"`
	Required     bool   `json:"required"`
	DefaultValue string `json:"default_value"`
	Options      string `json:"options"`
	Description  string `json:"description"`
}

type SuggestFieldsResponse struct {
	SuggestedFields []SuggestedField `json:"suggested_fields"`
	Explanation     string           `json:"explanation"`
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
	Users           map[string]*User   // Simple in-memory user store
	DynamoDB        *dynamodb.DynamoDB // AWS DynamoDB for logging system
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
// Database initialization functions
func initializeDynamoDB() (*dynamodb.DynamoDB, error) {
	// AWS credentials from environment variables
	awsAccessKey := os.Getenv("AWS_ACCESS_KEY_ID")
	awsSecretKey := os.Getenv("AWS_SECRET_ACCESS_KEY")
	awsRegion := os.Getenv("AWS_REGION")

	// Validate required AWS credentials
	if awsAccessKey == "" {
		return nil, fmt.Errorf("AWS_ACCESS_KEY_ID environment variable is required")
	}
	if awsSecretKey == "" {
		return nil, fmt.Errorf("AWS_SECRET_ACCESS_KEY environment variable is required")
	}
	if awsRegion == "" {
		awsRegion = "us-east-1" // Default region
	}

	// Create AWS session
	sess, err := session.NewSession(&aws.Config{
		Region:      aws.String(awsRegion),
		Credentials: credentials.NewStaticCredentials(awsAccessKey, awsSecretKey, ""),
	})
	if err != nil {
		return nil, fmt.Errorf("failed to create AWS session: %v", err)
	}

	// Create DynamoDB client
	svc := dynamodb.New(sess)

	// Create tables if they don't exist
	if err := createDynamoDBTables(svc); err != nil {
		return nil, fmt.Errorf("failed to create DynamoDB tables: %v", err)
	}

	log.Println("📊 DynamoDB initialized successfully")
	return svc, nil
}

func createDynamoDBTables(svc *dynamodb.DynamoDB) error {
	// Table names
	tables := []struct {
		name   string
		schema *dynamodb.CreateTableInput
	}{
		{
			name: "puzzle-hub-analytics",
			schema: &dynamodb.CreateTableInput{
				TableName: aws.String("puzzle-hub-analytics"),
				KeySchema: []*dynamodb.KeySchemaElement{
					{
						AttributeName: aws.String("id"),
						KeyType:       aws.String("HASH"),
					},
				},
				AttributeDefinitions: []*dynamodb.AttributeDefinition{
					{
						AttributeName: aws.String("id"),
						AttributeType: aws.String("S"),
					},
					{
						AttributeName: aws.String("event_type"),
						AttributeType: aws.String("S"),
					},
				},
				GlobalSecondaryIndexes: []*dynamodb.GlobalSecondaryIndex{
					{
						IndexName: aws.String("event-type-index"),
						KeySchema: []*dynamodb.KeySchemaElement{
							{
								AttributeName: aws.String("event_type"),
								KeyType:       aws.String("HASH"),
							},
						},
						Projection: &dynamodb.Projection{
							ProjectionType: aws.String("ALL"),
						},
						ProvisionedThroughput: &dynamodb.ProvisionedThroughput{
							ReadCapacityUnits:  aws.Int64(5),
							WriteCapacityUnits: aws.Int64(5),
						},
					},
				},
				ProvisionedThroughput: &dynamodb.ProvisionedThroughput{
					ReadCapacityUnits:  aws.Int64(5),
					WriteCapacityUnits: aws.Int64(5),
				},
			},
		},
		{
			name: "puzzle-hub-log-types",
			schema: &dynamodb.CreateTableInput{
				TableName: aws.String("puzzle-hub-log-types"),
				KeySchema: []*dynamodb.KeySchemaElement{
					{
						AttributeName: aws.String("id"),
						KeyType:       aws.String("HASH"),
					},
				},
				AttributeDefinitions: []*dynamodb.AttributeDefinition{
					{
						AttributeName: aws.String("id"),
						AttributeType: aws.String("S"),
					},
					{
						AttributeName: aws.String("user_id"),
						AttributeType: aws.String("S"),
					},
				},
				GlobalSecondaryIndexes: []*dynamodb.GlobalSecondaryIndex{
					{
						IndexName: aws.String("user-id-index"),
						KeySchema: []*dynamodb.KeySchemaElement{
							{
								AttributeName: aws.String("user_id"),
								KeyType:       aws.String("HASH"),
							},
						},
						Projection: &dynamodb.Projection{
							ProjectionType: aws.String("ALL"),
						},
						ProvisionedThroughput: &dynamodb.ProvisionedThroughput{
							ReadCapacityUnits:  aws.Int64(5),
							WriteCapacityUnits: aws.Int64(5),
						},
					},
				},
				ProvisionedThroughput: &dynamodb.ProvisionedThroughput{
					ReadCapacityUnits:  aws.Int64(5),
					WriteCapacityUnits: aws.Int64(5),
				},
			},
		},
		{
			name: "puzzle-hub-log-fields",
			schema: &dynamodb.CreateTableInput{
				TableName: aws.String("puzzle-hub-log-fields"),
				KeySchema: []*dynamodb.KeySchemaElement{
					{
						AttributeName: aws.String("id"),
						KeyType:       aws.String("HASH"),
					},
				},
				AttributeDefinitions: []*dynamodb.AttributeDefinition{
					{
						AttributeName: aws.String("id"),
						AttributeType: aws.String("S"),
					},
					{
						AttributeName: aws.String("log_type_id"),
						AttributeType: aws.String("S"),
					},
				},
				GlobalSecondaryIndexes: []*dynamodb.GlobalSecondaryIndex{
					{
						IndexName: aws.String("log-type-id-index"),
						KeySchema: []*dynamodb.KeySchemaElement{
							{
								AttributeName: aws.String("log_type_id"),
								KeyType:       aws.String("HASH"),
							},
						},
						Projection: &dynamodb.Projection{
							ProjectionType: aws.String("ALL"),
						},
						ProvisionedThroughput: &dynamodb.ProvisionedThroughput{
							ReadCapacityUnits:  aws.Int64(5),
							WriteCapacityUnits: aws.Int64(5),
						},
					},
				},
				ProvisionedThroughput: &dynamodb.ProvisionedThroughput{
					ReadCapacityUnits:  aws.Int64(5),
					WriteCapacityUnits: aws.Int64(5),
				},
			},
		},
		{
			name: "puzzle-hub-log-entries",
			schema: &dynamodb.CreateTableInput{
				TableName: aws.String("puzzle-hub-log-entries"),
				KeySchema: []*dynamodb.KeySchemaElement{
					{
						AttributeName: aws.String("id"),
						KeyType:       aws.String("HASH"),
					},
				},
				AttributeDefinitions: []*dynamodb.AttributeDefinition{
					{
						AttributeName: aws.String("id"),
						AttributeType: aws.String("S"),
					},
					{
						AttributeName: aws.String("user_id"),
						AttributeType: aws.String("S"),
					},
					{
						AttributeName: aws.String("entry_date"),
						AttributeType: aws.String("S"),
					},
				},
				GlobalSecondaryIndexes: []*dynamodb.GlobalSecondaryIndex{
					{
						IndexName: aws.String("user-date-index"),
						KeySchema: []*dynamodb.KeySchemaElement{
							{
								AttributeName: aws.String("user_id"),
								KeyType:       aws.String("HASH"),
							},
							{
								AttributeName: aws.String("entry_date"),
								KeyType:       aws.String("RANGE"),
							},
						},
						Projection: &dynamodb.Projection{
							ProjectionType: aws.String("ALL"),
						},
						ProvisionedThroughput: &dynamodb.ProvisionedThroughput{
							ReadCapacityUnits:  aws.Int64(5),
							WriteCapacityUnits: aws.Int64(5),
						},
					},
				},
				ProvisionedThroughput: &dynamodb.ProvisionedThroughput{
					ReadCapacityUnits:  aws.Int64(5),
					WriteCapacityUnits: aws.Int64(5),
				},
			},
		},
		{
			name: "puzzle-hub-feedback",
			schema: &dynamodb.CreateTableInput{
				TableName: aws.String("puzzle-hub-feedback"),
				KeySchema: []*dynamodb.KeySchemaElement{
					{
						AttributeName: aws.String("id"),
						KeyType:       aws.String("HASH"),
					},
				},
				AttributeDefinitions: []*dynamodb.AttributeDefinition{
					{
						AttributeName: aws.String("id"),
						AttributeType: aws.String("S"),
					},
					{
						AttributeName: aws.String("user_id"),
						AttributeType: aws.String("S"),
					},
					{
						AttributeName: aws.String("created_at"),
						AttributeType: aws.String("S"),
					},
				},
				GlobalSecondaryIndexes: []*dynamodb.GlobalSecondaryIndex{
					{
						IndexName: aws.String("user_id-created_at-index"),
						KeySchema: []*dynamodb.KeySchemaElement{
							{
								AttributeName: aws.String("user_id"),
								KeyType:       aws.String("HASH"),
							},
							{
								AttributeName: aws.String("created_at"),
								KeyType:       aws.String("RANGE"),
							},
						},
						Projection: &dynamodb.Projection{
							ProjectionType: aws.String("ALL"),
						},
						ProvisionedThroughput: &dynamodb.ProvisionedThroughput{
							ReadCapacityUnits:  aws.Int64(5),
							WriteCapacityUnits: aws.Int64(5),
						},
					},
				},
				ProvisionedThroughput: &dynamodb.ProvisionedThroughput{
					ReadCapacityUnits:  aws.Int64(5),
					WriteCapacityUnits: aws.Int64(5),
				},
			},
		},
	}

	// Create each table if it doesn't exist
	for _, table := range tables {
		// Check if table exists
		_, err := svc.DescribeTable(&dynamodb.DescribeTableInput{
			TableName: aws.String(table.name),
		})

		if err != nil {
			// Table doesn't exist, create it
			log.Printf("Creating DynamoDB table: %s", table.name)
			_, err = svc.CreateTable(table.schema)
			if err != nil {
				return fmt.Errorf("failed to create table %s: %v", table.name, err)
			}

			// Wait for table to be active
			log.Printf("Waiting for table %s to be active...", table.name)
			err = svc.WaitUntilTableExists(&dynamodb.DescribeTableInput{
				TableName: aws.String(table.name),
			})
			if err != nil {
				return fmt.Errorf("failed to wait for table %s: %v", table.name, err)
			}
		} else {
			log.Printf("DynamoDB table %s already exists", table.name)
		}
	}

	return nil
}

func NewPuzzleHub(provider string) (*PuzzleHub, error) {
	cacheDir := "cache"
	if err := os.MkdirAll(cacheDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create cache directory: %v", err)
	}

	// Initialize DynamoDB (creates all tables including feedback table)
	dynamoDB, err := initializeDynamoDB()
	if err != nil {
		return nil, fmt.Errorf("failed to initialize DynamoDB: %v", err)
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
		DynamoDB: dynamoDB,
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

// Story Starter Generator
func (h *PuzzleHub) GenerateStory(req StoryRequest) (*StoryResponse, error) {
	prompt := h.buildStoryPrompt(req)

	var content string

	if h.Provider == "openai" && h.OpenAIClient != nil {
		resp, err := h.OpenAIClient.CreateChatCompletion(
			context.Background(),
			openai.ChatCompletionRequest{
				Model: openai.GPT4,
				Messages: []openai.ChatCompletionMessage{
					{
						Role:    openai.ChatMessageRoleSystem,
						Content: "You are a creative writing assistant for 4th grade students. Your job is to inspire young writers with fun, age-appropriate story ideas. Be enthusiastic, encouraging, and creative. Keep language simple but engaging.",
					},
					{
						Role:    openai.ChatMessageRoleUser,
						Content: prompt,
					},
				},
			},
		)

		if err != nil {
			return nil, fmt.Errorf("OpenAI API error: %w", err)
		}

		if len(resp.Choices) > 0 {
			content = resp.Choices[0].Message.Content
		}
	} else if h.Provider == "perplexity" && h.PerplexityKey != "" {
		// Use Perplexity API
		perplexityReq := map[string]interface{}{
			"model": "sonar",
			"messages": []map[string]string{
				{
					"role":    "system",
					"content": "You are a creative writing assistant for 4th grade students. Your job is to inspire young writers with fun, age-appropriate story ideas. Be enthusiastic, encouraging, and creative. Keep language simple but engaging.",
				},
				{
					"role":    "user",
					"content": prompt,
				},
			},
		}

		jsonData, err := json.Marshal(perplexityReq)
		if err != nil {
			return nil, fmt.Errorf("failed to marshal request: %w", err)
		}

		httpReq, err := http.NewRequest("POST", "https://api.perplexity.ai/chat/completions", bytes.NewBuffer(jsonData))
		if err != nil {
			return nil, fmt.Errorf("failed to create request: %w", err)
		}

		httpReq.Header.Set("Authorization", "Bearer "+h.PerplexityKey)
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

		var perplexityResp struct {
			Choices []struct {
				Message struct {
					Content string `json:"content"`
				} `json:"message"`
			} `json:"choices"`
		}

		if err := json.Unmarshal(body, &perplexityResp); err != nil {
			return nil, fmt.Errorf("failed to unmarshal response: %w", err)
		}

		if len(perplexityResp.Choices) == 0 {
			return nil, fmt.Errorf("no response from API")
		}

		content = perplexityResp.Choices[0].Message.Content
	} else {
		return nil, fmt.Errorf("no AI provider configured")
	}

	storyResp := &StoryResponse{
		Content:     content,
		GeneratedAt: time.Now(),
	}

	return storyResp, nil
}

func (h *PuzzleHub) buildStoryPrompt(req StoryRequest) string {
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

// Feedback System Functions
func (h *PuzzleHub) submitFeedback(c *gin.Context) {
	user, exists := c.Get("user")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not found"})
		return
	}
	userObj := user.(*User)

	var submission FeedbackSubmission
	if err := c.ShouldBindJSON(&submission); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Validate rating if provided
	if submission.Rating != 0 && (submission.Rating < 1 || submission.Rating > 5) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Rating must be between 1 and 5"})
		return
	}

	// Generate unique ID
	feedbackID := fmt.Sprintf("fb_%d", time.Now().UnixNano())

	// Create feedback object
	feedback := Feedback{
		ID:          feedbackID,
		UserID:      userObj.ID,
		UserEmail:   userObj.Email,
		UserName:    userObj.Name,
		Type:        submission.Type,
		AppName:     submission.AppName,
		Rating:      submission.Rating,
		Title:       submission.Title,
		Description: submission.Description,
		AIAppIdea:   submission.AIAppIdea,
		UseCase:     submission.UseCase,
		CreatedAt:   time.Now(),
		Status:      "new",
	}

	// Marshal feedback to DynamoDB format
	feedbackItem, err := dynamodbattribute.MarshalMap(feedback)
	if err != nil {
		log.Printf("Error marshaling feedback: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to submit feedback"})
		return
	}

	// Put feedback in DynamoDB
	_, err = h.DynamoDB.PutItem(&dynamodb.PutItemInput{
		TableName: aws.String("puzzle-hub-feedback"),
		Item:      feedbackItem,
	})
	if err != nil {
		log.Printf("⚠️  Error putting feedback to DynamoDB: %v", err)
		log.Printf("💡 Note: The table 'puzzle-hub-feedback' may not exist. Feedback recorded in logs but not persisted.")
		// Don't fail the request - still acknowledge the feedback
		log.Printf("📝 FEEDBACK SUBMITTED (not persisted): Type=%s, UserID=%s, Email=%s, Title=%s, Description=%s",
			feedback.Type, feedback.UserID, feedback.UserEmail, feedback.Title, feedback.Description)
	} else {
		log.Printf("✅ Feedback submitted to DynamoDB: Type=%s, UserID=%s, Title=%s", feedback.Type, feedback.UserID, feedback.Title)
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Thank you for your feedback!",
		"id":      feedbackID,
	})
}

func (h *PuzzleHub) getAllFeedback(c *gin.Context) {
	user, exists := c.Get("user")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not found"})
		return
	}
	userObj := user.(*User)

	// Try to query user's feedback with index first
	queryResult, err := h.DynamoDB.Query(&dynamodb.QueryInput{
		TableName:              aws.String("puzzle-hub-feedback"),
		IndexName:              aws.String("user_id-created_at-index"),
		KeyConditionExpression: aws.String("user_id = :user_id"),
		ExpressionAttributeValues: map[string]*dynamodb.AttributeValue{
			":user_id": {S: aws.String(userObj.ID)},
		},
		ScanIndexForward: aws.Bool(false), // Most recent first
	})

	var items []map[string]*dynamodb.AttributeValue

	if err != nil {
		// If index doesn't exist or table doesn't exist, try scan as fallback
		log.Printf("⚠️  Query with index failed: %v. Trying scan...", err)

		scanResult, scanErr := h.DynamoDB.Scan(&dynamodb.ScanInput{
			TableName:        aws.String("puzzle-hub-feedback"),
			FilterExpression: aws.String("user_id = :user_id"),
			ExpressionAttributeValues: map[string]*dynamodb.AttributeValue{
				":user_id": {S: aws.String(userObj.ID)},
			},
		})

		if scanErr != nil {
			log.Printf("❌ Scan also failed: %v. Table may not exist.", scanErr)
			// Return empty list instead of error
			c.JSON(http.StatusOK, gin.H{
				"feedback": []Feedback{},
				"count":    0,
				"message":  "Feedback table not yet initialized. Your feedback will be saved when you submit.",
			})
			return
		}
		items = scanResult.Items
	} else {
		items = queryResult.Items
	}

	var feedbackList []Feedback
	err = dynamodbattribute.UnmarshalListOfMaps(items, &feedbackList)
	if err != nil {
		log.Printf("Error unmarshaling feedback: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to parse feedback"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"feedback": feedbackList,
		"count":    len(feedbackList),
	})
}

// Web server setup
// Analytics tracking types
type AnalyticsEvent struct {
	ID        string    `json:"id" dynamodbav:"id"`
	EventType string    `json:"event_type" dynamodbav:"event_type"` // "visit", "login"
	Timestamp time.Time `json:"timestamp" dynamodbav:"timestamp"`
	IP        string    `json:"ip,omitempty" dynamodbav:"ip,omitempty"`
	UserID    string    `json:"user_id,omitempty" dynamodbav:"user_id,omitempty"`
	IsNew     bool      `json:"is_new" dynamodbav:"is_new"` // New visitor or new user
}

// In-memory cache for quick lookups (synced from DynamoDB on startup)
var (
	totalVisits    int64
	totalLogins    int64
	uniqueVisitors = make(map[string]bool) // Track by IP
	uniqueUsers    = make(map[string]bool) // Track by User ID
	analyticsDB    *dynamodb.DynamoDB
)

func logAnalytics() {
	log.Printf("📊 ANALYTICS - Total Visits: %d | Unique Visitors: %d | Total Logins: %d | Unique Users: %d",
		totalVisits, len(uniqueVisitors), totalLogins, len(uniqueUsers))
}

func saveAnalyticsEvent(eventType, ip, userID string, isNew bool) error {
	event := AnalyticsEvent{
		ID:        fmt.Sprintf("%s_%d", eventType, time.Now().UnixNano()),
		EventType: eventType,
		Timestamp: time.Now(),
		IP:        ip,
		UserID:    userID,
		IsNew:     isNew,
	}

	item, err := dynamodbattribute.MarshalMap(event)
	if err != nil {
		return err
	}

	_, err = analyticsDB.PutItem(&dynamodb.PutItemInput{
		TableName: aws.String("puzzle-hub-analytics"),
		Item:      item,
	})
	return err
}

func loadAnalyticsFromDB(db *dynamodb.DynamoDB) error {
	analyticsDB = db

	// Scan analytics table to rebuild in-memory cache
	result, err := db.Scan(&dynamodb.ScanInput{
		TableName: aws.String("puzzle-hub-analytics"),
	})
	if err != nil {
		return err
	}

	visitorIPs := make(map[string]bool)
	userIDs := make(map[string]bool)

	for _, item := range result.Items {
		var event AnalyticsEvent
		if err := dynamodbattribute.UnmarshalMap(item, &event); err != nil {
			continue
		}

		if event.EventType == "visit" {
			totalVisits++
			if event.IP != "" {
				visitorIPs[event.IP] = true
			}
		} else if event.EventType == "login" {
			totalLogins++
			if event.UserID != "" {
				userIDs[event.UserID] = true
			}
		}
	}

	uniqueVisitors = visitorIPs
	uniqueUsers = userIDs

	log.Printf("📊 Loaded analytics from DynamoDB: %d visits, %d unique visitors, %d logins, %d unique users",
		totalVisits, len(uniqueVisitors), totalLogins, len(uniqueUsers))

	return nil
}

func setupRoutes(hub *PuzzleHub) *gin.Engine {
	r := gin.Default()

	// Analytics middleware - track every request
	r.Use(func(c *gin.Context) {
		// Only count page visits, not API calls or static files
		if !strings.HasPrefix(c.Request.URL.Path, "/api/") &&
			!strings.HasPrefix(c.Request.URL.Path, "/static/") &&
			c.Request.URL.Path != "/favicon.ico" {

			totalVisits++
			clientIP := c.ClientIP()
			isNewVisitor := !uniqueVisitors[clientIP]

			if isNewVisitor {
				uniqueVisitors[clientIP] = true
				log.Printf("🆕 New visitor from IP: %s | Total visits: %d | Unique visitors: %d",
					clientIP, totalVisits, len(uniqueVisitors))
			}

			// Save to DynamoDB (async to not slow down requests)
			go func() {
				if err := saveAnalyticsEvent("visit", clientIP, "", isNewVisitor); err != nil {
					log.Printf("Warning: Failed to save visit event: %v", err)
				}
			}()

			// Log analytics every 10 visits
			if totalVisits%10 == 0 {
				logAnalytics()
			}
		}
		c.Next()
	})

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

			// Track login analytics
			totalLogins++
			isNewUser := !uniqueUsers[user.ID]
			if isNewUser {
				uniqueUsers[user.ID] = true
			}

			if isNewUser {
				log.Printf("🎉 New user login | Total logins: %d | Unique users: %d", totalLogins, len(uniqueUsers))
			} else {
				log.Printf("🔄 Returning user login | Total logins: %d | Unique users: %d", totalLogins, len(uniqueUsers))
			}

			// Save to DynamoDB (async)
			go func() {
				if err := saveAnalyticsEvent("login", "", user.ID, isNewUser); err != nil {
					log.Printf("Warning: Failed to save login event: %v", err)
				}
			}()

			// Log full analytics every 5 logins
			if totalLogins%5 == 0 {
				logAnalytics()
			}

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

		// Story Starter endpoints
		api.POST("/story/generate", func(c *gin.Context) {
			var request StoryRequest
			if err := c.ShouldBindJSON(&request); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}

			story, err := hub.GenerateStory(request)
			if err != nil {
				log.Printf("Error generating story: %v", err)
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate story"})
				return
			}

			c.JSON(http.StatusOK, story)
		})

		// Feedback endpoints
		api.POST("/feedback/submit", hub.submitFeedback)
		api.GET("/feedback/list", hub.getAllFeedback)

		// Custom Logging System endpoints
		// Log Types
		api.GET("/logs/types", hub.getLogTypes)
		api.POST("/logs/types/suggest-fields", hub.suggestLogFields)
		api.POST("/logs/types", hub.createLogType)
		api.PUT("/logs/types/:id", hub.updateLogType)
		api.DELETE("/logs/types/:id", hub.deleteLogType)

		// Log Entries
		api.GET("/logs/entries", hub.getLogEntries)
		api.POST("/logs/entries", hub.createLogEntry)
		api.PUT("/logs/entries/:id", hub.updateLogEntry)
		api.DELETE("/logs/entries/:id", hub.deleteLogEntry)

		// Analytics
		api.GET("/logs/analytics", hub.getLogAnalytics)
		api.GET("/logs/analytics/:logTypeId", hub.getLogTypeAnalytics)
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
	// Use Google ID as the stable user ID
	// This ensures the same user gets the same ID across sessions
	stableUserID := googleUser.ID

	// Check if user already exists
	if user, exists := h.Users[stableUserID]; exists {
		// Update user info and last login
		user.Email = googleUser.Email
		user.Name = googleUser.Name
		user.Picture = googleUser.Picture
		user.LastLoginAt = time.Now()
		log.Printf("✅ Existing user logged in")
		return user
	}

	// Create new user
	user := &User{
		ID:          stableUserID,
		Email:       googleUser.Email,
		Name:        googleUser.Name,
		Picture:     googleUser.Picture,
		GoogleID:    googleUser.ID,
		CreatedAt:   time.Now(),
		LastLoginAt: time.Now(),
	}

	h.Users[stableUserID] = user
	log.Printf("🆕 New user created")
	return user
}

// Middleware for authentication
func (h *PuzzleHub) authMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Skip auth for public endpoints and puzzle games
		path := c.Request.URL.Path
		if strings.HasPrefix(path, "/static/") ||
			strings.HasPrefix(path, "/auth/") ||
			strings.HasPrefix(path, "/api/spelling/") ||
			strings.HasPrefix(path, "/api/yohaku/") ||
			strings.HasPrefix(path, "/api/writing/") ||
			path == "/" ||
			path == "/terms" ||
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

// Custom Logging System Handlers

// Log Types handlers
func (h *PuzzleHub) getLogTypes(c *gin.Context) {
	user, exists := c.Get("user")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not found"})
		return
	}
	userObj := user.(*User)

	log.Printf("🔍 Fetching log types for user")

	// Query log types for the user
	result, err := h.DynamoDB.Query(&dynamodb.QueryInput{
		TableName:              aws.String("puzzle-hub-log-types"),
		IndexName:              aws.String("user-id-index"),
		KeyConditionExpression: aws.String("user_id = :user_id"),
		ExpressionAttributeValues: map[string]*dynamodb.AttributeValue{
			":user_id": {
				S: aws.String(userObj.ID),
			},
		},
	})
	if err != nil {
		log.Printf("❌ Error querying log types: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch log types"})
		return
	}

	log.Printf("📋 Found %d log type items in DynamoDB", len(result.Items))

	var logTypes []LogType
	for _, item := range result.Items {
		var logType LogType
		err := dynamodbattribute.UnmarshalMap(item, &logType)
		if err != nil {
			log.Printf("❌ Error unmarshaling log type: %v", err)
			continue
		}

		log.Printf("✅ Unmarshaled log type: %s (ID: %s)", logType.Name, logType.ID)

		// Query fields for this log type
		fieldsResult, err := h.DynamoDB.Query(&dynamodb.QueryInput{
			TableName:              aws.String("puzzle-hub-log-fields"),
			IndexName:              aws.String("log-type-id-index"),
			KeyConditionExpression: aws.String("log_type_id = :log_type_id"),
			ExpressionAttributeValues: map[string]*dynamodb.AttributeValue{
				":log_type_id": {
					S: aws.String(logType.ID),
				},
			},
		})
		if err != nil {
			log.Printf("❌ Error querying log fields for %s: %v", logType.Name, err)
			// Continue without fields
		} else {
			var fields []LogField
			for _, fieldItem := range fieldsResult.Items {
				var field LogField
				err := dynamodbattribute.UnmarshalMap(fieldItem, &field)
				if err != nil {
					log.Printf("❌ Error unmarshaling log field: %v", err)
					continue
				}
				fields = append(fields, field)
			}
			logType.Fields = fields
			log.Printf("📝 Added %d fields to log type: %s", len(fields), logType.Name)
		}

		logTypes = append(logTypes, logType)
	}

	log.Printf("✅ Returning %d log types to client", len(logTypes))
	c.JSON(http.StatusOK, gin.H{"log_types": logTypes})
}

func (h *PuzzleHub) createLogType(c *gin.Context) {
	user, exists := c.Get("user")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not found"})
		return
	}
	userObj := user.(*User)

	var request CreateLogTypeRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		log.Printf("Error binding JSON in createLogType: %v", err)
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	log.Printf("Creating log type: %+v", request)

	// Generate unique ID for log type
	logTypeID := fmt.Sprintf("lt_%d", time.Now().UnixNano())

	// Create log type
	logType := LogType{
		ID:          logTypeID,
		UserID:      userObj.ID,
		Name:        request.Name,
		Description: request.Description,
		Color:       request.Color,
		Icon:        request.Icon,
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}

	// Marshal log type to DynamoDB format
	logTypeItem, err := dynamodbattribute.MarshalMap(logType)
	if err != nil {
		log.Printf("Error marshaling log type: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create log type"})
		return
	}

	// Put log type in DynamoDB
	_, err = h.DynamoDB.PutItem(&dynamodb.PutItemInput{
		TableName: aws.String("puzzle-hub-log-types"),
		Item:      logTypeItem,
	})
	if err != nil {
		log.Printf("❌ Error putting log type: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create log type"})
		return
	}

	log.Printf("✅ Successfully created log type: %s (ID: %s)", logType.Name, logType.ID)

	// Create log fields
	for i, field := range request.Fields {
		fieldID := fmt.Sprintf("lf_%d_%d", time.Now().UnixNano(), i)
		logField := LogField{
			ID:           fieldID,
			LogTypeID:    logTypeID,
			FieldName:    field.FieldName,
			FieldType:    FieldType(field.FieldType),
			Required:     field.Required,
			Options:      field.Options,
			DefaultValue: field.DefaultValue,
			DisplayOrder: i,
		}

		fieldItem, err := dynamodbattribute.MarshalMap(logField)
		if err != nil {
			log.Printf("Error marshaling log field: %v", err)
			continue
		}

		_, err = h.DynamoDB.PutItem(&dynamodb.PutItemInput{
			TableName: aws.String("puzzle-hub-log-fields"),
			Item:      fieldItem,
		})
		if err != nil {
			log.Printf("Error putting log field: %v", err)
			// Continue with other fields
		}
	}

	c.JSON(http.StatusCreated, gin.H{
		"message":     "Log type created successfully",
		"log_type_id": logTypeID,
	})
}

func (h *PuzzleHub) updateLogType(c *gin.Context) {
	// Implementation for updating log types
	c.JSON(http.StatusNotImplemented, gin.H{"error": "Not implemented yet"})
}

func (h *PuzzleHub) deleteLogType(c *gin.Context) {
	// Implementation for deleting log types
	c.JSON(http.StatusNotImplemented, gin.H{"error": "Not implemented yet"})
}

// AI-powered field suggestion using Perplexity
func (h *PuzzleHub) suggestLogFields(c *gin.Context) {
	_, exists := c.Get("user")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not found"})
		return
	}

	var request SuggestFieldsRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		log.Printf("Error binding JSON in suggestLogFields: %v", err)
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	log.Printf("Suggesting fields for log type: %s", request.LogTypeName)

	// Build prompt for Perplexity
	prompt := fmt.Sprintf(`You are an expert in data logging and tracking systems. A user wants to create a custom log type called "%s".

Description: %s

Please suggest 5-8 relevant fields that would be useful for tracking this type of activity. For each field, provide:
1. Field name (concise, no spaces, use underscores)
2. Field type (text, number, textarea, select, checkbox)
3. Whether it should be required (true/false)
4. Default value (if applicable)
5. Options (if it's a select field, provide comma-separated options)
6. Brief description of what this field tracks

Focus on fields that would provide meaningful insights and analytics. For trading logs, include fields like entry_price, exit_price, quantity, profit_loss, strategy, etc. For gym logs, include fields like exercise, weight, sets, reps, duration, etc.

Respond ONLY with a JSON object in this exact format:
{
  "suggested_fields": [
    {
      "field_name": "example_field",
      "field_type": "number",
      "required": true,
      "default_value": "",
      "options": "",
      "description": "Brief description"
    }
  ],
  "explanation": "Brief explanation of why these fields are useful for this log type"
}`, request.LogTypeName, request.Description)

	// Call Perplexity API
	response, err := h.generateWithPerplexity(prompt)
	if err != nil {
		log.Printf("Error calling Perplexity API: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate field suggestions"})
		return
	}

	// Parse the JSON response
	var suggestionsResponse SuggestFieldsResponse
	if err := json.Unmarshal([]byte(response), &suggestionsResponse); err != nil {
		log.Printf("Error parsing Perplexity response: %v", err)
		// Fallback to basic suggestions
		suggestionsResponse = h.getFallbackFieldSuggestions(request.LogTypeName)
	}

	c.JSON(http.StatusOK, suggestionsResponse)
}

// Fallback field suggestions if AI fails
func (h *PuzzleHub) getFallbackFieldSuggestions(logTypeName string) SuggestFieldsResponse {
	logTypeLower := strings.ToLower(logTypeName)

	var fields []SuggestedField
	var explanation string

	if strings.Contains(logTypeLower, "gym") || strings.Contains(logTypeLower, "workout") || strings.Contains(logTypeLower, "exercise") {
		fields = []SuggestedField{
			{FieldName: "exercise", FieldType: "text", Required: true, Description: "Name of the exercise"},
			{FieldName: "weight", FieldType: "number", Required: false, DefaultValue: "0", Description: "Weight used in kg/lbs"},
			{FieldName: "sets", FieldType: "number", Required: true, Description: "Number of sets performed"},
			{FieldName: "reps", FieldType: "number", Required: true, Description: "Repetitions per set"},
			{FieldName: "duration", FieldType: "number", Required: false, Description: "Duration in minutes"},
			{FieldName: "notes", FieldType: "textarea", Required: false, Description: "Additional notes"},
		}
		explanation = "These fields help track workout progress, strength gains, and exercise performance over time."
	} else if strings.Contains(logTypeLower, "trading") || strings.Contains(logTypeLower, "trade") {
		fields = []SuggestedField{
			{FieldName: "symbol", FieldType: "text", Required: true, Description: "Trading symbol (e.g., AAPL, BTC)"},
			{FieldName: "entry_price", FieldType: "number", Required: true, Description: "Entry price"},
			{FieldName: "exit_price", FieldType: "number", Required: false, Description: "Exit price"},
			{FieldName: "quantity", FieldType: "number", Required: true, Description: "Number of shares/units"},
			{FieldName: "trade_type", FieldType: "select", Required: true, Options: "Buy,Sell,Short,Cover", Description: "Type of trade"},
			{FieldName: "profit_loss", FieldType: "number", Required: false, Description: "Profit or loss amount"},
			{FieldName: "strategy", FieldType: "text", Required: false, Description: "Trading strategy used"},
		}
		explanation = "These fields enable comprehensive trade tracking, P&L analysis, and strategy performance evaluation."
	} else {
		fields = []SuggestedField{
			{FieldName: "title", FieldType: "text", Required: true, Description: "Title or name"},
			{FieldName: "amount", FieldType: "number", Required: false, Description: "Numeric value"},
			{FieldName: "category", FieldType: "select", Required: false, Options: "Category 1,Category 2,Category 3", Description: "Category classification"},
			{FieldName: "completed", FieldType: "checkbox", Required: false, Description: "Completion status"},
			{FieldName: "notes", FieldType: "textarea", Required: false, Description: "Additional notes"},
		}
		explanation = "These are general-purpose fields that can be customized for various logging needs."
	}

	return SuggestFieldsResponse{
		SuggestedFields: fields,
		Explanation:     explanation,
	}
}

// Log Entries handlers
func (h *PuzzleHub) getLogEntries(c *gin.Context) {
	user, exists := c.Get("user")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not found"})
		return
	}
	userObj := user.(*User)

	// Get log_type_id from query parameter
	logTypeId := c.Query("log_type_id")

	var result *dynamodb.QueryOutput
	var err error

	if logTypeId != "" {
		// Query log entries for specific log type
		result, err = h.DynamoDB.Query(&dynamodb.QueryInput{
			TableName:              aws.String("puzzle-hub-log-entries"),
			IndexName:              aws.String("user-date-index"),
			KeyConditionExpression: aws.String("user_id = :user_id"),
			FilterExpression:       aws.String("log_type_id = :log_type_id"),
			ExpressionAttributeValues: map[string]*dynamodb.AttributeValue{
				":user_id": {
					S: aws.String(userObj.ID),
				},
				":log_type_id": {
					S: aws.String(logTypeId),
				},
			},
		})
	} else {
		// Query all log entries for the user
		result, err = h.DynamoDB.Query(&dynamodb.QueryInput{
			TableName:              aws.String("puzzle-hub-log-entries"),
			IndexName:              aws.String("user-date-index"),
			KeyConditionExpression: aws.String("user_id = :user_id"),
			ExpressionAttributeValues: map[string]*dynamodb.AttributeValue{
				":user_id": {
					S: aws.String(userObj.ID),
				},
			},
		})
	}

	if err != nil {
		log.Printf("Error querying log entries: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch log entries"})
		return
	}

	var logEntries []LogEntry
	for _, item := range result.Items {
		var entry LogEntry
		err := dynamodbattribute.UnmarshalMap(item, &entry)
		if err != nil {
			log.Printf("Error unmarshaling log entry: %v", err)
			continue
		}
		logEntries = append(logEntries, entry)
	}

	// If a specific log type was requested, also return the log type info
	var logType *LogType
	if logTypeId != "" {
		logTypeResult, err := h.DynamoDB.GetItem(&dynamodb.GetItemInput{
			TableName: aws.String("puzzle-hub-log-types"),
			Key: map[string]*dynamodb.AttributeValue{
				"id": {
					S: aws.String(logTypeId),
				},
			},
		})
		if err == nil && logTypeResult.Item != nil {
			var lt LogType
			if dynamodbattribute.UnmarshalMap(logTypeResult.Item, &lt) == nil && lt.UserID == userObj.ID {
				logType = &lt
			}
		}
	}

	response := gin.H{"log_entries": logEntries}
	if logType != nil {
		response["log_type"] = logType
	}

	c.JSON(http.StatusOK, response)
}

func (h *PuzzleHub) createLogEntry(c *gin.Context) {
	user, exists := c.Get("user")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not found"})
		return
	}
	userObj := user.(*User)

	var request CreateLogEntryRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Validate entry date format
	_, err := time.Parse("2006-01-02", request.EntryDate)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid date format. Use YYYY-MM-DD"})
		return
	}

	// Generate unique ID for log entry
	entryID := fmt.Sprintf("le_%d", time.Now().UnixNano())

	// Create log entry
	logEntry := LogEntry{
		ID:        entryID,
		LogTypeID: request.LogTypeID,
		UserID:    userObj.ID,
		EntryDate: request.EntryDate,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
		Values:    request.Values,
	}

	// Marshal log entry to DynamoDB format
	entryItem, err := dynamodbattribute.MarshalMap(logEntry)
	if err != nil {
		log.Printf("Error marshaling log entry: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create log entry"})
		return
	}

	// Put log entry in DynamoDB
	_, err = h.DynamoDB.PutItem(&dynamodb.PutItemInput{
		TableName: aws.String("puzzle-hub-log-entries"),
		Item:      entryItem,
	})
	if err != nil {
		log.Printf("Error putting log entry: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create log entry"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"message":  "Log entry created successfully",
		"entry_id": entryID,
	})
}

func (h *PuzzleHub) updateLogEntry(c *gin.Context) {
	// Implementation for updating log entries
	c.JSON(http.StatusNotImplemented, gin.H{"error": "Not implemented yet"})
}

func (h *PuzzleHub) deleteLogEntry(c *gin.Context) {
	user, exists := c.Get("user")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not found"})
		return
	}
	userObj := user.(*User)

	entryId := c.Param("id")
	if entryId == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Entry ID is required"})
		return
	}

	// First, get the entry to verify ownership
	getResult, err := h.DynamoDB.GetItem(&dynamodb.GetItemInput{
		TableName: aws.String("puzzle-hub-log-entries"),
		Key: map[string]*dynamodb.AttributeValue{
			"id": {
				S: aws.String(entryId),
			},
		},
	})
	if err != nil {
		log.Printf("Error getting log entry for deletion: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to verify entry"})
		return
	}

	if getResult.Item == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Log entry not found"})
		return
	}

	// Unmarshal to verify ownership
	var entry LogEntry
	err = dynamodbattribute.UnmarshalMap(getResult.Item, &entry)
	if err != nil {
		log.Printf("Error unmarshaling log entry: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to parse entry"})
		return
	}

	// Verify ownership
	if entry.UserID != userObj.ID {
		c.JSON(http.StatusForbidden, gin.H{"error": "Access denied"})
		return
	}

	// Delete the entry
	_, err = h.DynamoDB.DeleteItem(&dynamodb.DeleteItemInput{
		TableName: aws.String("puzzle-hub-log-entries"),
		Key: map[string]*dynamodb.AttributeValue{
			"id": {
				S: aws.String(entryId),
			},
		},
	})
	if err != nil {
		log.Printf("Error deleting log entry: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete entry"})
		return
	}

	log.Printf("Log entry %s deleted successfully by user %s", entryId, userObj.ID)
	c.JSON(http.StatusOK, gin.H{
		"message": "Log entry deleted successfully",
	})
}

// Analytics handlers
func (h *PuzzleHub) getLogAnalytics(c *gin.Context) {
	user, exists := c.Get("user")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not found"})
		return
	}
	userObj := user.(*User)

	// Get all log types for the user
	logTypesResult, err := h.DynamoDB.Query(&dynamodb.QueryInput{
		TableName:              aws.String("puzzle-hub-log-types"),
		IndexName:              aws.String("user-id-index"),
		KeyConditionExpression: aws.String("user_id = :user_id"),
		ExpressionAttributeValues: map[string]*dynamodb.AttributeValue{
			":user_id": {
				S: aws.String(userObj.ID),
			},
		},
	})
	if err != nil {
		log.Printf("Error querying log types for analytics: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch analytics"})
		return
	}

	var analytics []LogAnalytics
	totalEntries := 0

	for _, item := range logTypesResult.Items {
		var logType LogType
		err := dynamodbattribute.UnmarshalMap(item, &logType)
		if err != nil {
			log.Printf("Error unmarshaling log type: %v", err)
			continue
		}

		// Get entries for this log type
		entriesResult, err := h.DynamoDB.Query(&dynamodb.QueryInput{
			TableName:              aws.String("puzzle-hub-log-entries"),
			IndexName:              aws.String("user-date-index"),
			KeyConditionExpression: aws.String("user_id = :user_id"),
			FilterExpression:       aws.String("log_type_id = :log_type_id"),
			ExpressionAttributeValues: map[string]*dynamodb.AttributeValue{
				":user_id": {
					S: aws.String(userObj.ID),
				},
				":log_type_id": {
					S: aws.String(logType.ID),
				},
			},
		})
		if err != nil {
			log.Printf("Error querying entries for log type %s: %v", logType.ID, err)
			continue
		}

		entryCount := len(entriesResult.Items)
		totalEntries += entryCount

		// Calculate monthly data and other analytics
		monthlyData := h.calculateMonthlyData(entriesResult.Items)
		thisMonth, thisWeek := h.calculateRecentActivity(entriesResult.Items)

		analytics = append(analytics, LogAnalytics{
			LogTypeID:     logType.ID,
			LogTypeName:   logType.Name,
			TotalEntries:  entryCount,
			ThisMonth:     thisMonth,
			ThisWeek:      thisWeek,
			DailyActivity: make(map[string]interface{}),
			MonthlyTrend:  monthlyData,
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"analytics":       analytics,
		"total_entries":   totalEntries,
		"total_log_types": len(logTypesResult.Items),
	})
}

func (h *PuzzleHub) getLogTypeAnalytics(c *gin.Context) {
	user, exists := c.Get("user")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not found"})
		return
	}
	userObj := user.(*User)

	logTypeId := c.Param("logTypeId")
	if logTypeId == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Log type ID is required"})
		return
	}

	// Get the log type
	logTypeResult, err := h.DynamoDB.GetItem(&dynamodb.GetItemInput{
		TableName: aws.String("puzzle-hub-log-types"),
		Key: map[string]*dynamodb.AttributeValue{
			"id": {
				S: aws.String(logTypeId),
			},
		},
	})
	if err != nil {
		log.Printf("Error getting log type: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch log type"})
		return
	}

	if logTypeResult.Item == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Log type not found"})
		return
	}

	var logType LogType
	err = dynamodbattribute.UnmarshalMap(logTypeResult.Item, &logType)
	if err != nil {
		log.Printf("Error unmarshaling log type: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to parse log type"})
		return
	}

	// Verify ownership
	if logType.UserID != userObj.ID {
		c.JSON(http.StatusForbidden, gin.H{"error": "Access denied"})
		return
	}

	// Get all entries for this log type
	entriesResult, err := h.DynamoDB.Query(&dynamodb.QueryInput{
		TableName:              aws.String("puzzle-hub-log-entries"),
		IndexName:              aws.String("user-date-index"),
		KeyConditionExpression: aws.String("user_id = :user_id"),
		FilterExpression:       aws.String("log_type_id = :log_type_id"),
		ExpressionAttributeValues: map[string]*dynamodb.AttributeValue{
			":user_id": {
				S: aws.String(userObj.ID),
			},
			":log_type_id": {
				S: aws.String(logTypeId),
			},
		},
	})
	if err != nil {
		log.Printf("Error querying entries: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch entries"})
		return
	}

	// Calculate detailed analytics
	monthlyData := h.calculateMonthlyData(entriesResult.Items)
	thisMonth, thisWeek := h.calculateRecentActivity(entriesResult.Items)
	dailyActivity := h.calculateDailyActivity(entriesResult.Items)
	fieldAnalytics := h.calculateFieldAnalytics(entriesResult.Items, logType.Fields)

	analytics := LogAnalytics{
		LogTypeID:     logType.ID,
		LogTypeName:   logType.Name,
		TotalEntries:  len(entriesResult.Items),
		ThisMonth:     thisMonth,
		ThisWeek:      thisWeek,
		DailyActivity: dailyActivity,
		MonthlyTrend:  monthlyData,
	}

	c.JSON(http.StatusOK, gin.H{
		"analytics":       analytics,
		"field_analytics": fieldAnalytics,
		"log_type":        logType,
	})
}

// Helper functions for analytics calculations
func (h *PuzzleHub) calculateMonthlyData(items []map[string]*dynamodb.AttributeValue) []MonthlyData {
	monthCounts := make(map[string]int)

	for _, item := range items {
		var entry LogEntry
		err := dynamodbattribute.UnmarshalMap(item, &entry)
		if err != nil {
			continue
		}

		// Parse date and get month
		if date, err := time.Parse("2006-01-02", entry.EntryDate); err == nil {
			monthKey := date.Format("2006-01")
			monthCounts[monthKey]++
		}
	}

	var monthlyData []MonthlyData
	for month, count := range monthCounts {
		monthlyData = append(monthlyData, MonthlyData{
			Month:   month,
			Count:   count,
			Summary: nil, // Can be enhanced with field-specific summaries
		})
	}

	return monthlyData
}

func (h *PuzzleHub) calculateRecentActivity(items []map[string]*dynamodb.AttributeValue) (int, int) {
	now := time.Now()
	thisMonth := 0
	thisWeek := 0

	for _, item := range items {
		var entry LogEntry
		err := dynamodbattribute.UnmarshalMap(item, &entry)
		if err != nil {
			continue
		}

		if date, err := time.Parse("2006-01-02", entry.EntryDate); err == nil {
			// This month
			if date.Year() == now.Year() && date.Month() == now.Month() {
				thisMonth++
			}

			// This week (last 7 days)
			if now.Sub(date).Hours() <= 7*24 {
				thisWeek++
			}
		}
	}

	return thisMonth, thisWeek
}

func (h *PuzzleHub) calculateDailyActivity(items []map[string]*dynamodb.AttributeValue) map[string]interface{} {
	dailyActivity := make(map[string]interface{})

	for _, item := range items {
		var entry LogEntry
		err := dynamodbattribute.UnmarshalMap(item, &entry)
		if err != nil {
			continue
		}

		if _, exists := dailyActivity[entry.EntryDate]; !exists {
			dailyActivity[entry.EntryDate] = map[string]interface{}{
				"count":   0,
				"entries": []map[string]interface{}{},
			}
		}

		dayData := dailyActivity[entry.EntryDate].(map[string]interface{})
		dayData["count"] = dayData["count"].(int) + 1

		entryData := map[string]interface{}{
			"id":     entry.ID,
			"values": entry.Values,
		}
		dayData["entries"] = append(dayData["entries"].([]map[string]interface{}), entryData)

		dailyActivity[entry.EntryDate] = dayData
	}

	return dailyActivity
}

func (h *PuzzleHub) calculateFieldAnalytics(items []map[string]*dynamodb.AttributeValue, fields []LogField) map[string]interface{} {
	fieldAnalytics := make(map[string]interface{})

	for _, field := range fields {
		fieldStats := map[string]interface{}{
			"field_name":     field.FieldName,
			"field_type":     field.FieldType,
			"total_entries":  0,
			"filled_entries": 0,
		}

		values := []interface{}{}
		numericValues := []float64{}

		for _, item := range items {
			var entry LogEntry
			err := dynamodbattribute.UnmarshalMap(item, &entry)
			if err != nil {
				continue
			}

			fieldStats["total_entries"] = fieldStats["total_entries"].(int) + 1

			if value, exists := entry.Values[field.FieldName]; exists && value != nil {
				fieldStats["filled_entries"] = fieldStats["filled_entries"].(int) + 1
				values = append(values, value)

				// For numeric fields, calculate statistics
				if field.FieldType == FieldTypeNumber {
					if numVal, ok := value.(float64); ok {
						numericValues = append(numericValues, numVal)
					}
				}
			}
		}

		// Calculate numeric statistics
		if len(numericValues) > 0 {
			sum := 0.0
			min := numericValues[0]
			max := numericValues[0]

			for _, val := range numericValues {
				sum += val
				if val < min {
					min = val
				}
				if val > max {
					max = val
				}
			}

			fieldStats["sum"] = sum
			fieldStats["average"] = sum / float64(len(numericValues))
			fieldStats["min"] = min
			fieldStats["max"] = max
		}

		fieldStats["sample_values"] = values
		fieldAnalytics[field.FieldName] = fieldStats
	}

	return fieldAnalytics
}

func main() {
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found, using system environment variables")
	}

	// Start periodic analytics reporting (every hour)
	go func() {
		ticker := time.NewTicker(1 * time.Hour)
		defer ticker.Stop()
		for range ticker.C {
			log.Println("⏰ HOURLY ANALYTICS REPORT:")
			logAnalytics()
		}
	}()

	provider := os.Getenv("AI_PROVIDER")
	if provider == "" {
		// Default to perplexity if no provider specified
		provider = "perplexity"
	}

	hub, err := NewPuzzleHub(provider)
	if err != nil {
		log.Fatalf("Failed to create puzzle hub: %v", err)
	}

	// Load analytics from DynamoDB
	if err := loadAnalyticsFromDB(hub.DynamoDB); err != nil {
		log.Printf("⚠️  Warning: Failed to load analytics from DynamoDB: %v", err)
		log.Println("📊 Starting with fresh analytics counters")
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
