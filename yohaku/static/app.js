// Yohaku Game JavaScript

// Game state variables
let currentPuzzle = null;
let gameSettings = {
    timerDuration: 30,
    size: 2,
    operation: 'addition',
    range: { min: 1, max: 10 },
    difficulty: 'easy'
};

// Timer variables
let gameTimer = null;
let timeRemaining = 30;
let timerInterval = null;

// Initialize the game when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    loadSettings();
    updateOperationDisplay();
});

// Load settings from localStorage
function loadSettings() {
    const saved = localStorage.getItem('yohakuSettings');
    if (saved) {
        gameSettings = { ...gameSettings, ...JSON.parse(saved) };
        updateSettingsUI();
    }
}

// Save settings to localStorage
function saveSettings() {
    localStorage.setItem('yohakuSettings', JSON.stringify(gameSettings));
}

// Update settings UI with current values
function updateSettingsUI() {
    document.getElementById('gridSize').value = gameSettings.size;
    document.getElementById('operation').value = gameSettings.operation;
    document.getElementById('difficulty').value = gameSettings.difficulty;
    document.getElementById('timerDuration').value = gameSettings.timerDuration;
    document.getElementById('minRange').value = gameSettings.range.min;
    document.getElementById('maxRange').value = gameSettings.range.max;
}

// Get settings from UI
function getSettingsFromUI() {
    return {
        timerDuration: parseInt(document.getElementById('timerDuration').value),
        size: parseInt(document.getElementById('gridSize').value),
        operation: document.getElementById('operation').value,
        difficulty: document.getElementById('difficulty').value,
        range: {
            min: parseInt(document.getElementById('minRange').value),
            max: parseInt(document.getElementById('maxRange').value)
        }
    };
}

// Update operation display
function updateOperationDisplay() {
    const operation = document.getElementById('operation').value;
    const display = document.getElementById('operationDisplay');
    if (display) {
        switch (operation) {
            case 'addition':
                display.textContent = 'Addition';
                break;
            case 'subtraction':
                display.textContent = 'Subtraction';
                break;
            case 'multiplication':
                display.textContent = 'Multiplication';
                break;
        }
    }
}

// Start a new game
async function startNewGame() {
    gameSettings = getSettingsFromUI();
    saveSettings();
    
    try {
        showLoading(true);
        
        const response = await fetch('/api/generate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(gameSettings)
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        currentPuzzle = result.puzzle;
        
        displayPuzzle(currentPuzzle);
        showGameArea();
        startTimer();
        updateOperationDisplay();
        
    } catch (error) {
        console.error('Error generating puzzle:', error);
        showError('Failed to generate puzzle. Please try again.');
    } finally {
        showLoading(false);
    }
}

// Display the puzzle grid
function displayPuzzle(puzzle) {
    const gridContainer = document.getElementById('puzzleGrid');
    gridContainer.innerHTML = '';
    
    const size = puzzle.size;
    
    for (let i = 0; i <= size; i++) {
        const row = document.createElement('div');
        row.className = 'puzzle-row';
        
        for (let j = 0; j <= size; j++) {
            const cell = document.createElement('div');
            cell.className = 'puzzle-cell';
            
            const cellData = puzzle.grid[i][j];
            
            if (cellData.isSum) {
                // Sum cell - display the sum value
                cell.textContent = cellData.value;
                cell.classList.add('cell-sum');
                
                if (cellData.sumType === 'row') {
                    cell.classList.add('row-sum');
                } else if (cellData.sumType === 'column') {
                    cell.classList.add('column-sum');
                } else if (cellData.sumType === 'total') {
                    cell.classList.add('total-sum');
                }
            } else if (cellData.isGiven) {
                // Given cell - display the number
                cell.textContent = cellData.value;
                cell.classList.add('cell-given');
            } else {
                // Empty cell - create input
                const input = document.createElement('input');
                input.type = 'number';
                input.min = gameSettings.range.min;
                input.max = gameSettings.range.max;
                input.dataset.row = i;
                input.dataset.col = j;
                input.addEventListener('input', handleCellInput);
                input.addEventListener('keypress', handleKeyPress);
                
                cell.appendChild(input);
                cell.classList.add('cell-empty');
            }
            
            row.appendChild(cell);
        }
        
        gridContainer.appendChild(row);
    }
}

// Handle cell input
function handleCellInput(event) {
    const input = event.target;
    const value = parseInt(input.value);
    
    // Validate input range
    if (value < gameSettings.range.min || value > gameSettings.range.max) {
        input.classList.add('cell-incorrect');
        setTimeout(() => input.classList.remove('cell-incorrect'), 1000);
    } else {
        input.classList.remove('cell-incorrect');
    }
}

// Handle key press in cells
function handleKeyPress(event) {
    if (event.key === 'Enter') {
        validateSolution();
    }
}

// Show game area and hide settings
function showGameArea() {
    document.getElementById('settingsCard').style.display = 'none';
    document.getElementById('gameArea').style.display = 'block';
}

// Show settings and hide game area
function showSettings() {
    clearTimer();
    document.getElementById('gameArea').style.display = 'none';
    document.getElementById('settingsCard').style.display = 'block';
}

// Timer functions
function startTimer() {
    clearTimer();
    timeRemaining = gameSettings.timerDuration;
    updateTimerDisplay();
    
    timerInterval = setInterval(() => {
        timeRemaining--;
        updateTimerDisplay();
        
        if (timeRemaining <= 0) {
            clearTimer();
            handleTimerExpired();
        }
    }, 1000);
}

function clearTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
}

function updateTimerDisplay() {
    const timerText = document.getElementById('timerText');
    const timerCircle = document.getElementById('timerCircle');
    const timerProgress = document.getElementById('timerProgress');
    
    if (!timerText || !timerCircle || !timerProgress) {
        return;
    }
    
    timerText.textContent = timeRemaining;
    
    const progress = (timeRemaining / gameSettings.timerDuration) * 100;
    const degrees = (progress / 100) * 360;
    
    timerCircle.classList.remove('timer-warning', 'timer-danger');
    
    let color = '#28a745'; // Green
    if (timeRemaining <= 5) {
        timerCircle.classList.add('timer-danger');
        color = '#dc3545'; // Red
    } else if (timeRemaining <= 10) {
        timerCircle.classList.add('timer-warning');
        color = '#ffc107'; // Yellow
    }
    
    const gradient = `conic-gradient(${color} ${degrees}deg, #e9ecef ${degrees}deg)`;
    timerProgress.style.background = gradient;
    
    if (timeRemaining <= 5) {
        timerCircle.style.animation = 'pulse 1s infinite';
    } else {
        timerCircle.style.animation = 'none';
    }
}

function handleTimerExpired() {
    showResults({
        success: false,
        message: 'Time\'s up! Try again with a new puzzle.',
        title: 'Time Expired'
    });
}

// Validate the current solution
async function validateSolution() {
    if (!currentPuzzle) {
        showError('No puzzle loaded. Please start a new game.');
        return;
    }
    
    // Get current grid state
    const currentGrid = getCurrentGridState();
    
    try {
        const response = await fetch('/api/validate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                puzzleId: currentPuzzle.id,
                grid: currentGrid
            })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        
        if (result.valid) {
            clearTimer();
            showResults({
                success: true,
                message: 'Congratulations! You solved the puzzle correctly!',
                title: 'Puzzle Solved!',
                time: gameSettings.timerDuration - timeRemaining
            });
            
            // Add celebration animation
            document.getElementById('puzzleGrid').classList.add('puzzle-solved');
        } else {
            showError('Solution is not correct. Keep trying!');
            highlightIncorrectCells();
        }
        
    } catch (error) {
        console.error('Error validating solution:', error);
        showError('Failed to validate solution. Please try again.');
    }
}

// Get current grid state from inputs
function getCurrentGridState() {
    const inputs = document.querySelectorAll('#puzzleGrid input');
    const grid = [];
    
    // Initialize grid structure
    for (let i = 0; i <= currentPuzzle.size; i++) {
        grid[i] = [];
        for (let j = 0; j <= currentPuzzle.size; j++) {
            grid[i][j] = { ...currentPuzzle.grid[i][j] };
        }
    }
    
    // Update with user inputs
    inputs.forEach(input => {
        const row = parseInt(input.dataset.row);
        const col = parseInt(input.dataset.col);
        const value = parseInt(input.value) || 0;
        
        grid[row][col].value = value;
    });
    
    return grid;
}

// Highlight incorrect cells (placeholder implementation)
function highlightIncorrectCells() {
    const inputs = document.querySelectorAll('#puzzleGrid input');
    inputs.forEach(input => {
        if (input.value) {
            input.parentElement.classList.add('cell-flash');
            setTimeout(() => {
                input.parentElement.classList.remove('cell-flash');
            }, 500);
        }
    });
}

// Get a hint
async function getHint() {
    if (!currentPuzzle) {
        showError('No puzzle loaded. Please start a new game.');
        return;
    }
    
    try {
        const response = await fetch('/api/hint', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                puzzleId: currentPuzzle.id
            })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        showInfo(result.hint);
        
    } catch (error) {
        console.error('Error getting hint:', error);
        showError('Failed to get hint. Please try again.');
    }
}

// Show results modal
function showResults(results) {
    const modal = new bootstrap.Modal(document.getElementById('resultsModal'));
    const title = document.getElementById('resultsTitle');
    const body = document.getElementById('resultsBody');
    
    title.textContent = results.title;
    
    let content = `<p>${results.message}</p>`;
    
    if (results.success && results.time) {
        content += `<p><strong>Time taken:</strong> ${results.time} seconds</p>`;
    }
    
    body.innerHTML = content;
    modal.show();
}

// Utility functions
function showLoading(show) {
    // Implementation for loading spinner
    console.log('Loading:', show);
}

function showError(message) {
    alert('Error: ' + message);
}

function showInfo(message) {
    alert('Hint: ' + message);
}

// Event listeners for settings changes
document.getElementById('operation').addEventListener('change', updateOperationDisplay);

// Prevent form submission on Enter key
document.addEventListener('keypress', function(event) {
    if (event.key === 'Enter' && event.target.tagName !== 'INPUT') {
        event.preventDefault();
    }
});
