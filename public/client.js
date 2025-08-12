// public/client.js
const socket = io();

const gameControls = document.getElementById('game-controls');
const gameInfo = document.getElementById('game-info');
const singlePlayerBtn = document.getElementById('single-player-btn');
const twoPlayerBtn = document.getElementById('two-player-btn');
const matchingArea = document.getElementById('matching-area');
const matchCodeInput = document.getElementById('match-code-input');
const joinGameBtn = document.getElementById('join-game-btn');
const matchingStatus = document.getElementById('matching-status');
const gameBoard = document.getElementById('game-board');
const statusText = document.getElementById('status');
const playersContainer = document.getElementById('players');
const turnIndicator = document.getElementById('turn-indicator');
const player1ScoreEl = document.getElementById('player1-score');
const player2ScoreEl = document.getElementById('player2-score');
const playerScoresContainer = document.getElementById('player-scores');
const player2ScoreLabel = document.getElementById('player2-label');
const gameOverMessage = document.getElementById('game-over-message');
const replayBtn = document.getElementById('replay-btn');
const homeBtn = document.getElementById('home-btn');
const player1Label = document.getElementById('player1-label');
const player2Label = document.getElementById('player2-label');
const player1WinsEl = document.getElementById('player1-wins');
const player2WinsEl = document.getElementById('player2-wins');
const playerWinsContainer = document.getElementById('player-wins');
const player2WinsLabel = document.getElementById('player2-wins-label');
const gameOverImage = document.getElementById('game-over-image');

let gameMode = null;
let playerScores = {
    'player1': 0,
    'player2': 0
};
let isProcessingTurn = false;
let flippedCardElements = [];
let currentMatchCode = null;
let myPlayerNumber = null;

function createDeck() {
    const suits = ['♠', '♥', '♦', '♣'];
    const values = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    let deck = [];
    for (const suit of suits) {
        for (const value of values) {
            deck.push({ suit: suit, value: value, cardId: `${suit}-${value}` });
        }
    }
    return deck;
}

function shuffleDeck(deck) {
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
}

function createAndDisplayCards(shuffledDeck) {
    gameBoard.innerHTML = '';
    shuffledDeck.forEach((card, index) => {
        const cardElement = document.createElement('div');
        cardElement.classList.add('card');
        cardElement.dataset.cardValue = card.value;
        cardElement.dataset.cardId = card.cardId;
        cardElement.dataset.index = index;
        cardElement.innerText = '?';
        gameBoard.appendChild(cardElement);

        cardElement.addEventListener('click', () => {
            if (isProcessingTurn) {
                return;
            }
            socket.emit('flipCard', {
                cardIndex: index,
                cardValue: card.value,
            });
        });
    });
}

function resetUI() {
    gameControls.style.display = 'flex';
    gameInfo.style.display = 'none';
    matchingArea.style.display = 'none';
    gameBoard.style.display = 'none';
    gameOverMessage.style.display = 'none';
    playerScores = { 'player1': 0, 'player2': 0 };
    if (player1ScoreEl) player1ScoreEl.innerText = playerScores['player1'];
    if (player2ScoreEl) player2ScoreEl.innerText = playerScores['player2'];
    if (player1WinsEl) player1WinsEl.innerText = 0;
    if (player2WinsEl) player2WinsEl.innerText = 0;
    isProcessingTurn = false;
    flippedCardElements = [];
    currentMatchCode = null;
    myPlayerNumber = null;
    if (player1Label) player1Label.classList.remove('my-player-label');
    if (player2Label) player2Label.classList.remove('my-player-label');
    if (turnIndicator) turnIndicator.classList.remove('my-turn-indicator');
    if (playerWinsContainer) playerWinsContainer.style.display = 'flex';
}

singlePlayerBtn.addEventListener('click', () => {
    gameControls.style.display = 'none';
    gameInfo.style.display = 'block';
    gameBoard.style.display = 'grid';
    if (player2ScoreLabel) player2ScoreLabel.style.display = 'none';
    if (player2ScoreEl) player2ScoreEl.style.display = 'none';
    if (playersContainer) playersContainer.style.display = 'none';
    if (turnIndicator) turnIndicator.style.display = 'none';
    if (playerWinsContainer) playerWinsContainer.style.display = 'none';
    if (player2WinsLabel) player2WinsLabel.style.display = 'none';
    if (player2WinsEl) player2WinsEl.style.display = 'none';
    if (playerScoresContainer) playerScoresContainer.style.display = 'flex';
    socket.emit('startGame', { mode: 'single' });
});

twoPlayerBtn.addEventListener('click', () => {
    gameControls.style.display = 'none';
    matchingArea.style.display = 'block';
    if (playerScoresContainer) playerScoresContainer.style.display = 'flex';
    if (playersContainer) playersContainer.style.display = 'block';
    if (turnIndicator) turnIndicator.style.display = 'block';
    if (player2ScoreLabel) player2ScoreLabel.style.display = 'inline';
    if (player2ScoreEl) player2ScoreEl.style.display = 'inline';
    if (playerWinsContainer) playerWinsContainer.style.display = 'flex';
    if (player2WinsLabel) player2WinsLabel.style.display = 'inline';
    if (player2WinsEl) player2WinsEl.style.display = 'inline';
});

joinGameBtn.addEventListener('click', () => {
    const matchCode = matchCodeInput.value.trim();
    if (matchCode) {
        matchingStatus.innerText = 'マッチングを待っています...';
        currentMatchCode = matchCode;
        socket.emit('joinMatch', { matchCode: matchCode });
    } else {
        matchingStatus.innerText = '合言葉を入力してください。';
    }
});

replayBtn.addEventListener('click', () => {
    if (gameMode === 'two-player') {
        if (gameOverMessage) gameOverMessage.style.display = 'none';
        if (matchingStatus) matchingStatus.innerText = '相手が選択するのを待っています...';
        if (matchingArea) matchingArea.style.display = 'block';
        socket.emit('replayGame');
    } else {
        resetUI();
        singlePlayerBtn.click();
    }
});

homeBtn.addEventListener('click', () => {
    socket.disconnect();
    resetUI();
    setTimeout(() => {
        socket.connect();
    }, 500);
});

socket.on('startGame', (data) => {
    gameMode = data.mode;
    if (gameBoard) gameBoard.style.display = 'grid';
    
    playerScores = { 'player1': 0, 'player2': 0 };
    if (player1ScoreEl) player1ScoreEl.innerText = playerScores['player1'];
    if (player2ScoreEl) player2ScoreEl.innerText = playerScores['player2'];
    if (player1WinsEl) player1WinsEl.innerText = 0;
    if (player2WinsEl) player2WinsEl.innerText = 0;

    if (gameMode === 'single') {
        createAndDisplayCards(data.shuffledDeck);
        if (statusText) statusText.innerText = 'ゲーム開始！';
    }
});

socket.on('matchFound', (data) => {
    gameMode = 'two-player';
    if (matchingArea) matchingArea.style.display = 'none';
    if (gameInfo) gameInfo.style.display = 'block';
    if (gameBoard) gameBoard.style.display = 'grid';
    createAndDisplayCards(data.shuffledDeck);
    
    if (statusText) statusText.innerText = 'ゲーム開始！';
    if (playersContainer) playersContainer.innerText = `現在のプレイヤー数: ${data.playerCount} / 2`;
    if (player2ScoreLabel) player2ScoreLabel.style.display = 'inline';
    if (player2ScoreEl) player2ScoreEl.style.display = 'inline';
    if (playerScoresContainer) playerScoresContainer.style.display = 'flex';
    if (player1WinsEl) player1WinsEl.innerText = data.winCounts.player1;
    if (player2WinsEl) player2WinsEl.innerText = data.winCounts.player2;
});

socket.on('startReplay', (data) => {
    gameMode = 'two-player';
    if (matchingArea) matchingArea.style.display = 'none';
    if (gameInfo) gameInfo.style.display = 'block';
    if (gameBoard) gameBoard.style.display = 'grid';
    createAndDisplayCards(data.shuffledDeck);
    
    playerScores = { 'player1': 0, 'player2': 0 };
    if (player1ScoreEl) player1ScoreEl.innerText = playerScores['player1'];
    if (player2ScoreEl) player2ScoreEl.innerText = playerScores['player2'];
    
    if (statusText) statusText.innerText = 'ゲーム開始！';
    if (playersContainer) playersContainer.innerText = `現在のプレイヤー数: ${data.playerCount} / 2`;
    if (player2ScoreLabel) player2ScoreLabel.style.display = 'inline';
    if (player2ScoreEl) player2ScoreEl.style.display = 'inline';
    if (playerScoresContainer) playerScoresContainer.style.display = 'flex';
    if (turnIndicator) turnIndicator.innerText = '相手の番です';
    if (turnIndicator) turnIndicator.classList.remove('my-turn-indicator');
    if (player1WinsEl) player1WinsEl.innerText = data.winCounts.player1;
    if (player2WinsEl) player2WinsEl.innerText = data.winCounts.player2;
});

socket.on('playerNumber', (data) => {
    myPlayerNumber = data.playerNumber;
    if (myPlayerNumber === 1) {
        if (player1Label) player1Label.classList.add('my-player-label');
        if (player2Label) player2Label.classList.remove('my-player-label');
    } else if (myPlayerNumber === 2) {
        if (player2Label) player2Label.classList.add('my-player-label');
        if (player1Label) player1Label.classList.remove('my-player-label');
    }
});

socket.on('updatePlayers', (data) => {
    if (gameMode === 'two-player') {
        if (playersContainer) playersContainer.innerText = `現在のプレイヤー数: ${data.playerCount} / 2`;
        if (statusText) statusText.innerText = 'プレイヤーを待っています...';
    }
});

socket.on('matchingStatus', (data) => {
    if (matchingStatus) matchingStatus.innerText = data.message;
});

socket.on('cardFlipped', (data) => {
    const cardElement = document.querySelector(`[data-index='${data.cardIndex}']`);
    if (cardElement) {
        cardElement.innerText = `${data.cardSuit} ${data.cardValue}`;
        cardElement.dataset.flipped = 'true';
        
        if (data.cardSuit === '♥' || data.cardSuit === '♦') {
            cardElement.classList.add('red-card');
        } else {
            cardElement.classList.add('black-card');
        }

        flippedCardElements.push(cardElement);

        if (flippedCardElements.length === 2) {
            isProcessingTurn = true;
        }
    }
});

socket.on('scoreUpdate', (data) => {
    if (playerScores && data.player === 'player1') {
        playerScores.player1 = data.score;
        if (player1ScoreEl) player1ScoreEl.innerText = data.score;
    } else if (playerScores && data.player === 'player2') {
        playerScores.player2 = data.score;
        if (player2ScoreEl) player2ScoreEl.innerText = data.score;
    }
});

socket.on('hideCards', (data) => {
    if (data && data.matchedCards) {
        data.matchedCards.forEach(index => {
            const cardElement = document.querySelector(`[data-index='${index}']`);
            if (cardElement) {
                cardElement.style.visibility = 'hidden';
                cardElement.dataset.matched = 'true';
            }
        });
    }
    isProcessingTurn = false;
    flippedCardElements = [];
});

socket.on('unflipCards', (data) => {
    const cardElement1 = document.querySelector(`[data-index='${data.cardIndex1}']`);
    const cardElement2 = document.querySelector(`[data-index='${data.cardIndex2}']`);
    
    if (cardElement1) {
        cardElement1.innerText = '?';
        cardElement1.dataset.flipped = 'false';
        cardElement1.classList.remove('red-card', 'black-card');
    }
    if (cardElement2) {
        cardElement2.innerText = '?';
        cardElement2.dataset.flipped = 'false';
        cardElement2.classList.remove('red-card', 'black-card');
    }

    isProcessingTurn = false;
    flippedCardElements = [];
});

socket.on('turnChange', (data) => {
    if (socket.id === data.currentPlayerId) {
        if (turnIndicator) {
            turnIndicator.innerText = 'あなたの番です！';
            turnIndicator.classList.add('my-turn-indicator');
        }
    } else {
        if (turnIndicator) {
            turnIndicator.innerText = '相手の番です';
            turnIndicator.classList.remove('my-turn-indicator');
        }
    }
});

socket.on('playerLeft', () => {
    alert('対戦相手が退出しました。');
    resetUI();
});

socket.on('gameOver', (data) => {
    if (gameBoard) gameBoard.style.display = 'none';
    if (gameOverMessage) gameOverMessage.style.display = 'block';

    const messageElement = document.getElementById('game-over-text');
    const imageElement = document.getElementById('game-over-image');

    if (messageElement) {
        if (data.message === 'WIN') {
            messageElement.innerText = 'WIN!';
            messageElement.style.color = 'green';
            if (imageElement) imageElement.src = 'images/win.png';
        } else if (data.message === 'LOSE') {
            messageElement.innerText = 'LOSE...';
            messageElement.style.color = 'red';
            if (imageElement) imageElement.src = 'images/lose.png';
        } else {
            messageElement.innerText = 'DRAW';
            messageElement.style.color = 'blue';
            if (imageElement) imageElement.src = 'images/draw.png';
        }
    }
    if (player1WinsEl) player1WinsEl.innerText = data.winCounts.player1;
    if (player2WinsEl) player2WinsEl.innerText = data.winCounts.player2;
});