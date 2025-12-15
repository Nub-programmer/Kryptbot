const { EmbedBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");
const { PREFIX } = require("../config");
const { isAllowedOwner } = require("../utils/permissions");
const { getGuildHunt, getUserProgress, updateUserProgress, updateLeaderboard, getLeaderboard, deleteGuildHunt, isHuntPaused, setHuntPaused, kickUserFromHunt } = require("../database/operations");
const leadExamples = require("../data/leadExamples");

function loadFunQuestions() {
        const filePath = path.join(__dirname, "../../fun-questions.json");
        try {
                const data = fs.readFileSync(filePath, "utf8");
                return JSON.parse(data);
        } catch (error) {
                console.error("Error loading fun-questions.json:", error);
                return null;
        }
}

function loadDares() {
        const filePath = path.join(__dirname, "../../dares.json");
        try {
                const data = fs.readFileSync(filePath, "utf8");
                return JSON.parse(data);
        } catch (error) {
                console.error("Error loading dares.json:", error);
                return null;
        }
}

async function handleMessage(message) {
        if (message.author.bot) return;

        const content = message.content.toLowerCase();
        if (!content.startsWith(PREFIX.toLowerCase())) return;

        if (!isAllowedOwner(message.author.id)) {
                return;
        }

        const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
        const command = args.shift()?.toLowerCase();
        const guildId = message.guild?.id;

        if (!guildId) {
                return message.reply("This command can only be used in servers.");
        }

        try {
                switch (command) {
                        case "help":
                                return handleHelp(message);

                        case "answers":
                                return handleAnswers(message, guildId);

                        case "leads":
                                return handleLeads(message);

                        case "fun":
                                return handleFun(message, args);

                        case "funanswer":
                                return handleFunAnswer(message, args);

                        case "dare":
                                return handleDare(message, args);

                        case "add":
                                return handleAddPoints(message, args, guildId);

                        case "remove":
                                return handleRemovePoints(message, args, guildId);

                        case "end":
                                return handleEnd(message, guildId);

                        case "pause":
                                return handlePause(message, guildId);

                        case "con":
                                return handleContinue(message, guildId);

                        case "kick":
                                return handleKick(message, args, guildId);

                        default:
                                await message.reply(`Unknown command. Use \`${PREFIX}help\` to see available commands.`);
                }
        } catch (error) {
                console.error("Error handling prefix command:", error);
                await message.reply("An error occurred while processing the command.");
        }
}

async function handleHelp(message) {
        const helpEmbed = new EmbedBuilder()
                .setColor(0x9B59B6)
                .setTitle("🔐 KryptixBot Owner Commands")
                .setDescription("These commands are only available to authorized owners/admins.")
                .addFields(
                        {
                                name: "📋 Available Commands",
                                value: [
                                        "`khelp` - Show this help message",
                                        "`kanswers` - View all hunt questions and answers",
                                        "`kleads` - Learn how to give leads to contestants",
                                        "`kfun` - Show a random fun challenge",
                                        "`kfun <id>` - Show a specific fun challenge by ID",
                                        "`kfun @user` - Show a fun challenge for a specific user",
                                        "`kfunanswer` - View all fun question answers",
                                        "`kfunanswer <id>` - View answer for specific question",
                                        "`kdare` - Show a random dare challenge (300 pts)",
                                        "`kdare <id>` - Show a specific dare by ID",
                                        "`kdare @user` - Show a dare for a specific user",
                                        "`kadd <points> @user` - Add points to a user",
                                        "`kremove <points> @user` - Remove points from a user",
                                        "`kpause` - Pause the hunt (blocks all player commands)",
                                        "`kcon` - Continue/resume the hunt",
                                        "`kkick @user` - Remove a user from the hunt (they must restart)",
                                        "`kend` - End the hunt and show final results (Admin only)"
                                ].join("\n")
                        },
                        {
                                name: "⚠️ Important Notes",
                                value: [
                                        "• All commands use prefix `k` or `K`",
                                        "• Only authorized owners can use these",
                                        "• Use `kanswers` and `kfunanswer` carefully - don't spoil!",
                                        "• Edit `fun-questions.json` to add/modify fun challenges",
                                        "• Edit `dares.json` to add/modify dare challenges",
                                        "• `kpause`, `kcon`, `kend` can only be used by the main admin"
                                ].join("\n")
                        }
                )
                .setFooter({ text: "Kryptix2k25 - Owner Panel" })
                .setTimestamp();

        await message.reply({ embeds: [helpEmbed] });
}

async function handleAnswers(message, guildId) {
        const guildHunt = await getGuildHunt(guildId);

        if (!guildHunt) {
                return message.reply("❌ No active hunt found in this server. Use `/setup-hunt` first.");
        }

        const huntData = guildHunt.huntData;
        const answersEmbed = new EmbedBuilder()
                .setColor(0xE74C3C)
                .setTitle(`🔑 ${huntData.name} - All Answers`)
                .setDescription("**⚠️ CONFIDENTIAL - Do not share with contestants!**")
                .setFooter({ text: "Kryptix2k25 - Answer Key" })
                .setTimestamp();

        let answersList = "";
        for (const level of huntData.levels) {
                const answers = Array.isArray(level.answer) ? level.answer.join(", ") : level.answer;
                answersList += `**Level ${level.id}** (${level.points} pts)\n`;
                answersList += `Q: ${level.question.substring(0, 50)}${level.question.length > 50 ? "..." : ""}\n`;
                answersList += `A: \`${answers}\`\n\n`;
        }

        if (answersList.length > 4000) {
                const chunks = [];
                let currentChunk = "";
                const lines = answersList.split("\n\n");

                for (const line of lines) {
                        if ((currentChunk + line + "\n\n").length > 1900) {
                                chunks.push(currentChunk);
                                currentChunk = line + "\n\n";
                        } else {
                                currentChunk += line + "\n\n";
                        }
                }
                if (currentChunk) chunks.push(currentChunk);

                await message.reply({ embeds: [answersEmbed] });
                for (let i = 0; i < chunks.length; i++) {
                        const chunkEmbed = new EmbedBuilder()
                                .setColor(0xE74C3C)
                                .setTitle(`📄 Answers (Part ${i + 1}/${chunks.length})`)
                                .setDescription(chunks[i]);
                        await message.channel.send({ embeds: [chunkEmbed] });
                }
        } else {
                answersEmbed.setDescription("**⚠️ CONFIDENTIAL - Do not share with contestants!**\n\n" + answersList);
                await message.reply({ embeds: [answersEmbed] });
        }
}

async function handleLeads(message) {
        const leadsEmbed = new EmbedBuilder()
                .setColor(0x3498DB)
                .setTitle("📍 How to Give Leads to Contestants")
                .setDescription("Use these techniques to help stuck contestants without giving away answers directly.")
                .setFooter({ text: "Kryptix2k25 - Lead Guide" })
                .setTimestamp();

        for (const lead of leadExamples) {
                leadsEmbed.addFields({
                        name: `💡 ${lead.type}`,
                        value: [
                                `**What:** ${lead.description}`,
                                `**Example:** "${lead.example}"`,
                                `**When:** ${lead.when}`
                        ].join("\n"),
                        inline: false
                });
        }

        leadsEmbed.addFields({
                name: "🎯 Pro Tips",
                value: [
                        "• Start with subtle hints, escalate if needed",
                        "• Never give the exact answer directly",
                        "• Encourage them to think differently",
                        "• Use `kfun` to give them a chance to earn hints",
                        "• Remember: the goal is to guide, not solve"
                ].join("\n")
        });

        await message.reply({ embeds: [leadsEmbed] });
}

async function handleFun(message, args) {
        const funData = loadFunQuestions();
        
        if (!funData || !funData.questions || funData.questions.length === 0) {
                return message.reply("❌ No fun questions found. Please check `fun-questions.json` file.");
        }

        const mentionedUser = message.mentions.users.first();
        const questionIdArg = args.find(arg => !arg.startsWith("<@"));
        
        let question;
        if (questionIdArg) {
                const questionId = parseInt(questionIdArg);
                question = funData.questions.find(q => q.id === questionId);
                if (!question) {
                        return message.reply(`❌ Question with ID ${questionId} not found. Available IDs: ${funData.questions.map(q => q.id).join(", ")}`);
                }
        } else {
                question = funData.questions[Math.floor(Math.random() * funData.questions.length)];
        }

        const points = question.points || funData.default_points || 100;

        const funEmbed = new EmbedBuilder()
                .setColor(0xF39C12)
                .setTitle(`🎮 Fun Challenge #${question.id}`)
                .setDescription(mentionedUser ? `**Challenge for:** ${mentionedUser}` : "Solve this challenge for bonus points!")
                .addFields(
                        {
                                name: "📝 Question",
                                value: question.question
                        },
                        {
                                name: "🎁 Reward",
                                value: `**${points} points** if answered correctly!`
                        }
                )
                .setFooter({ text: `Use ${PREFIX}add ${points} @user to award points | Answer: hidden from staff` })
                .setTimestamp();

        await message.reply({ embeds: [funEmbed] });
}

async function handleFunAnswer(message, args) {
        const funData = loadFunQuestions();
        
        if (!funData || !funData.questions || funData.questions.length === 0) {
                return message.reply("❌ No fun questions found. Please check `fun-questions.json` file.");
        }

        if (args.length === 0) {
                const allAnswers = funData.questions.map(q => {
                        const answers = Array.isArray(q.answer) ? q.answer.join(", ") : q.answer;
                        return `**#${q.id}:** \`${answers}\``;
                }).join("\n");

                const answersEmbed = new EmbedBuilder()
                        .setColor(0xE74C3C)
                        .setTitle("🔑 Fun Question Answers")
                        .setDescription("**⚠️ CONFIDENTIAL - Do not share!**\n\n" + allAnswers)
                        .setFooter({ text: "Use kfunanswer <id> to see a specific answer" })
                        .setTimestamp();

                return message.reply({ embeds: [answersEmbed] });
        }

        const questionId = parseInt(args[0]);
        const question = funData.questions.find(q => q.id === questionId);
        
        if (!question) {
                return message.reply(`❌ Question with ID ${questionId} not found. Available IDs: ${funData.questions.map(q => q.id).join(", ")}`);
        }

        const answers = Array.isArray(question.answer) ? question.answer.join(", ") : question.answer;
        const points = question.points || funData.default_points || 100;

        const answerEmbed = new EmbedBuilder()
                .setColor(0xE74C3C)
                .setTitle(`🔑 Answer for Question #${question.id}`)
                .setDescription("**⚠️ CONFIDENTIAL - Do not share!**")
                .addFields(
                        {
                                name: "📝 Question",
                                value: question.question
                        },
                        {
                                name: "✅ Accepted Answers",
                                value: `\`${answers}\``
                        },
                        {
                                name: "💡 Hint",
                                value: question.hint || "No hint available"
                        },
                        {
                                name: "🎁 Points",
                                value: `${points}`
                        }
                )
                .setFooter({ text: `Use ${PREFIX}add ${points} @user to award points` })
                .setTimestamp();

        await message.reply({ embeds: [answerEmbed] });
}

async function handleDare(message, args) {
        const daresData = loadDares();
        
        if (!daresData || !daresData.dares || daresData.dares.length === 0) {
                return message.reply("❌ No dares found. Please check `dares.json` file.");
        }

        const mentionedUser = message.mentions.users.first();
        const dareIdArg = args.find(arg => !arg.startsWith("<@"));
        
        let dare;
        if (dareIdArg) {
                const dareId = parseInt(dareIdArg);
                dare = daresData.dares.find(d => d.id === dareId);
                if (!dare) {
                        return message.reply(`❌ Dare with ID ${dareId} not found. Available IDs: ${daresData.dares.map(d => d.id).join(", ")}`);
                }
        } else {
                dare = daresData.dares[Math.floor(Math.random() * daresData.dares.length)];
        }

        const points = dare.points || daresData.default_points || 300;

        const dareEmbed = new EmbedBuilder()
                .setColor(0xFF6B6B)
                .setTitle(`🔥 DARE CHALLENGE #${dare.id}`)
                .setDescription(mentionedUser ? `**Dare for:** ${mentionedUser}` : "**Are you brave enough?** Complete this dare for bonus points!")
                .addFields(
                        {
                                name: "🎯 The Dare",
                                value: dare.dare
                        },
                        {
                                name: "🎁 Reward",
                                value: `**${points} points** if completed!`
                        }
                )
                .setFooter({ text: `Use ${PREFIX}add ${points} @user to award points when completed` })
                .setTimestamp();

        await message.reply({ embeds: [dareEmbed] });
}

async function handleAddPoints(message, args, guildId) {
        const guildHunt = await getGuildHunt(guildId);
        
        if (!guildHunt) {
                return message.reply("❌ No active hunt found in this server. Use `/setup-hunt` first.");
        }

        if (args.length < 2) {
                return message.reply(`❌ Usage: \`${PREFIX}add <points> @user\`\nExample: \`${PREFIX}add 50 @username\``);
        }

        const pointsArg = args[0];
        const points = parseInt(pointsArg);

        if (isNaN(points)) {
                return message.reply(`❌ Invalid points amount. Please provide a number.\nUsage: \`${PREFIX}add <points> @user\``);
        }

        const mentionedUser = message.mentions.users.first();
        if (!mentionedUser) {
                return message.reply(`❌ Please mention a user.\nUsage: \`${PREFIX}add <points> @user\``);
        }

        if (mentionedUser.bot) {
                return message.reply("❌ You cannot add points to a bot!");
        }

        try {
                const userState = await getUserProgress(mentionedUser.id, guildId);
                
                if (!userState) {
                        return message.reply(`❌ ${mentionedUser} hasn't started the hunt yet. They need to use \`/hunt\` first.`);
                }

                const oldPoints = userState.points;
                userState.points += points;

                if (userState.points < 0) {
                        userState.points = 0;
                }

                await updateUserProgress(mentionedUser.id, guildId, userState);

                await updateLeaderboard(guildId, {
                        userId: mentionedUser.id,
                        username: mentionedUser.username,
                        points: userState.points,
                        level: userState.level,
                        startTime: userState.startTime,
                        lastCompleted: Date.now(),
                });

                const actionWord = points >= 0 ? "added to" : "removed from";
                const pointsDisplay = Math.abs(points);

                const successEmbed = new EmbedBuilder()
                        .setColor(points >= 0 ? 0x2ECC71 : 0xE74C3C)
                        .setTitle(points >= 0 ? "✅ Points Added" : "➖ Points Removed")
                        .setDescription(`**${pointsDisplay} points** ${actionWord} ${mentionedUser}`)
                        .addFields(
                                { name: "Previous Points", value: `${oldPoints}`, inline: true },
                                { name: "New Points", value: `${userState.points}`, inline: true },
                                { name: "Change", value: `${points >= 0 ? "+" : ""}${points}`, inline: true }
                        )
                        .setFooter({ text: `Modified by ${message.author.username}` })
                        .setTimestamp();

                await message.reply({ embeds: [successEmbed] });

        } catch (error) {
                console.error("Error adding points:", error);
                await message.reply("❌ An error occurred while adding points. Please try again.");
        }
}

async function handleRemovePoints(message, args, guildId) {
        const guildHunt = await getGuildHunt(guildId);
        
        if (!guildHunt) {
                return message.reply("❌ No active hunt found in this server. Use `/setup-hunt` first.");
        }

        if (args.length < 2) {
                return message.reply(`❌ Usage: \`${PREFIX}remove <points> @user\`\nExample: \`${PREFIX}remove 50 @username\``);
        }

        const pointsArg = args[0];
        const points = parseInt(pointsArg);

        if (isNaN(points) || points <= 0) {
                return message.reply(`❌ Invalid points amount. Please provide a positive number.\nUsage: \`${PREFIX}remove <points> @user\``);
        }

        const mentionedUser = message.mentions.users.first();
        if (!mentionedUser) {
                return message.reply(`❌ Please mention a user.\nUsage: \`${PREFIX}remove <points> @user\``);
        }

        if (mentionedUser.bot) {
                return message.reply("❌ You cannot remove points from a bot!");
        }

        try {
                const userState = await getUserProgress(mentionedUser.id, guildId);
                
                if (!userState) {
                        return message.reply(`❌ ${mentionedUser} hasn't started the hunt yet. They need to use \`/hunt\` first.`);
                }

                const oldPoints = userState.points;
                userState.points -= points;

                if (userState.points < 0) {
                        userState.points = 0;
                }

                await updateUserProgress(mentionedUser.id, guildId, userState);

                await updateLeaderboard(guildId, {
                        userId: mentionedUser.id,
                        username: mentionedUser.username,
                        points: userState.points,
                        level: userState.level,
                        startTime: userState.startTime,
                        lastCompleted: Date.now(),
                });

                const successEmbed = new EmbedBuilder()
                        .setColor(0xE74C3C)
                        .setTitle("➖ Points Removed")
                        .setDescription(`**${points} points** removed from ${mentionedUser}`)
                        .addFields(
                                { name: "Previous Points", value: `${oldPoints}`, inline: true },
                                { name: "New Points", value: `${userState.points}`, inline: true },
                                { name: "Change", value: `-${points}`, inline: true }
                        )
                        .setFooter({ text: `Modified by ${message.author.username}` })
                        .setTimestamp();

                await message.reply({ embeds: [successEmbed] });

        } catch (error) {
                console.error("Error removing points:", error);
                await message.reply("❌ An error occurred while removing points. Please try again.");
        }
}

const MAIN_ADMIN_ID = "952838363587706880";

async function handlePause(message, guildId) {
        if (message.author.id !== MAIN_ADMIN_ID) {
                return message.reply("❌ Only the main admin can use this command.");
        }

        const guildHunt = await getGuildHunt(guildId);
        
        if (!guildHunt) {
                return message.reply("❌ No active hunt found in this server. Use `/setup-hunt` first.");
        }

        const alreadyPaused = await isHuntPaused(guildId);
        if (alreadyPaused) {
                return message.reply("⚠️ The hunt is already paused. Use `kcon` to resume it.");
        }

        try {
                const success = await setHuntPaused(guildId, true, message.author.id);
                
                if (!success) {
                        return message.reply("❌ Failed to pause the hunt. Please try again.");
                }

                const pauseEmbed = new EmbedBuilder()
                        .setColor(0xE74C3C)
                        .setTitle("⏸️ Hunt Paused")
                        .setDescription("The hunt has been paused. All player commands are now disabled.")
                        .addFields(
                                { name: "Paused by", value: `<@${message.author.id}>`, inline: true },
                                { name: "Status", value: "Players cannot use `/hunt`, `/answer`, `/hint`, etc.", inline: false }
                        )
                        .setFooter({ text: "Use kcon to resume the hunt" })
                        .setTimestamp();

                await message.reply({ embeds: [pauseEmbed] });

        } catch (error) {
                console.error("Error pausing hunt:", error);
                await message.reply("❌ An error occurred while pausing the hunt. Please try again.");
        }
}

async function handleContinue(message, guildId) {
        if (message.author.id !== MAIN_ADMIN_ID) {
                return message.reply("❌ Only the main admin can use this command.");
        }

        const guildHunt = await getGuildHunt(guildId);
        
        if (!guildHunt) {
                return message.reply("❌ No active hunt found in this server. Use `/setup-hunt` first.");
        }

        const isPaused = await isHuntPaused(guildId);
        if (!isPaused) {
                return message.reply("⚠️ The hunt is not paused. It's already running!");
        }

        try {
                const success = await setHuntPaused(guildId, false, message.author.id);
                
                if (!success) {
                        return message.reply("❌ Failed to resume the hunt. Please try again.");
                }

                const continueEmbed = new EmbedBuilder()
                        .setColor(0x2ECC71)
                        .setTitle("▶️ Hunt Resumed")
                        .setDescription("The hunt has been resumed! All player commands are now active.")
                        .addFields(
                                { name: "Resumed by", value: `<@${message.author.id}>`, inline: true },
                                { name: "Status", value: "Players can now use all hunt commands again!", inline: false }
                        )
                        .setFooter({ text: "Good luck hunters!" })
                        .setTimestamp();

                await message.reply({ embeds: [continueEmbed] });

        } catch (error) {
                console.error("Error resuming hunt:", error);
                await message.reply("❌ An error occurred while resuming the hunt. Please try again.");
        }
}

async function handleEnd(message, guildId) {
        if (message.author.id !== MAIN_ADMIN_ID) {
                return message.reply("❌ Only the main admin can use this command.");
        }

        const guildHunt = await getGuildHunt(guildId);
        
        if (!guildHunt) {
                return message.reply("❌ No active hunt found in this server.");
        }

        try {
                const leaderboard = await getLeaderboard(guildId);
                const huntData = guildHunt.huntData;

                const endEmbed = new EmbedBuilder()
                        .setColor(0xFFD700)
                        .setTitle(`🏆 ${huntData.name} - HUNT ENDED!`)
                        .setDescription("**The hunt has officially ended! Here are the final results:**")
                        .setTimestamp();

                if (leaderboard && leaderboard.length > 0) {
                        const sortedLeaderboard = leaderboard.sort((a, b) => {
                                if (b.points !== a.points) return b.points - a.points;
                                return (a.last_completed || 0) - (b.last_completed || 0);
                        });

                        const medals = ["🥇", "🥈", "🥉"];
                        let rankingText = "";

                        for (let i = 0; i < Math.min(sortedLeaderboard.length, 10); i++) {
                                const entry = sortedLeaderboard[i];
                                const medal = medals[i] || `**#${i + 1}**`;
                                const displayName = entry.username || `User`;
                                const completedLevel = Math.max(0, (entry.level || 1) - 1);
                                rankingText += `${medal} <@${entry.user_id}> (${displayName}) - **${entry.points || 0} points** (Level ${completedLevel})\n`;
                        }

                        endEmbed.addFields({
                                name: "🏅 Final Leaderboard",
                                value: rankingText || "No participants"
                        });

                        if (sortedLeaderboard.length > 0) {
                                const winner = sortedLeaderboard[0];
                                endEmbed.addFields({
                                        name: "👑 Winner",
                                        value: `Congratulations to <@${winner.user_id}> for winning with **${winner.points || 0} points**!`
                                });
                        }

                        endEmbed.addFields({
                                name: "📊 Statistics",
                                value: `Total Participants: **${sortedLeaderboard.length}**\nTotal Levels: **${huntData.levels.length}**`
                        });
                } else {
                        endEmbed.addFields({
                                name: "📊 Results",
                                value: "No participants completed any levels."
                        });
                }

                await message.channel.send({ embeds: [endEmbed] });

                await deleteGuildHunt(guildId);

                const confirmEmbed = new EmbedBuilder()
                        .setColor(0x2ECC71)
                        .setTitle("✅ Hunt Ended Successfully")
                        .setDescription("The hunt has been ended and all progress has been cleared.\nUse `/setup-hunt` to start a new hunt.")
                        .setTimestamp();

                await message.reply({ embeds: [confirmEmbed] });

        } catch (error) {
                console.error("Error ending hunt:", error);
                await message.reply("❌ An error occurred while ending the hunt. Please try again.");
        }
}

async function handleKick(message, args, guildId) {
        const guildHunt = await getGuildHunt(guildId);
        
        if (!guildHunt) {
                return message.reply("❌ No active hunt found in this server. Use `/setup-hunt` first.");
        }

        const mentionedUser = message.mentions.users.first();
        if (!mentionedUser) {
                return message.reply(`❌ Please mention a user to kick.\nUsage: \`${PREFIX}kick @user\``);
        }

        if (mentionedUser.bot) {
                return message.reply("❌ You cannot kick a bot from the hunt!");
        }

        try {
                const userState = await getUserProgress(mentionedUser.id, guildId);
                
                if (!userState || (userState.level === 1 && userState.points === 0)) {
                        return message.reply(`❌ ${mentionedUser} hasn't made any progress in the hunt yet.`);
                }

                const oldLevel = userState.level;
                const oldPoints = userState.points;

                const success = await kickUserFromHunt(mentionedUser.id, guildId);
                
                if (!success) {
                        return message.reply("❌ Failed to kick user from the hunt. Please try again.");
                }

                const kickEmbed = new EmbedBuilder()
                        .setColor(0xE74C3C)
                        .setTitle("🚫 User Kicked from Hunt")
                        .setDescription(`${mentionedUser} has been removed from the hunt and must start over.`)
                        .addFields(
                                { name: "Previous Level", value: `${oldLevel}`, inline: true },
                                { name: "Previous Points", value: `${oldPoints}`, inline: true },
                                { name: "New Status", value: "Must use `/hunt` to restart", inline: true }
                        )
                        .setFooter({ text: `Kicked by ${message.author.username}` })
                        .setTimestamp();

                await message.reply({ embeds: [kickEmbed] });

        } catch (error) {
                console.error("Error kicking user:", error);
                await message.reply("❌ An error occurred while kicking the user. Please try again.");
        }
}

module.exports = { handleMessage };
