// Puzzle Hub - Unified Game JavaScript

// Global game state
let currentPuzzleType = null; // 'spelling' or 'yohaku'
let gameState = 'idle'; // 'idle', 'playing', 'finished'

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
    loadProfile();
    updateStats();
    
    // Profile form handler
    document.getElementById('profileForm').addEventListener('submit', function(e) {
        e.preventDefault();
        saveProfile();
    });

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
    const age = parseInt(document.getElementById('spellingAge').value);
    const theme = document.getElementById('spellingTheme').value;
    
    showLoading(true);
    
    try {
        const response = await fetch('/api/spelling/generate-for-age', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
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
    yohakuSettings = {
        operation: document.getElementById('yohakuOperation').value,
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
