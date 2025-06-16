// script.js - Enhanced Guess the Number Game

let secretNumber, attemptsLeft, maxAttempts, rangeMax, timer, timeLeft;
const guessInput = document.getElementById('guessInput');
const submitBtn = document.getElementById('submitBtn');
const feedback = document.getElementById('feedback');
const attemptsDisplay = document.getElementById('attempts');
const newGameBtn = document.getElementById('newGameBtn');
const timerDisplay = document.getElementById('timer');
const leaderboardList = document.getElementById('leaderboard');
const modeSelector = document.getElementById('mode');
const difficultySelector = document.getElementById('difficulty');
const container = document.querySelector('.container');

function setDifficulty() {
  const level = difficultySelector.value;
  switch (level) {
    case 'easy':
      rangeMax = 50;
      maxAttempts = 15;
      break;
    case 'hard':
      rangeMax = 200;
      maxAttempts = 10;
      break;
    default:
      rangeMax = 100;
      maxAttempts = 12;
  }
}

function startTimer() {
  timeLeft = 60;
  timerDisplay.textContent = `Time: ${timeLeft}s`;
  timerDisplay.style.display = 'block';
  timer = setInterval(() => {
    timeLeft--;
    timerDisplay.textContent = `Time: ${timeLeft}s`;
    if (timeLeft <= 0) {
      clearInterval(timer);
      endGame(false, '⏰ Time\'s up! The number was ' + secretNumber);
    }
  }, 1000);
}

function stopTimer() {
  clearInterval(timer);
  timerDisplay.style.display = 'none';
}

function startGame() {
  setDifficulty();
  secretNumber = Math.floor(Math.random() * rangeMax) + 1;
  attemptsLeft = maxAttempts;
  guessInput.disabled = false;
  submitBtn.disabled = false;
  feedback.textContent = '';
  feedback.className = 'feedback';
  attemptsDisplay.textContent = `Attempts: 0`;
  newGameBtn.style.display = 'none';

  if (modeSelector.value === 'timer') {
    startTimer();
  } else {
    stopTimer();
  }
}

function endGame(won, message) {
  guessInput.disabled = true;
  submitBtn.disabled = true;
  feedback.textContent = message;
  feedback.classList.add(won ? 'correct' : 'too-high');
  newGameBtn.style.display = 'inline-block';
  stopTimer();
  saveToLeaderboard(won);

  if (won) triggerConfetti();
}

function saveToLeaderboard(won) {
  const history = JSON.parse(localStorage.getItem('leaderboard') || '[]');
  const entry = {
    result: won ? '✅ Win' : '❌ Loss',
    attempts: maxAttempts - attemptsLeft,
    number: secretNumber,
    timestamp: new Date().toLocaleString()
  };
  history.unshift(entry);
  localStorage.setItem('leaderboard', JSON.stringify(history.slice(0, 5)));
  renderLeaderboard();
}

function renderLeaderboard() {
  const history = JSON.parse(localStorage.getItem('leaderboard') || '[]');
  leaderboardList.innerHTML = '';
  history.forEach(entry => {
    const li = document.createElement('li');
    li.textContent = `${entry.result} in ${entry.attempts} tries (🔢 ${entry.number}) on ${entry.timestamp}`;
    leaderboardList.appendChild(li);
  });
}

function triggerConfetti() {
  const emojis = ['🎉','✨','🎊','💥','🌟'];
  for (let i = 0; i < 20; i++) {
    const emoji = document.createElement('div');
    emoji.classList.add('floating-emoji');
    emoji.style.left = Math.random() * 100 + '%';
    emoji.style.top = Math.random() * 50 + 50 + '%';
    emoji.textContent = emojis[Math.floor(Math.random() * emojis.length)];
    container.appendChild(emoji);
    setTimeout(() => emoji.remove(), 2000);
  }
}

submitBtn.addEventListener('click', () => {
  const guess = Number(guessInput.value);
  if (!guess || guess < 1 || guess > rangeMax) {
    feedback.textContent = `⚠️ Enter a number between 1 and ${rangeMax}`;
    feedback.className = 'feedback';
    return;
  }

  attemptsLeft--;
  attemptsDisplay.textContent = `Attempts: ${maxAttempts - attemptsLeft}`;

  if (guess === secretNumber) {
    endGame(true, `🎉 Correct! The number was ${secretNumber}`);
  } else if (attemptsLeft <= 0) {
    endGame(false, `❌ Game Over! The number was ${secretNumber}`);
  } else {
    feedback.textContent = guess > secretNumber ? '📉 Too high!' : '📈 Too low!';
    feedback.className = `feedback ${guess > secretNumber ? 'too-high' : 'too-low'}`;
  }

  guessInput.value = '';
});

newGameBtn.addEventListener('click', startGame);
difficultySelector.addEventListener('change', startGame);
modeSelector.addEventListener('change', startGame);

renderLeaderboard();
startGame();
