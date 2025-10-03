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
function makeAuthenticatedRequest(url, options = {}) {
    if (!authToken) {
        throw new Error('No authentication token available');
    }
    
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
        ...options.headers
    };
    
    return fetch(url, {
        ...options,
        headers
    });
}
