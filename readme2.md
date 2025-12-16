# KryptixBot - Discord Cryptic Hunt Bot

## Overview

KryptixBot is a Discord bot that enables server administrators to create and run custom cryptic hunts (puzzle/riddle competitions) within their Discord servers. Players progress through sequential levels by solving riddles, puzzles, and cryptographic challenges. The bot tracks individual progress, awards points, provides hints with penalties, and maintains server-wide leaderboards.

## User Preferences

Preferred communication style: Simple, everyday language.
## Features
- Make your own hunt with easy to use JSON format (easy to format with an llm)
- support for hints & images
- Leaderboard tracking based on points
- admin suite for managing hunts
- statistical tracking for players
- takes 1/2 minutes to selfhost 
- literally sqlite so no need for a database server

## System Architecture

### Core Technology Stack

**Runtime Environment**
- Node.js v16+ with JavaScript
- Discord.js v14.18.0 for Discord API interactions
- SQLite3 v5.1.7 for local data persistence
- dotenv v17.2.0 for environment configuration

**Architectural Pattern**

The application follows a modular, event-driven architecture organized around Discord bot patterns:

**Entry Point** (`index.js`)
- Minimal bootstrap layer that initializes database connections
- Registers Discord event listeners (ready, interactionCreate, messageCreate)
- Implements graceful shutdown handlers for SIGINT, SIGTERM, and uncaught exceptions
- Ensures database cleanup on process exit

**Modular Organization** (`src/` directory structure)
- `client.js`: Discord client initialization with gateway intents (Guilds, GuildMessages, MessageContent)
- `config/`: Centralized configuration management using environment variables and owner whitelist
- `database/`: Database connection pooling and all CRUD operations
- `commands/`: Slash command definitions using Discord.js SlashCommandBuilder pattern
- `handlers/`: Event handlers separated by interaction type (slash commands vs prefix commands)
- `utils/`: Validation logic and permission checking utilities
- `data/`: Static gamification content (trivia challenges, hint examples)

**Event-Driven Design**

The bot responds to three primary Discord events:
1. `ready`: One-time initialization for command registration
2. `interactionCreate`: Handles slash commands and button interactions (player-facing features)
3. `messageCreate`: Handles prefix commands (admin-only features with `k` prefix)

**Command Architecture**

Two distinct command systems serve different user roles:

*Slash Commands (Player & Admin)*
- `/hunt` - Display current level question
- `/answer` - Submit answer for current level
- `/hint` - Request hint with point penalty
- `/leaderboard` - View server rankings
- `/progress` - Check personal progress
- `/previous` - View completed questions
- `/setup-hunt` - Admin: Upload hunt JSON file
- `/hunt-status` - Check active hunt status
- `/help` - Display bot usage information

*Prefix Commands (Owner-only)*
- `k!help` - Admin command reference
- `k!answers` - View all answers for debugging
- `k!leads` - Display hint strategy examples
- `k!fun` - Show gamification activities
- `k!add <user> <points>` - Manually adjust user points
- `k!pause` - Pause the hunt (blocks all player commands)
- `k!con` - Continue/resume the hunt

**Permission Model**

Three-tier permission system:
1. **Bot Owners**: Hardcoded whitelist in `owners.json` (5 users) with access to prefix commands
2. **Server Administrators**: Users with Administrator permission or server ownership can use `/setup-hunt`
3. **Players**: All users can access gameplay slash commands

### Data Storage Architecture

**SQLite Database** (`data/hunt.db`)

The application uses a single-file SQLite database with the following schema:

**Tables**

1. `guild_hunts` - Hunt configurations per Discord server
   - `guild_id` (PRIMARY KEY): Discord server identifier
   - `hunt_data` (TEXT/JSON): Complete hunt structure (questions, answers, hints, points)
   - `created_by` (TEXT): User ID who created the hunt
   - `created_at` (INTEGER): Unix timestamp
   - `active` (INTEGER): Boolean flag (1 = active, 0 = inactive)

2. `user_progress` - Individual player progress tracking
   - `user_id` (TEXT): Discord user identifier
   - `guild_id` (TEXT): Discord server identifier
   - `level` (INTEGER): Current level number
   - `points` (INTEGER): Total points earned
   - `hint_used` (TEXT): Comma-separated list of levels where hints were used
   - `start_time` (INTEGER): Unix timestamp of hunt start
   - PRIMARY KEY: (user_id, guild_id)

3. `completed_levels` - History of completed levels
   - `user_id` (TEXT): Discord user identifier
   - `guild_id` (TEXT): Discord server identifier
   - `level_id` (INTEGER): Completed level number
   - `completed_at` (INTEGER): Unix timestamp
   - `points_earned` (INTEGER): Points awarded for this level
   - FOREIGN KEY: (user_id, guild_id) references user_progress

4. `leaderboard` - Cached leaderboard data
   - `user_id` (TEXT): Discord user identifier
   - `guild_id` (TEXT): Discord server identifier
   - `username` (TEXT): Display name
   - `points` (INTEGER): Total points
   - `level` (INTEGER): Current level
   - `start_time` (INTEGER): Hunt start timestamp

5. `hunt_paused` - Hunt pause state per server
   - `guild_id` (TEXT PRIMARY KEY): Discord server identifier
   - `paused` (INTEGER): Boolean flag (1 = paused, 0 = active)
   - `paused_by` (TEXT): User ID who paused/resumed
   - `paused_at` (INTEGER): Unix timestamp

**Data Flow**

Hunt creation flow:
1. Admin uploads JSON file via `/setup-hunt`
2. Validation checks structure, field types, and constraints
3. Hunt data stored as serialized JSON in `guild_hunts` table
4. Previous hunt data (if any) is deleted, resetting all player progress

Gameplay flow:
1. Player uses `/hunt` to retrieve current question from hunt JSON
2. Player submits answer via `/answer`
3. Answer validation (case-insensitive, supports multiple correct answers)
4. On correct answer:
   - `user_progress` updated (increment level, add points)
   - `completed_levels` record inserted
   - `leaderboard` cache updated
5. On wrong answer: No state change, player retries

**Hunt Data Format**

Hunts are defined in JSON files with this structure:
```json
{
  "name": "Hunt Name",
  "description": "Hunt description",
  "levels": [
    {
      "id": 1,
      "question": "Question text",
      "answer": ["answer1", "answer2"],  // Array or single string
      "hint": "Hint text",
      "points": 100,
      "image": "https://optional-image-url.com/image.png"
    }
  ]
}
```

**Validation Rules**
- Maximum 100 levels per hunt
- Level IDs must be unique and between 1-1000
- Questions limited to 2000 characters
- Answers can be array (multiple accepted answers) or string (single answer)
- Points must be positive integers
- Image URLs optional

### Game Mechanics

**Hint System**

Dynamic penalty calculation:
- Base penalty: 20% of level points
- Scaling penalty: +5% per level (capped at 50%)
- Formula: `min(20 + (level - 1) * 5, 50)%`
- Hints tracked per-user to prevent multiple penalties on same level

**Point System**
- Points defined per level in hunt JSON
- Reduced by hint penalty if hint requested
- Manually adjustable by bot owners via `k!add` command
- Leaderboard ranked by total points (tiebreaker: completion time)

**Progress Tracking**
- Linear progression (must complete levels sequentially)
- Cannot skip levels
- Can view previous questions via `/previous`
- Hunt completion requires finishing all defined levels

## External Dependencies

### Third-Party Services

**Discord Platform**
- Discord API via discord.js library
- Requires bot token from Discord Developer Portal
- Uses Gateway v10 with three intents: Guilds, GuildMessages, MessageContent
- Slash commands registered globally via REST API

### Runtime Dependencies

**Production Dependencies**
- `discord.js` (v14.18.0): Discord API client library with builders, collections, and REST utilities
- `sqlite3` (v5.1.7): Native SQLite3 bindings for Node.js
- `dotenv` (v17.2.0): Environment variable loader from `.env` file

**Development Dependencies**
- `nodemon` (v3.1.9): Auto-restart development server on file changes
- `typescript` (v5.2.2): Type definitions (unused in current JavaScript codebase)

### Configuration Requirements

**Environment Variables** (`.env` file)
- `DISCORD_TOKEN`: Bot authentication token from Discord Developer Portal

**Static Configuration** (`src/config/owners.json`)
- Hardcoded list of bot owner Discord user IDs with admin privileges
- Currently contains 5 whitelisted users

### File System Dependencies

**Database Storage**
- SQLite database file located at `data/hunt.db`
- Created automatically if missing
- Requires read/write permissions

**Hunt Definition Files**
- JSON files uploaded as Discord attachments
- Parsed and validated before storage
- Examples provided: `example-hunt.json`, `hunt.json`
