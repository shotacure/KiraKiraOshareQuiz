#!/usr/bin/env node
/**
 * Quiz Data Loader
 * 
 * Usage:
 *   node scripts/load-quizzes.mjs <websocket-url> <admin-secret> <quiz-json-file>
 * 
 * Example:
 *   node scripts/load-quizzes.mjs wss://xxx.execute-api.ap-northeast-1.amazonaws.com/prod mysecret sample-data/quizzes.json
 */

import { readFileSync } from 'fs';
import { WebSocket } from 'ws'; // npm install ws

const [,, wsUrl, secret, quizFile] = process.argv;

if (!wsUrl || !secret || !quizFile) {
  console.error('Usage: node scripts/load-quizzes.mjs <websocket-url> <admin-secret> <quiz-json-file>');
  process.exit(1);
}

const quizData = JSON.parse(readFileSync(quizFile, 'utf-8'));

const ws = new WebSocket(wsUrl);

ws.on('open', () => {
  console.log('Connected to WebSocket');

  // Authenticate as admin
  ws.send(JSON.stringify({
    action: 'connect_role',
    role: 'admin',
    secret,
  }));
});

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  console.log('Received:', msg.event);

  if (msg.event === 'full_state') {
    console.log('Authenticated as admin. Loading quizzes...');
    ws.send(JSON.stringify({
      action: 'load_quizzes',
      quizzes: quizData.quizzes,
    }));
  }

  if (msg.event === 'quizzes_loaded') {
    console.log(`✅ ${msg.count} quizzes loaded successfully!`);
    ws.close();
  }

  if (msg.event === 'error') {
    console.error(`❌ Error: ${msg.message}`);
    ws.close();
    process.exit(1);
  }
});

ws.on('error', (err) => {
  console.error('WebSocket error:', err.message);
  process.exit(1);
});

ws.on('close', () => {
  console.log('Connection closed');
  process.exit(0);
});
