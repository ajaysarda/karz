// Global state
let selectedElements = [];
let currentResults = {
    prompt: null,
    character: null,
    plot: null,
    twist: null,
    setting: null
};
let favorites = JSON.parse(localStorage.getItem('storyFavorites') || '[]');

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    setupElementChips();
    setupForms();
    loadFavorites();
});

// Setup element chips for story starter
function setupElementChips() {
    const chips = document.querySelectorAll('.chip');
    chips.forEach(chip => {
        chip.addEventListener('click', function(e) {
            e.preventDefault();
            this.classList.toggle('active');
            const element = this.dataset.element;
            
            if (selectedElements.includes(element)) {
                selectedElements = selectedElements.filter(e => e !== element);
            } else {
                selectedElements.push(element);
            }
        });
    });
}

// Setup form handlers
function setupForms() {
    const forms = [
        { id: 'promptForm', type: 'prompt' },
        { id: 'characterForm', type: 'character' },
        { id: 'plotForm', type: 'plot' },
        { id: 'twistForm', type: 'twist' },
        { id: 'settingForm', type: 'setting' }
    ];

    forms.forEach(({ id, type }) => {
        const form = document.getElementById(id);
        if (form) {
            form.addEventListener('submit', (e) => handleFormSubmit(e, type));
        }
    });
}

// Handle form submission
async function handleFormSubmit(e, type) {
    e.preventDefault();
    
    const form = e.target;
    const formData = new FormData(form);
    
    // Build request
    const request = {
        requestType: type,
        genre: formData.get('genre') || '',
        tone: formData.get('tone') || '',
        length: formData.get('length') || 'medium',
        elements: []
    };

    // Add selected elements for story starter
    if (type === 'prompt') {
        request.elements = [...selectedElements];
        const customElement = formData.get('customElement');
        if (customElement && customElement.trim()) {
            request.elements.push(customElement.trim());
        }
    }

    // Show loading
    showLoading(true);

    try {
        const response = await fetch('/api/generate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(request)
        });

        if (!response.ok) {
            throw new Error('Failed to generate content');
        }

        const data = await response.json();
        currentResults[type] = data;
        displayResult(type, data);
        
    } catch (error) {
        console.error('Error:', error);
        showError('Oops! Something went wrong. Please try again.');
    } finally {
        showLoading(false);
    }
}

// Display result
function displayResult(type, data) {
    const resultDiv = document.getElementById(`${type}Result`);
    const contentDiv = resultDiv.querySelector('.result-content');
    
    // Format the content
    const formattedContent = formatContent(data.content, type);
    contentDiv.innerHTML = formattedContent;
    
    // Show result with animation
    resultDiv.style.display = 'block';
    resultDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    
    // Add animation
    resultDiv.classList.add('result-appear');
    setTimeout(() => {
        resultDiv.classList.remove('result-appear');
    }, 500);
}

// Format content based on type
function formatContent(content, type) {
    let html = '<div class="formatted-result">';
    
    // Parse structured content
    const lines = content.split('\n');
    let currentSection = '';
    
    lines.forEach(line => {
        const trimmedLine = line.trim();
        
        if (!trimmedLine) {
            html += '<br>';
            return;
        }

        // Check for section headers
        if (trimmedLine.match(/^(TITLE|OPENING|IDEAS|TIPS|NAME|DESCRIPTION|BACKGROUND|SPECIAL TRAIT|QUESTIONS|BEGINNING|PROBLEM|MIDDLE|CLIMAX|ENDING IDEAS|TWIST|WHY IT WORKS|HOW TO BUILD UP|ALTERNATIVE TWISTS|LOCATION|TIME|MOOD|STORY POSSIBILITIES):/i)) {
            const [header, ...contentParts] = trimmedLine.split(':');
            currentSection = header.trim();
            const sectionContent = contentParts.join(':').trim();
            
            html += `<div class="result-section">`;
            html += `<h4 class="result-header">${getIcon(header)} ${header}</h4>`;
            if (sectionContent) {
                html += `<p class="result-text">${sectionContent}</p>`;
            }
        } else if (trimmedLine.startsWith('- ') || trimmedLine.startsWith('• ')) {
            // Bullet points
            const bulletText = trimmedLine.substring(2);
            html += `<div class="result-bullet"><i class="fas fa-star text-warning"></i> ${bulletText}</div>`;
        } else if (currentSection) {
            // Continue current section
            html += `<p class="result-text">${trimmedLine}</p>`;
        } else {
            // Regular text
            html += `<p class="result-text">${trimmedLine}</p>`;
        }
        
        // Close section when done
        if (trimmedLine.match(/^(TITLE|OPENING|IDEAS|TIPS|NAME|DESCRIPTION|BACKGROUND|SPECIAL TRAIT|QUESTIONS|BEGINNING|PROBLEM|MIDDLE|CLIMAX|ENDING IDEAS|TWIST|WHY IT WORKS|HOW TO BUILD UP|ALTERNATIVE TWISTS|LOCATION|TIME|MOOD|STORY POSSIBILITIES):/i)) {
            // Don't close yet
        } else if (lines[lines.indexOf(line) + 1] && lines[lines.indexOf(line) + 1].match(/^(TITLE|OPENING|IDEAS|TIPS|NAME|DESCRIPTION|BACKGROUND|SPECIAL TRAIT|QUESTIONS|BEGINNING|PROBLEM|MIDDLE|CLIMAX|ENDING IDEAS|TWIST|WHY IT WORKS|HOW TO BUILD UP|ALTERNATIVE TWISTS|LOCATION|TIME|MOOD|STORY POSSIBILITIES):/i)) {
            html += `</div>`;
        }
    });
    
    html += '</div></div>';
    return html;
}

// Get icon for section
function getIcon(header) {
    const icons = {
        'TITLE': '📖',
        'OPENING': '🎬',
        'IDEAS': '💡',
        'TIPS': '✨',
        'NAME': '👤',
        'DESCRIPTION': '📝',
        'BACKGROUND': '📚',
        'SPECIAL TRAIT': '⭐',
        'QUESTIONS': '❓',
        'BEGINNING': '🚀',
        'PROBLEM': '⚠️',
        'MIDDLE': '🎯',
        'CLIMAX': '🔥',
        'ENDING IDEAS': '🎭',
        'TWIST': '🌪️',
        'WHY IT WORKS': '💫',
        'HOW TO BUILD UP': '📈',
        'ALTERNATIVE TWISTS': '🔄',
        'LOCATION': '📍',
        'TIME': '⏰',
        'MOOD': '🎨',
        'STORY POSSIBILITIES': '🎪'
    };
    return icons[header.toUpperCase()] || '✨';
}

// Save to favorites
function saveToFavorites(type) {
    const result = currentResults[type];
    if (!result) return;
    
    const favorite = {
        id: Date.now(),
        type: type,
        content: result.content,
        timestamp: new Date().toISOString()
    };
    
    favorites.unshift(favorite);
    localStorage.setItem('storyFavorites', JSON.stringify(favorites));
    
    showNotification('Saved to favorites! ❤️');
    loadFavorites();
}

// Load favorites
function loadFavorites() {
    const favoritesList = document.getElementById('favoritesList');
    if (!favoritesList) return;
    
    if (favorites.length === 0) {
        favoritesList.innerHTML = '<p class="text-center text-muted">No favorites yet! Generate some awesome stories and save your favorites.</p>';
        return;
    }
    
    let html = '';
    favorites.forEach(fav => {
        const preview = fav.content.substring(0, 150) + '...';
        const date = new Date(fav.timestamp).toLocaleDateString();
        
        html += `
            <div class="favorite-item card mb-3">
                <div class="card-body">
                    <div class="d-flex justify-content-between align-items-start">
                        <div class="flex-grow-1">
                            <h5 class="card-title">
                                <span class="badge bg-primary">${getTypeLabel(fav.type)}</span>
                                <small class="text-muted ms-2">${date}</small>
                            </h5>
                            <p class="card-text">${preview}</p>
                            <button class="btn btn-sm btn-outline-primary" onclick="viewFavorite(${fav.id})">
                                <i class="fas fa-eye"></i> View Full
                            </button>
                        </div>
                        <button class="btn btn-sm btn-outline-danger ms-2" onclick="deleteFavorite(${fav.id})">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    });
    
    favoritesList.innerHTML = html;
}

// View favorite
function viewFavorite(id) {
    const favorite = favorites.find(f => f.id === id);
    if (!favorite) return;
    
    // Create modal or display
    const modalHtml = `
        <div class="modal fade" id="favoriteModal" tabindex="-1">
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">
                            <span class="badge bg-primary">${getTypeLabel(favorite.type)}</span>
                            ${getTypeLabel(favorite.type)}
                        </h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        ${formatContent(favorite.content, favorite.type)}
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" onclick="copyToClipboard('favoriteModal')">
                            <i class="fas fa-copy"></i> Copy
                        </button>
                        <button type="button" class="btn btn-primary" data-bs-dismiss="modal">Close</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Remove existing modal if any
    const existingModal = document.getElementById('favoriteModal');
    if (existingModal) {
        existingModal.remove();
    }
    
    // Add and show modal
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    const modal = new bootstrap.Modal(document.getElementById('favoriteModal'));
    modal.show();
    
    // Clean up modal on close
    document.getElementById('favoriteModal').addEventListener('hidden.bs.modal', function() {
        this.remove();
    });
}

// Delete favorite
function deleteFavorite(id) {
    if (!confirm('Are you sure you want to delete this favorite?')) return;
    
    favorites = favorites.filter(f => f.id !== id);
    localStorage.setItem('storyFavorites', JSON.stringify(favorites));
    loadFavorites();
    showNotification('Favorite deleted');
}

// Get type label
function getTypeLabel(type) {
    const labels = {
        prompt: 'Story Starter',
        character: 'Character',
        plot: 'Plot',
        twist: 'Plot Twist',
        setting: 'Setting'
    };
    return labels[type] || type;
}

// Copy to clipboard
function copyToClipboard(elementId) {
    const element = document.getElementById(elementId);
    const text = element.innerText || element.textContent;
    
    navigator.clipboard.writeText(text).then(() => {
        showNotification('Copied to clipboard! 📋');
    }).catch(err => {
        console.error('Failed to copy:', err);
        showNotification('Failed to copy');
    });
}

// Generate new
function generateNew(type) {
    const form = document.getElementById(`${type}Form`);
    if (form) {
        form.dispatchEvent(new Event('submit', { cancelable: true }));
    }
}

// Show loading
function showLoading(show) {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.style.display = show ? 'flex' : 'none';
    }
}

// Show notification
function showNotification(message) {
    // Create toast notification
    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('show');
    }, 10);
    
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Show error
function showError(message) {
    showNotification('❌ ' + message);
}

