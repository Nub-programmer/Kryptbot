const { SlashCommandBuilder } = require("discord.js");

const commands = [
        new SlashCommandBuilder()
                .setName("hunt")
                .setDescription("Get your current cryptic hunt question"),

        new SlashCommandBuilder()
                .setName("answer")
                .setDescription("Submit an answer for your current level")
                .addStringOption((option) =>
                        option
                                .setName("solution")
                                .setDescription("Your answer")
                                .setRequired(true),
                ),

        new SlashCommandBuilder()
                .setName("leaderboard")
                .setDescription("View the hunt leaderboard"),

        new SlashCommandBuilder()
                .setName("progress")
                .setDescription("Check your hunt progress"),

        new SlashCommandBuilder()
                .setName("hint")
                .setDescription("Request a hint for your current level"),

        new SlashCommandBuilder()
                .setName("help")
                .setDescription("Get information about how to play the hunt"),

        new SlashCommandBuilder()
                .setName("previous")
                .setDescription("View your previously completed questions"),

        new SlashCommandBuilder()
                .setName("setup-hunt")
                .setDescription("Setup a new hunt for your server (Admin only)")
                .addAttachmentOption((option) =>
                        option
                                .setName("hunt-file")
                                .setDescription("JSON file containing hunt data")
                                .setRequired(true),
                ),

        new SlashCommandBuilder()
                .setName("hunt-status")
                .setDescription("Check if a hunt is active in this server"),

        new SlashCommandBuilder()
                .setName("delete-hunt")
                .setDescription("Delete the current hunt and all progress (Admin only)")
                .addBooleanOption((option) =>
                        option
                                .setName("confirm")
                                .setDescription("Confirm deletion - this cannot be undone!")
                                .setRequired(true),
                ),

        new SlashCommandBuilder()
                .setName("setup-firstblood")
                .setDescription("Set the channel for first blood announcements (Admin only)")
                .addChannelOption((option) =>
                        option
                                .setName("channel")
                                .setDescription("The channel where first blood will be announced")
                                .setRequired(true),
                ),
];

function registerCommands(client) {
        client.guilds.cache.forEach(guild => {
                guild.commands.set(commands)
                        .then(() => console.log(`Slash commands registered for guild: ${guild.name}`))
                        .catch(error => console.error(`Error registering commands for ${guild.name}:`, error));
        });
        console.log("Slash commands registered for all guilds (instant registration)");
}

module.exports = {
        commands,
        registerCommands,
};
