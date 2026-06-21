# Spotify Premium Upgrade System

A decoupled, automated system to sell Spotify Premium family upgrades via the `upgrader.cc` reseller API, with a Telegram Bot front-end and a local Admin Dashboard.

## Features

- **Automated LTC Payments**: Uses a pool of 50 Litecoin addresses rotated chronologically (FIFO).
- **Blockchain Monitoring**: Automatically detects unconfirmed payments and verifies confirmations.
- **Auto-Renewal & Key Release**: Releases the key/slot at upgrader.cc when a subscription expires without renewal.
- **Ersatz anfragen (Replacement flow)**: Handles the Spotify 12-month limit by resetting keys and prompting customers for a fresh account.
- **Local Dashboard**: Add/manage keys, configure pricing packages, view system logs, and generate address pools locally.
- **Secure Encrypted Credentials**: Spotify passwords are encrypted via AES-256-CBC at the app level.

## Folder Structure

- `/database`: Database schema and migration SQL.
- `/telegram-bot`: The main node app (Telegram Bot + Watcher) to run on Render.com.
- `/admin-dashboard`: The local node app for administration (ignored in Git).
- `start-admin.bat`: Click-to-start launcher script for Windows.

## Setup Instructions

### 1. Database Setup
1. Create a project on [Supabase](https://supabase.com).
2. Execute the SQL script in `database/schema.sql` via the Supabase SQL Editor.

### 2. Local Dashboard Configuration
1. Open the `/admin-dashboard` folder.
2. Rename `.env.local.example` to `.env.local` and fill in the parameters (`SUPABASE_URL`, `SUPABASE_KEY`, `ENCRYPTION_KEY`).
3. Derive your LTC address pool by inputting an `xpub` in the dashboard interface.

### 3. Telegram Bot Configuration
1. Open the `/telegram-bot` folder.
2. Rename `.env.example` to `.env` and fill in the credentials.
3. Start the bot on Render.com.
