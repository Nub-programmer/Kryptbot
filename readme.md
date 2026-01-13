 # KryptixBot - Discord Cryptic Hunt Bot 

> A discord bot letting anyone run a cryptic hunt in their server

##  What is KryptixBot?

KryptixBot is a Discord bot designed for Kryptix2k25 that lets server admins create custom cryptic hunts for their servers. This includes common hunt features like hints and leaderboards and point system. Code can be customized for different types of hunts though it's good practice to use cdn links for images and links in questions to ensure they are accessible to all players.

> Built for Kryptix2k25 event with features like hints, progress tracking, and leaderboard system. This version supports multi-server deployment so the bot can run in multiple Discord servers simultaneously.

## Features
- Make your own hunt with easy to use JSON format (easy to format with an llm)
- support for hints & images
- Leaderboard tracking based on points
- admin suite for managing hunts
- statistical tracking for players
- takes 1/2 minutes to selfhost 
- literally sqlite so no need for a database server

## 🚀 Getting Started

### Prerequisites
- Node.js (v16 or higher)
- A Discord bot 

### Installation
1. Clone this repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a .env file with your bot token:
   ```bash
   DISCORD_TOKEN= GET FROM https://discord.com/developers/applications
   ```
4. Start the bot:
   ```bash
   node index.js
   ```

### Setting Up Your First Hunt

1. **Create your hunt file** - Check out `example-hunt.json` for reference
2. **Upload it** - Use `/setup-hunt` and attach your JSON file
3. **Start hunting** -  Use `/hunt` to start hunting

## 📝 Commands

### Player Commands
- `/hunt` - current question starter
- `/answer <solution>` - submit answer
- `/hint` - Get a hint (20% points cut tho)
- `/progress` - Check your progress and stats
- `/leaderboard` - Check top 15 hunters
- `/previous` - Review your completed questions
- `/help` - Get help and command info

### Admin Commands
- `/setup-hunt` - Upload a new hunt file 
- `/hunt-status` - Check if a hunt is active in your server
- `delete-hunt` - Delete the current hunt

## 🎮 Creating Hunt Files

Hunt files are JSON documents that define your cryptic hunt. Here's the basic structure:

```json
{
  "name": "cIcAdA ",
  "description": "3301",
  "levels": [
    {
      "id": 1,
      "question": "hE WHO FOUND IT",
      "answer": ["keyboard", "a keyboard"],
      "hint": "You use it to type",
      "points": 100,
      "image": "https://example.com/image.jpg"
    }
  ]
}
```

### Required Fields
- `name`: Hunts name
- `levels`: Array of level objects
- `id`: Id for each level (must be unique)
- `question`: The provided starter
- `answer`: String or array of answers (case-insensitive)

### Optional Fields
- `description`: Hunt description (useful for context)
- `hint`: A helpful hint for the level (optional for each lvl)
- `points`: The points for tha question (by default 100)
- `image`: Incase you want to add an image directly. Or use a cdn link 

## Scoring -
The admin set's a questions point value and players can earn points by answering correctly.Using a hint takes away 20% of that (eg if a question is worth 100 points, using a hint will reduce the score to 80 points).Leaderboard shows the top 15 players based on points earned.
Imo this is better than prior approaches used where number of questions was taken into account for lb which caused too many ties.




## 🔧 Troubleshooting / Common Issues

**Bot not responding?**
- Check your bot token is correct
- Ensure the bot has proper permissions in your server
- Verify the `data` folder exists

**Hunt upload failing?**
- Validate your JSON syntax
- Check all required fields are present
- Ensure file size is under 1MB

**Database errors?**
- Make sure the `data` folder is writable
- Restart the bot to trigger database migration
- try deleting the `data/hunt.db` file to reset the database (this will delete all hunt data)

### License
This project is licensed under the GNU AGPLV3 License - see the [LICENSE](LICENSE) file for details.
