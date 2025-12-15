const client = require("./src/client");
const { DISCORD_TOKEN } = require("./src/config");
const { initializeDatabase, closeDatabase } = require("./src/database/connection");
const { registerCommands } = require("./src/commands/definitions");
const { handleInteraction } = require("./src/handlers/interactionHandler");
const { handleMessage } = require("./src/handlers/messageHandler");

initializeDatabase();

client.once("ready", () => {
        console.log(`Logged in as ${client.user.tag}`);
        registerCommands(client);
});

client.on("interactionCreate", handleInteraction);
client.on("messageCreate", handleMessage);

function cleanup() {
        console.log("Cleaning up...");
        closeDatabase()
                .then(() => process.exit(0))
                .catch(() => process.exit(1));
}

process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);
process.on("uncaughtException", (error) => {
        console.error("Uncaught exception:", error);
        cleanup();
});

client.login(DISCORD_TOKEN);
