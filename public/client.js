// public/client.js
// サーバーと接続
const socket = io();

const gameControls = document.getElementById('game-controls');
const gameInfo = document.getElementById('game-info');
const singlePlayerBtn = document.getElementById('single-player-btn');
const twoPlayerBtn = document.getElementById('two-player-btn');
const gameBoard = document.getElementById('game-board');
const statusText = document.getElementById('status');
const playersContainer = document.getElementById('players');
const turnIndicator = document.getElementById('turn-indicator');
const player1ScoreEl = document.getElementById('player1-score');
const playerScoresContainer = document.getElementById('player-scores');
const player2ScoreLabel = document.getElementById('player2-score-label'); // 新規追加
const player2ScoreEl = document.getElementById('player2-score'); // 既存

let gameMode = null;
let playerScores = {
    'player1': 0,
    'player2': 0
};
let isProcessingTurn = false;
let flippedCardElements = [];

// ボタンイベントリスナー
singlePlayerBtn.addEventListener('click', () => {
    gameMode = 'single';
    gameControls.style.display = 'none';
    gameInfo.style.display = 'block';
    gameBoard.style.display = 'grid';
    // 一人モードではプレイヤー2の表示を非表示にする
    player2ScoreLabel.style.display = 'none';
    player2ScoreEl.style.display = 'none';
    playerScoresContainer.style.display = 'flex'; // ポイント表示自体は有効にする
    socket.emit('startGame', { mode: 'single' });
});

twoPlayerBtn.addEventListener('click', () => {
    gameMode = 'two-player';
    gameControls.style.display = 'none';
    gameInfo.style.display = 'block';
    gameBoard.style.display = 'grid';
    // 二人モードではプレイヤー2の表示を有効にする
    player2ScoreLabel.style.display = 'inline';
    player2ScoreEl.style.display = 'inline';
    playerScoresContainer.style.display = 'flex';
    socket.emit('startGame', { mode: 'two-player' });
});

// 52枚のトランプカードを生成する関数
function createDeck() {
    const suits = ['♠', '♥', '♦', '♣'];
    const values = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    let deck = [];

    // 4つのスートと13の数字を組み合わせてカードを生成
    for (const suit of suits) {
        for (const value of values) {
            deck.push({
                suit: suit,
                value: value,
                cardId: `${suit}-${value}` // ユニークなカードIDを作成
            });
        }
    }
    return deck;
}

// カードのシャッフル関数（Fisher-Yatesシャッフルアルゴリズム）
function shuffleDeck(deck) {
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]]; // 要素を交換
    }
    return deck;
}

// 52枚のトランプカードを生成
let deck = createDeck();
deck = shuffleDeck(deck);

// カードをHTMLに表示
deck.forEach((card, index) => {
    const cardElement = document.createElement('div');
    cardElement.classList.add('card');
    cardElement.dataset.cardValue = card.value;
    cardElement.dataset.cardId = card.cardId;
    cardElement.dataset.index = index;
    cardElement.innerText = '?';
    gameBoard.appendChild(cardElement);

    cardElement.addEventListener('click', () => {
        socket.emit('flipCard', {
            cardIndex: index,
            cardValue: card.value,
        });
    });
});

// サーバーからのイベントハンドラ
socket.on('updatePlayers', (data) => {
    if (gameMode === 'two-player') {
        playersContainer.innerText = `現在のプレイヤー数: ${data.playerCount} / 2`;
        statusText.innerText = 'プレイヤーを待っています...';
    }
});

socket.on('startGame', (data) => {
    // ゲームボードを表示
    gameBoard.style.display = 'grid';
    if (gameMode === 'single') {
        statusText.innerText = 'ゲーム開始！';
        playersContainer.style.display = 'none';
        turnIndicator.style.display = 'none';
    } else {
        statusText.innerText = 'プレイヤーを待っています...';
    }
    playerScores = { 'player1': 0, 'player2': 0 };
    player1ScoreEl.innerText = playerScores['player1'];
    player2ScoreEl.innerText = playerScores['player2'];
    flippedCardElements = [];
    isProcessingTurn = false;

    // カードを生成して表示する
    gameBoard.style.display = 'grid';

    // サーバーから受け取ったシャッフル済みのカード配列
    const shuffledDeck = data.shuffledDeck;

    gameBoard.innerHTML = '';
    // サーバーから受け取った配列を使ってカードを生成
    shuffledDeck.forEach((card, index) => {
        const cardElement = document.createElement('div');
        cardElement.classList.add('card');
        // `card.value`と`card.cardId`はサーバーから送られてきた値を使う
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
                cardIndex: index, // ★これでサーバーとクライアントのインデックスが一致する
                cardValue: card.value,
            });
        });
    });
});

// サーバーからカードがめくられた情報を受け取ったときの処理
socket.on('cardFlipped', (data) => {
    const cardElement = document.querySelector(`[data-index='${data.cardIndex}']`);
    cardElement.innerText = `${data.cardSuit} ${data.cardValue}`;
    // ★修正: めくられたカードを配列に追加
    flippedCardElements.push(cardElement);

    // ★修正: 2枚目のカードがめくられたらフラグを立てる
    if (flippedCardElements.length === 2) {
        isProcessingTurn = true;
    }
});

// サーバーからカードを裏返す情報を受け取ったときの処理
socket.on('unflipCards', (data) => {
    const cardElement1 = document.querySelector(`[data-index='${data.cardIndex1}']`);
    const cardElement2 = document.querySelector(`[data-index='${data.cardIndex2}']`);
    
    cardElement1.innerText = '?';
    cardElement2.innerText = '?';

    // ★修正: カードを裏返した後、フラグと配列をリセット
    isProcessingTurn = false;
    flippedCardElements = [];
});
// サーバーからターン交代の情報を受け取ったときの処理
socket.on('turnChange', (data) => {
    if (socket.id === data.currentPlayerId) {
        turnIndicator.innerText = 'あなたの番です！';
    } else {
        turnIndicator.innerText = '相手の番です';
    }
});

socket.on('scoreUpdate', (data) => {
    console.log('scoreUpdateイベントを受信しました。', data); // ★デバッグ用ログ★
    console.log('クライアント: scoreUpdateイベントを受信しました。データ:', data);

    
    // ポイントを更新
    if (data.player === 'player1') {
        playerScores.player1 = data.score;
        player1ScoreEl.innerText = data.score;
    } else if (data.player === 'player2') {
        playerScores.player2 = data.score;
        player2ScoreEl.innerText = data.score;
    }
    
    // マッチしたカードを非表示にする
    data.matchedCards.forEach(index => {
        const cardElement = document.querySelector(`[data-index='${index}']`);
        console.log(`クライアント: index ${index} のカード要素を検索しました。結果:`, cardElement);

        if (cardElement) {
            cardElement.style.visibility = 'hidden';
            // マッチしたカードには属性を追加して、再クリックできないようにする
            cardElement.dataset.matched = 'true';
        }
    });

    // ★修正：ペアが揃った後、フラグをリセットして次の入力を有効にする
    isProcessingTurn = false;
    flippedCardElements = [];
});
