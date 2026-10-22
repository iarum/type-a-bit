const wordsContainer = document.getElementById('words-container');
const inputField = document.getElementById('input-field');
const stats = document.getElementById('stats');
const timerDisplay = document.getElementById('timer');
const resultScreen = document.getElementById('result-screen');
const finalWpm = document.getElementById('final-wpm');
const finalAccuracy = document.getElementById('final-accuracy');
const personalBestDisplay = document.getElementById('personal-best');
const retryBtn = document.getElementById('retry-btn');
const restartBtn = document.getElementById('restart-btn');
const themeToggle = document.getElementById('theme-toggle');
const soundToggle = document.getElementById('sound-toggle');
const optionBtns = document.querySelectorAll('.option-btn');
const progressBar = document.getElementById('progress-bar');
const hint = document.querySelector('.hint');

// localStorage can throw in private mode or with blocked site data
const storage = {
    get(key) { try { return localStorage.getItem(key); } catch { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch {} }
};

// State
let currentTheme = storage.get('theme') || 'light';
let currentTimeLimit = parseInt(storage.get('timeLimit')) || 30;
let personalBest = parseInt(storage.get(`pb_${currentTimeLimit}`)) || 0;
let isSoundEnabled = storage.get('soundEnabled') !== 'false'; // Default true

let wordsArr = [];
let timer = null;
let startTime = null;
let timeLeft = 0;
let typedChars = 0;    // every character entered (for accuracy)
let correctChars = 0;  // characters that matched when entered (for accuracy)
let netChars = 0;      // characters of correctly finished words + spaces (for WPM)
let isGameActive = false;
let isGameOver = false;
let currentWordIndex = 0;
let currentTyped = ''; // what has been typed for the current word

// Audio Context for soft click, created lazily so browsers don't block it
let audioCtx = null;
function playClickSound() {
    if (!isSoundEnabled) return;
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
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

if (window.matchMedia('(pointer: coarse)').matches) {
    hint.innerText = 'დასაწყებად დაიწყე წერა';
}

// Fit the layout to the visible area, above the on-screen keyboard
function fitViewport() {
    const height = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    document.documentElement.style.setProperty('--app-height', `${height}px`);
    document.body.classList.toggle('compact', height < 500);
    window.scrollTo(0, 0);
    if (wordsArr.length) updateCursor();
}
if (window.visualViewport) window.visualViewport.addEventListener('resize', fitViewport);
window.addEventListener('resize', fitViewport);
fitViewport();

themeToggle.addEventListener('click', () => {
    currentTheme = currentTheme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', currentTheme);
    storage.set('theme', currentTheme);
    inputField.focus();
});

soundToggle.addEventListener('click', () => {
    isSoundEnabled = !isSoundEnabled;
    storage.set('soundEnabled', isSoundEnabled);
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
        storage.set('timeLimit', currentTimeLimit);
        personalBest = parseInt(storage.get(`pb_${currentTimeLimit}`)) || 0;
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
    typedChars = 0;
    correctChars = 0;
    netChars = 0;
    currentWordIndex = 0;
    currentTyped = '';

    wordsArr = [];
    timeLeft = currentTimeLimit;
    timerDisplay.innerText = timeLeft;
    progressBar.style.width = '0%';
    progressBar.style.transition = 'none';

    wordsContainer.innerHTML = '';
    appendWords(100);
    stats.classList.add('hidden');
    resultScreen.classList.add('hidden');
    hint.classList.remove('hidden');
    timerDisplay.classList.remove('hidden');
    wordsContainer.style.transform = 'translateY(0)';
    updateCursor();
    inputField.value = '';
    inputField.focus();
}

function appendWords(count) {
    const newWords = generateWords(count).split(' ').filter(w => w.length > 0);
    wordsArr = wordsArr.concat(newWords);
    newWords.forEach(wordStr => {
        const wordDiv = document.createElement('div');
        wordDiv.className = 'word';
        wordStr.split('').forEach(char => wordDiv.appendChild(createLetter(char)));
        wordsContainer.appendChild(wordDiv);
    });
}

function createLetter(char, className = 'letter') {
    const span = document.createElement('span');
    span.className = className;
    span.innerText = char;
    return span;
}

function updateCursor() {
    wordsContainer.querySelectorAll('.active-word').forEach(w => w.classList.remove('active-word'));
    wordsContainer.querySelectorAll('.current, .current-end').forEach(l => l.classList.remove('current', 'current-end'));

    const words = wordsContainer.children;
    const currentWordDiv = words[currentWordIndex];
    if (!currentWordDiv) return;

    currentWordDiv.classList.add('active-word');
    const letters = currentWordDiv.querySelectorAll('.letter');
    if (currentTyped.length < letters.length) {
        letters[currentTyped.length].classList.add('current');
    } else {
        letters[letters.length - 1].classList.add('current-end');
    }

    // Scroll so the previous line stays visible above the active one
    const top = currentWordDiv.offsetTop;
    let prevLineTop = 0;
    for (let i = currentWordIndex - 1; i >= 0; i--) {
        if (words[i].offsetTop < top) {
            prevLineTop = words[i].offsetTop;
            break;
        }
    }
    wordsContainer.style.transform = `translateY(-${prevLineTop}px)`;
}

function startGame() {
    isGameActive = true;
    startTime = Date.now();
    stats.classList.remove('hidden');
    hint.classList.add('hidden');
    progressBar.style.transition = `width ${currentTimeLimit}s linear`;
    progressBar.style.width = '100%';

    timer = setInterval(() => {
        const elapsed = (Date.now() - startTime) / 1000;
        const remaining = Math.max(0, Math.ceil(currentTimeLimit - elapsed));
        if (remaining !== timeLeft) {
            timeLeft = remaining;
            timerDisplay.innerText = timeLeft;
        }
        if (elapsed >= currentTimeLimit) endGame();
    }, 200);
}

// The input mirrors the current word, so backspace, autocorrect, IME
// composition and paste on mobile keyboards all work the same as on desktop.
function handleInput() {
    if (isGameOver) {
        inputField.value = '';
        return;
    }

    const val = inputField.value;
    if (!isGameActive) {
        if (val.trim().length === 0) {
            inputField.value = '';
            return;
        }
        startGame();
    }

    const parts = val.split(' ');
    for (let i = 0; i < parts.length - 1; i++) {
        applyTyped(parts[i]);
        commitWord();
    }
    const rest = parts[parts.length - 1];
    if (parts.length > 1) inputField.value = rest;
    applyTyped(rest);
}

function applyTyped(next) {
    const prev = currentTyped;
    if (next === prev) return;
    const targetWord = wordsArr[currentWordIndex];

    // Count every newly entered character as a keystroke
    let diffAt = 0;
    while (diffAt < prev.length && diffAt < next.length && prev[diffAt] === next[diffAt]) diffAt++;
    let madeMistake = false;
    for (let i = diffAt; i < next.length; i++) {
        typedChars++;
        if (next[i] === targetWord[i]) {
            correctChars++;
        } else {
            madeMistake = true;
        }
    }

    currentTyped = next;
    playClickSound();
    if (madeMistake) {
        document.body.classList.add('shake');
        setTimeout(() => document.body.classList.remove('shake'), 200);
    }
    renderCurrentWord();
}

function renderCurrentWord() {
    const currentWordDiv = wordsContainer.children[currentWordIndex];
    const targetWord = wordsArr[currentWordIndex];

    currentWordDiv.querySelectorAll('.extra').forEach(el => el.remove());
    currentWordDiv.querySelectorAll('.letter').forEach((span, i) => {
        const isTyped = i < currentTyped.length;
        span.classList.toggle('correct', isTyped && currentTyped[i] === targetWord[i]);
        span.classList.toggle('incorrect', isTyped && currentTyped[i] !== targetWord[i]);
    });
    // Letters typed past the end of the word
    currentTyped.slice(targetWord.length).split('').forEach(char => {
        currentWordDiv.appendChild(createLetter(char, 'letter incorrect extra'));
    });
    updateCursor();
}

function commitWord() {
    if (currentTyped.length === 0) return;
    const targetWord = wordsArr[currentWordIndex];
    if (currentTyped === targetWord) {
        netChars += targetWord.length + 1;
    } else {
        wordsContainer.children[currentWordIndex].classList.add('error');
    }

    currentWordIndex++;
    currentTyped = '';
    playClickSound();
    if (currentWordIndex >= wordsArr.length - 10) appendWords(40);
    updateCursor();
}

function handleKeyDown(e) {
    if (e.key === 'Tab' || e.key === 'Escape' || (isGameOver && e.key === 'Enter')) {
        e.preventDefault();
        initGame();
    }
}

function endGame() {
    if (isGameOver) return;
    isGameOver = true;
    isGameActive = false;
    clearInterval(timer);
    progressBar.style.width = '100%';
    inputField.value = '';

    // Final word check
    if (currentTyped === wordsArr[currentWordIndex]) {
        netChars += currentTyped.length;
    }

    const totalMinutes = currentTimeLimit / 60;
    const finalWpmVal = Math.round((netChars / 5) / totalMinutes) || 0;
    const acc = typedChars > 0 ? Math.round((correctChars / typedChars) * 100) : 100;

    // Record check
    const isNewRecord = finalWpmVal > personalBest;
    if (isNewRecord) {
        personalBest = finalWpmVal;
        storage.set(`pb_${currentTimeLimit}`, personalBest);
    }

    finalWpm.innerText = finalWpmVal;
    finalAccuracy.innerText = `${acc}%`;
    personalBestDisplay.innerText = isNewRecord ? 'ახალი რეკორდი!' : `რეკორდი: ${personalBest}`;
    personalBestDisplay.classList.toggle('new-record', isNewRecord);
    resultScreen.classList.remove('hidden');
}

inputField.addEventListener('input', handleInput);
document.addEventListener('keydown', handleKeyDown);

// Focus logic for both desktop and mobile
document.addEventListener('click', () => inputField.focus());

retryBtn.addEventListener('click', (e) => {
    e.stopPropagation(); // Prevent re-focus loop
    initGame();
});
restartBtn.addEventListener('click', initGame);
window.addEventListener('load', () => { updateUI(); initGame(); });
