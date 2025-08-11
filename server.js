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
    // const values = ['A'];

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
                playerPoints: { player1: 0, player2: 0 },
                players: [socket.id]
            };
            socket.join(gameId);
            socket.emit('startGame', { mode: 'single', shuffledDeck: games[gameId].board });
        }
    });

    socket.on('joinMatch', (data) => {
        const matchCode = data.matchCode;
        let game = games[matchCode];

        if (!game) {
            games[matchCode] = {
                gameMode: 'two-player',
                players: [socket.id],
                board: createAndShuffleDeck(),
                flippedCards: [],
                isProcessingTurn: false,
                currentPlayerIndex: 0,
                playerPoints: { player1: 0, player2: 0 },
                replayVotes: [],
                winCounts: { player1: 0, player2: 0 }
            };
            socket.join(matchCode);
            socket.emit('matchingStatus', { message: 'プレイヤーを待っています...' });
        } else if (game.players.length === 1 && !game.players.includes(socket.id)) {
            game.players.push(socket.id);
            socket.join(matchCode);
            
            game.currentPlayerIndex = Math.floor(Math.random() * 2);

            io.to(matchCode).emit('matchFound', {
                playerCount: 2,
                shuffledDeck: game.board,
                winCounts: game.winCounts
            });
            io.to(matchCode).emit('turnChange', { currentPlayerId: game.players[game.currentPlayerIndex] });

            game.players.forEach((playerId, index) => {
                io.to(playerId).emit('playerNumber', { playerNumber: index + 1 });
            });
        } else {
            socket.emit('matchingStatus', { message: 'この部屋は満員です。' });
        }
    });

    socket.on('replayGame', () => {
        const matchCode = Array.from(socket.rooms).find(room => games[room] && games[room].gameMode === 'two-player');
        if (!matchCode) return;
        
        const game = games[matchCode];

        if (!game.replayVotes.includes(socket.id)) {
            game.replayVotes.push(socket.id);
            io.to(matchCode).emit('matchingStatus', { message: `もう一度プレイを希望: ${game.replayVotes.length} / 2` });
        }

        if (game.replayVotes.length === 2) {
            game.board = createAndShuffleDeck();
            game.flippedCards = [];
            game.isProcessingTurn = false;
            game.currentPlayerIndex = Math.floor(Math.random() * 2);
            game.playerPoints = { player1: 0, player2: 0 };
            game.replayVotes = [];
            
            io.to(matchCode).emit('startReplay', {
                shuffledDeck: game.board,
                playerCount: 2,
                winCounts: game.winCounts
            });
            io.to(matchCode).emit('turnChange', { currentPlayerId: game.players[game.currentPlayerIndex] });

            game.players.forEach((playerId, index) => {
                io.to(playerId).emit('playerNumber', { playerNumber: index + 1 });
            });
        }
    });

    socket.on('disconnect', () => {
        console.log('プレイヤーが切断しました:', socket.id);
        for (const matchCode in games) {
            const game = games[matchCode];
            if (game.players && game.players.includes(socket.id)) {
                game.players = game.players.filter(id => id !== socket.id);
                if (game.replayVotes) {
                    game.replayVotes = game.replayVotes.filter(id => id !== socket.id);
                }
                
                if (game.players.length === 0) {
                    delete games[matchCode];
                } else if (game.players.length === 1) {
                    io.to(matchCode).emit('playerLeft');
                    io.to(matchCode).emit('updatePlayers', { playerCount: game.players.length });
                    delete games[matchCode];
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
                            game.winCounts.player1++;
                            if (game.players[0]) io.to(game.players[0]).emit('gameOver', { message: 'WIN', winCounts: game.winCounts });
                            if (game.players[1]) io.to(game.players[1]).emit('gameOver', { message: 'LOSE', winCounts: game.winCounts });
                        } else if (player2Score > player1Score) {
                            game.winCounts.player2++;
                            if (game.players[0]) io.to(game.players[0]).emit('gameOver', { message: 'LOSE', winCounts: game.winCounts });
                            if (game.players[1]) io.to(game.players[1]).emit('gameOver', { message: 'WIN', winCounts: game.winCounts });
                        } else {
                            io.to(matchCode).emit('gameOver', { message: 'DRAW', winCounts: game.winCounts });
                        }
                    } else {
                        io.to(matchCode).emit('gameOver', { message: 'WIN', winCounts: game.winCounts });
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

                    if (game.gameMode === 'two-player' && game.players.length === 2) {
                        game.currentPlayerIndex = (game.currentPlayerIndex + 1) % 2;
                        io.to(matchCode).emit('turnChange', { currentPlayerId: game.players[game.currentPlayerIndex] });
                    }
                    
                    game.flippedCards = [];
                    game.isProcessingTurn = false;
                }, 2000);
            }
        }
    });
});

server.listen(port, () => {
    console.log(`サーバーが http://localhost:${port} で起動しました`);
});