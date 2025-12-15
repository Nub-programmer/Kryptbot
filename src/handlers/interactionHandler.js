const { EmbedBuilder, MessageFlags } = require("discord.js");
const { isServerOwner } = require("../utils/permissions");
const { validateHuntData } = require("../utils/validation");
const {
        getGuildHunt,
        createGuildHunt,
        deleteGuildHunt,
        getUserProgress,
        updateUserProgress,
        getLeaderboard,
        updateLeaderboard,
        getUserRank,
        getCompletedLevels,
        recordCompletedLevel,
        cleanupDatabaseState,
        isHuntPaused,
        setFirstBloodChannel,
        getFirstBloodChannel,
        checkFirstBlood,
        recordFirstBlood,
} = require("../database/operations");

async function handleInteraction(interaction) {
        if (interaction.isButton()) {
                return handleButtonInteraction(interaction);
        }
        
        if (!interaction.isCommand()) return;

        try {
                const { commandName } = interaction;
                const userId = interaction.user.id;
                const guildId = interaction.guild?.id;

                if (!guildId) {
                        return interaction.reply({
                                content: "This bot can only be used in servers, not in DMs.",
                                flags: MessageFlags.Ephemeral,
                        });
                }

                if (!["setup-hunt", "hunt-status", "help", "delete-hunt", "setup-firstblood"].includes(commandName)) {
                        const guildHunt = await getGuildHunt(guildId);
                        if (!guildHunt) {
                                return interaction.reply({
                                        content: "No active hunt found in this server! Ask an admin to use `/setup-hunt` to create one.",
                                        flags: MessageFlags.Ephemeral,
                                });
                        }
                }

                const pausedCommands = ["hunt", "answer", "hint", "progress", "previous", "leaderboard"];
                if (pausedCommands.includes(commandName)) {
                        const paused = await isHuntPaused(guildId);
                        if (paused) {
                                return interaction.reply({
                                        content: "⏸️ **The hunt is currently paused.**\n\nPlease wait for an admin to resume the hunt. You cannot use hunt commands while the hunt is paused.",
                                        flags: MessageFlags.Ephemeral,
                                });
                        }
                }

                const guildHunt = await getGuildHunt(guildId);
                const huntData = guildHunt?.huntData;
                const userState = huntData ? await getUserProgress(userId, guildId) : null;

                switch (commandName) {
                        case "setup-hunt":
                                return handleSetupHunt(interaction, userId, guildId);

                        case "hunt-status":
                                return handleHuntStatus(interaction, guildId);

                        case "hunt":
                                return handleHunt(interaction, huntData, userState);

                        case "answer":
                                return handleAnswer(interaction, huntData, userState, userId, guildId);

                        case "leaderboard":
                                return handleLeaderboard(interaction, userId, guildId);

                        case "progress":
                                return handleProgress(interaction, huntData, userState, userId, guildId);

                        case "previous":
                                return handlePrevious(interaction, huntData, userId, guildId);

                        case "hint":
                                return handleHint(interaction, huntData, userState, userId, guildId);

                        case "delete-hunt":
                                return handleDeleteHunt(interaction, userId, guildId);

                        case "setup-firstblood":
                                return handleSetupFirstBlood(interaction, userId, guildId);

                        case "help":
                                return handleHelp(interaction);

                        default:
                                return interaction.reply({
                                        content: "Unknown command. Use `/help` for available commands.",
                                        flags: MessageFlags.Ephemeral,
                                });
                }
        } catch (error) {
                console.error("Error handling interaction:", error);

                const errorResponse = {
                        content: "An unexpected error occurred. Please try again later.",
                        flags: MessageFlags.Ephemeral,
                };

                if (interaction.deferred) {
                        return interaction.editReply(errorResponse);
                }
                if (!interaction.replied) {
                        return interaction.reply(errorResponse);
                }
        }
}

async function handleSetupHunt(interaction, userId, guildId) {
        if (!isServerOwner(interaction)) {
                return interaction.reply({
                        content: "Only a server admin can setup hunts!",
                        flags: MessageFlags.Ephemeral,
                });
        }

        const attachment = interaction.options.getAttachment("hunt-file");
        if (!attachment) {
                return interaction.reply({
                        content: "Please provide a valid json with your hunt questions",
                        flags: MessageFlags.Ephemeral,
                });
        }

        if (!attachment.name.endsWith(".json")) {
                return interaction.reply({
                        content: "Please provide a valid JSON file",
                        flags: MessageFlags.Ephemeral,
                });
        }

        if (attachment.size > 1024 * 1024) {
                return interaction.reply({
                        content: "File size too large! Maximum file size is 1MB.",
                        flags: MessageFlags.Ephemeral,
                });
        }

        try {
                await interaction.deferReply({ ephemeral: false });

                const response = await fetch(attachment.url);
                if (!response.ok) {
                        throw new Error(`Failed to fetch file: ${response.status}`);
                }

                const huntData = await response.json();

                const validationErrors = validateHuntData(huntData);
                if (validationErrors.length > 0) {
                        const errorMessage = `**Invalid hunt data:**\n${validationErrors.map((err) => `• ${err}`).join("\n")}`;

                        const exampleEmbed = new EmbedBuilder()
                                .setTitle("Hunt Setup Failed")
                                .setColor("#FF0000")
                                .setDescription(errorMessage)
                                .addFields({
                                        name: "📋 Required JSON Format",
                                        value: '```json\n{\n  "name": "Hunt Name",\n  "description": "Hunt description",\n  "levels": [\n    {\n      "id": 1,\n      "question": "Your question here",\n      "answer": "answer" or ["answer1", "answer2"],\n      "hint": "Optional hint",\n      "points": 100,\n      "image": "https://optional-image-url.com"\n    }\n  ]\n}\n```',
                                })
                                .setFooter({
                                        text: "Check the example-hunt.json file for reference",
                                });

                        return interaction.editReply({ embeds: [exampleEmbed] });
                }

                await cleanupDatabaseState();

                const success = await createGuildHunt(guildId, huntData, userId);
                if (!success) {
                        return interaction.editReply({
                                content: "Failed to save hunt data. Please try again later.",
                        });
                }

                const embed = new EmbedBuilder()
                        .setTitle("Hunt Setup Complete! 🎉")
                        .setColor("#00FF00")
                        .setDescription(
                                `Successfully created "${huntData.name}" with ${huntData.levels.length} levels!`,
                        )
                        .addFields(
                                { name: "Created by", value: `<@${userId}>` },
                                { name: "Total Levels", value: huntData.levels.length.toString() },
                                { name: "Get Started", value: "Use `/hunt` to begin!" },
                        );

                if (huntData.description) {
                        embed.addFields({ name: "Description", value: huntData.description });
                }

                return interaction.editReply({ embeds: [embed] });
        } catch (error) {
                console.error("Error setting up hunt:", error);
                const errorEmbed = new EmbedBuilder()
                        .setTitle("Hunt Setup Error")
                        .setColor("#FF0000")
                        .setDescription("Error processing hunt file. Please check the JSON format.")
                        .addFields({
                                name: "Common Issues",
                                value: "• Invalid JSON syntax\n• Missing required fields\n• File too large\n• Network error downloading file",
                        })
                        .setFooter({
                                text: "Check the example-hunt.json file for reference(if you have selfhosted)",
                        });

                return interaction.editReply({ embeds: [errorEmbed] });
        }
}

async function handleHuntStatus(interaction, guildId) {
        const guildHunt = await getGuildHunt(guildId);

        if (!guildHunt) {
                const embed = new EmbedBuilder()
                        .setTitle("No Active Hunt")
                        .setColor("#FF9900")
                        .setDescription("No active hunt in this server.")
                        .addFields({
                                name: "📋 Example Hunt Format",
                                value: '```json\n{\n  "name": "Cicada",\n  "description": "3301",\n  "levels": [\n    {\n      "id": 1,\n      "question": "Who am i ",\n      "answer": ["cicada", "a cicada"],\n      "hint": "2013 ref",\n      "points": 100\n    }\n  ]\n}\n```',
                        })
                        .setFooter({ text: "Use /setup-hunt to create one!" });

                return interaction.reply({
                        embeds: [embed],
                        flags: MessageFlags.Ephemeral,
                });
        }

        const embed = new EmbedBuilder()
                .setTitle("Hunt Status")
                .setColor("#0099ff")
                .setDescription(`"${guildHunt.huntData.name}" is active in this server!`)
                .addFields(
                        { name: "Total Levels", value: guildHunt.huntData.levels.length.toString() },
                        { name: "Created by", value: `<@${guildHunt.created_by}>` },
                        { name: "Created", value: new Date(guildHunt.created_at).toLocaleDateString() },
                );

        if (guildHunt.huntData.description) {
                embed.addFields({ name: "Description", value: guildHunt.huntData.description });
        }

        return interaction.reply({
                embeds: [embed],
                flags: MessageFlags.Ephemeral,
        });
}

async function handleHunt(interaction, huntData, userState) {
        if (!userState) {
                return interaction.reply({
                        content: "Failed to load your progress. Please try again later.",
                        flags: MessageFlags.Ephemeral,
                });
        }

        const currentLevel = huntData.levels.find((level) => level.id === userState.level);

        if (!currentLevel) {
                return interaction.reply({
                        content: "You have completed all levels! Congratulations! 🎉",
                        flags: MessageFlags.Ephemeral,
                });
        }

        const embed = new EmbedBuilder()
                .setTitle(`Level ${currentLevel.id}`)
                .setDescription(currentLevel.question)
                .setColor("#0099ff")
                .setFooter({
                        text: `Points: ${userState.points} | Good luck!`,
                });

        if (currentLevel.image) {
                embed.setImage(currentLevel.image);
        }

        return interaction.reply({ embeds: [embed] });
}

async function handleAnswer(interaction, huntData, userState, userId, guildId) {
        if (!userState) {
                return interaction.reply({
                        content: "Failed to load your progress. Please try again later.",
                        flags: MessageFlags.Ephemeral,
                });
        }

        const answer = interaction.options.getString("solution")?.trim()?.toLowerCase();

        if (!answer) {
                return interaction.reply({
                        content: "Please provide a valid answer!",
                        flags: MessageFlags.Ephemeral,
                });
        }

        const currentLevel = huntData.levels.find((level) => level.id === userState.level);

        if (!currentLevel) {
                return interaction.reply({
                        content: "You have completed all levels! Congratulations! 🎉",
                        flags: MessageFlags.Ephemeral,
                });
        }

        const correctAnswer = Array.isArray(currentLevel.answer)
                ? currentLevel.answer.map((a) => a.toLowerCase())
                : [currentLevel.answer.toLowerCase()];

        if (correctAnswer.includes(answer)) {
                try {
                        const levelPoints = currentLevel.points || 100;
                        const pointsEarned = levelPoints;

                        const completionTime = Date.now();

                        userState.points += pointsEarned;
                        userState.level++;

                        await updateLeaderboard(guildId, {
                                userId,
                                username: interaction.user.username,
                                points: userState.points,
                                level: userState.level,
                                startTime: userState.startTime,
                                lastCompleted: completionTime,
                        });

                        const progressSaved = await updateUserProgress(userId, guildId, userState);
                        if (!progressSaved) {
                                console.error("Failed to save user progress");
                        }

                        await recordCompletedLevel(userId, guildId, currentLevel.id, completionTime, pointsEarned);

                        console.log(`[FIRST BLOOD] Checking level ${currentLevel.id} for guild ${guildId}`);
                        const existingFirstBlood = await checkFirstBlood(guildId, currentLevel.id);
                        console.log(`[FIRST BLOOD] Existing first blood: ${existingFirstBlood}`);
                        let firstBloodBonus = 0;
                        if (!existingFirstBlood) {
                                console.log(`[FIRST BLOOD] No existing first blood, attempting to record for user ${userId}`);
                                const isFirstBlood = await recordFirstBlood(guildId, currentLevel.id, userId, interaction.user.username);
                                console.log(`[FIRST BLOOD] Record result: ${isFirstBlood}`);
                                
                                if (isFirstBlood) {
                                        firstBloodBonus = 50;
                                        userState.points += firstBloodBonus;
                                        console.log(`[FIRST BLOOD] Awarding ${firstBloodBonus} bonus points to user ${userId}`);
                                        
                                        await updateLeaderboard(guildId, {
                                                userId,
                                                username: interaction.user.username,
                                                points: userState.points,
                                                level: userState.level,
                                                startTime: userState.startTime,
                                                lastCompleted: completionTime,
                                        });
                                        
                                        await updateUserProgress(userId, guildId, userState);
                                        
                                        const firstBloodChannelId = await getFirstBloodChannel(guildId);
                                        console.log(`[FIRST BLOOD] Channel ID: ${firstBloodChannelId}`);
                                        if (firstBloodChannelId) {
                                                try {
                                                        const firstBloodChannel = await interaction.client.channels.fetch(firstBloodChannelId);
                                                        if (firstBloodChannel) {
                                                                const firstBloodEmbed = new EmbedBuilder()
                                                                        .setTitle("🩸 FIRST BLOOD!")
                                                                        .setColor("#FF0000")
                                                                        .setDescription(`**${interaction.user.username}** drew first blood on **Level ${currentLevel.id}**!`)
                                                                        .addFields(
                                                                                { name: "🏆 Hunter", value: `<@${userId}>`, inline: true },
                                                                                { name: "📍 Level", value: `${currentLevel.id}`, inline: true },
                                                                                { name: "💰 Points Earned", value: `${pointsEarned} + 50 bonus = ${pointsEarned + firstBloodBonus}`, inline: true }
                                                                        )
                                                                        .setFooter({ text: "First blood earns +50 bonus points! Be faster next time!" })
                                                                        .setTimestamp();

                                                                await firstBloodChannel.send({
                                                                        content: "@everyone",
                                                                        embeds: [firstBloodEmbed]
                                                                });
                                                                console.log(`[FIRST BLOOD] Announcement sent successfully!`);
                                                        } else {
                                                                console.log(`[FIRST BLOOD] Could not fetch channel`);
                                                        }
                                                } catch (fbError) {
                                                        console.error("[FIRST BLOOD] Error sending announcement:", fbError);
                                                }
                                        } else {
                                                console.log(`[FIRST BLOOD] No first blood channel configured for this guild`);
                                        }
                                }
                        } else {
                                console.log(`[FIRST BLOOD] Level ${currentLevel.id} already has first blood by user ${existingFirstBlood}`);
                        }

                        const nextLevel = huntData.levels.find((level) => level.id === userState.level);
                        const totalEarned = pointsEarned + firstBloodBonus;
                        const firstBloodText = firstBloodBonus > 0 ? ` 🩸 **FIRST BLOOD! +${firstBloodBonus} bonus!**` : "";
                        
                        if (nextLevel) {
                                return interaction.reply({
                                        content: `🎉 ${interaction.user} earned ${totalEarned} points and advanced to level ${nextLevel.id}!${firstBloodText}`,
                                });
                        }
                        return interaction.reply({
                                content: `🎉 ${interaction.user} has completed all levels with a total of ${userState.points} points! Congratulations! 🏆${firstBloodText}`,
                        });
                } catch (error) {
                        console.error("Error processing correct answer:", error);
                        return interaction.reply({
                                content: "An error occurred while processing your answer. Please try again.",
                                flags: MessageFlags.Ephemeral,
                        });
                }
        }
        return interaction.reply({
                content: "❌ Incorrect answer. Try again!",
                flags: MessageFlags.Ephemeral,
        });
}

async function handleLeaderboard(interaction, userId, guildId) {
        try {
                const leaderboardData = await getLeaderboard(guildId);
                if (!leaderboardData || leaderboardData.length === 0) {
                        return interaction.reply({
                                content: "No entries in the leaderboard yet!",
                        });
                }

                const embed = new EmbedBuilder()
                        .setTitle("Cryptic Hunt Leaderboard")
                        .setColor("#FFD700")
                        .setDescription("Top 15 players by points");

                const topPlayers = leaderboardData.slice(0, 15);
                const leaderboardText = topPlayers
                        .map((entry, index) => {
                                const username = entry.username;
                                const level = entry.level - 1;
                                const points = entry.points;

                                const timeAgo = Math.floor((Date.now() - entry.last_completed) / 1000 / 60);
                                const timeDisplay = timeAgo < 60
                                        ? `${timeAgo}m ago`
                                        : `${Math.floor(timeAgo / 60)}h ${timeAgo % 60}m ago`;

                                return `**${index + 1}. ${username}** - Level ${level} - ${points} points (${timeDisplay})`;
                        })
                        .join("\n");

                embed.setDescription(leaderboardText);

                const userRank = leaderboardData.findIndex((entry) => entry.user_id === userId) + 1;
                if (userRank > 0) {
                        embed.setFooter({ text: `Your position: #${userRank}` });
                }

                return interaction.reply({ embeds: [embed] });
        } catch (error) {
                console.error("Error in leaderboard command:", error);
                return interaction.reply({
                        content: "An error occurred while fetching the leaderboard.",
                        flags: MessageFlags.Ephemeral,
                });
        }
}

async function handleProgress(interaction, huntData, userState, userId, guildId) {
        try {
                const completedLevels = userState.level - 1;
                const totalLevels = huntData.levels.length;
                const progressPercent = Math.floor((completedLevels / totalLevels) * 100);

                const userRank = await getUserRank(userId, guildId);
                const completedLevelData = await getCompletedLevels(userId, guildId);

                const embed = new EmbedBuilder()
                        .setTitle("Your Hunt Progress")
                        .setColor("#00FF00")
                        .setDescription(`You are on Level ${userState.level} with ${userState.points} points`)
                        .addFields(
                                { name: "Progress", value: `${completedLevels}/${totalLevels} levels (${progressPercent}%)` },
                                { name: "Leaderboard Rank", value: userRank ? `#${userRank}` : "Not ranked yet" },
                        );

                if (completedLevels > 0) {
                        const firstLevel = completedLevelData[0];
                        const lastLevel = completedLevelData[completedLevelData.length - 1];
                        const totalTime = lastLevel.completed_at - firstLevel.completed_at;
                        const avgMinutes = Math.floor(totalTime / 60000 / completedLevels);

                        embed.addFields({ name: "Average Time per Level", value: `${avgMinutes} minutes` });
                }

                return interaction.reply({
                        embeds: [embed],
                        flags: MessageFlags.Ephemeral,
                });
        } catch (error) {
                console.error("Error in progress command:", error);
                return interaction.reply({
                        content: "An error occurred while fetching your progress.",
                        flags: MessageFlags.Ephemeral,
                });
        }
}

async function handlePrevious(interaction, huntData, userId, guildId) {
        const completedLevels = await getCompletedLevels(userId, guildId);

        if (completedLevels.length === 0) {
                return interaction.reply({
                        content: "You haven't completed any levels yet!",
                        flags: MessageFlags.Ephemeral,
                });
        }

        const embed = new EmbedBuilder()
                .setTitle("Your Completed Questions")
                .setColor("#0099ff");

        const questionsText = completedLevels
                .map((level) => {
                        const levelData = huntData.levels.find((l) => l.id === level.level_id);
                        if (!levelData) return null;

                        const completedAt = new Date(level.completed_at);
                        return `**Level ${level.level_id}** (${level.points_earned} points)\n${levelData.question}\nCompleted: ${completedAt.toLocaleString()}\n`;
                })
                .filter((text) => text !== null)
                .join("\n");

        embed.setDescription(questionsText);

        return interaction.reply({
                embeds: [embed],
                flags: MessageFlags.Ephemeral,
        });
}

async function handleHint(interaction, huntData, userState, userId, guildId) {
        const embed = new EmbedBuilder()
                .setTitle("Nice Try! 😏")
                .setColor("#FF6B6B")
                .setDescription("You really thought there would be hints separately for each person?")
                .setFooter({ text: "Figure it out yourself!" })
                .setTimestamp();

        return interaction.reply({
                embeds: [embed],
                flags: MessageFlags.Ephemeral,
        });
}

async function handleButtonInteraction(interaction) {
        return interaction.reply({
                content: "This button is no longer active.",
                flags: MessageFlags.Ephemeral,
        });
}

async function handleDeleteHunt(interaction, userId, guildId) {
        if (!isServerOwner(interaction)) {
                return interaction.reply({
                        content: "Only server admins can delete hunts!",
                        flags: MessageFlags.Ephemeral,
                });
        }

        const confirmDelete = interaction.options.getBoolean("confirm");
        if (!confirmDelete) {
                return interaction.reply({
                        content: "You must confirm deletion by setting the confirm option to `True`. This action cannot be undone!",
                        flags: MessageFlags.Ephemeral,
                });
        }

        const guildHunt = await getGuildHunt(guildId);
        if (!guildHunt) {
                return interaction.reply({
                        content: "No active hunt found in this server to delete.",
                        flags: MessageFlags.Ephemeral,
                });
        }

        try {
                await interaction.deferReply({ ephemeral: false });

                const success = await deleteGuildHunt(guildId);
                if (!success) {
                        return interaction.editReply({
                                content: "Failed to delete hunt data. Please try again later.",
                        });
                }

                const embed = new EmbedBuilder()
                        .setTitle("Hunt Deleted Successfully! 🗑️")
                        .setColor("#FF6B6B")
                        .setDescription(`The hunt "${guildHunt.huntData.name}" has been completely removed from this server.`)
                        .addFields(
                                { name: "Deleted by", value: `<@${userId}>` },
                                {
                                        name: "What was removed",
                                        value: "• Hunt configuration\n• All user progress\n• Leaderboard data\n• Completed levels history",
                                },
                                { name: "Next steps", value: "Use `/setup-hunt` to create a new hunt!" },
                        )
                        .setFooter({ text: "This action cannot be undone" });

                return interaction.editReply({ embeds: [embed] });
        } catch (error) {
                console.error("Error deleting hunt:", error);
                return interaction.editReply({
                        content: "An error occurred while deleting the hunt. Please try again later.",
                });
        }
}

async function handleHelp(interaction) {
        const embed = new EmbedBuilder()
                .setTitle("Cryptic Hunt Help")
                .setColor("#00FF00")
                .setDescription("Welcome to the Cryptic Hunt! Here's how to play:")
                .addFields(
                        {
                                name: "📝 Player Commands",
                                value: [
                                        "`/hunt` - View your current question",
                                        "`/answer <solution>` - Submit an answer",
                                        "`/progress` - Check your progress",
                                        "`/leaderboard` - View top players",
                                        "`/previous` - View your solved questions",
                                ].join("\n"),
                        },
                        {
                                name: "⚙️ Admin Commands",
                                value: [
                                        "`/setup-hunt` - Setup a new hunt (Admin only)",
                                        "`/setup-firstblood` - Set first blood announcement channel",
                                        "`/hunt-status` - Check if hunt is active",
                                        "`/delete-hunt` - Delete hunt and all data (Admin only)",
                                ].join("\n"),
                        },
                        {
                                name: "🎮 How to Play",
                                value: "Solve puzzles to advance through levels. Each correct answer earns you points. Good luck!",
                        },
                );

        return interaction.reply({
                embeds: [embed],
                flags: MessageFlags.Ephemeral,
        });
}

async function handleSetupFirstBlood(interaction, userId, guildId) {
        if (!isServerOwner(interaction)) {
                return interaction.reply({
                        content: "Only a server admin can setup first blood channel!",
                        flags: MessageFlags.Ephemeral,
                });
        }

        const channel = interaction.options.getChannel("channel");
        if (!channel) {
                return interaction.reply({
                        content: "Please provide a valid channel!",
                        flags: MessageFlags.Ephemeral,
                });
        }

        if (channel.type !== 0) {
                return interaction.reply({
                        content: "Please select a text channel for first blood announcements!",
                        flags: MessageFlags.Ephemeral,
                });
        }

        try {
                const success = await setFirstBloodChannel(guildId, channel.id, userId);
                
                if (!success) {
                        return interaction.reply({
                                content: "Failed to setup first blood channel. Please try again.",
                                flags: MessageFlags.Ephemeral,
                        });
                }

                const embed = new EmbedBuilder()
                        .setTitle("🩸 First Blood Channel Set!")
                        .setColor("#FF0000")
                        .setDescription(`First blood announcements will now be sent to ${channel}`)
                        .addFields(
                                { name: "Channel", value: `<#${channel.id}>`, inline: true },
                                { name: "Setup by", value: `<@${userId}>`, inline: true },
                                { name: "How it works", value: "When someone is the first to solve a level, everyone will be pinged in the first blood channel with an announcement!" }
                        )
                        .setFooter({ text: "May the fastest hunter win!" })
                        .setTimestamp();

                return interaction.reply({ embeds: [embed] });
        } catch (error) {
                console.error("Error setting up first blood channel:", error);
                return interaction.reply({
                        content: "An error occurred while setting up first blood. Please try again.",
                        flags: MessageFlags.Ephemeral,
                });
        }
}

module.exports = { handleInteraction };
