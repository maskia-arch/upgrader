const dns = require('dns');
if (typeof dns.setDefaultResultOrder === 'function') {
  dns.setDefaultResultOrder('ipv4first');
}

const express = require('express');
const path = require('path');
const config = require('./config');
const { initializeDatabase } = require('./db');
const routes = require('./routes');

const app = express();

// Host-matching middleware for the Telegram Mini App subdomain placeholder
app.use((req, res, next) => {
  const host = req.headers.host || '';
  if (host.toLowerCase().includes('upgrader.autoacts.link')) {
    res.setHeader('Content-Type', 'text/html');
    return res.status(200).send(`
      <!DOCTYPE html>
      <html lang="de">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Upgrader Mini App - Coming Soon</title>
          <style>
              body {
                  margin: 0;
                  padding: 0;
                  display: flex;
                  justify-content: center;
                  align-items: center;
                  min-height: 100vh;
                  background: #0f0c1b;
                  color: #ffffff;
                  font-family: system-ui, -apple-system, sans-serif;
                  text-align: center;
              }
              .container {
                  padding: 2.5rem;
                  border-radius: 16px;
                  background: rgba(255, 255, 255, 0.02);
                  backdrop-filter: blur(12px);
                  border: 1px solid rgba(255, 255, 255, 0.08);
                  max-width: 400px;
                  box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.5);
              }
              h1 {
                  font-size: 1.8rem;
                  margin-bottom: 1rem;
                  background: linear-gradient(135deg, #a855f7, #ec4899);
                  -webkit-background-clip: text;
                  -webkit-text-fill-color: transparent;
              }
              p {
                  color: #94a3b8;
                  font-size: 1rem;
                  line-height: 1.6;
                  margin: 0;
              }
              .badge {
                  display: inline-block;
                  padding: 0.35rem 0.85rem;
                  border-radius: 9999px;
                  background: rgba(168, 85, 247, 0.1);
                  color: #c084fc;
                  font-size: 0.85rem;
                  font-weight: 600;
                  margin-bottom: 1.5rem;
                  border: 1px solid rgba(168, 85, 247, 0.2);
              }
          </style>
      </head>
      <body>
          <div class="container">
              <div class="badge">Mini App</div>
              <h1>Coming Soon</h1>
              <p>Der Inhalt für diese Telegram Mini App befindet sich aktuell in Vorbereitung und wird bald verfügbar sein.</p>
          </div>
      </body>
      </html>
    `);
  }
  next();
});

// Parse request bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static dashboard assets
app.use(express.static(path.join(__dirname, '../public')));

// Register API routes
app.use('/api', routes);

// Serve single-page dashboard HTML for any other route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Start server after database is fully initialized
async function start() {
  try {
    console.log('[SYSTEM] Initializing database schema...');
    await initializeDatabase();
    console.log('[SYSTEM] Database initialization completed successfully.');

    app.listen(config.port, () => {
      console.log(`==================================================`);
      console.log(`Spotify Premium Upgrade - Local Admin Dashboard`);
      console.log(`Server listening on: http://localhost:${config.port}`);
      console.log(`==================================================`);
    });
  } catch (err) {
    console.error('[SYSTEM CRITICAL] Database initialization failed. Exiting...', err);
    process.exit(1);
  }
}

start();
