// Puzzle Hub - Unified Game JavaScript

// Global game state
let currentPuzzleType = null; // 'spelling' or 'yohaku'
let gameState = 'idle'; // 'idle', 'playing', 'finished'

// Authentication state
let currentUser = null;
let authToken = null;
let isAuthenticated = false;

// Player profile
let playerProfile = {
    name: '',
    age: 10
};

// Spelling Bee variables
let spellingProblems = [];
let currentSpellingIndex = 0;
let spellingScore = 0;
let spellingCorrect = 0;
let spellingStreak = 0;
let currentSpellingWord = null;
let spellingTimer = null;
let spellingTimeRemaining = 30;

// Yohaku variables
let currentYohakuPuzzle = null;
let currentYohakuSession = null;
let currentYohakuPuzzleIndex = 0;
let yohakuSettings = {
    timerDuration: 30,
    size: 2,
    operation: 'addition',
    range: { min: 1, max: 10 },
    difficulty: 'easy'
};
let yohakuTimer = null;
let yohakuTimeRemaining = 30;

// Speech synthesis
let speechSynthesis = window.speechSynthesis;

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    console.log('Puzzle Hub loaded!');
    
    // Initialize authentication first
    initializeAuth();
    loadProfile();
    updateStats();
    
    // Initialize Custom Logs functionality
    initializeCustomLogs();
    
    // Profile form handler
    document.getElementById('profileForm').addEventListener('submit', function(e) {
        e.preventDefault();
        saveProfile();
    });
    
    // Writing form handler - use setTimeout to ensure all DOM elements are loaded
    setTimeout(() => {
        const writingForm = document.getElementById('writingForm');
        if (writingForm) {
            writingForm.addEventListener('submit', handleWritingSubmission);
            console.log('Writing form handler attached successfully');
        } else {
            console.warn('Writing form not found - will try again when writing tab is activated');
        }
    }, 100);

    // Spelling word input enter key
    document.getElementById('spellingWordInput').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            submitSpellingWord();
        }
    });
});

// Profile Management
function loadProfile() {
    const saved = localStorage.getItem('puzzleHubProfile');
    if (saved) {
        playerProfile = JSON.parse(saved);
        document.getElementById('playerName').value = playerProfile.name;
        document.getElementById('playerAge').value = playerProfile.age;
        document.getElementById('spellingAge').value = playerProfile.age;
        updateCurrentPlayer();
    }
}

function saveProfile() {
    playerProfile = {
        name: document.getElementById('playerName').value,
        age: parseInt(document.getElementById('playerAge').value)
    };
    localStorage.setItem('puzzleHubProfile', JSON.stringify(playerProfile));
    updateCurrentPlayer();
    showFeedback('Profile saved!', 'success');
}

function updateCurrentPlayer() {
    const playerText = playerProfile.name ? `Welcome, ${playerProfile.name}!` : 'Welcome!';
    document.getElementById('currentPlayer').textContent = playerText;
}

// Navigation
function selectPuzzle(puzzleType) {
    currentPuzzleType = puzzleType;
    if (puzzleType === 'spelling') {
        const spellingTab = new bootstrap.Tab(document.getElementById('spelling-tab'));
        spellingTab.show();
    } else if (puzzleType === 'yohaku') {
        const yohakuTab = new bootstrap.Tab(document.getElementById('yohaku-tab'));
        yohakuTab.show();
    } else if (puzzleType === 'writing') {
        const writingTab = new bootstrap.Tab(document.getElementById('writing-tab'));
        writingTab.show();
        
        // Ensure writing form handler is attached when tab is activated
        setTimeout(() => {
            const writingForm = document.getElementById('writingForm');
            if (writingForm && !writingForm.hasAttribute('data-handler-attached')) {
                writingForm.addEventListener('submit', handleWritingSubmission);
                writingForm.setAttribute('data-handler-attached', 'true');
                console.log('Writing form handler attached on tab activation');
            }
        }, 100);
    } else if (puzzleType === 'story') {
        const storyTab = new bootstrap.Tab(document.getElementById('story-tab'));
        storyTab.show();
    }
}

function goHome() {
    const homeTab = new bootstrap.Tab(document.getElementById('home-tab'));
    homeTab.show();
    resetAllGames();
}

function resetAllGames() {
    // Reset spelling bee
    resetSpellingGame();
    
    // Reset yohaku
    resetYohakuGame();
    
    gameState = 'idle';
    currentPuzzleType = null;
}

// Spelling Bee Functions
async function startSpellingGame() {
    if (!isAuthenticated) {
        showFeedback('Please login to play games', 'error');
        return;
    }
    
    const age = parseInt(document.getElementById('spellingAge').value);
    const theme = document.getElementById('spellingTheme').value;
    
    showLoading(true);
    
    try {
        const response = await makeAuthenticatedRequest('/api/spelling/generate-for-age', {
            method: 'POST',
            body: JSON.stringify({
                age: age,
                count: 10,
                theme: theme,
                force_refresh: false
            })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        spellingProblems = result.problems;
        
        if (spellingProblems.length === 0) {
            throw new Error('No problems generated');
        }
        
        // Shuffle problems
        shuffleArray(spellingProblems);
        
        // Reset game state
        currentSpellingIndex = 0;
        spellingScore = 0;
        spellingCorrect = 0;
        spellingStreak = 0;
        gameState = 'playing';
        
        // Update UI
        document.getElementById('spellingGameStart').style.display = 'none';
        document.getElementById('spellingCurrentWord').style.display = 'block';
        document.getElementById('spellingResults').style.display = 'none';
        
        showCurrentSpellingWord();
        
    } catch (error) {
        console.error('Error starting spelling game:', error);
        showError('Failed to start spelling game. Please try again.');
    } finally {
        showLoading(false);
    }
}

function showCurrentSpellingWord() {
    if (currentSpellingIndex >= spellingProblems.length) {
        endSpellingGame();
        return;
    }
    
    currentSpellingWord = spellingProblems[currentSpellingIndex];
    
    // Update UI
    document.getElementById('currentSpellingWord').textContent = '???';
    document.getElementById('spellingWordDefinition').textContent = currentSpellingWord.definition;
    document.getElementById('spellingWordInput').value = '';
    document.getElementById('spellingWordInput').focus();
    
    // Update progress
    const progress = ((currentSpellingIndex + 1) / spellingProblems.length) * 100;
    document.getElementById('spellingProgress').style.width = progress + '%';
    
    // Update level
    document.getElementById('spellingLevel').textContent = currentSpellingIndex + 1;
    
    // Start timer
    startSpellingTimer();
    
    // Auto-play pronunciation
    setTimeout(() => {
        playSpellingPronunciation();
    }, 500);
}

function playSpellingPronunciation() {
    if (!currentSpellingWord || !speechSynthesis) return;
    
    const utterance = new SpeechSynthesisUtterance(currentSpellingWord.word);
    utterance.rate = 0.8;
    utterance.pitch = 1;
    utterance.volume = 0.8;
    
    speechSynthesis.speak(utterance);
}

function showSpellingHint() {
    if (!currentSpellingWord || !currentSpellingWord.hints) return;
    
    const hints = currentSpellingWord.hints;
    const randomHint = hints[Math.floor(Math.random() * hints.length)];
    
    showFeedback(`Hint: ${randomHint}`, 'info');
}

function submitSpellingWord() {
    const userInput = document.getElementById('spellingWordInput').value.trim().toLowerCase();
    const correctWord = currentSpellingWord.word.toLowerCase();
    
    clearSpellingTimer();
    
    if (userInput === correctWord) {
        // Correct answer
        spellingCorrect++;
        spellingStreak++;
        spellingScore += 10 + (spellingStreak * 2);
        
        showFeedback('Correct! 🎉', 'success');
        
        // Update displays
        document.getElementById('spellingScore').textContent = spellingScore;
        document.getElementById('spellingStreak').textContent = spellingStreak;
        
        setTimeout(() => {
            currentSpellingIndex++;
            showCurrentSpellingWord();
        }, 1500);
        
    } else {
        // Wrong answer
        spellingStreak = 0;
        document.getElementById('spellingStreak').textContent = '0';
        
        showFeedback(`Incorrect. The word was "${currentSpellingWord.word}".`, 'danger');
        
        setTimeout(() => {
            currentSpellingIndex++;
            showCurrentSpellingWord();
        }, 2000);
    }
}

function skipSpellingWord() {
    showFeedback(`Skipped. The word was "${currentSpellingWord.word}".`, 'warning');
    
    clearSpellingTimer();
    setTimeout(() => {
        currentSpellingIndex++;
        showCurrentSpellingWord();
    }, 1500);
}

function endSpellingGame() {
    gameState = 'finished';
    clearSpellingTimer();
    
    const accuracy = spellingProblems.length > 0 ? Math.round((spellingCorrect / spellingProblems.length) * 100) : 0;
    
    // Update final results
    document.getElementById('spellingFinalScore').textContent = spellingScore;
    document.getElementById('spellingCorrectCount').textContent = spellingCorrect;
    document.getElementById('spellingAccuracy').textContent = accuracy + '%';
    
    // Save stats
    saveGameStats('spelling', {
        score: spellingScore,
        correct: spellingCorrect,
        total: spellingProblems.length,
        accuracy: accuracy
    });
    
    // Show results
    document.getElementById('spellingCurrentWord').style.display = 'none';
    document.getElementById('spellingResults').style.display = 'block';
    
    updateStats();
}

function resetSpellingGame() {
    clearSpellingTimer();
    currentSpellingIndex = 0;
    spellingScore = 0;
    spellingCorrect = 0;
    spellingStreak = 0;
    currentSpellingWord = null;
    spellingProblems = [];
    
    document.getElementById('spellingScore').textContent = '0';
    document.getElementById('spellingLevel').textContent = '1';
    document.getElementById('spellingStreak').textContent = '0';
    document.getElementById('spellingProgress').style.width = '0%';
    
    document.getElementById('spellingGameStart').style.display = 'block';
    document.getElementById('spellingCurrentWord').style.display = 'none';
    document.getElementById('spellingResults').style.display = 'none';
}

// Spelling Timer Functions
function startSpellingTimer() {
    clearSpellingTimer();
    spellingTimeRemaining = 30;
    updateSpellingTimerDisplay();
    
    spellingTimer = setInterval(() => {
        spellingTimeRemaining--;
        updateSpellingTimerDisplay();
        
        if (spellingTimeRemaining <= 0) {
            clearSpellingTimer();
            handleSpellingTimerExpired();
        }
    }, 1000);
}

function clearSpellingTimer() {
    if (spellingTimer) {
        clearInterval(spellingTimer);
        spellingTimer = null;
    }
}

function updateSpellingTimerDisplay() {
    const timerText = document.getElementById('spellingTimerText');
    const timerCircle = document.getElementById('spellingTimerCircle');
    const timerProgress = document.getElementById('spellingTimerProgress');
    
    if (!timerText || !timerCircle || !timerProgress) return;
    
    timerText.textContent = spellingTimeRemaining;
    
    const progress = (spellingTimeRemaining / 30) * 100;
    const degrees = (progress / 100) * 360;
    
    timerCircle.classList.remove('timer-warning', 'timer-danger');
    
    let color = '#28a745';
    if (spellingTimeRemaining <= 5) {
        timerCircle.classList.add('timer-danger');
        color = '#dc3545';
    } else if (spellingTimeRemaining <= 10) {
        timerCircle.classList.add('timer-warning');
        color = '#ffc107';
    }
    
    const gradient = `conic-gradient(${color} ${degrees}deg, #e9ecef ${degrees}deg)`;
    timerProgress.style.background = gradient;
}

function handleSpellingTimerExpired() {
    showFeedback('Time\'s up! Moving to next word...', 'warning');
    
    setTimeout(() => {
        currentSpellingIndex++;
        showCurrentSpellingWord();
    }, 1500);
}

// Yohaku Functions
async function startYohakuGame() {
    const minRange = parseInt(document.getElementById('yohakuMinRange').value) || 1;
    const maxRange = parseInt(document.getElementById('yohakuMaxRange').value) || 10;
    
    yohakuSettings = {
        operation: document.getElementById('yohakuOperation').value,
        range: {
            min: minRange,
            max: maxRange
        }
    };
    
    showLoading(true);
    
    try {
        const response = await fetch('/api/yohaku/start-game', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(yohakuSettings)
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        
        if (!result.session || !result.session.puzzles || result.session.puzzles.length === 0) {
            throw new Error('Invalid session data received');
        }
        
        currentYohakuSession = result.session;
        currentYohakuPuzzleIndex = 0;
        
        console.log('Yohaku session created:', currentYohakuSession);
        showFeedback(result.message, 'success');
        
        // Start with the first puzzle
        loadCurrentYohakuPuzzle();
        showYohakuGameArea();
        
        gameState = 'playing';
        
    } catch (error) {
        console.error('Error starting Yohaku game:', error);
        showError('Failed to start Yohaku game. Please try again.');
    } finally {
        showLoading(false);
    }
}

function loadCurrentYohakuPuzzle() {
    console.log('Loading puzzle:', currentYohakuPuzzleIndex, 'Session:', currentYohakuSession);
    
    if (!currentYohakuSession || !currentYohakuSession.puzzles) {
        console.error('No valid session or puzzles');
        showError('Game session error. Please restart the game.');
        return;
    }
    
    if (currentYohakuPuzzleIndex >= currentYohakuSession.puzzles.length) {
        console.log('All puzzles completed, ending game');
        endYohakuGame();
        return;
    }
    
    currentYohakuPuzzle = currentYohakuSession.puzzles[currentYohakuPuzzleIndex];
    
    if (!currentYohakuPuzzle) {
        console.error('Invalid puzzle at index:', currentYohakuPuzzleIndex);
        showError('Puzzle loading error. Please restart the game.');
        return;
    }
    
    console.log('Loading puzzle level:', currentYohakuPuzzle.level);
    
    // Update progress display
    updateYohakuProgress();
    
    // Display the puzzle
    displayYohakuPuzzle(currentYohakuPuzzle);
    updateYohakuOperationDisplay();
    
    // Start timer with puzzle-specific duration from the progressive settings
    const puzzleSettings = getPuzzleSettings(currentYohakuPuzzle.level);
    yohakuTimeRemaining = puzzleSettings.timerDuration;
    
    startYohakuTimer();
    
    showFeedback(`Level ${currentYohakuPuzzle.level}: ${currentYohakuPuzzle.difficulty} ${currentYohakuPuzzle.size}x${currentYohakuPuzzle.size} puzzle!`, 'info');
}

function getPuzzleSettings(level) {
    // Mirror the progressive settings from the Go backend
    if (level <= 3) {
        return { timerDuration: 60 }; // 1 minute for easy
    } else if (level <= 6) {
        return { timerDuration: 45 }; // 45 seconds for medium
    } else if (level <= 8) {
        return { timerDuration: 30 }; // 30 seconds for hard 2x2
    } else {
        return { timerDuration: 90 }; // More time for 3x3 puzzles
    }
}

function updateYohakuProgress() {
    if (!currentYohakuSession) return;
    
    const level = currentYohakuPuzzleIndex + 1;
    const progress = (level / 10) * 100;
    
    document.getElementById('yohakuCurrentLevel').textContent = `Puzzle ${level}`;
    document.getElementById('yohakuCurrentDifficulty').textContent = 
        currentYohakuPuzzle.difficulty.charAt(0).toUpperCase() + currentYohakuPuzzle.difficulty.slice(1);
    document.getElementById('yohakuTotalScore').textContent = currentYohakuSession.totalScore;
    document.getElementById('yohakuGameProgress').style.width = progress + '%';
    
    // Update difficulty badge color
    const difficultyBadge = document.getElementById('yohakuCurrentDifficulty');
    difficultyBadge.className = 'badge ms-2';
    switch (currentYohakuPuzzle.difficulty) {
        case 'easy':
            difficultyBadge.classList.add('bg-success');
            break;
        case 'medium':
            difficultyBadge.classList.add('bg-warning');
            break;
        case 'hard':
            difficultyBadge.classList.add('bg-danger');
            break;
        default:
            difficultyBadge.classList.add('bg-info');
    }
}

function displayYohakuPuzzle(puzzle) {
    const gridContainer = document.getElementById('yohakuPuzzleGrid');
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
                cell.textContent = cellData.value;
                cell.classList.add('cell-given');
            } else {
                const input = document.createElement('input');
                input.type = 'number';
                input.min = puzzle.range ? puzzle.range.min : 1;
                input.max = puzzle.range ? puzzle.range.max : 10;
                input.dataset.row = i;
                input.dataset.col = j;
                input.addEventListener('input', handleYohakuCellInput);
                input.addEventListener('keypress', handleYohakuKeyPress);
                
                cell.appendChild(input);
                cell.classList.add('cell-empty');
            }
            
            row.appendChild(cell);
        }
        
        gridContainer.appendChild(row);
    }
}

function handleYohakuCellInput(event) {
    const input = event.target;
    const value = parseInt(input.value);
    
    if (currentYohakuPuzzle && currentYohakuPuzzle.range) {
        const min = currentYohakuPuzzle.range.min;
        const max = currentYohakuPuzzle.range.max;
        
        if (value < min || value > max) {
            input.classList.add('cell-incorrect');
            setTimeout(() => input.classList.remove('cell-incorrect'), 1000);
        } else {
            input.classList.remove('cell-incorrect');
        }
    }
}

function handleYohakuKeyPress(event) {
    if (event.key === 'Enter') {
        validateYohakuSolution();
    }
}

function showYohakuGameArea() {
    document.getElementById('yohakuSettingsCard').style.display = 'none';
    document.getElementById('yohakuGameArea').style.display = 'block';
}

function showYohakuSettings() {
    clearYohakuTimer();
    document.getElementById('yohakuGameArea').style.display = 'none';
    document.getElementById('yohakuSettingsCard').style.display = 'block';
}

function updateYohakuOperationDisplay() {
    const operation = yohakuSettings.operation;
    const display = document.getElementById('yohakuOperationDisplay');
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

async function validateYohakuSolution() {
    if (!currentYohakuPuzzle) {
        showError('No puzzle loaded. Please start a new game.');
        return;
    }
    
    const currentGrid = getCurrentYohakuGridState();
    
    try {
        const response = await fetch('/api/yohaku/validate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                puzzleId: currentYohakuPuzzle.id,
                grid: currentGrid
            })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        
        if (result.valid) {
            clearYohakuTimer();
            
            // Calculate score bonus for remaining time
            const timeBonus = Math.max(0, yohakuTimeRemaining * 5);
            const puzzleScore = currentYohakuPuzzle.score + timeBonus;
            
            // Update session score
            if (currentYohakuSession) {
                currentYohakuSession.totalScore += puzzleScore;
                currentYohakuSession.completedCount++;
                updateYohakuProgress();
            }
            
            document.getElementById('yohakuPuzzleGrid').classList.add('puzzle-solved');
            
            showFeedback(`Puzzle solved! +${puzzleScore} points (${timeBonus} time bonus)`, 'success');
            
            // Move to next puzzle after a short delay
            setTimeout(() => {
                currentYohakuPuzzleIndex++;
                if (currentYohakuPuzzleIndex < 10) {
                    loadCurrentYohakuPuzzle();
                } else {
                    endYohakuGame();
                }
            }, 2000);
            
        } else {
            showError('Solution is not correct. Keep trying!');
            highlightIncorrectYohakuCells();
        }
        
    } catch (error) {
        console.error('Error validating solution:', error);
        showError('Failed to validate solution. Please try again.');
    }
}

function getCurrentYohakuGridState() {
    const inputs = document.querySelectorAll('#yohakuPuzzleGrid input');
    const grid = [];
    
    for (let i = 0; i <= currentYohakuPuzzle.size; i++) {
        grid[i] = [];
        for (let j = 0; j <= currentYohakuPuzzle.size; j++) {
            grid[i][j] = { ...currentYohakuPuzzle.grid[i][j] };
        }
    }
    
    inputs.forEach(input => {
        const row = parseInt(input.dataset.row);
        const col = parseInt(input.dataset.col);
        const value = parseInt(input.value) || 0;
        
        grid[row][col].value = value;
    });
    
    return grid;
}

function highlightIncorrectYohakuCells() {
    const inputs = document.querySelectorAll('#yohakuPuzzleGrid input');
    inputs.forEach(input => {
        if (input.value) {
            input.parentElement.classList.add('cell-flash');
            setTimeout(() => {
                input.parentElement.classList.remove('cell-flash');
            }, 500);
        }
    });
}

async function getYohakuHint() {
    if (!currentYohakuPuzzle) {
        showError('No puzzle loaded. Please start a new game.');
        return;
    }
    
    try {
        const response = await fetch('/api/yohaku/hint', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                puzzleId: currentYohakuPuzzle.id
            })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        showFeedback(result.hint, 'info');
        
    } catch (error) {
        console.error('Error getting hint:', error);
        showError('Failed to get hint. Please try again.');
    }
}

function showYohakuResults(results) {
    const modal = new bootstrap.Modal(document.getElementById('resultsModal'));
    const title = document.getElementById('resultsTitle');
    const body = document.getElementById('resultsBody');
    
    title.textContent = results.title;
    
    let content = `<p>${results.message}</p>`;
    
    if (results.score !== undefined) {
        content += `
            <div class="row text-center mt-3">
                <div class="col-md-3">
                    <div class="card bg-success text-white">
                        <div class="card-body">
                            <h5 class="card-title">Total Score</h5>
                            <h2>${results.score}</h2>
                        </div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="card bg-info text-white">
                        <div class="card-body">
                            <h5 class="card-title">Accuracy</h5>
                            <h2>${results.accuracy}%</h2>
                        </div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="card bg-warning text-white">
                        <div class="card-body">
                            <h5 class="card-title">Completed</h5>
                            <h2>${currentYohakuSession ? currentYohakuSession.completedCount : 0}/10</h2>
                        </div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="card bg-primary text-white">
                        <div class="card-body">
                            <h5 class="card-title">Total Time</h5>
                            <h2>${Math.floor(results.totalTime / 60)}:${String(results.totalTime % 60).padStart(2, '0')}</h2>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
    
    if (results.time) {
        content += `<p class="mt-3"><strong>Time taken:</strong> ${results.time} seconds</p>`;
    }
    
    body.innerHTML = content;
    modal.show();
}

function resetYohakuGame() {
    clearYohakuTimer();
    currentYohakuPuzzle = null;
    currentYohakuSession = null;
    currentYohakuPuzzleIndex = 0;
    
    document.getElementById('yohakuSettingsCard').style.display = 'block';
    document.getElementById('yohakuGameArea').style.display = 'none';
}

// Yohaku Timer Functions
function startYohakuTimer() {
    clearYohakuTimer();
    // yohakuTimeRemaining should already be set by loadCurrentYohakuPuzzle
    updateYohakuTimerDisplay();
    
    yohakuTimer = setInterval(() => {
        yohakuTimeRemaining--;
        updateYohakuTimerDisplay();
        
        if (yohakuTimeRemaining <= 0) {
            clearYohakuTimer();
            handleYohakuTimerExpired();
        }
    }, 1000);
}

function clearYohakuTimer() {
    if (yohakuTimer) {
        clearInterval(yohakuTimer);
        yohakuTimer = null;
    }
}

function updateYohakuTimerDisplay() {
    const timerText = document.getElementById('yohakuTimerText');
    const timerCircle = document.getElementById('yohakuTimerCircle');
    const timerProgress = document.getElementById('yohakuTimerProgress');
    
    if (!timerText || !timerCircle || !timerProgress) return;
    
    timerText.textContent = yohakuTimeRemaining;
    
    const maxTime = getPuzzleSettings(currentYohakuPuzzle ? currentYohakuPuzzle.level : 1).timerDuration;
    const progress = (yohakuTimeRemaining / maxTime) * 100;
    const degrees = (progress / 100) * 360;
    
    timerCircle.classList.remove('timer-warning', 'timer-danger');
    
    let color = '#28a745';
    if (yohakuTimeRemaining <= 5) {
        timerCircle.classList.add('timer-danger');
        color = '#dc3545';
    } else if (yohakuTimeRemaining <= 10) {
        timerCircle.classList.add('timer-warning');
        color = '#ffc107';
    }
    
    const gradient = `conic-gradient(${color} ${degrees}deg, #e9ecef ${degrees}deg)`;
    timerProgress.style.background = gradient;
    
    if (yohakuTimeRemaining <= 5) {
        timerCircle.style.animation = 'pulse 1s infinite';
    } else {
        timerCircle.style.animation = 'none';
    }
}

function handleYohakuTimerExpired() {
    showFeedback('Time\'s up! Moving to next puzzle...', 'warning');
    
    // Move to next puzzle after timer expires
    setTimeout(() => {
        currentYohakuPuzzleIndex++;
        if (currentYohakuPuzzleIndex < 10) {
            loadCurrentYohakuPuzzle();
        } else {
            endYohakuGame();
        }
    }, 1500);
}

function endYohakuGame() {
    clearYohakuTimer();
    gameState = 'finished';
    
    if (currentYohakuSession) {
        const accuracy = Math.round((currentYohakuSession.completedCount / 10) * 100);
        const startTime = new Date(currentYohakuSession.startTime);
        const totalTime = Math.round((Date.now() - startTime.getTime()) / 1000);
        
        showYohakuResults({
            success: true,
            message: `Game Complete! You solved ${currentYohakuSession.completedCount} out of 10 puzzles.`,
            title: 'Yohaku Challenge Complete!',
            score: currentYohakuSession.totalScore,
            accuracy: accuracy,
            totalTime: totalTime
        });
        
        // Save stats
        saveGameStats('yohaku', {
            totalScore: currentYohakuSession.totalScore,
            completed: currentYohakuSession.completedCount,
            accuracy: accuracy,
            totalTime: totalTime,
            operation: currentYohakuSession.settings.operation
        });
        
        updateStats();
    }
}

// Utility Functions
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

function showLoading(show) {
    document.getElementById('loading').style.display = show ? 'block' : 'none';
}

function showError(message) {
    showFeedback(message, 'danger');
}

function showFeedback(message, type) {
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type} alert-dismissible fade show position-fixed`;
    alertDiv.style.top = '20px';
    alertDiv.style.right = '20px';
    alertDiv.style.zIndex = '9999';
    alertDiv.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    
    document.body.appendChild(alertDiv);
    
    setTimeout(() => {
        alertDiv.remove();
    }, 3000);
}

// Stats Management
function saveGameStats(gameType, stats) {
    const allStats = JSON.parse(localStorage.getItem('puzzleHubStats') || '{}');
    
    if (!allStats[gameType]) {
        allStats[gameType] = [];
    }
    
    allStats[gameType].push({
        ...stats,
        date: new Date().toISOString()
    });
    
    localStorage.setItem('puzzleHubStats', JSON.stringify(allStats));
}

function updateStats() {
    const allStats = JSON.parse(localStorage.getItem('puzzleHubStats') || '{}');
    
    let totalGames = 0;
    let wordsLearned = 0;
    let puzzlesSolved = 0;
    let currentStreak = 0;
    
    if (allStats.spelling) {
        totalGames += allStats.spelling.length;
        wordsLearned = allStats.spelling.reduce((sum, game) => sum + (game.correct || 0), 0);
    }
    
    if (allStats.yohaku) {
        totalGames += allStats.yohaku.length;
        puzzlesSolved = allStats.yohaku.length;
    }
    
    document.getElementById('totalGamesPlayed').textContent = totalGames;
    document.getElementById('spellingWordsLearned').textContent = wordsLearned;
    document.getElementById('yohakuPuzzlesSolved').textContent = puzzlesSolved;
    document.getElementById('currentStreak').textContent = currentStreak;
}

// ============================================================================
// WRITING COACH FUNCTIONALITY
// ============================================================================

// Writing analysis variables
let currentWritingAnalysis = null;
let isAnalyzing = false;
let appliedFixes = []; // Track applied fixes for highlighting

// Writing form handler is now initialized in the main DOMContentLoaded listener above

async function handleWritingSubmission(event) {
    event.preventDefault();
    
    if (isAnalyzing) {
        return; // Prevent multiple submissions
    }
    
    const title = document.getElementById('writingTitle').value.trim();
    const text = document.getElementById('writingText').value.trim();
    const gradeLevel = parseInt(document.getElementById('gradeLevel').value);
    
    // Validation
    if (!text || text.length < 10) {
        showFeedback('Please write at least 10 characters for analysis.', 'error');
        return;
    }
    
    if (!gradeLevel || gradeLevel < 1 || gradeLevel > 12) {
        showFeedback('Please select a valid grade level.', 'error');
        return;
    }
    
    try {
        isAnalyzing = true;
        showWritingLoadingIndicator(true);
        
        // Hide previous analysis button since we're doing a new analysis
        hidePreviousAnalysisButton();
        
        // Show encouraging message for longer analysis
        setTimeout(() => {
            if (isAnalyzing) {
                showFeedback('Analysis in progress... Perplexity is carefully reviewing your writing!', 'info');
            }
        }, 10000); // Show after 10 seconds
        
        setTimeout(() => {
            if (isAnalyzing) {
                showFeedback('Still analyzing... Complex writing takes more time for thorough feedback!', 'info');
            }
        }, 30000); // Show after 30 seconds
        
        const analysis = await analyzeWriting({
            text: text,
            gradeLevel: gradeLevel,
            title: title || 'Untitled'
        });
        
        currentWritingAnalysis = analysis;
        displayWritingAnalysis(analysis);
        showWritingResults();
        
        showFeedback('Writing analysis completed successfully!', 'success');
        
    } catch (error) {
        console.error('Error analyzing writing:', error);
        showFeedback('Failed to analyze writing. Please try again.', 'error');
    } finally {
        isAnalyzing = false;
        showWritingLoadingIndicator(false);
    }
}

async function analyzeWriting(request) {
    const response = await fetch('/api/writing/analyze', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(request)
    });
    
    if (!response.ok) {
        let errorMessage = 'Failed to analyze writing';
        try {
            const errorData = await response.json();
            errorMessage = errorData.error || errorMessage;
        } catch (parseError) {
            // If we can't parse the error response as JSON, use the status text
            errorMessage = `Server error: ${response.status} ${response.statusText}`;
        }
        throw new Error(errorMessage);
    }
    
    let responseText = '';
    try {
        responseText = await response.text();
        const data = JSON.parse(responseText);
        
        if (!data.analysis) {
            console.error('Missing analysis in response:', data);
            throw new Error('Invalid response format: missing analysis data');
        }
        return data.analysis;
    } catch (parseError) {
        console.error('Failed to parse response:', parseError);
        console.error('Response text was:', responseText);
        throw new Error(`Invalid response from server: ${parseError.message}`);
    }
}

function displayWritingAnalysis(analysis) {
    // Display overall rating
    displayRating('overallRating', analysis.overallRating);
    displayRating('narrativeRating', analysis.narrativeAnalysis.rating);
    
    // Display grammar errors
    displayGrammarErrors(analysis.grammarErrors);
    
    // Display vocabulary tips
    displayVocabularyTips(analysis.vocabularyTips);
    
    // Display context suggestions
    displayContextSuggestions(analysis.contextSuggestions);
    
    // Display narrative analysis
    displayNarrativeAnalysis(analysis.narrativeAnalysis);
    
    // Display summary
    document.getElementById('writingSummary').innerHTML = `
        <h5><i class="fas fa-summary me-2"></i>Summary</h5>
        <p>${analysis.summary}</p>
    `;
}

function displayRating(elementId, rating) {
    const element = document.getElementById(elementId);
    const starsElement = element.querySelector('.rating-stars');
    const numberElement = element.querySelector('.rating-number');
    
    // Generate star display
    let starsHTML = '';
    for (let i = 1; i <= 5; i++) {
        if (i <= rating) {
            starsHTML += '<i class="fas fa-star text-warning"></i>';
        } else {
            starsHTML += '<i class="far fa-star text-muted"></i>';
        }
    }
    
    starsElement.innerHTML = starsHTML;
    numberElement.textContent = `${rating}/5`;
}

function displayGrammarErrors(errors) {
    const container = document.getElementById('grammarErrors');
    
    if (!errors || errors.length === 0) {
        container.innerHTML = `
            <div class="alert alert-success">
                <i class="fas fa-check-circle me-2"></i>
                Great job! No grammar errors detected.
            </div>
        `;
        return;
    }
    
    let html = '<div class="grammar-errors-list">';
    errors.forEach((error, index) => {
        const isApplied = error.applied || false;
        const buttonClass = isApplied ? 'btn btn-sm btn-success' : 'btn btn-sm btn-outline-success apply-fix-btn';
        const buttonText = isApplied ? '<i class="fas fa-check me-1"></i>Applied' : '<i class="fas fa-check me-1"></i>Apply Fix';
        const buttonDisabled = isApplied ? 'disabled' : '';
        
        html += `
            <div class="card mb-3" data-error-index="${index}">
                <div class="card-body">
                    <div class="row">
                        <div class="col-md-8">
                            <h6 class="text-danger">
                                <i class="fas fa-exclamation-triangle me-1"></i>
                                ${error.errorType}
                            </h6>
                            <p class="mb-2">
                                <strong>Original:</strong> 
                                <span class="text-danger">"${error.original}"</span>
                            </p>
                            <p class="mb-2">
                                <strong>Suggestion:</strong> 
                                <span class="text-success">"${error.suggestion}"</span>
                            </p>
                            <p class="text-muted small mb-0">
                                <i class="fas fa-info-circle me-1"></i>
                                ${error.explanation}
                            </p>
                        </div>
                        <div class="col-md-4 text-end">
                            <button class="${buttonClass}" onclick="applyGrammarFix(${index})" ${buttonDisabled}>
                                ${buttonText}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    });
    html += '</div>';
    
    container.innerHTML = html;
}

function displayVocabularyTips(tips) {
    const container = document.getElementById('vocabularyTips');
    
    if (!tips || tips.length === 0) {
        container.innerHTML = `
            <div class="alert alert-info">
                <i class="fas fa-info-circle me-2"></i>
                Your vocabulary usage looks good! Keep expanding your word choices.
            </div>
        `;
        return;
    }
    
    let html = '<div class="vocabulary-tips-list">';
    tips.forEach((tip, index) => {
        html += `
            <div class="card mb-3">
                <div class="card-body">
                    <h6 class="text-info">
                        <i class="fas fa-book me-1"></i>
                        Vocabulary Enhancement
                    </h6>
                    <p class="mb-2">
                        <strong>Current word:</strong> 
                        <span class="badge bg-light text-dark">"${tip.original}"</span>
                    </p>
                    <p class="mb-2">
                        <strong>Better alternatives:</strong>
                    </p>
                    <div class="mb-2">
                        ${tip.suggestions.map(suggestion => 
                            `<span class="badge bg-success me-1">${suggestion}</span>`
                        ).join('')}
                    </div>
                    <p class="text-muted small mb-0">
                        <i class="fas fa-lightbulb me-1"></i>
                        ${tip.explanation}
                    </p>
                </div>
            </div>
        `;
    });
    html += '</div>';
    
    container.innerHTML = html;
}

function displayContextSuggestions(suggestions) {
    const container = document.getElementById('contextSuggestions');
    
    if (!suggestions || suggestions.length === 0) {
        container.innerHTML = `
            <div class="alert alert-success">
                <i class="fas fa-check-circle me-2"></i>
                Your writing has good context and detail!
            </div>
        `;
        return;
    }
    
    let html = '<div class="context-suggestions-list">';
    suggestions.forEach((suggestion, index) => {
        html += `
            <div class="card mb-3">
                <div class="card-body">
                    <h6 class="text-warning">
                        <i class="fas fa-lightbulb me-1"></i>
                        Paragraph ${suggestion.paragraphIndex + 1} Enhancement
                    </h6>
                    <p class="mb-2">
                        <strong>Suggestion:</strong> ${suggestion.suggestion}
                    </p>
                    <p class="text-muted small mb-0">
                        <i class="fas fa-info-circle me-1"></i>
                        ${suggestion.reason}
                    </p>
                </div>
            </div>
        `;
    });
    html += '</div>';
    
    container.innerHTML = html;
}

function displayNarrativeAnalysis(analysis) {
    const container = document.getElementById('narrativeAnalysis');
    
    const structure = analysis.structure;
    
    let html = `
        <div class="narrative-analysis">
            <div class="card mb-3">
                <div class="card-header">
                    <h6 class="mb-0">
                        <i class="fas fa-sitemap me-1"></i>
                        Story Structure Analysis
                    </h6>
                </div>
                <div class="card-body">
                    <div class="row">
                        <div class="col-md-6">
                            <div class="structure-checklist">
                                <div class="form-check">
                                    <input class="form-check-input" type="checkbox" ${structure.hasIntroduction ? 'checked' : ''} disabled>
                                    <label class="form-check-label">
                                        Introduction/Beginning
                                    </label>
                                </div>
                                <div class="form-check">
                                    <input class="form-check-input" type="checkbox" ${structure.hasRisingAction ? 'checked' : ''} disabled>
                                    <label class="form-check-label">
                                        Rising Action/Development
                                    </label>
                                </div>
                                <div class="form-check">
                                    <input class="form-check-input" type="checkbox" ${structure.hasClimax ? 'checked' : ''} disabled>
                                    <label class="form-check-label">
                                        Climax/Main Event
                                    </label>
                                </div>
                                <div class="form-check">
                                    <input class="form-check-input" type="checkbox" ${structure.hasResolution ? 'checked' : ''} disabled>
                                    <label class="form-check-label">
                                        Resolution/Ending
                                    </label>
                                </div>
                            </div>
                        </div>
                        <div class="col-md-6">
                            <p class="text-muted">
                                <strong>Feedback:</strong> ${structure.feedback}
                            </p>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="row">
                <div class="col-md-6">
                    <div class="card">
                        <div class="card-header bg-success text-white">
                            <h6 class="mb-0">
                                <i class="fas fa-thumbs-up me-1"></i>
                                Strengths
                            </h6>
                        </div>
                        <div class="card-body">
                            <ul class="list-unstyled mb-0">
                                ${analysis.strengths.map(strength => 
                                    `<li><i class="fas fa-check text-success me-2"></i>${strength}</li>`
                                ).join('')}
                            </ul>
                        </div>
                    </div>
                </div>
                <div class="col-md-6">
                    <div class="card">
                        <div class="card-header bg-info text-white">
                            <h6 class="mb-0">
                                <i class="fas fa-arrow-up me-1"></i>
                                Areas for Improvement
                            </h6>
                        </div>
                        <div class="card-body">
                            <ul class="list-unstyled mb-0">
                                ${analysis.improvements.map(improvement => 
                                    `<li><i class="fas fa-arrow-right text-info me-2"></i>${improvement}</li>`
                                ).join('')}
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    container.innerHTML = html;
}

function showWritingResults() {
    document.getElementById('writingInputCard').style.display = 'none';
    document.getElementById('writingResultsCard').style.display = 'block';
}

function showWritingLoadingIndicator(show) {
    document.getElementById('writingLoadingIndicator').style.display = show ? 'block' : 'none';
}

function startNewWritingAnalysis() {
    // Reset form
    document.getElementById('writingForm').reset();
    
    // Show input card, hide results
    document.getElementById('writingInputCard').style.display = 'block';
    document.getElementById('writingResultsCard').style.display = 'none';
    
    // Clear current analysis and applied fixes
    currentWritingAnalysis = null;
    appliedFixes = [];
    
    // Clear highlights
    const highlightOverlay = document.getElementById('writingTextHighlights');
    if (highlightOverlay) {
        highlightOverlay.remove();
    }
    
    // Hide previous analysis button
    hidePreviousAnalysisButton();
    
    showFeedback('Ready for new writing analysis!', 'info');
}

function saveWritingAnalysis() {
    if (!currentWritingAnalysis) {
        showFeedback('No analysis to save.', 'error');
        return;
    }
    
    // Save to localStorage
    const savedAnalyses = JSON.parse(localStorage.getItem('writingAnalyses') || '[]');
    const analysisToSave = {
        ...currentWritingAnalysis,
        timestamp: new Date().toISOString(),
        title: document.getElementById('writingTitle').value.trim() || 'Untitled',
        gradeLevel: parseInt(document.getElementById('gradeLevel').value)
    };
    
    savedAnalyses.push(analysisToSave);
    localStorage.setItem('writingAnalyses', JSON.stringify(savedAnalyses));
    
    showFeedback('Writing analysis saved successfully!', 'success');
}

function applyGrammarFix(errorIndex) {
    if (!currentWritingAnalysis || !currentWritingAnalysis.grammarErrors[errorIndex]) {
        return;
    }
    
    const error = currentWritingAnalysis.grammarErrors[errorIndex];
    
    // Get the current text from the form (it might have been updated by previous fixes)
    const textArea = document.getElementById('writingText');
    let currentText = textArea.value;
    
    // Find the error text in the current content (it might have moved due to previous fixes)
    const errorPosition = currentText.indexOf(error.original);
    if (errorPosition === -1) {
        showFeedback(`Error text "${error.original}" not found. It may have already been fixed.`, 'warning');
        return;
    }
    
    // Replace the error with the suggestion
    const newText = currentText.substring(0, errorPosition) + 
                   error.suggestion + 
                   currentText.substring(errorPosition + error.original.length);
    
    textArea.value = newText;
    
    // Track the applied fix for highlighting
    const appliedFix = {
        errorIndex: errorIndex,
        original: error.original,
        suggestion: error.suggestion,
        startPosition: errorPosition,
        endPosition: errorPosition + error.suggestion.length,
        timestamp: Date.now()
    };
    
    // Remove any existing fix for this error index
    appliedFixes = appliedFixes.filter(fix => fix.errorIndex !== errorIndex);
    appliedFixes.push(appliedFix);
    
    // Update the analysis to reflect the change
    currentWritingAnalysis.grammarErrors[errorIndex].applied = true;
    
    // Update the UI to show the fix was applied
    const errorCard = document.querySelector(`[data-error-index="${errorIndex}"]`);
    if (errorCard) {
        errorCard.classList.add('fix-applied');
        const applyButton = errorCard.querySelector('.apply-fix-btn');
        if (applyButton) {
            applyButton.innerHTML = '<i class="fas fa-check me-1"></i>Applied';
            applyButton.disabled = true;
            applyButton.classList.remove('btn-outline-success');
            applyButton.classList.add('btn-success');
        }
    }
    
    // Add visual highlighting to the textarea
    highlightAppliedFixes();
    
    showFeedback(`Applied fix: "${error.original}" → "${error.suggestion}"`, 'success');
}

function highlightAppliedFixes() {
    const textArea = document.getElementById('writingText');
    if (!textArea || appliedFixes.length === 0) {
        return;
    }
    
    // Create or update the highlight overlay
    let highlightOverlay = document.getElementById('writingTextHighlights');
    if (!highlightOverlay) {
        highlightOverlay = document.createElement('div');
        highlightOverlay.id = 'writingTextHighlights';
        highlightOverlay.className = 'writing-text-highlights';
        
        // Insert the overlay into the container, behind the textarea
        const container = textArea.parentNode;
        container.insertBefore(highlightOverlay, textArea);
        
        // Add event listeners to sync scrolling and resizing
        textArea.addEventListener('scroll', syncHighlightOverlay);
        textArea.addEventListener('input', updateHighlightPositions);
    }
    
    // Update highlight positions and content
    updateHighlightOverlay();
}

function syncHighlightOverlay() {
    const textArea = document.getElementById('writingText');
    const highlightOverlay = document.getElementById('writingTextHighlights');
    
    if (textArea && highlightOverlay) {
        highlightOverlay.scrollTop = textArea.scrollTop;
        highlightOverlay.scrollLeft = textArea.scrollLeft;
    }
}

function updateHighlightPositions() {
    // Recalculate positions when text changes
    setTimeout(updateHighlightOverlay, 0);
}

function updateHighlightOverlay() {
    const textArea = document.getElementById('writingText');
    const highlightOverlay = document.getElementById('writingTextHighlights');
    
    if (!textArea || !highlightOverlay || appliedFixes.length === 0) {
        if (highlightOverlay) {
            highlightOverlay.innerHTML = '';
        }
        return;
    }
    
    const currentText = textArea.value;
    let highlightedText = '';
    let lastIndex = 0;
    
    // Sort fixes by position to avoid overlapping
    const sortedFixes = [...appliedFixes].sort((a, b) => {
        // Find current positions of the fixes in the text
        const aPos = currentText.indexOf(a.suggestion, lastIndex);
        const bPos = currentText.indexOf(b.suggestion, lastIndex);
        return aPos - bPos;
    });
    
    sortedFixes.forEach(fix => {
        const fixPosition = currentText.indexOf(fix.suggestion, lastIndex);
        if (fixPosition !== -1) {
            // Add text before the fix
            highlightedText += escapeHtml(currentText.substring(lastIndex, fixPosition));
            
            // Add highlighted fix
            highlightedText += `<span class="applied-fix-highlight" title="Fixed: ${escapeHtml(fix.original)} → ${escapeHtml(fix.suggestion)}">${escapeHtml(fix.suggestion)}</span>`;
            
            lastIndex = fixPosition + fix.suggestion.length;
        }
    });
    
    // Add remaining text
    highlightedText += escapeHtml(currentText.substring(lastIndex));
    
    highlightOverlay.innerHTML = highlightedText;
    
    // Sync overlay scrolling with textarea
    highlightOverlay.scrollTop = textArea.scrollTop;
    highlightOverlay.scrollLeft = textArea.scrollLeft;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function goBackToWritingForm() {
    // Show input card, hide results (but keep analysis in memory)
    document.getElementById('writingInputCard').style.display = 'block';
    document.getElementById('writingResultsCard').style.display = 'none';
    
    // Restore highlights in the form
    highlightAppliedFixes();
    
    // Add a button to show the previous analysis if it exists
    if (currentWritingAnalysis) {
        showPreviousAnalysisButton();
    }
    
    // The form already contains the updated text with applied fixes
    showFeedback('Returned to writing form with your fixes applied!', 'info');
}

function showPreviousAnalysisButton() {
    // Check if button already exists
    if (document.getElementById('showPreviousAnalysisBtn')) {
        return;
    }
    
    // Create and add the "Show Previous Analysis" button
    const buttonContainer = document.querySelector('#writingInputCard .card-body .d-grid');
    if (buttonContainer) {
        const showAnalysisBtn = document.createElement('button');
        showAnalysisBtn.type = 'button';
        showAnalysisBtn.id = 'showPreviousAnalysisBtn';
        showAnalysisBtn.className = 'btn btn-outline-info btn-lg mt-2';
        showAnalysisBtn.innerHTML = '<i class="fas fa-eye me-2"></i>Show Previous Analysis';
        showAnalysisBtn.onclick = showPreviousAnalysis;
        
        buttonContainer.appendChild(showAnalysisBtn);
    }
}

function showPreviousAnalysis() {
    if (currentWritingAnalysis) {
        // Show the results card with existing analysis
        document.getElementById('writingInputCard').style.display = 'none';
        document.getElementById('writingResultsCard').style.display = 'block';
        showFeedback('Showing your previous analysis results!', 'info');
    }
}

function hidePreviousAnalysisButton() {
    const button = document.getElementById('showPreviousAnalysisBtn');
    if (button) {
        button.remove();
    }
}

function clearWritingAnalysis() {
    // Clear the analysis data
    currentWritingAnalysis = null;
    appliedFixes = []; // Clear applied fixes
    
    // Go back to the form
    document.getElementById('writingInputCard').style.display = 'block';
    document.getElementById('writingResultsCard').style.display = 'none';
    
    // Clear highlights
    const highlightOverlay = document.getElementById('writingTextHighlights');
    if (highlightOverlay) {
        highlightOverlay.remove();
    }
    
    // Hide the previous analysis button
    hidePreviousAnalysisButton();
    
    showFeedback('Analysis cleared successfully!', 'success');
}

// ============================================================================
// AUTHENTICATION FUNCTIONALITY
// ============================================================================

// Initialize authentication on page load
function initializeAuth() {
    // Check for stored auth token
    const storedToken = localStorage.getItem('authToken');
    const storedUser = localStorage.getItem('currentUser');
    
    if (storedToken && storedUser) {
        authToken = storedToken;
        currentUser = JSON.parse(storedUser);
        isAuthenticated = true;
        
        // Verify token is still valid
        verifyAuthToken().then(valid => {
            if (valid) {
                updateAuthUI();
            } else {
                logout();
            }
        });
    } else {
        showLoginScreen();
    }
}

// Verify auth token with server
async function verifyAuthToken() {
    if (!authToken) return false;
    
    try {
        const response = await fetch('/auth/me', {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            currentUser = data.user;
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
            return true;
        }
        return false;
    } catch (error) {
        console.error('Token verification failed:', error);
        return false;
    }
}

// Show login screen
function showLoginScreen() {
    document.body.innerHTML = `
        <div class="login-container">
            <div class="login-card">
                <div class="login-header">
                    <h1>
                        <i class="fas fa-puzzle-piece me-2"></i>
                        Puzzle Hub
                        <span class="badge bg-danger text-white ms-2 fw-bold">BETA</span>
                    </h1>
                    <div class="alert alert-danger d-inline-block px-3 py-2 mb-3">
                        <i class="fas fa-flask me-2"></i>
                        <strong>Beta Version</strong> - Currently in testing phase
                    </div>
                    <p class="lead">Your Learning Adventure Awaits</p>
                </div>
                
                <div class="login-content">
                    <div class="feature-preview">
                        <div class="row">
                            <div class="col-md-4 text-center mb-3">
                                <div class="feature-icon">
                                    <i class="fas fa-spell-check"></i>
                                </div>
                                <h5>Spelling Bee</h5>
                                <p class="small">Master words with AI-powered challenges</p>
                            </div>
                            <div class="col-md-4 text-center mb-3">
                                <div class="feature-icon">
                                    <i class="fas fa-calculator"></i>
                                </div>
                                <h5>Yohaku Puzzles</h5>
                                <p class="small">Solve mathematical grid challenges</p>
                            </div>
                            <div class="col-md-4 text-center mb-3">
                                <div class="feature-icon">
                                    <i class="fas fa-pen-fancy"></i>
                                </div>
                                <h5>Writing Coach</h5>
                                <p class="small">Improve your writing with AI feedback</p>
                            </div>
                        </div>
                    </div>
                    
                    <div class="login-actions">
                        <button class="btn btn-google btn-lg w-100 mb-3" onclick="loginWithGoogle()">
                            <i class="fab fa-google me-2"></i>
                            Continue with Google
                        </button>
                        
                        <div class="text-center mb-4">
                            <small class="text-muted">
                                By continuing, you agree to our <a href="/terms" target="_blank" class="text-decoration-none">terms of service</a>. 
                                We only store your name and email for personalization.
                            </small>
                        </div>
                        
                        <div class="login-benefits">
                            <p class="small text-muted mb-2">
                                <i class="fas fa-shield-alt me-1"></i>
                                Secure login powered by Google
                            </p>
                            <p class="small text-muted mb-2">
                                <i class="fas fa-chart-line me-1"></i>
                                Track your progress across all games
                            </p>
                            <p class="small text-muted">
                                <i class="fas fa-sync me-1"></i>
                                Sync your achievements across devices
                            </p>
                        </div>
                    </div>
                </div>
                
                <div class="login-footer">
                    <p class="small text-muted">
                        <i class="fas fa-shield-alt me-1"></i>
                        Secure authentication powered by Google
                    </p>
                </div>
            </div>
        </div>
    `;
}

// Login with Google
async function loginWithGoogle() {
    try {
        showFeedback('Connecting to Google...', 'info');
        
        // Get Google OAuth URL from server
        const response = await fetch('/auth/google');
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to get Google login URL');
        }
        
        const data = await response.json();
        
        // Open Google OAuth in popup
        const popup = window.open(
            data.url, 
            'google-login', 
            'width=500,height=600,scrollbars=yes,resizable=yes'
        );
        
        // Listen for popup messages
        let loginCompleted = false; // Flag to track if login completed successfully
        
        const messageListener = (event) => {
            if (event.origin !== window.location.origin) return;
            
            if (event.data.type === 'GOOGLE_AUTH_SUCCESS') {
                loginCompleted = true; // Mark login as completed
                popup.close();
                handleLoginSuccess(event.data.result);
                window.removeEventListener('message', messageListener);
            } else if (event.data.type === 'GOOGLE_AUTH_ERROR') {
                loginCompleted = true; // Mark login as completed (with error)
                popup.close();
                showFeedback('Login failed: ' + event.data.error, 'error');
                window.removeEventListener('message', messageListener);
            }
        };
        
        window.addEventListener('message', messageListener);
        
        // Check if popup was closed manually (only show cancelled if not completed)
        const checkClosed = setInterval(() => {
            if (popup.closed) {
                clearInterval(checkClosed);
                window.removeEventListener('message', messageListener);
                
                // Only show "cancelled" if login wasn't completed successfully
                if (!loginCompleted) {
                    showFeedback('Login cancelled', 'warning');
                }
            }
        }, 1000);
        
    } catch (error) {
        console.error('Login error:', error);
        showFeedback('Login failed: ' + error.message, 'error');
    }
}

// Handle successful login
function handleLoginSuccess(loginResult) {
    authToken = loginResult.token;
    currentUser = loginResult.user;
    isAuthenticated = true;
    
    // Store in localStorage
    localStorage.setItem('authToken', authToken);
    localStorage.setItem('currentUser', JSON.stringify(currentUser));
    
    showFeedback(`Welcome back, ${currentUser.name}!`, 'success');
    
    // Reload the main application
    setTimeout(() => {
        window.location.reload();
    }, 1500);
}

// Logout function
function logout() {
    // Clear local storage
    localStorage.removeItem('authToken');
    localStorage.removeItem('currentUser');
    
    // Reset state
    authToken = null;
    currentUser = null;
    isAuthenticated = false;
    
    // Show login screen
    showLoginScreen();
    showFeedback('Logged out successfully', 'info');
}

// Update authentication UI elements
function updateAuthUI() {
    if (!isAuthenticated || !currentUser) return;
    
    // Update page title with user name
    document.title = `Puzzle Hub - Welcome ${currentUser.name}`;
    
    // Add user info to navigation if it exists
    const navbarNav = document.querySelector('.navbar-nav');
    if (navbarNav) {
        const userNavItem = document.createElement('li');
        userNavItem.className = 'nav-item dropdown ms-auto';
        userNavItem.innerHTML = `
            <a class="nav-link dropdown-toggle d-flex align-items-center" href="#" 
               id="userDropdown" role="button" data-bs-toggle="dropdown">
                <img src="${currentUser.picture}" alt="${currentUser.name}" 
                     class="user-avatar me-2" width="32" height="32">
                <span class="d-none d-md-inline">${currentUser.name}</span>
            </a>
            <ul class="dropdown-menu dropdown-menu-end">
                <li><h6 class="dropdown-header">${currentUser.name}</h6></li>
                <li><span class="dropdown-item-text small text-muted">${currentUser.email}</span></li>
                <li><hr class="dropdown-divider"></li>
                <li><a class="dropdown-item" href="#" onclick="showProfile()">
                    <i class="fas fa-user me-2"></i>Profile
                </a></li>
                <li><a class="dropdown-item" href="#" onclick="showProgress()">
                    <i class="fas fa-chart-line me-2"></i>Progress
                </a></li>
                <li><hr class="dropdown-divider"></li>
                <li><a class="dropdown-item text-danger" href="#" onclick="logout()">
                    <i class="fas fa-sign-out-alt me-2"></i>Logout
                </a></li>
            </ul>
        `;
        navbarNav.appendChild(userNavItem);
    }
}

// Show user profile
function showProfile() {
    alert(`Profile: ${currentUser.name}\nEmail: ${currentUser.email}\nMember since: ${new Date(currentUser.createdAt).toLocaleDateString()}`);
}

// Show user progress
function showProgress() {
    alert('Progress tracking feature coming soon!');
}

// Add authentication to API requests
async function makeAuthenticatedRequest(url, options = {}) {
    // Get token from localStorage or global variable
    const token = authToken || localStorage.getItem('authToken');
    
    console.log('Making authenticated request to:', url);
    console.log('Token available:', !!token);
    
    if (!token) {
        console.error('No auth token available');
        showLoginScreen();
        throw new Error('Authentication required. Please login first.');
    }
    
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...options.headers
    };
    
    const response = await fetch(url, {
        ...options,
        headers
    });
    
    // If we get 401, the token might be expired
    if (response.status === 401) {
        console.error('Authentication failed - token may be expired');
        localStorage.removeItem('authToken');
        authToken = null;
        showLoginScreen();
        throw new Error('Authentication expired. Please login again.');
    }
    
    return response;
}

// ============================================================================
// CUSTOM LOGS FUNCTIONALITY
// ============================================================================

// Load user's log types
async function loadLogTypes() {
    try {
        const response = await makeAuthenticatedRequest('/api/logs/types');
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        displayLogTypes(data.log_types || []);
        
    } catch (error) {
        console.error('Error loading log types:', error);
        displayLogTypesError('Failed to load your logs. Please try again.');
    }
}

// Display log types in the UI
function displayLogTypes(logTypes) {
    const container = document.getElementById('logTypesList');
    
    if (logTypes.length === 0) {
        container.innerHTML = `
            <div class="col-12 text-center py-5">
                <i class="fas fa-plus-circle fa-3x text-muted mb-3"></i>
                <h5>No Custom Logs Yet</h5>
                <p class="text-muted">Create your first custom log to start tracking your activities!</p>
                <button class="btn btn-primary" onclick="switchToCreateLogTab()">
                    <i class="fas fa-plus me-2"></i>Create Your First Log
                </button>
            </div>
        `;
        return;
    }
    
    let html = '';
    logTypes.forEach(logType => {
        html += `
            <div class="col-md-6 col-lg-4 mb-3">
                <div class="card h-100">
                    <div class="card-body">
                        <div class="d-flex align-items-center mb-2">
                            <i class="${logType.icon || 'fas fa-list'} fa-2x me-3" style="color: ${logType.color || '#007bff'}"></i>
                            <div>
                                <h6 class="card-title mb-0">${logType.name}</h6>
                                <small class="text-muted">${logType.fields ? logType.fields.length : 0} fields</small>
                            </div>
                        </div>
                        <p class="card-text small">${logType.description || 'No description'}</p>
                        <div class="d-flex gap-2">
                            <button class="btn btn-sm btn-primary" onclick="addLogEntry('${logType.id}')">
                                <i class="fas fa-plus me-1"></i>Add Entry
                            </button>
                            <button class="btn btn-sm btn-outline-secondary" onclick="viewLogEntries('${logType.id}')">
                                <i class="fas fa-eye me-1"></i>View
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

// Display error when loading log types fails
function displayLogTypesError(message) {
    const container = document.getElementById('logTypesList');
    container.innerHTML = `
        <div class="col-12 text-center py-5">
            <i class="fas fa-exclamation-triangle fa-3x text-warning mb-3"></i>
            <h5>Unable to Load Logs</h5>
            <p class="text-muted">${message}</p>
            <button class="btn btn-primary" onclick="loadLogTypes()">
                <i class="fas fa-refresh me-2"></i>Try Again
            </button>
        </div>
    `;
}

// Switch to create log tab
function switchToCreateLogTab() {
    const createLogTab = document.getElementById('create-log-tab');
    if (createLogTab) {
        createLogTab.click();
    }
}

// Add log entry - switch to Add Entry tab and pre-select log type
function addLogEntry(logTypeId) {
    // Switch to Add Entry tab
    const addEntryTab = document.getElementById('add-entry-tab');
    if (addEntryTab) {
        addEntryTab.click();
    }
    
    // Pre-select the log type
    setTimeout(() => {
        const logTypeSelect = document.getElementById('entryLogType');
        if (logTypeSelect) {
            logTypeSelect.value = logTypeId;
            handleLogTypeSelection();
        }
        
        // Set today's date as default
        const dateInput = document.getElementById('entryDate');
        if (dateInput && !dateInput.value) {
            dateInput.value = new Date().toISOString().split('T')[0];
        }
    }, 100);
}

// View log entries - load and display entries for a specific log type
async function viewLogEntries(logTypeId) {
    try {
        console.log('Loading entries for log type ID:', logTypeId);
        showFeedback('Loading entries...', 'info');
        const response = await makeAuthenticatedRequest(`/api/logs/entries?log_type_id=${logTypeId}`);
        
        console.log('Response status:', response.status);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        const entries = data.log_entries || [];
        
        console.log('Loaded entries for log type:', logTypeId, entries);
        console.log('Log type info:', data.log_type);
        
        if (entries.length === 0) {
            showFeedback('No entries found for this log type', 'info');
            return;
        }
        
        // Show entries in a modal
        showEntriesModal(entries, data.log_type || { name: 'Log Entries' });
        
    } catch (error) {
        console.error('Error loading log entries:', error);
        showFeedback('Failed to load log entries', 'error');
    }
}

function showEntriesModal(entries, logType) {
    const modalHtml = `
        <div class="modal fade" id="entriesModal" tabindex="-1">
            <div class="modal-dialog modal-xl">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">
                            <i class="${logType.icon || 'fas fa-list'} me-2"></i>
                            ${logType.name} - Entries (${entries.length})
                        </h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <div class="table-responsive">
                            <table class="table table-striped">
                                <thead>
                                    <tr>
                                        <th>Date</th>
                                        <th>Values</th>
                                        <th>Created</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${entries.map(entry => `
                                        <tr id="entry-row-${entry.id}">
                                            <td>
                                                <strong>${entry.entry_date}</strong>
                                            </td>
                                            <td>
                                                ${formatEntryValues(entry.values)}
                                            </td>
                                            <td>
                                                <small class="text-muted">
                                                    ${new Date(entry.created_at).toLocaleDateString()}
                                                </small>
                                            </td>
                                            <td>
                                                <button class="btn btn-sm btn-outline-danger" onclick="deleteLogEntry('${entry.id}')" title="Delete Entry">
                                                    <i class="fas fa-trash"></i>
                                                </button>
                                            </td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Remove existing modal if any
    const existingModal = document.getElementById('entriesModal');
    if (existingModal) {
        existingModal.remove();
    }
    
    // Add modal to body
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    
    // Show modal
    const modal = new bootstrap.Modal(document.getElementById('entriesModal'));
    modal.show();
    
    // Clean up when modal is hidden
    document.getElementById('entriesModal').addEventListener('hidden.bs.modal', function() {
        this.remove();
    });
}

function formatEntryValues(values) {
    if (!values || Object.keys(values).length === 0) {
        return '<em class="text-muted">No values</em>';
    }
    
    let html = '<div class="row g-2">';
    for (const [key, value] of Object.entries(values)) {
        html += `
            <div class="col-md-6">
                <small class="text-muted d-block">${key}:</small>
                <strong>${value}</strong>
            </div>
        `;
    }
    html += '</div>';
    
    return html;
}

// Initialize Custom Logs when tab is shown
function initializeCustomLogs() {
    // Load log types when the Custom Logs tab is first shown
    const logsTab = document.getElementById('logs-tab');
    if (logsTab) {
        logsTab.addEventListener('shown.bs.tab', function() {
            loadLogTypes();
            loadLogTypesForEntryForm();
        });
    }
    
    // Add event listener for analytics tab
    const analyticsTab = document.getElementById('analytics-tab');
    if (analyticsTab) {
        analyticsTab.addEventListener('shown.bs.tab', function() {
            loadAnalytics();
        });
    }
    
    // Initialize create log form handler
    const createLogForm = document.getElementById('createLogForm');
    if (createLogForm) {
        createLogForm.addEventListener('submit', handleCreateLogType);
    }
    
    // Initialize add entry form handler
    const addEntryForm = document.getElementById('addEntryForm');
    if (addEntryForm) {
        addEntryForm.addEventListener('submit', handleAddLogEntry);
    }
}

// Handle create log type form submission
async function handleCreateLogType(e) {
    e.preventDefault();
    
    const name = document.getElementById('logName').value.trim();
    const description = document.getElementById('logDescription').value.trim();
    const icon = document.getElementById('logIcon').value;
    const color = document.getElementById('logColor').value;
    
    if (!name) {
        showFeedback('Please enter a log name', 'error');
        return;
    }
    
    // Collect custom fields
    const fields = [];
    const fieldElements = document.querySelectorAll('.custom-field-row');
    
    fieldElements.forEach((fieldRow, index) => {
        const fieldName = fieldRow.querySelector('.field-name').value.trim();
        const fieldType = fieldRow.querySelector('.field-type').value;
        const required = fieldRow.querySelector('.field-required').checked;
        const defaultValue = fieldRow.querySelector('.field-default').value.trim();
        
        if (fieldName) {
            fields.push({
                field_name: fieldName,
                field_type: fieldType,
                required: required,
                default_value: defaultValue,
                options: fieldType === 'select' ? fieldRow.querySelector('.field-options')?.value || '' : ''
            });
        }
    });
    
    const logTypeData = {
        name: name,
        description: description,
        icon: icon,
        color: color,
        fields: fields
    };
    
    try {
        showFeedback('Creating log type...', 'info');
        
        const response = await makeAuthenticatedRequest('/api/logs/types', {
            method: 'POST',
            body: JSON.stringify(logTypeData)
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to create log type');
        }
        
        const result = await response.json();
        showFeedback('Log type created successfully!', 'success');
        
        // Reset form and reload log types
        resetCreateLogForm();
        loadLogTypes();
        loadLogTypesForEntryForm();
        
        // Switch to My Logs tab to show the new log type
        const myLogsTab = document.getElementById('my-logs-tab');
        if (myLogsTab) {
            myLogsTab.click();
        }
        
    } catch (error) {
        console.error('Error creating log type:', error);
        showFeedback(error.message, 'error');
    }
}

// Add a custom field to the create log form
function addCustomField() {
    const container = document.getElementById('customFields');
    const fieldIndex = container.children.length;
    
    const fieldHtml = `
        <div class="custom-field-row border rounded p-3 mb-3">
            <div class="row">
                <div class="col-md-4">
                    <label class="form-label">Field Name *</label>
                    <input type="text" class="form-control field-name" placeholder="e.g., Weight, Duration" required>
                </div>
                <div class="col-md-3">
                    <label class="form-label">Field Type</label>
                    <select class="form-control field-type" onchange="toggleFieldOptions(this)">
                        <option value="text">Text</option>
                        <option value="number">Number</option>
                        <option value="textarea">Long Text</option>
                        <option value="select">Dropdown</option>
                        <option value="checkbox">Checkbox</option>
                    </select>
                </div>
                <div class="col-md-3">
                    <label class="form-label">Default Value</label>
                    <input type="text" class="form-control field-default" placeholder="Optional">
                </div>
                <div class="col-md-2">
                    <label class="form-label">Required</label>
                    <div class="form-check">
                        <input type="checkbox" class="form-check-input field-required">
                        <label class="form-check-label">Required</label>
                    </div>
                </div>
            </div>
            <div class="field-options-container mt-2" style="display: none;">
                <label class="form-label">Options (one per line)</label>
                <textarea class="form-control field-options" rows="3" placeholder="Option 1&#10;Option 2&#10;Option 3"></textarea>
            </div>
            <button type="button" class="btn btn-sm btn-outline-danger mt-2" onclick="removeCustomField(this)">
                <i class="fas fa-trash me-1"></i>Remove Field
            </button>
        </div>
    `;
    
    container.insertAdjacentHTML('beforeend', fieldHtml);
}

// Remove a custom field
function removeCustomField(button) {
    button.closest('.custom-field-row').remove();
}

// Toggle field options visibility for select fields
function toggleFieldOptions(selectElement) {
    const optionsContainer = selectElement.closest('.custom-field-row').querySelector('.field-options-container');
    if (selectElement.value === 'select') {
        optionsContainer.style.display = 'block';
    } else {
        optionsContainer.style.display = 'none';
    }
}

// Reset the create log form
function resetCreateLogForm() {
    document.getElementById('createLogForm').reset();
    document.getElementById('customFields').innerHTML = '';
    document.getElementById('logColor').value = '#007bff';
}

// AI-powered field suggestions
async function suggestFields() {
    const logName = document.getElementById('logName').value.trim();
    const description = document.getElementById('logDescription').value.trim();
    
    if (!logName) {
        showFeedback('Please enter a log name first', 'error');
        return;
    }
    
    try {
        console.log('Requesting AI field suggestions for:', logName);
        showFeedback('AI is analyzing your log type and suggesting fields...', 'info');
        
        const requestBody = {
            log_type_name: logName,
            description: description
        };
        console.log('Request body:', requestBody);
        
        const response = await makeAuthenticatedRequest('/api/logs/types/suggest-fields', {
            method: 'POST',
            body: JSON.stringify(requestBody)
        });
        
        console.log('Suggest fields response status:', response.status);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('Suggest fields error response:', errorText);
            throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
        }
        
        const data = await response.json();
        console.log('AI suggestions received:', data);
        
        // Clear existing fields
        document.getElementById('customFields').innerHTML = '';
        
        // Add suggested fields
        data.suggested_fields.forEach((field, index) => {
            addSuggestedField(field, index);
        });
        
        showFeedback(`✨ AI suggested ${data.suggested_fields.length} fields! ${data.explanation}`, 'success');
        
    } catch (error) {
        console.error('Error getting field suggestions:', error);
        showFeedback('Failed to get AI suggestions: ' + error.message, 'error');
    }
}

// Add a suggested field to the form
function addSuggestedField(field, index) {
    const container = document.getElementById('customFields');
    
    const fieldHtml = `
        <div class="custom-field-row border rounded p-3 mb-3 bg-light">
            <div class="d-flex justify-content-between align-items-start mb-2">
                <h6 class="mb-0 text-success">
                    <i class="fas fa-magic me-1"></i>AI Suggested Field
                </h6>
                <button type="button" class="btn btn-sm btn-outline-danger" onclick="removeCustomField(this)">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
            <div class="row">
                <div class="col-md-4">
                    <label class="form-label">Field Name *</label>
                    <input type="text" class="form-control field-name" value="${field.field_name}" required>
                </div>
                <div class="col-md-3">
                    <label class="form-label">Field Type</label>
                    <select class="form-control field-type" onchange="toggleFieldOptions(this)">
                        <option value="text" ${field.field_type === 'text' ? 'selected' : ''}>Text</option>
                        <option value="number" ${field.field_type === 'number' ? 'selected' : ''}>Number</option>
                        <option value="textarea" ${field.field_type === 'textarea' ? 'selected' : ''}>Long Text</option>
                        <option value="select" ${field.field_type === 'select' ? 'selected' : ''}>Dropdown</option>
                        <option value="checkbox" ${field.field_type === 'checkbox' ? 'selected' : ''}>Checkbox</option>
                    </select>
                </div>
                <div class="col-md-3">
                    <label class="form-label">Default Value</label>
                    <input type="text" class="form-control field-default" value="${field.default_value || ''}" placeholder="Optional">
                </div>
                <div class="col-md-2">
                    <label class="form-label">Required</label>
                    <div class="form-check">
                        <input type="checkbox" class="form-check-input field-required" ${field.required ? 'checked' : ''}>
                        <label class="form-check-label">Required</label>
                    </div>
                </div>
            </div>
            <div class="field-options-container mt-2" style="display: ${field.field_type === 'select' ? 'block' : 'none'};">
                <label class="form-label">Options (one per line)</label>
                <textarea class="form-control field-options" rows="3" placeholder="Option 1&#10;Option 2&#10;Option 3">${field.options ? field.options.replace(/,/g, '\n') : ''}</textarea>
            </div>
            <div class="mt-2">
                <small class="text-muted">
                    <i class="fas fa-info-circle me-1"></i>
                    ${field.description}
                </small>
            </div>
        </div>
    `;
    
    container.insertAdjacentHTML('beforeend', fieldHtml);
}

// Load log types for the entry form dropdown
async function loadLogTypesForEntryForm() {
    try {
        const response = await makeAuthenticatedRequest('/api/logs/types');
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        const logTypes = data.log_types || [];
        
        const select = document.getElementById('entryLogType');
        if (select) {
            select.innerHTML = '<option value="">Select a log type...</option>';
            
            logTypes.forEach(logType => {
                const option = document.createElement('option');
                option.value = logType.id;
                option.textContent = logType.name;
                option.dataset.fields = JSON.stringify(logType.fields || []);
                select.appendChild(option);
            });
        }
        
    } catch (error) {
        console.error('Error loading log types for entry form:', error);
    }
}

// Handle log type selection in entry form
function handleLogTypeSelection() {
    const select = document.getElementById('entryLogType');
    const fieldsContainer = document.getElementById('entryCustomFields');
    
    if (!select.value) {
        fieldsContainer.innerHTML = '';
        return;
    }
    
    const selectedOption = select.options[select.selectedIndex];
    const fields = JSON.parse(selectedOption.dataset.fields || '[]');
    
    if (fields.length === 0) {
        fieldsContainer.innerHTML = '<div class="alert alert-info"><i class="fas fa-info-circle me-2"></i>No custom fields for this log type.</div>';
        return;
    }
    
    // Generate enhanced fields with better UX
    let fieldsHtml = '<div class="row">';
    fields.forEach((field, index) => {
        fieldsHtml += generateEnhancedFieldInput(field, index);
    });
    fieldsHtml += '</div>';
    
    // Add quick actions
    fieldsHtml += `
        <div class="mt-3 p-3 bg-light rounded">
            <div class="row">
                <div class="col-md-6">
                    <button type="button" class="btn btn-outline-secondary btn-sm" onclick="clearAllFields()">
                        <i class="fas fa-eraser me-1"></i> Clear All
                    </button>
                    <button type="button" class="btn btn-outline-info btn-sm ms-2" onclick="fillSampleData()">
                        <i class="fas fa-magic me-1"></i> Sample Data
                    </button>
                </div>
                <div class="col-md-6 text-end">
                    <small class="text-muted">
                        <i class="fas fa-save me-1"></i> Auto-saves as you type
                    </small>
                </div>
            </div>
        </div>
    `;
    
    fieldsContainer.innerHTML = fieldsHtml;
    
    // Initialize auto-save and validation
    initializeFieldEnhancements();
}

// Generate HTML for a field input based on field type
function generateFieldInput(field) {
    const required = field.required ? 'required' : '';
    const requiredLabel = field.required ? ' *' : '';
    
    switch (field.field_type) {
        case 'text':
            return `
                <div class="col-md-6 mb-3">
                    <label class="form-label">${field.field_name}${requiredLabel}</label>
                    <input type="text" class="form-control" name="field_${field.field_name}" 
                           value="${field.default_value || ''}" ${required}>
                </div>
            `;
        case 'number':
            return `
                <div class="col-md-6 mb-3">
                    <label class="form-label">${field.field_name}${requiredLabel}</label>
                    <input type="number" class="form-control" name="field_${field.field_name}" 
                           value="${field.default_value || ''}" ${required}>
                </div>
            `;
        case 'textarea':
            return `
                <div class="col-12 mb-3">
                    <label class="form-label">${field.field_name}${requiredLabel}</label>
                    <textarea class="form-control" name="field_${field.field_name}" rows="3" ${required}>${field.default_value || ''}</textarea>
                </div>
            `;
        case 'select':
            const options = field.options.split('\n').filter(opt => opt.trim());
            let optionsHtml = '<option value="">Choose...</option>';
            options.forEach(option => {
                const selected = option.trim() === field.default_value ? 'selected' : '';
                optionsHtml += `<option value="${option.trim()}" ${selected}>${option.trim()}</option>`;
            });
            return `
                <div class="col-md-6 mb-3">
                    <label class="form-label">${field.field_name}${requiredLabel}</label>
                    <select class="form-control" name="field_${field.field_name}" ${required}>
                        ${optionsHtml}
                    </select>
                </div>
            `;
        case 'checkbox':
            const checked = field.default_value === 'true' ? 'checked' : '';
            return `
                <div class="col-md-6 mb-3">
                    <div class="form-check">
                        <input type="checkbox" class="form-check-input" name="field_${field.field_name}" ${checked}>
                        <label class="form-check-label">${field.field_name}${requiredLabel}</label>
                    </div>
                </div>
            `;
        default:
            return '';
    }
}

// Handle add log entry form submission
async function handleAddLogEntry(e) {
    e.preventDefault();
    
    console.log('Starting handleAddLogEntry...');
    console.log('Auth token available:', !!(authToken || localStorage.getItem('authToken')));
    
    const logTypeId = document.getElementById('entryLogType').value;
    const entryDate = document.getElementById('entryDate').value;
    
    console.log('Log Type ID:', logTypeId);
    console.log('Entry Date:', entryDate);
    
    if (!logTypeId) {
        showFeedback('Please select a log type', 'error');
        return;
    }
    
    if (!entryDate) {
        showFeedback('Please select a date', 'error');
        return;
    }
    
    // Collect field values
    const values = {};
    const fieldInputs = document.querySelectorAll('#entryCustomFields input, #entryCustomFields select, #entryCustomFields textarea');
    
    fieldInputs.forEach(input => {
        const fieldName = input.name.replace('field_', '');
        if (input.type === 'checkbox') {
            values[fieldName] = input.checked;
        } else {
            values[fieldName] = input.value;
        }
    });
    
    // Auto-calculate profit_loss if not provided but we have entry_price, exit_price, and quantity
    if (!values.profit_loss || values.profit_loss === '' || values.profit_loss === 'null') {
        const entryPrice = parseFloat(values.entry_price) || 0;
        const exitPrice = parseFloat(values.exit_price) || 0;
        const quantity = parseFloat(values.quantity) || 0;
        
        if (entryPrice > 0 && exitPrice > 0 && quantity > 0) {
            const calculatedPL = (exitPrice - entryPrice) * quantity;
            values.profit_loss = calculatedPL.toString();
            console.log(`Auto-calculated profit_loss: (${exitPrice} - ${entryPrice}) * ${quantity} = ${calculatedPL}`);
        }
    }
    
    const entryData = {
        log_type_id: logTypeId,
        entry_date: entryDate,
        values: values
    };
    
    console.log('Entry data to send:', entryData);
    
    try {
        showFeedback('Adding log entry...', 'info');
        
        const response = await makeAuthenticatedRequest('/api/logs/entries', {
            method: 'POST',
            body: JSON.stringify(entryData)
        });
        
        console.log('Add entry response status:', response.status);
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to add log entry');
        }
        
        const result = await response.json();
        showFeedback('Log entry added successfully!', 'success');
        
        // Reset form
        document.getElementById('addEntryForm').reset();
        document.getElementById('entryCustomFields').innerHTML = '';
        
        // Clear auto-saved data
        clearAutoSavedData();
        
        // Refresh analytics if the analytics tab is active
        const analyticsTab = document.getElementById('analytics-tab');
        if (analyticsTab && analyticsTab.classList.contains('active')) {
            console.log('Refreshing analytics after adding log entry...');
            setTimeout(() => {
                loadAnalytics();
            }, 500); // Small delay to ensure backend is updated
        }
        
    } catch (error) {
        console.error('Error adding log entry:', error);
        showFeedback(error.message, 'error');
    }
}

// ANALYTICS FUNCTIONALITY
async function loadAnalytics() {
    try {
        console.log('Loading analytics...');
        showFeedback('Loading analytics...', 'info');
        
        const response = await makeAuthenticatedRequest('/api/logs/analytics');
        console.log('Analytics response status:', response.status);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('Analytics error response:', errorText);
            throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
        }
        
        const data = await response.json();
        console.log('Analytics data received:', data);
        displayAnalytics(data);
        
    } catch (error) {
        console.error('Error loading analytics:', error);
        showFeedback('Failed to load analytics: ' + error.message, 'error');
        
        // Show empty state
        displayEmptyAnalytics();
    }
}

function displayEmptyAnalytics() {
    // Update summary cards with zeros
    document.getElementById('totalLogs').textContent = '0';
    document.getElementById('thisMonthEntries').textContent = '0';
    document.getElementById('thisWeekEntries').textContent = '0';
    document.getElementById('currentStreak').textContent = '0';
    
    // Show empty calendar
    const calendarContainer = document.getElementById('activityCalendar');
    if (calendarContainer) {
        const emptyCalendarHtml = generateCalendarHtml({});
        calendarContainer.innerHTML = emptyCalendarHtml + 
            '<div class="text-center mt-3"><p class="text-muted">No activity data yet. Start by creating log types and adding entries!</p></div>';
    }
    
    // Clear log type breakdown
    const existingBreakdown = document.getElementById('logTypeBreakdown');
    if (existingBreakdown) {
        existingBreakdown.remove();
    }
}

function displayAnalytics(data) {
    // Store analytics data globally for calendar filtering
    window.currentAnalyticsData = data;
    
    // Populate log type selector
    populateCalendarLogTypeSelector(data.analytics);
    
    // Render log type breakdown
    renderLogTypeBreakdown(data.analytics);
    
    showFeedback('Analytics loaded successfully!', 'success');
}

function populateCalendarLogTypeSelector(analytics) {
    const selector = document.getElementById('calendarLogTypeSelector');
    if (!selector) return;
    
    // Clear existing options except the default
    selector.innerHTML = '<option value="">Choose a log type...</option>';
    
    // Add option for each log type
    analytics.forEach(logAnalytics => {
        const option = document.createElement('option');
        option.value = logAnalytics.log_type_id;
        option.textContent = logAnalytics.log_type_name;
        selector.appendChild(option);
    });
}

function handleCalendarLogTypeChange() {
    const selector = document.getElementById('calendarLogTypeSelector');
    const selectedLogTypeId = selector.value;
    const calendarContainer = document.getElementById('activityCalendar');
    
    if (!window.currentAnalyticsData || !calendarContainer) return;
    
    if (!selectedLogTypeId) {
        // Show default message when no log type is selected
        calendarContainer.innerHTML = `
            <div class="text-center py-4">
                <i class="fas fa-calendar-alt fa-3x text-muted mb-3"></i>
                <p class="text-muted">Select a log type above to view its detailed calendar</p>
            </div>
        `;
        return;
    }
    
    // Show detailed calendar for specific log type
    const selectedLogType = window.currentAnalyticsData.analytics.find(
        analytics => analytics.log_type_id === selectedLogTypeId
    );
    
    if (selectedLogType) {
        renderDetailedLogTypeCalendar(selectedLogType);
    }
}

function calculateStreak(analytics) {
    // Collect all entry dates
    const allDates = new Set();
    
    analytics.forEach(logAnalytics => {
        Object.keys(logAnalytics.daily_activity || {}).forEach(date => {
            allDates.add(date);
        });
    });
    
    // Sort dates
    const sortedDates = Array.from(allDates).sort().reverse();
    
    // Calculate consecutive days from today
    let streak = 0;
    const today = new Date().toISOString().split('T')[0];
    
    for (let i = 0; i < sortedDates.length; i++) {
        const expectedDate = new Date();
        expectedDate.setDate(expectedDate.getDate() - i);
        const expectedDateStr = expectedDate.toISOString().split('T')[0];
        
        if (sortedDates[i] === expectedDateStr) {
            streak++;
        } else {
            break;
        }
    }
    
    return streak;
}


function renderLogTypeBreakdown(analytics) {
    const container = document.querySelector('#analytics .row:last-child');
    if (!container) return;
    
    // Clear existing breakdown
    const existingBreakdown = document.getElementById('logTypeBreakdown');
    if (existingBreakdown) {
        existingBreakdown.remove();
    }
    
    // Create breakdown section
    const breakdownHtml = `
        <div class="col-12 mt-4" id="logTypeBreakdown">
            <div class="card">
                <div class="card-header">
                    <h5>Log Type Breakdown</h5>
                </div>
                <div class="card-body">
                    <div class="row">
                        ${analytics.map(logAnalytics => `
                            <div class="col-md-4 mb-3">
                                <div class="card border-start border-primary border-3">
                                    <div class="card-body">
                                        <h6 class="card-title">${logAnalytics.log_type_name}</h6>
                                        <div class="d-flex justify-content-between">
                                            <small class="text-muted">Total Entries:</small>
                                            <strong>${logAnalytics.total_entries}</strong>
                                        </div>
                                        <div class="d-flex justify-content-between">
                                            <small class="text-muted">This Month:</small>
                                            <strong>${logAnalytics.this_month || 0}</strong>
                                        </div>
                                        <div class="d-flex justify-content-between">
                                            <small class="text-muted">This Week:</small>
                                            <strong>${logAnalytics.this_week || 0}</strong>
                                        </div>
                                        <button class="btn btn-sm btn-outline-primary mt-2" onclick="viewDetailedAnalytics('${logAnalytics.log_type_id}')">
                                            <i class="fas fa-chart-line me-1"></i> View Details
                                        </button>
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        </div>
    `;
    
    container.insertAdjacentHTML('beforeend', breakdownHtml);
}

async function viewDetailedAnalytics(logTypeId) {
    try {
        showFeedback('Loading detailed analytics...', 'info');
        
        const response = await makeAuthenticatedRequest(`/api/logs/analytics/${logTypeId}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        showDetailedAnalyticsModal(data);
        
    } catch (error) {
        console.error('Error loading detailed analytics:', error);
        showFeedback('Failed to load detailed analytics', 'error');
    }
}

function showDetailedAnalyticsModal(data) {
    // Create modal HTML
    const modalHtml = `
        <div class="modal fade" id="detailedAnalyticsModal" tabindex="-1">
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">${data.log_type.name} - Detailed Analytics</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <div class="row mb-4">
                            <div class="col-md-3">
                                <div class="text-center">
                                    <h4 class="text-primary">${data.analytics.total_entries}</h4>
                                    <small class="text-muted">Total Entries</small>
                                </div>
                            </div>
                            <div class="col-md-3">
                                <div class="text-center">
                                    <h4 class="text-success">${data.analytics.this_month}</h4>
                                    <small class="text-muted">This Month</small>
                                </div>
                            </div>
                            <div class="col-md-3">
                                <div class="text-center">
                                    <h4 class="text-warning">${data.analytics.this_week}</h4>
                                    <small class="text-muted">This Week</small>
                                </div>
                            </div>
                            <div class="col-md-3">
                                <div class="text-center">
                                    <h4 class="text-info">${data.analytics.monthly_trend.length}</h4>
                                    <small class="text-muted">Active Months</small>
                                </div>
                            </div>
                        </div>
                        
                        ${Object.keys(data.field_analytics || {}).length > 0 ? `
                            <h6>Field Statistics</h6>
                            <div class="row">
                                ${Object.entries(data.field_analytics).map(([fieldName, stats]) => `
                                    <div class="col-md-6 mb-3">
                                        <div class="card">
                                            <div class="card-body">
                                                <h6 class="card-title">${fieldName}</h6>
                                                <small class="text-muted">${stats.field_type}</small>
                                                <div class="mt-2">
                                                    <div class="d-flex justify-content-between">
                                                        <span>Filled:</span>
                                                        <span>${stats.filled_entries}/${stats.total_entries}</span>
                                                    </div>
                                                    ${stats.average !== undefined ? `
                                                        <div class="d-flex justify-content-between">
                                                            <span>Average:</span>
                                                            <span>${stats.average.toFixed(2)}</span>
                                                        </div>
                                                        <div class="d-flex justify-content-between">
                                                            <span>Range:</span>
                                                            <span>${stats.min} - ${stats.max}</span>
                                                        </div>
                                                    ` : ''}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        ` : ''}
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Remove existing modal
    const existingModal = document.getElementById('detailedAnalyticsModal');
    if (existingModal) {
        existingModal.remove();
    }
    
    // Add modal to page
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    
    // Show modal
    const modal = new bootstrap.Modal(document.getElementById('detailedAnalyticsModal'));
    modal.show();
    
    // Clean up when modal is hidden
    document.getElementById('detailedAnalyticsModal').addEventListener('hidden.bs.modal', function() {
        this.remove();
    });
}

// Enhanced field generation and UX functions
function generateEnhancedFieldInput(field, index) {
    const required = field.required ? 'required' : '';
    const requiredLabel = field.required ? ' *' : '';
    const fieldId = `field_${field.field_name}_${index}`;
    
    switch (field.field_type) {
        case 'text':
            return `
                <div class="col-md-6 mb-3">
                    <label class="form-label">${field.field_name}${requiredLabel}</label>
                    <input type="text" class="form-control enhanced-field" id="${fieldId}" 
                           name="field_${field.field_name}" value="${field.default_value || ''}" 
                           ${required} data-field-type="text" placeholder="Enter ${field.field_name}">
                    <div class="field-feedback"></div>
                </div>
            `;
        case 'number':
            return `
                <div class="col-md-6 mb-3">
                    <label class="form-label">${field.field_name}${requiredLabel}</label>
                    <input type="number" class="form-control enhanced-field" id="${fieldId}" 
                           name="field_${field.field_name}" value="${field.default_value || ''}" 
                           ${required} data-field-type="number" placeholder="Enter ${field.field_name}" step="any">
                    <div class="field-feedback"></div>
                </div>
            `;
        case 'textarea':
            return `
                <div class="col-12 mb-3">
                    <label class="form-label">${field.field_name}${requiredLabel}</label>
                    <textarea class="form-control enhanced-field" id="${fieldId}" 
                              name="field_${field.field_name}" rows="3" ${required} 
                              data-field-type="textarea" placeholder="Enter ${field.field_name}">${field.default_value || ''}</textarea>
                    <div class="field-feedback"></div>
                </div>
            `;
        case 'select':
            const options = field.options ? field.options.split(',').map(opt => opt.trim()) : [];
            let optionsHtml = '<option value="">Select an option...</option>';
            options.forEach(option => {
                const selected = option === field.default_value ? 'selected' : '';
                optionsHtml += `<option value="${option}" ${selected}>${option}</option>`;
            });
            return `
                <div class="col-md-6 mb-3">
                    <label class="form-label">${field.field_name}${requiredLabel}</label>
                    <select class="form-select enhanced-field" id="${fieldId}" 
                            name="field_${field.field_name}" ${required} data-field-type="select">
                        ${optionsHtml}
                    </select>
                    <div class="field-feedback"></div>
                </div>
            `;
        case 'checkbox':
            const checked = field.default_value === 'true' ? 'checked' : '';
            return `
                <div class="col-md-6 mb-3">
                    <div class="form-check">
                        <input type="checkbox" class="form-check-input enhanced-field" id="${fieldId}" 
                               name="field_${field.field_name}" value="true" ${checked} 
                               data-field-type="checkbox">
                        <label class="form-check-label" for="${fieldId}">
                            ${field.field_name}${requiredLabel}
                        </label>
                    </div>
                    <div class="field-feedback"></div>
                </div>
            `;
        default:
            return `
                <div class="col-md-6 mb-3">
                    <label class="form-label">${field.field_name}${requiredLabel}</label>
                    <input type="text" class="form-control enhanced-field" id="${fieldId}" 
                           name="field_${field.field_name}" value="${field.default_value || ''}" 
                           ${required} data-field-type="text" placeholder="Enter ${field.field_name}">
                    <div class="field-feedback"></div>
                </div>
            `;
    }
}

function initializeFieldEnhancements() {
    const enhancedFields = document.querySelectorAll('.enhanced-field');
    
    enhancedFields.forEach(field => {
        field.addEventListener('input', debounce(autoSaveField, 1000));
        field.addEventListener('blur', validateField);
        
        if (field.dataset.fieldType === 'number') {
            field.addEventListener('input', formatNumberField);
        }
    });
    
    loadAutoSavedData();
}

function autoSaveField(event) {
    const field = event.target;
    const logTypeId = document.getElementById('entryLogType').value;
    const entryDate = document.getElementById('entryDate').value;
    
    if (!logTypeId || !entryDate) return;
    
    const autoSaveKey = `entry_autosave_${logTypeId}_${entryDate}`;
    let savedData = JSON.parse(localStorage.getItem(autoSaveKey) || '{}');
    
    savedData[field.name] = field.type === 'checkbox' ? field.checked : field.value;
    localStorage.setItem(autoSaveKey, JSON.stringify(savedData));
    
    showAutoSaveIndicator(field);
}

function loadAutoSavedData() {
    const logTypeId = document.getElementById('entryLogType').value;
    const entryDate = document.getElementById('entryDate').value;
    
    if (!logTypeId || !entryDate) return;
    
    const autoSaveKey = `entry_autosave_${logTypeId}_${entryDate}`;
    const savedData = JSON.parse(localStorage.getItem(autoSaveKey) || '{}');
    
    Object.entries(savedData).forEach(([fieldName, value]) => {
        const field = document.querySelector(`[name="${fieldName}"]`);
        if (field) {
            if (field.type === 'checkbox') {
                field.checked = value;
            } else {
                field.value = value;
            }
        }
    });
}

function clearAutoSavedData() {
    const logTypeId = document.getElementById('entryLogType').value;
    const entryDate = document.getElementById('entryDate').value;
    
    if (!logTypeId || !entryDate) return;
    
    const autoSaveKey = `entry_autosave_${logTypeId}_${entryDate}`;
    localStorage.removeItem(autoSaveKey);
}

function showAutoSaveIndicator(field) {
    const feedback = field.parentElement.querySelector('.field-feedback');
    if (feedback) {
        feedback.innerHTML = '<small class="text-success"><i class="fas fa-check me-1"></i>Saved</small>';
        setTimeout(() => {
            feedback.innerHTML = '';
        }, 2000);
    }
}

function validateField(event) {
    const field = event.target;
    const feedback = field.parentElement.querySelector('.field-feedback');
    
    if (!feedback) return;
    
    let isValid = true;
    let message = '';
    
    if (field.required && !field.value.trim()) {
        isValid = false;
        message = 'This field is required';
    }
    
    if (field.dataset.fieldType === 'number' && field.value) {
        const numValue = parseFloat(field.value);
        if (isNaN(numValue)) {
            isValid = false;
            message = 'Please enter a valid number';
        }
    }
    
    if (isValid) {
        field.classList.remove('is-invalid');
        field.classList.add('is-valid');
        feedback.innerHTML = '';
    } else {
        field.classList.remove('is-valid');
        field.classList.add('is-invalid');
        feedback.innerHTML = `<small class="text-danger"><i class="fas fa-exclamation-triangle me-1"></i>${message}</small>`;
    }
}

function formatNumberField(event) {
    const field = event.target;
    const value = field.value;
    const cleanValue = value.replace(/[^0-9.-]/g, '');
    
    if (cleanValue !== value) {
        field.value = cleanValue;
    }
}

function clearAllFields() {
    const enhancedFields = document.querySelectorAll('.enhanced-field');
    enhancedFields.forEach(field => {
        if (field.type === 'checkbox') {
            field.checked = false;
        } else {
            field.value = '';
        }
        field.classList.remove('is-valid', 'is-invalid');
        const feedback = field.parentElement.querySelector('.field-feedback');
        if (feedback) feedback.innerHTML = '';
    });
    
    clearAutoSavedData();
    showFeedback('All fields cleared', 'info');
}

function fillSampleData() {
    const logTypeSelect = document.getElementById('entryLogType');
    const selectedOption = logTypeSelect.options[logTypeSelect.selectedIndex];
    const logTypeName = selectedOption.text.toLowerCase();
    
    const enhancedFields = document.querySelectorAll('.enhanced-field');
    
    enhancedFields.forEach(field => {
        const fieldName = field.name.replace('field_', '').toLowerCase();
        let sampleValue = '';
        
        if (fieldName.includes('weight') || fieldName.includes('price') || fieldName.includes('amount')) {
            sampleValue = Math.floor(Math.random() * 100) + 1;
        } else if (fieldName.includes('sets') || fieldName.includes('reps') || fieldName.includes('quantity')) {
            sampleValue = Math.floor(Math.random() * 20) + 1;
        } else if (fieldName.includes('duration') || fieldName.includes('time')) {
            sampleValue = Math.floor(Math.random() * 60) + 5;
        } else if (fieldName.includes('symbol') && logTypeName.includes('trading')) {
            const symbols = ['AAPL', 'GOOGL', 'MSFT', 'TSLA', 'AMZN', 'BTC', 'ETH'];
            sampleValue = symbols[Math.floor(Math.random() * symbols.length)];
        } else if (fieldName.includes('exercise') && logTypeName.includes('gym')) {
            const exercises = ['Bench Press', 'Squats', 'Deadlift', 'Pull-ups', 'Push-ups'];
            sampleValue = exercises[Math.floor(Math.random() * exercises.length)];
        } else if (field.dataset.fieldType === 'select') {
            const options = Array.from(field.options).filter(opt => opt.value);
            if (options.length > 0) {
                sampleValue = options[Math.floor(Math.random() * options.length)].value;
            }
        } else if (field.dataset.fieldType === 'checkbox') {
            field.checked = Math.random() > 0.5;
            return;
        } else if (field.dataset.fieldType === 'textarea') {
            sampleValue = 'Sample notes and observations for this entry.';
        } else {
            sampleValue = `Sample ${fieldName}`;
        }
        
        if (field.type !== 'checkbox') {
            field.value = sampleValue;
        }
        
        field.dispatchEvent(new Event('blur'));
    });
    
    showFeedback('Sample data filled in all fields', 'success');
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Detailed calendar view for specific log types
async function renderDetailedLogTypeCalendar(logAnalytics) {
    const calendarContainer = document.getElementById('activityCalendar');
    
    if (!calendarContainer) {
        console.error('Calendar container not found');
        return;
    }
    
    // Get detailed data for this log type
    try {
        const response = await makeAuthenticatedRequest(`/api/logs/analytics/${logAnalytics.log_type_id}`);
        if (!response.ok) {
            throw new Error(`Failed to load detailed analytics`);
        }
        
        const detailedData = await response.json();
        
        // Determine log type category for specific rendering
        const logTypeName = logAnalytics.log_type_name.toLowerCase();
        let calendarType = 'general';
        
        if (logTypeName.includes('trading') || logTypeName.includes('trade')) {
            calendarType = 'trading';
        } else if (logTypeName.includes('gym') || logTypeName.includes('workout') || logTypeName.includes('exercise') || logTypeName.includes('activity')) {
            calendarType = 'activity';
        }
        
        // Render calendar based on type
        const calendarHtml = generateDetailedCalendarHtml(detailedData, calendarType);
        calendarContainer.innerHTML = calendarHtml;
        
    } catch (error) {
        console.error('Error loading detailed analytics:', error);
        calendarContainer.innerHTML = '<div class="alert alert-danger">Failed to load detailed calendar view</div>';
    }
}

function generateDetailedCalendarHtml(detailedData, calendarType) {
    const today = new Date();
    const currentMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    const prevMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    
    let html = `
        <div class="detailed-calendar">
            <div class="calendar-header mb-4">
                <div class="row align-items-center">
                    <div class="col-md-8">
                        <div class="d-flex align-items-center mb-2">
                            <i class="${detailedData.log_type.icon || 'fas fa-calendar-check'} fa-2x me-3" style="color: ${detailedData.log_type.color || '#28a745'}"></i>
                            <div>
                                <h5 class="text-primary mb-0">${detailedData.log_type.name} - Detailed View</h5>
                                <p class="text-muted mb-0">${getCalendarDescription(calendarType)}</p>
                            </div>
                        </div>
                    </div>
                    <div class="col-md-4 text-end">
                        <button class="btn btn-outline-primary btn-sm" onclick="showFullCalendarModal('${detailedData.log_type.id}', '${calendarType}')">
                            <i class="fas fa-expand me-1"></i> Full View
                        </button>
                    </div>
                </div>
            </div>
    `;
    
    // Generate summary cards based on calendar type
    html += generateCalendarSummary(detailedData, calendarType);
    
    // Generate mini calendar for current month
    html += generateMiniCalendar(detailedData, calendarType, currentMonth);
    
    html += '</div>';
    
    return html;
}

function getCalendarDescription(calendarType) {
    switch (calendarType) {
        case 'trading':
            return 'Daily profit/loss, monthly totals, and trading performance metrics';
        case 'activity':
            return 'Daily check-ins, streaks, and activity consistency tracking';
        default:
            return 'Daily activity tracking and progress monitoring';
    }
}

function generateCalendarSummary(detailedData, calendarType) {
    const analytics = detailedData.analytics;
    const fieldAnalytics = detailedData.field_analytics || {};
    
    console.log('Generating calendar summary for:', calendarType);
    console.log('Analytics data:', analytics);
    console.log('Field analytics data:', fieldAnalytics);
    
    let html = '<div class="row mb-4">';
    
    if (calendarType === 'trading') {
        // Trading-specific metrics
        const profitLossField = findProfitLossField(fieldAnalytics);
        const totalPL = profitLossField ? (profitLossField.sum || 0) : 0;
        const avgPL = profitLossField ? (profitLossField.average || 0) : 0;
        const winRate = calculateWinRate(fieldAnalytics);
        
        console.log('Profit/Loss field found:', profitLossField);
        console.log('Total P&L:', totalPL, 'Avg P&L:', avgPL, 'Win Rate:', winRate);
        
        html += `
            <div class="col-md-3">
                <div class="card ${totalPL >= 0 ? 'border-success' : 'border-danger'}">
                    <div class="card-body text-center">
                        <h5 class="${totalPL >= 0 ? 'text-success' : 'text-danger'}">$${totalPL.toFixed(2)}</h5>
                        <small class="text-muted">Total P&L</small>
                    </div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="card">
                    <div class="card-body text-center">
                        <h5 class="text-primary">$${avgPL.toFixed(2)}</h5>
                        <small class="text-muted">Avg per Trade</small>
                    </div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="card">
                    <div class="card-body text-center">
                        <h5 class="text-info">${winRate.toFixed(1)}%</h5>
                        <small class="text-muted">Win Rate</small>
                    </div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="card">
                    <div class="card-body text-center">
                        <h5 class="text-warning">${analytics.total_entries}</h5>
                        <small class="text-muted">Total Trades</small>
                    </div>
                </div>
            </div>
        `;
    } else if (calendarType === 'activity') {
        // Activity/Gym-specific metrics
        const streak = calculateActivityStreak(analytics.daily_activity);
        const monthlyCheckIns = analytics.this_month || 0;
        const consistency = calculateConsistency(analytics.daily_activity);
        
        const streakEmoji = streak >= 7 ? '🔥' : streak >= 3 ? '💪' : streak >= 1 ? '✨' : '💤';
        const consistencyEmoji = consistency >= 80 ? '🏆' : consistency >= 60 ? '🎯' : consistency >= 40 ? '📈' : '🌱';
        
        html += `
            <div class="col-md-3">
                <div class="card border-success">
                    <div class="card-body text-center">
                        <div class="d-flex align-items-center justify-content-center mb-2">
                            <span class="fs-4 me-2">${streakEmoji}</span>
                            <h4 class="text-success mb-0">${streak}</h4>
                        </div>
                        <small class="text-muted">Current Streak</small>
                        <div class="mt-1">
                            <small class="text-success fw-bold">${streak >= 7 ? 'On fire!' : streak >= 3 ? 'Keep it up!' : streak >= 1 ? 'Good start!' : 'Time to begin!'}</small>
                        </div>
                    </div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="card border-primary">
                    <div class="card-body text-center">
                        <div class="d-flex align-items-center justify-content-center mb-2">
                            <span class="fs-4 me-2">📅</span>
                            <h4 class="text-primary mb-0">${monthlyCheckIns}</h4>
                        </div>
                        <small class="text-muted">This Month</small>
                    </div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="card border-info">
                    <div class="card-body text-center">
                        <div class="d-flex align-items-center justify-content-center mb-2">
                            <span class="fs-4 me-2">${consistencyEmoji}</span>
                            <h4 class="text-info mb-0">${consistency.toFixed(1)}%</h4>
                        </div>
                        <small class="text-muted">Consistency</small>
                        <div class="mt-1">
                            <small class="text-info fw-bold">${consistency >= 80 ? 'Amazing!' : consistency >= 60 ? 'Great job!' : consistency >= 40 ? 'Getting better!' : 'Room to grow!'}</small>
                        </div>
                    </div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="card border-warning">
                    <div class="card-body text-center">
                        <div class="d-flex align-items-center justify-content-center mb-2">
                            <span class="fs-4 me-2">🎯</span>
                            <h4 class="text-warning mb-0">${analytics.total_entries}</h4>
                        </div>
                        <small class="text-muted">Total Sessions</small>
                    </div>
                </div>
            </div>
        `;
    } else {
        // General metrics
        html += `
            <div class="col-md-4">
                <div class="card">
                    <div class="card-body text-center">
                        <h5 class="text-primary">${analytics.total_entries}</h5>
                        <small class="text-muted">Total Entries</small>
                    </div>
                </div>
            </div>
            <div class="col-md-4">
                <div class="card">
                    <div class="card-body text-center">
                        <h5 class="text-success">${analytics.this_month || 0}</h5>
                        <small class="text-muted">This Month</small>
                    </div>
                </div>
            </div>
            <div class="col-md-4">
                <div class="card">
                    <div class="card-body text-center">
                        <h5 class="text-info">${analytics.this_week || 0}</h5>
                        <small class="text-muted">This Week</small>
                    </div>
                </div>
            </div>
        `;
    }
    
    html += '</div>';
    return html;
}

function generateMiniCalendar(detailedData, calendarType, month) {
    const dailyActivity = detailedData.analytics.daily_activity || {};
    const fieldAnalytics = detailedData.field_analytics || {};
    
    console.log('🗓️ === GENERATING CALENDAR ===');
    console.log('Calendar Type:', calendarType);
    console.log('Month:', month.toLocaleDateString());
    console.log('Detailed Data:', detailedData);
    console.log('Daily Activity:', dailyActivity);
    console.log('Field Analytics:', fieldAnalytics);
    console.log('============================');
    
    const year = month.getFullYear();
    const monthIndex = month.getMonth();
    const firstDay = new Date(year, monthIndex, 1);
    const lastDay = new Date(year, monthIndex + 1, 0);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay()); // Start from Sunday
    
    let html = `
        <div class="mini-calendar">
            <div class="calendar-month-header text-center mb-3">
                <div class="d-flex justify-content-between align-items-center">
                    <button class="btn btn-sm btn-outline-secondary" onclick="navigateMonth(-1)" title="Previous Month">
                        <i class="fas fa-chevron-left"></i>
                    </button>
                    <h5 class="mb-0 text-primary fw-bold">${month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</h5>
                    <button class="btn btn-sm btn-outline-secondary" onclick="navigateMonth(1)" title="Next Month">
                        <i class="fas fa-chevron-right"></i>
                    </button>
                </div>
            </div>
            <div class="calendar-grid">
                <div class="calendar-weekdays">
                    <div class="weekday">Sun</div>
                    <div class="weekday">Mon</div>
                    <div class="weekday">Tue</div>
                    <div class="weekday">Wed</div>
                    <div class="weekday">Thu</div>
                    <div class="weekday">Fri</div>
                    <div class="weekday">Sat</div>
                </div>
                <div class="calendar-days">
    `;
    
    const currentDate = new Date(startDate);
    let totalDays = 0;
    
    // Generate exactly 6 weeks (42 days) for consistent layout
    for (let week = 0; week < 6; week++) {
        for (let day = 0; day < 7; day++) {
            const dateStr = currentDate.toISOString().split('T')[0];
            const isCurrentMonth = currentDate.getMonth() === monthIndex;
            const isToday = dateStr === new Date().toISOString().split('T')[0];
            const dayActivity = dailyActivity[dateStr];
            
            let dayClass = 'calendar-day';
            let dayContent = `<div class="day-number">${currentDate.getDate()}</div>`;
            let dayTitle = dateStr;
            
            if (!isCurrentMonth) {
                dayClass += ' other-month';
            }
            
            if (isToday) {
                dayClass += ' today';
            }
            
            // Always show trading metrics for trading calendar type
            if (calendarType === 'trading') {
                if (isCurrentMonth) {
                    const metrics = dayActivity ? calculateDayMetrics(dayActivity, calendarType, fieldAnalytics) : { 
                        hasActivity: false, 
                        totalPL: 0, 
                        totalTrades: 0,
                        cssClass: 'no-activity'
                    };
                    
                    console.log(`Day ${dateStr} (current month) metrics:`, metrics);
                    
                // Set background color based on P&L
                if (metrics.hasActivity) {
                    if (metrics.totalPL > 0) {
                        dayClass += ' profit-day';
                    } else if (metrics.totalPL < 0) {
                        dayClass += ' loss-day';
                    } else {
                        // Break-even: traded but P&L is exactly $0.00
                        dayClass += ' break-even';
                    }
                } else {
                    dayClass += ' no-activity';
                }
                    
                    // Format P&L display
                    const plDisplay = metrics.totalPL >= 0 ? `$${metrics.totalPL.toFixed(2)}` : `-$${Math.abs(metrics.totalPL).toFixed(2)}`;
                    const tradeCount = metrics.totalTrades || 0;
                    const tradeText = tradeCount === 1 ? '1 trade' : `${tradeCount} trades`;
                    
                    dayContent = `
                        <div class="day-number">${currentDate.getDate()}</div>
                        <div class="day-pl">${plDisplay}</div>
                        <div class="day-trades">${tradeText}</div>
                    `;
                    dayTitle = `${dateStr}: ${plDisplay}, ${tradeText}`;
                } else {
                    // Other month days for trading calendar - just show day number
                    dayContent = `<div class="day-number">${currentDate.getDate()}</div>`;
                }
            } else if (dayActivity && isCurrentMonth) {
                // For non-trading calendar types, use existing logic
                console.log(`Day ${dateStr} has activity:`, dayActivity);
                console.log(`Calendar type: ${calendarType}, Field analytics:`, fieldAnalytics);
                const metrics = calculateDayMetrics(dayActivity, calendarType, fieldAnalytics);
                console.log(`Calculated metrics for ${dateStr}:`, metrics);
                dayClass += ` has-activity ${metrics.cssClass}`;
                dayContent = `<div class="day-number">${currentDate.getDate()}</div><div class="day-metric">${metrics.display}</div>`;
                dayTitle = `${dateStr}: ${metrics.tooltip}`;
            }
            
            html += `<div class="${dayClass}" title="${dayTitle}">${dayContent}</div>`;
            currentDate.setDate(currentDate.getDate() + 1);
            totalDays++;
        }
    }
    
    html += `
                </div>
            </div>
        </div>
    `;
    
    console.log(`Generated calendar with ${totalDays} days`);
    return html;
}

function calculateDayMetrics(dayActivity, calendarType, fieldAnalytics) {
    const entries = dayActivity.entries || [];
    const count = dayActivity.count || 0;
    
    console.log('Calculating day metrics for:', calendarType, 'with entries:', entries);
    
    if (calendarType === 'trading') {
        // Calculate daily P&L
        let dailyPL = 0;
        entries.forEach(entry => {
            const values = entry.values || {};
            console.log('Entry values:', values);
            
            let entryPL = 0;
            
            // First try to get profit_loss directly
            if (values.profit_loss !== undefined && values.profit_loss !== null && values.profit_loss !== '') {
                entryPL = parseFloat(values.profit_loss) || 0;
                console.log(`Using direct profit_loss: ${entryPL}`);
            } else {
                // Calculate from entry_price, exit_price, quantity
                const entryPrice = parseFloat(values.entry_price) || 0;
                const exitPrice = parseFloat(values.exit_price) || 0;
                const quantity = parseFloat(values.quantity) || 0;
                
                if (entryPrice > 0 && exitPrice > 0 && quantity > 0) {
                    entryPL = (exitPrice - entryPrice) * quantity;
                    console.log(`Calculated P&L: (${exitPrice} - ${entryPrice}) * ${quantity} = ${entryPL}`);
                } else {
                    console.log('Insufficient data to calculate P&L:', { entryPrice, exitPrice, quantity });
                }
            }
            
            dailyPL += entryPL;
        });
        
        console.log('Total daily P&L:', dailyPL);
        
        return {
            display: dailyPL >= 0 ? `+$${dailyPL.toFixed(0)}` : `-$${Math.abs(dailyPL).toFixed(0)}`,
            cssClass: dailyPL >= 0 ? 'profit-day' : 'loss-day',
            tooltip: `${count} trades, P&L: $${dailyPL.toFixed(2)}`,
            hasActivity: count > 0,
            totalPL: dailyPL,
            totalTrades: count
        };
    } else if (calendarType === 'activity') {
        // Show check-in status with better visual feedback
        const displayIcon = count > 1 ? `✓${count}` : '✓';
        return {
            display: displayIcon,
            cssClass: 'checkin-day',
            tooltip: `${count} session${count > 1 ? 's' : ''} - Great job staying active!`,
            hasActivity: count > 0,
            totalPL: 0,
            totalTrades: count
        };
    } else {
        // General activity
        return {
            display: count.toString(),
            cssClass: 'activity-day',
            tooltip: `${count} entries`,
            hasActivity: count > 0,
            totalPL: 0,
            totalTrades: count
        };
    }
}

// Helper functions for calculations
function findProfitLossField(fieldAnalytics) {
    console.log('Looking for profit/loss field in:', fieldAnalytics);
    
    const plFields = ['profit_loss', 'profit', 'pnl', 'pl', 'profit_loss_amount', 'profit/loss', 'p&l', 'p_l'];
    
    // First try exact matches
    for (const field of plFields) {
        if (fieldAnalytics[field] && fieldAnalytics[field].field_type === 'number') {
            console.log('Found exact match field:', field);
            return fieldAnalytics[field];
        }
    }
    
    // Then try case-insensitive search
    for (const [fieldName, fieldData] of Object.entries(fieldAnalytics)) {
        if (fieldData.field_type === 'number') {
            const lowerFieldName = fieldName.toLowerCase();
            if (lowerFieldName.includes('profit') || lowerFieldName.includes('loss') || 
                lowerFieldName.includes('pnl') || lowerFieldName.includes('p&l')) {
                console.log('Found case-insensitive match field:', fieldName);
                return fieldData;
            }
        }
    }
    
    console.log('No profit/loss field found');
    return null;
}

function calculateWinRate(fieldAnalytics) {
    const profitLossField = findProfitLossField(fieldAnalytics);
    if (!profitLossField || !profitLossField.sample_values) return 0;
    
    const values = profitLossField.sample_values;
    const winningTrades = values.filter(val => parseFloat(val) > 0).length;
    return values.length > 0 ? (winningTrades / values.length) * 100 : 0;
}

function calculateActivityStreak(dailyActivity) {
    if (!dailyActivity) return 0;
    
    const dates = Object.keys(dailyActivity).sort().reverse();
    const today = new Date().toISOString().split('T')[0];
    
    let streak = 0;
    for (let i = 0; i < dates.length; i++) {
        const expectedDate = new Date();
        expectedDate.setDate(expectedDate.getDate() - i);
        const expectedDateStr = expectedDate.toISOString().split('T')[0];
        
        if (dates[i] === expectedDateStr) {
            streak++;
        } else {
            break;
        }
    }
    
    return streak;
}

function calculateConsistency(dailyActivity) {
    if (!dailyActivity) return 0;
    
    const daysInMonth = new Date().getDate();
    const activeDays = Object.keys(dailyActivity).filter(date => {
        const entryDate = new Date(date);
        const now = new Date();
        return entryDate.getMonth() === now.getMonth() && entryDate.getFullYear() === now.getFullYear();
    }).length;
    
    return (activeDays / daysInMonth) * 100;
}

function showFullCalendarModal(logTypeId, calendarType) {
    // This will show a full-screen modal with detailed calendar
    console.log('Show full calendar modal for:', logTypeId, calendarType);
    // Implementation for full calendar modal can be added here
}

// Navigate calendar months (placeholder for future enhancement)
function navigateMonth(direction) {
    console.log('Navigate month:', direction);
    showFeedback('Month navigation coming soon!', 'info');
    // TODO: Implement month navigation
}

// Delete log entry
async function deleteLogEntry(entryId) {
    if (!confirm('Are you sure you want to delete this log entry? This action cannot be undone.')) {
        return;
    }
    
    try {
        console.log('Deleting entry with ID:', entryId);
        showFeedback('Deleting entry...', 'info');
        
        const response = await makeAuthenticatedRequest(`/api/logs/entries/${entryId}`, {
            method: 'DELETE'
        });
        
        console.log('Delete response status:', response.status);
        
        if (!response.ok) {
            const errorData = await response.json();
            console.error('Delete error:', errorData);
            throw new Error(errorData.error || 'Failed to delete entry');
        }
        
        // Remove the row from the table
        const row = document.getElementById(`entry-row-${entryId}`);
        if (row) {
            row.remove();
            console.log('Removed row from table');
        }
        
        showFeedback('Entry deleted successfully!', 'success');
        
        // Refresh analytics if the analytics tab is active
        const analyticsTab = document.getElementById('analytics-tab');
        if (analyticsTab && analyticsTab.classList.contains('active')) {
            console.log('Refreshing analytics after deleting entry...');
            setTimeout(() => {
                loadAnalytics();
            }, 500);
        }
        
        // Check if table is now empty
        const tableBody = row?.closest('tbody');
        if (tableBody && tableBody.children.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">No entries remaining</td></tr>';
        }
        
    } catch (error) {
        console.error('Error deleting entry:', error);
        showFeedback(error.message, 'error');
    }
}

// ================================
// Story Starter Functions
// ================================

async function generateStory() {
    const requestType = document.getElementById('storyRequestType').value;
    const genre = document.getElementById('storyGenre').value;
    const tone = document.getElementById('storyTone').value;

    // Show loading
    document.getElementById('storyLoading').style.display = 'block';
    document.getElementById('storyResult').style.display = 'none';

    try {
        const response = await fetch('/api/story/generate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({
                requestType: requestType,
                genre: genre,
                tone: tone,
                elements: [],
                length: 'medium'
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to generate story');
        }

        const data = await response.json();
        
        // Display result
        document.getElementById('storyContent').textContent = data.content;
        document.getElementById('storyResult').style.display = 'block';
        
    } catch (error) {
        console.error('Error generating story:', error);
        showFeedback('Failed to generate story. Please try again.', 'error');
    } finally {
        document.getElementById('storyLoading').style.display = 'none';
    }
}

function copyStoryToClipboard() {
    const content = document.getElementById('storyContent').textContent;
    navigator.clipboard.writeText(content).then(() => {
        showFeedback('Copied to clipboard!', 'success');
    }).catch(err => {
        console.error('Failed to copy:', err);
        showFeedback('Failed to copy to clipboard', 'error');
    });
}
