package main

import (
	"encoding/json"
	"fmt"
	"log"
	"math/rand"
	"net/http"
	"os"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
)

// YohakuPuzzle represents a Yohaku mathematical puzzle
type YohakuPuzzle struct {
	ID        string     `json:"id"`
	Size      int        `json:"size"`      // Grid size (2 for 2x2, 3 for 3x3, etc.)
	Grid      [][]Cell   `json:"grid"`      // The puzzle grid
	Solution  [][]int    `json:"solution"`  // The solution grid
	Operation string     `json:"operation"` // "addition", "subtraction", "multiplication"
	Range     NumberRange `json:"range"`    // Number range for the puzzle
	Difficulty string    `json:"difficulty"` // "easy", "medium", "hard"
}

// Cell represents a single cell in the Yohaku grid
type Cell struct {
	Value     int    `json:"value"`     // The number in the cell (0 if empty)
	IsGiven   bool   `json:"isGiven"`   // Whether this cell is pre-filled
	IsSum     bool   `json:"isSum"`     // Whether this cell shows a sum/result
	SumType   string `json:"sumType"`   // "row", "column", or "cell"
}

// NumberRange defines the range of numbers to use in puzzles
type NumberRange struct {
	Min int `json:"min"`
	Max int `json:"max"`
}

// GameSettings holds the game configuration
type GameSettings struct {
	TimerDuration int         `json:"timerDuration"` // Timer duration in seconds
	Size          int         `json:"size"`          // Grid size
	Operation     string      `json:"operation"`     // Math operation
	Range         NumberRange `json:"range"`         // Number range
	Difficulty    string      `json:"difficulty"`    // Difficulty level
}

// YohakuGenerator handles puzzle generation
type YohakuGenerator struct {
	rand *rand.Rand
}

// NewYohakuGenerator creates a new puzzle generator
func NewYohakuGenerator() *YohakuGenerator {
	return &YohakuGenerator{
		rand: rand.New(rand.NewSource(time.Now().UnixNano())),
	}
}

// GeneratePuzzle creates a new Yohaku puzzle based on settings
func (g *YohakuGenerator) GeneratePuzzle(settings GameSettings) YohakuPuzzle {
	puzzle := YohakuPuzzle{
		ID:        fmt.Sprintf("yohaku_%d", time.Now().UnixNano()),
		Size:      settings.Size,
		Operation: settings.Operation,
		Range:     settings.Range,
		Difficulty: settings.Difficulty,
	}

	// Initialize grid
	puzzle.Grid = make([][]Cell, settings.Size+1)
	puzzle.Solution = make([][]int, settings.Size+1)
	
	for i := range puzzle.Grid {
		puzzle.Grid[i] = make([]Cell, settings.Size+1)
		puzzle.Solution[i] = make([]int, settings.Size+1)
	}

	// Generate the solution first
	g.generateSolution(&puzzle, settings)
	
	// Create the puzzle by hiding some numbers
	g.createPuzzleFromSolution(&puzzle, settings)

	return puzzle
}

// generateSolution creates a complete solution grid
func (g *YohakuGenerator) generateSolution(puzzle *YohakuPuzzle, settings GameSettings) {
	size := settings.Size

	// Fill the main grid with random numbers
	for i := 0; i < size; i++ {
		for j := 0; j < size; j++ {
			puzzle.Solution[i][j] = g.rand.Intn(settings.Range.Max-settings.Range.Min+1) + settings.Range.Min
		}
	}

	// Calculate row sums/results
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

	// Calculate column sums/results
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

	// Calculate corner result (total)
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

// createPuzzleFromSolution creates the puzzle by hiding appropriate cells
func (g *YohakuGenerator) createPuzzleFromSolution(puzzle *YohakuPuzzle, settings GameSettings) {
	size := settings.Size

	// Copy solution to grid initially
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

	// Hide some cells based on difficulty
	cellsToHide := g.getCellsToHide(settings.Difficulty, size)
	hiddenCount := 0

	// Hide random cells in the main grid (not the sum cells)
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

// getCellsToHide returns the number of cells to hide based on difficulty
func (g *YohakuGenerator) getCellsToHide(difficulty string, size int) int {
	totalCells := size * size
	
	switch difficulty {
	case "easy":
		return totalCells / 3 // Hide 1/3 of cells
	case "medium":
		return totalCells / 2 // Hide 1/2 of cells
	case "hard":
		return (totalCells * 2) / 3 // Hide 2/3 of cells
	default:
		return totalCells / 2
	}
}

// setupRoutes configures the web routes
func setupRoutes(generator *YohakuGenerator) *gin.Engine {
	r := gin.Default()

	// Load HTML templates
	r.LoadHTMLGlob("templates/*")
	r.Static("/static", "./static")

	// Main page
	r.GET("/", func(c *gin.Context) {
		c.HTML(http.StatusOK, "index.html", gin.H{
			"title": "Yohaku - Mathematical Puzzle Game",
		})
	})

	// API endpoints
	api := r.Group("/api")
	{
		// Generate new puzzle
		api.POST("/generate", func(c *gin.Context) {
			var settings GameSettings
			if err := c.ShouldBindJSON(&settings); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}

			// Set defaults if not provided
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

			puzzle := generator.GeneratePuzzle(settings)
			c.JSON(http.StatusOK, gin.H{
				"puzzle": puzzle,
				"settings": settings,
			})
		})

		// Validate solution
		api.POST("/validate", func(c *gin.Context) {
			var request struct {
				PuzzleID string     `json:"puzzleId"`
				Grid     [][]Cell   `json:"grid"`
			}

			if err := c.ShouldBindJSON(&request); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}

			// For now, just return success (in a real app, you'd validate against stored solution)
			c.JSON(http.StatusOK, gin.H{
				"valid": true,
				"message": "Puzzle solved correctly!",
			})
		})

		// Get hint
		api.POST("/hint", func(c *gin.Context) {
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

func main() {
	// Initialize random seed
	rand.Seed(time.Now().UnixNano())

	// Create puzzle generator
	generator := NewYohakuGenerator()

	// Setup routes
	r := setupRoutes(generator)

	// Get port from environment or use default
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	fmt.Printf("🧮 Yohaku Mathematical Puzzle Game starting on port %s\n", port)
	fmt.Printf("Visit http://localhost:%s to play!\n", port)

	// Start server
	if err := r.Run(":" + port); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
