const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const port = process.env.PORT || 3000;

const games = {};

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

function isGameOver(game) {
    return game.board.every(card => card.isMatched);
}

app.use(express.static('public'));

io.on('connection', (socket) => {
    console.log('新しいプレイヤーが接続しました:', socket.id);

    socket.on('startGame', (data) => {
        if (data.mode === 'single') {
            const gameId = `single-${socket.id}`;
            games[gameId] = {
                gameMode: 'single',
                board: createAndShuffleDeck(),
                flippedCards: [],
                isProcessingTurn: false,
                playerPoints: { player1: 0, player2: 0 }
            };
            socket.join(gameId);
            socket.emit('startGame', { mode: 'single', shuffledDeck: games[gameId].board });
        }
    });

    socket.on('joinMatch', (data) => {
        const matchCode = data.matchCode;
        if (!games[matchCode]) {
            games[matchCode] = {
                gameMode: 'two-player',
                players: [socket.id],
                board: createAndShuffleDeck(),
                flippedCards: [],
                isProcessingTurn: false,
                currentPlayerIndex: 0,
                playerPoints: { player1: 0, player2: 0 }
            };
            socket.join(matchCode);
            socket.emit('matchingStatus', { message: 'プレイヤーを待っています...' });
        } else if (games[matchCode].players.length < 2) {
            games[matchCode].players.push(socket.id);
            socket.join(matchCode);
            
            io.to(matchCode).emit('matchFound', {
                playerCount: 2,
                shuffledDeck: games[matchCode].board
            });
            // ★修正: ゲーム開始時に最初のプレイヤーのターンを通知
            io.to(matchCode).emit('turnChange', { currentPlayerId: games[matchCode].players[0] });

            games[matchCode].players.forEach((playerId, index) => {
                io.to(playerId).emit('playerNumber', { playerNumber: index + 1 });
            });

        } else {
            socket.emit('matchingStatus', { message: 'この部屋は満員です。' });
        }
    });

    socket.on('disconnect', () => {
        console.log('プレイヤーが切断しました:', socket.id);
        for (const matchCode in games) {
            const game = games[matchCode];
            if (game.players && game.players.includes(socket.id)) {
                game.players = game.players.filter(id => id !== socket.id);
                if (game.players.length === 0) {
                    delete games[matchCode];
                } else {
                    io.to(matchCode).emit('playerLeft');
                }
                break;
            }
        }
    });

    socket.on('flipCard', (data) => {
        const matchCode = Array.from(socket.rooms).find(room => games[room]);
        if (!matchCode) return;
        
        const game = games[matchCode];

        if (game.gameMode === 'two-player') {
            if (socket.id !== game.players[game.currentPlayerIndex] || game.isProcessingTurn) {
                return;
            }
        } else if (game.isProcessingTurn) {
            return;
        }

        const cardIndex = data.cardIndex;
        if (game.board[cardIndex].isFlipped || game.board[cardIndex].isMatched) {
            return;
        }

        io.to(matchCode).emit('cardFlipped', {
            cardIndex: cardIndex,
            cardSuit: game.board[cardIndex].suit,
            cardValue: game.board[cardIndex].value
        });
        game.board[cardIndex].isFlipped = true;
        game.flippedCards.push({ cardIndex: cardIndex, cardValue: data.cardValue });

        if (game.flippedCards.length === 2) {
            game.isProcessingTurn = true;
            const [card1, card2] = game.flippedCards;

            if (card1.cardValue === card2.cardValue) {
                io.to(matchCode).emit('match', { message: 'ペアが揃いました！' });
                
                game.board[card1.cardIndex].isMatched = true;
                game.board[card2.cardIndex].isMatched = true;

                const currentPlayerKey = game.gameMode === 'two-player' ? `player${game.currentPlayerIndex + 1}` : 'player1';
                game.playerPoints[currentPlayerKey]++;
                
                io.to(matchCode).emit('scoreUpdate', {
                    player: currentPlayerKey,
                    score: game.playerPoints[currentPlayerKey],
                    matchedCards: [card1.cardIndex, card2.cardIndex]
                });
                
                if (isGameOver(game)) {
                    if (game.gameMode === 'two-player') {
                        const player1Score = game.playerPoints.player1;
                        const player2Score = game.playerPoints.player2;

                        if (player1Score > player2Score) {
                            if (game.players[0]) io.to(game.players[0]).emit('gameOver', { message: 'WIN' });
                            if (game.players[1]) io.to(game.players[1]).emit('gameOver', { message: 'LOSE' });
                        } else if (player2Score > player1Score) {
                            if (game.players[0]) io.to(game.players[0]).emit('gameOver', { message: 'LOSE' });
                            if (game.players[1]) io.to(game.players[1]).emit('gameOver', { message: 'WIN' });
                        } else {
                            io.to(matchCode).emit('gameOver', { message: 'DRAW' });
                        }
                    } else {
                        io.to(matchCode).emit('gameOver', { message: 'WIN' });
                    }
                }
                
                game.flippedCards = [];
                game.isProcessingTurn = false;
            } else {
                io.to(matchCode).emit('noMatch', { card1, card2, message: 'ペアではありませんでした。' });

                setTimeout(() => {
                    game.board[card1.cardIndex].isFlipped = false;
                    game.board[card2.cardIndex].isFlipped = false;
                    io.to(matchCode).emit('unflipCards', { cardIndex1: card1.cardIndex, cardIndex2: card2.cardIndex });

                    if (game.gameMode === 'two-player') {
                        game.currentPlayerIndex = (game.currentPlayerIndex + 1) % 2;
                        io.to(matchCode).emit('turnChange', { currentPlayerId: game.players[game.currentPlayerIndex] });
                    }
                    
                    game.flippedCards = [];
                    game.isProcessingTurn = false;
                }, 3000);
            }
        }
    });
});

server.listen(port, () => {
    console.log(`サーバーが http://localhost:${port} で起動しました`);
});