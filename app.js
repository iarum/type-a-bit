const wordsContainer = document.getElementById('words-container');
const inputField = document.getElementById('input-field');
const stats = document.getElementById('stats');
const wpmDisplay = document.getElementById('wpm');
const accuracyDisplay = document.getElementById('accuracy');
const timerDisplay = document.getElementById('timer');
const resultScreen = document.getElementById('result-screen');
const finalWpm = document.getElementById('final-wpm');
const finalWords = document.getElementById('final-words');
const finalAccuracy = document.getElementById('final-accuracy');
const personalBestDisplay = document.getElementById('personal-best');
const retryBtn = document.getElementById('retry-btn');
const restartBtn = document.getElementById('restart-btn');
const themeToggle = document.getElementById('theme-toggle');
const soundToggle = document.getElementById('sound-toggle');
const optionBtns = document.querySelectorAll('.option-btn');
const progressBar = document.getElementById('progress-bar');
const hint = document.querySelector('.hint');

// State
let currentTheme = localStorage.getItem('theme') || 'light';
let currentTimeLimit = parseInt(localStorage.getItem('timeLimit')) || 30;
let personalBest = parseInt(localStorage.getItem(`pb_${currentTimeLimit}`)) || 0;
let isSoundEnabled = localStorage.getItem('soundEnabled') !== 'false'; // Default true

let wordsArr = [];
let timer = null;
let startTime = null;
let timeLeft = 0;
let mistakes = 0;
let typedChars = 0;
let correctChars = 0;
let correctWordsCount = 0;
let isWordDirty = false; 
let isGameActive = false;
let isGameOver = false;
let currentWordIndex = 0;
let currentLetterIndex = 0;

// Audio Context for soft click
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playClickSound() {
    if (!isSoundEnabled) return;
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'triangle'; 
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(1, now + 0.05);
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + 0.05);
}

// Initialize Theme & Sound UI
document.documentElement.setAttribute('data-theme', currentTheme);
updateSoundUI();

themeToggle.addEventListener('click', () => {
    currentTheme = currentTheme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', currentTheme);
    localStorage.setItem('theme', currentTheme);
    inputField.focus();
});

soundToggle.addEventListener('click', () => {
    isSoundEnabled = !isSoundEnabled;
    localStorage.setItem('soundEnabled', isSoundEnabled);
    updateSoundUI();
    inputField.focus();
});

function updateSoundUI() {
    const onIcon = soundToggle.querySelector('.sound-on');
    const offIcon = soundToggle.querySelector('.sound-off');
    if (isSoundEnabled) {
        onIcon.classList.remove('hidden');
        offIcon.classList.add('hidden');
    } else {
        onIcon.classList.add('hidden');
        offIcon.classList.remove('hidden');
    }
}

optionBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        currentTimeLimit = parseInt(btn.getAttribute('data-value'));
        localStorage.setItem('timeLimit', currentTimeLimit);
        personalBest = parseInt(localStorage.getItem(`pb_${currentTimeLimit}`)) || 0;
        updateUI();
        initGame();
    });
});

function updateUI() {
    optionBtns.forEach(btn => {
        btn.classList.toggle('active', parseInt(btn.getAttribute('data-value')) === currentTimeLimit);
    });
    inputField.focus();
}

function initGame() {
    if (timer) clearInterval(timer);
    isGameActive = false;
    isGameOver = false;
    startTime = null;
    mistakes = 0;
    typedChars = 0;
    correctChars = 0;
    correctWordsCount = 0;
    isWordDirty = false;
    currentWordIndex = 0;
    currentLetterIndex = 0;
    
    wordsArr = generateWords(100).split(' ').filter(w => w.length > 0);
    timeLeft = currentTimeLimit;
    timerDisplay.innerText = timeLeft;
    progressBar.style.width = '0%';
    progressBar.style.transition = 'none';
    
    renderWords();
    stats.classList.add('hidden');
    resultScreen.classList.add('hidden');
    hint.classList.remove('hidden');
    timerDisplay.classList.remove('hidden');
    wordsContainer.style.transform = 'translateY(0)';
    updateCursor();
    inputField.value = '';
    inputField.focus();
}

function renderWords() {
    wordsContainer.innerHTML = '';
    wordsArr.forEach((wordStr) => {
        const wordDiv = document.createElement('div');
        wordDiv.className = 'word';
        wordStr.split('').forEach(char => {
            const span = document.createElement('span');
            span.className = 'letter';
            span.innerText = char;
            wordDiv.appendChild(span);
        });
        wordsContainer.appendChild(wordDiv);
    });
}

function updateCursor() {
    const words = document.querySelectorAll('.word');
    words.forEach(w => w.classList.remove('active-word'));
    
    const currentWordDiv = words[currentWordIndex];
    if (currentWordDiv) {
        currentWordDiv.classList.add('active-word');
        const letters = currentWordDiv.querySelectorAll('.letter');
        letters.forEach(l => l.classList.remove('current'));
        if (letters[currentLetterIndex]) {
            letters[currentLetterIndex].classList.add('current');
        }

        const offsetTop = currentWordDiv.offsetTop;
        if (offsetTop > 0) {
            wordsContainer.style.transform = `translateY(-${offsetTop}px)`;
        } else {
            wordsContainer.style.transform = 'translateY(0)';
        }
    }
}

function handleInput(e) {
    if (isGameOver) return;

    if (!isGameActive) {
        isGameActive = true;
        startTime = Date.now();
        stats.classList.remove('hidden');
        hint.classList.add('hidden');
        progressBar.style.transition = `width ${currentTimeLimit}s linear`;
        progressBar.style.width = '100%';
        
        timer = setInterval(() => {
            timeLeft--;
            if (timeLeft <= 0) {
                timeLeft = 0;
                timerDisplay.innerText = timeLeft;
                endGame();
            } else {
                timerDisplay.innerText = timeLeft;
                updateStats();
            }
        }, 1000);
    }

    const val = inputField.value;
    if (val.length === 0) return;
    
    const charTyped = val[val.length - 1];
    inputField.value = ''; 
    playClickSound();

    const words = document.querySelectorAll('.word');
    const currentWordDiv = words[currentWordIndex];
    const letters = currentWordDiv.querySelectorAll('.letter');
    const targetWord = wordsArr[currentWordIndex];

    if (charTyped === ' ') {
        if (currentLetterIndex > 0) {
            const wordLetters = currentWordDiv.querySelectorAll('.letter');
            let hasMistakesRemaining = false;
            wordLetters.forEach(l => {
                if (l.classList.contains('incorrect')) hasMistakesRemaining = true;
            });

            if (!hasMistakesRemaining && currentLetterIndex === targetWord.length) {
                correctWordsCount++;
            }
            
            currentWordIndex++;
            currentLetterIndex = 0;
            isWordDirty = false;
            
            if (currentWordIndex >= wordsArr.length - 10) {
                const extra = generateWords(40).split(' ').filter(w => w.length > 0);
                wordsArr = wordsArr.concat(extra);
                extra.forEach(wordStr => {
                    const wordDiv = document.createElement('div');
                    wordDiv.className = 'word';
                    wordStr.split('').forEach(char => {
                        const span = document.createElement('span');
                        span.className = 'letter';
                        span.innerText = char;
                        wordDiv.appendChild(span);
                    });
                    wordsContainer.appendChild(wordDiv);
                });
            }
            updateCursor();
        }
        return;
    }

    if (currentLetterIndex < targetWord.length) {
        const targetChar = targetWord[currentLetterIndex];
        const letterSpan = letters[currentLetterIndex];

        if (charTyped === targetChar) {
            letterSpan.classList.add('correct');
            letterSpan.classList.remove('incorrect');
            correctChars++;
        } else {
            letterSpan.classList.add('incorrect');
            letterSpan.classList.remove('correct');
            mistakes++;
            isWordDirty = true;
            document.body.classList.add('shake');
            setTimeout(() => document.body.classList.remove('shake'), 200);
        }
        typedChars++;
        currentLetterIndex++;
        updateCursor();
    }
}

function handleKeyDown(e) {
    if (isGameOver) {
        if (e.key === 'Enter' || e.key === 'Escape' || e.key === 'Tab') {
            e.preventDefault();
            initGame();
        }
        return;
    }

    if (e.key === 'Backspace') {
        if (currentLetterIndex > 0) {
            currentLetterIndex--;
            const words = document.querySelectorAll('.word');
            const currentWordDiv = words[currentWordIndex];
            const letters = currentWordDiv.querySelectorAll('.letter');
            const letterSpan = letters[currentLetterIndex];
            letterSpan.classList.remove('correct', 'incorrect');
            updateCursor();
            playClickSound();
        }
    }
    if (e.key === 'Tab' || e.key === 'Escape') {
        e.preventDefault();
        initGame();
    }
}

function updateStats() {
    if (!startTime || isGameOver) return;
    const minutesElapsed = (Date.now() - startTime) / 60000;
    const currentWPM = Math.round((typedChars / 5) / minutesElapsed) || 0;
    const acc = typedChars > 0 ? Math.round((correctChars / typedChars) * 100) : 100;
    wpmDisplay.innerText = `${currentWPM} სიტყვა წუთში`;
    accuracyDisplay.innerText = `${acc}% სიზუსტე`;
}

function endGame() {
    if (isGameOver) return;
    isGameOver = true;
    isGameActive = false;
    clearInterval(timer);
    progressBar.style.width = '100%';
    
    // Final word check
    const targetWord = wordsArr[currentWordIndex];
    const currentWordDiv = document.querySelectorAll('.word')[currentWordIndex];
    if (currentWordDiv) {
        const wordLetters = currentWordDiv.querySelectorAll('.letter');
        let hasMistakesRemaining = false;
        wordLetters.forEach(l => {
            if (l.classList.contains('incorrect')) hasMistakesRemaining = true;
        });
        if (!hasMistakesRemaining && currentLetterIndex === targetWord.length) {
            correctWordsCount++;
        }
    }

    const totalMinutes = currentTimeLimit / 60;
    const finalWpmVal = Math.round((typedChars / 5) / totalMinutes) || 0;
    const acc = typedChars > 0 ? Math.round((correctChars / typedChars) * 100) : 100;

    // Record check
    personalBestDisplay.classList.remove('new-record');
    if (finalWpmVal > personalBest) {
        personalBest = finalWpmVal;
        localStorage.setItem(`pb_${currentTimeLimit}`, personalBest);
        personalBestDisplay.classList.add('new-record');
    }

    finalWpm.innerText = finalWpmVal;
    finalWords.innerText = correctWordsCount;
    finalAccuracy.innerText = `${acc}%`;
    personalBestDisplay.innerText = personalBest;
    resultScreen.classList.remove('hidden');
}

inputField.addEventListener('input', handleInput);
document.addEventListener('keydown', handleKeyDown);

// Focus logic for both desktop and mobile
document.addEventListener('touchstart', () => inputField.focus());
document.addEventListener('click', () => inputField.focus());

retryBtn.addEventListener('click', (e) => {
    e.stopPropagation(); // Prevent re-focus loop
    initGame();
});
restartBtn.addEventListener('click', initGame);
window.addEventListener('load', () => { updateUI(); initGame(); });
