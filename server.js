// server.js
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const port = process.env.PORT || 3000;

server.listen(port, () => {
    console.log(`サーバーが http://localhost:${port} で起動しました`);
});

app.use(express.static('public'));

let gameBoardState = [];
let flippedCards = [];
let currentPlayerIndex = 0;
let players = [];
let isProcessingTurn = false;
let gameMode = null;

let playerPoints = {
    'player1': 0,
    'player2': 0
};

// 52枚のトランプカードを生成し、シャッフルする関数
function createAndShuffleDeck() {
    const suits = ['♠', '♥', '♦', '♣'];
    const values = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    let deck = [];

    for (const suit of suits) {
        for (const value of values) {
            deck.push({ cardId: `${suit}-${value}`, suit: suit, value: value, isFlipped: false, isMatched: false });
        }
    }

    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
}

gameBoardState = createAndShuffleDeck();

io.on('connection', (socket) => {
    console.log('新しいプレイヤーが接続しました');

    socket.on('startGame', (data) => {
        gameMode = data.mode;
        gameBoardState = createAndShuffleDeck(); // ★シャッフルはサーバー側で行う
        flippedCards = [];
        currentPlayerIndex = 0;
        players = [];
        playerPoints = { 'player1': 0, 'player2': 0 };

        if (gameMode === 'single') {
            // シャッフルしたカード情報をクライアントに送信
            io.emit('startGame', { mode: 'single', shuffledDeck: gameBoardState });
        } else {
            players.push(socket.id);
            io.emit('updatePlayers', { playerCount: players.length });
        }
    });

    if (players.length < 2) {
        players.push(socket.id);
        io.emit('updatePlayers', { playerCount: players.length });
    }

    if (players.length === 2 && gameMode === 'two-player') {
        io.emit('startGame', { mode: 'two-player' });
        io.emit('turnChange', { currentPlayerId: players[currentPlayerIndex] });
    }

    socket.on('disconnect', () => {
        console.log('プレイヤーが切断しました');
        players = players.filter(id => id !== socket.id);
        io.emit('updatePlayers', { playerCount: players.length });
    });

    socket.on('flipCard', (data) => {
        console.log('flipCardイベントを受信しました。', data);
        if (gameMode === 'two-player') {
            if (socket.id !== players[currentPlayerIndex] || isProcessingTurn) {
                return;
            }
        }
        console.log('サーバー: flipCardイベントを受信しました。データ:', data);

        const cardIndex = data.cardIndex;
        const cardValue = data.cardValue;

        // すでにめくられているか、マッチしたカードでないかを確認
        if (gameBoardState[cardIndex].isFlipped || gameBoardState[cardIndex].isMatched) {
            console.log('すでにめくられているか、マッチしたカードです。'); // ★デバッグ用ログ★
            return;
        }

        io.emit('cardFlipped', {
            cardIndex: cardIndex,
            cardSuit: gameBoardState[cardIndex].suit,
            cardValue: gameBoardState[cardIndex].value
        });
        gameBoardState[cardIndex].isFlipped = true;
        flippedCards.push({ cardIndex: cardIndex, cardValue: cardValue });
        
        console.log('現在めくられているカードの数:', flippedCards.length); // ★デバッグ用ログ★


        if (flippedCards.length === 2) {
            isProcessingTurn = true;
            const [card1, card2] = flippedCards;
            
            console.log('2枚目のカードがめくられました。', card1, card2);
            console.log('ペア判定:', card1.cardValue, 'と', card2.cardValue);

            if (card1.cardValue === card2.cardValue) {
                console.log('ペアが揃いました！');
                io.emit('match', { message: 'ペアが揃いました！' });

                gameBoardState[card1.cardIndex].isMatched = true;
                gameBoardState[card2.cardIndex].isMatched = true;

                // ゲームモードに関わらず、現在のプレイヤーのポイントを加算
                const currentPlayerKey = gameMode === 'two-player' ? `player${currentPlayerIndex + 1}` : 'player1';
                playerPoints[currentPlayerKey]++;

                io.emit('scoreUpdate', {
                    player: currentPlayerKey,
                    score: playerPoints[currentPlayerKey],
                    matchedCards: [card1.cardIndex, card2.cardIndex]
                });
                console.log('サーバー: scoreUpdateイベントを送信しました。データ:', {
                    player: currentPlayerKey,
                    score: playerPoints[currentPlayerKey],
                    matchedCards: [card1.cardIndex, card2.cardIndex]
                });

                flippedCards = [];
                isProcessingTurn = false;
            } else {
                // ペアが揃わなかった場合
                console.log('ペアではありませんでした。');
                io.emit('noMatch', { card1, card2, message: 'ペアではありませんでした。' });

                setTimeout(() => {
                    gameBoardState[card1.cardIndex].isFlipped = false;
                    gameBoardState[card2.cardIndex].isFlipped = false;
                    io.emit('unflipCards', { cardIndex1: card1.cardIndex, cardIndex2: card2.cardIndex });

                    if (gameMode === 'two-player') {
                        currentPlayerIndex = (currentPlayerIndex + 1) % 2;
                        io.emit('turnChange', { currentPlayerId: players[currentPlayerIndex] });
                    }

                    flippedCards = [];
                    isProcessingTurn = false;
                }, 2000);
            }
        }
    });
});