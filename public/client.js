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
const player2ScoreLabel = document.getElementById('player2-score-label');
const gameOverMessage = document.getElementById('game-over-message');
const replayBtn = document.getElementById('replay-btn');
const homeBtn = document.getElementById('home-btn');
const player1Label = document.getElementById('player1-label');
const player2Label = document.getElementById('player2-score-label');

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
    player1ScoreEl.innerText = playerScores['player1'];
    player2ScoreEl.innerText = playerScores['player2'];
    isProcessingTurn = false;
    flippedCardElements = [];
    currentMatchCode = null;
    myPlayerNumber = null;
    player1Label.classList.remove('my-player-label', 'my-turn-label');
    player2Label.classList.remove('my-player-label', 'my-turn-label');
}

singlePlayerBtn.addEventListener('click', () => {
    gameControls.style.display = 'none';
    gameInfo.style.display = 'block';
    gameBoard.style.display = 'grid';
    player2ScoreLabel.style.display = 'none';
    player2ScoreEl.style.display = 'none';
    playerScoresContainer.style.display = 'flex';
    socket.emit('startGame', { mode: 'single' });
});

twoPlayerBtn.addEventListener('click', () => {
    gameControls.style.display = 'none';
    matchingArea.style.display = 'block';
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
    resetUI();
    if (gameMode === 'single') {
        singlePlayerBtn.click();
    } else if (gameMode === 'two-player' && currentMatchCode) {
        twoPlayerBtn.click();
        matchCodeInput.value = currentMatchCode;
        joinGameBtn.click();
    }
});

homeBtn.addEventListener('click', () => {
    resetUI();
});

socket.on('startGame', (data) => {
    gameMode = data.mode;
    gameBoard.style.display = 'grid';
    
    if (gameMode === 'single') {
        createAndDisplayCards(data.shuffledDeck);
        statusText.innerText = 'ゲーム開始！';
        playersContainer.style.display = 'none';
        turnIndicator.style.display = 'none';
    }
});

socket.on('matchFound', (data) => {
    gameMode = 'two-player';
    matchingArea.style.display = 'none';
    gameInfo.style.display = 'block';
    gameBoard.style.display = 'grid';
    createAndDisplayCards(data.shuffledDeck);
    
    statusText.innerText = 'ゲーム開始！';
    playersContainer.innerText = `現在のプレイヤー数: ${data.playerCount} / 2`;
    player2ScoreLabel.style.display = 'inline';
    player2ScoreEl.style.display = 'inline';
    playerScoresContainer.style.display = 'flex';
});

socket.on('playerNumber', (data) => {
    console.log('プレイヤー番号を受信しました:', data.playerNumber); // ★ログを追加
    myPlayerNumber = data.playerNumber;
    if (myPlayerNumber === 1) {
        player1Label.classList.add('my-player-label');
        player2Label.classList.remove('my-player-label');
    } else if (myPlayerNumber === 2) {
        player2Label.classList.add('my-player-label');
        player1Label.classList.remove('my-player-label');
    }
});

socket.on('matchingStatus', (data) => {
    matchingStatus.innerText = data.message;
});

socket.on('cardFlipped', (data) => {
    const cardElement = document.querySelector(`[data-index='${data.cardIndex}']`);
    cardElement.innerText = `${data.cardSuit} ${data.cardValue}`;
    flippedCardElements.push(cardElement);

    if (flippedCardElements.length === 2) {
        isProcessingTurn = true;
    }
});

socket.on('scoreUpdate', (data) => {
    if (data.player === 'player1') {
        playerScores.player1 = data.score;
        player1ScoreEl.innerText = data.score;
    } else if (data.player === 'player2') {
        playerScores.player2 = data.score;
        player2ScoreEl.innerText = data.score;
    }
    
    data.matchedCards.forEach(index => {
        const cardElement = document.querySelector(`[data-index='${index}']`);
        if (cardElement) {
            cardElement.style.visibility = 'hidden';
            cardElement.dataset.matched = 'true';
        }
    });

    isProcessingTurn = false;
    flippedCardElements = [];
});

socket.on('unflipCards', (data) => {
    const cardElement1 = document.querySelector(`[data-index='${data.cardIndex1}']`);
    const cardElement2 = document.querySelector(`[data-index='${data.cardIndex2}']`);
    
    cardElement1.innerText = '?';
    cardElement2.innerText = '?';

    isProcessingTurn = false;
    flippedCardElements = [];
});

socket.on('turnChange', (data) => {
    if (socket.id === data.currentPlayerId) {
        turnIndicator.innerText = 'あなたの番です！';
        if (myPlayerNumber === 1) {
            player1Label.classList.add('my-turn-label');
            player2Label.classList.remove('my-turn-label');
        } else if (myPlayerNumber === 2) {
            player2Label.classList.add('my-turn-label');
            player1Label.classList.remove('my-turn-label');
        }
    } else {
        turnIndicator.innerText = '相手の番です';
        player1Label.classList.remove('my-turn-label');
        player2Label.classList.remove('my-turn-label');
    }
});

socket.on('playerLeft', () => {
    alert('対戦相手が退出しました。');
    resetUI();
});

socket.on('gameOver', (data) => {
    gameBoard.style.display = 'none';
    gameOverMessage.style.display = 'block';

    const messageElement = document.getElementById('game-over-text');
    if (messageElement) {
        if (data.message === 'WIN') {
            messageElement.innerText = 'WIN!';
            messageElement.style.color = 'green';
        } else if (data.message === 'LOSE') {
            messageElement.innerText = 'LOSE...';
            messageElement.style.color = 'red';
        } else {
            messageElement.innerText = 'DRAW';
            messageElement.style.color = 'blue';
        }
    }
});