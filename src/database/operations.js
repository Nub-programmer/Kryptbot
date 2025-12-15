const { db } = require("./connection");

async function safeop(operation, errorMessage = "Database operation failed") {
        try {
                return await operation();
        } catch (error) {
                console.error(`${errorMessage}:`, error);
                return null;
        }
}

async function ensureLeaderboardTable() {
        return new Promise((resolve) => {
                db.get(
                        "SELECT name FROM sqlite_master WHERE type='table' AND name='leaderboard'",
                        (err, row) => {
                                if (err || !row) {
                                        console.log("Leaderboard table missing, creating it now...");
                                        db.run(
                                                `CREATE TABLE IF NOT EXISTS leaderboard (
                                                user_id TEXT,
                                                guild_id TEXT,
                                                username TEXT,
                                                points INTEGER,
                                                level INTEGER,
                                                start_time INTEGER,
                                                last_completed INTEGER,
                                                PRIMARY KEY (user_id, guild_id)
                                        )`,
                                                (err) => {
                                                        if (err) {
                                                                console.error("Error creating leaderboard table:", err);
                                                        } else {
                                                                console.log("Leaderboard table created successfully");
                                                        }
                                                        resolve();
                                                },
                                        );
                                } else {
                                        db.all("PRAGMA table_info(leaderboard)", (err, columns) => {
                                                if (err) {
                                                        console.error("Error checking leaderboard structure:", err);
                                                        resolve();
                                                        return;
                                                }

                                                const requiredColumns = [
                                                        "user_id",
                                                        "guild_id",
                                                        "username",
                                                        "points",
                                                        "level",
                                                        "start_time",
                                                        "last_completed",
                                                ];
                                                const existingColumns = columns.map((col) => col.name);
                                                const missingColumns = requiredColumns.filter(
                                                        (col) => !existingColumns.includes(col),
                                                );

                                                if (missingColumns.length > 0) {
                                                        console.log(
                                                                `Leaderboard table missing columns: ${missingColumns.join(", ")}, recreating...`,
                                                        );
                                                        db.run("DROP TABLE leaderboard", (err) => {
                                                                if (err) console.error("Error dropping old leaderboard:", err);

                                                                db.run(
                                                                        `CREATE TABLE leaderboard (
                                                                        user_id TEXT,
                                                                        guild_id TEXT,
                                                                        username TEXT,
                                                                        points INTEGER,
                                                                        level INTEGER,
                                                                        start_time INTEGER,
                                                                        last_completed INTEGER,
                                                                        PRIMARY KEY (user_id, guild_id)
                                                                )`,
                                                                        (err) => {
                                                                                if (err) {
                                                                                        console.error("Error recreating leaderboard table:", err);
                                                                                } else {
                                                                                        console.log("Leaderboard table recreated successfully");
                                                                                }
                                                                                resolve();
                                                                        },
                                                                );
                                                        });
                                                } else {
                                                        resolve();
                                                }
                                        });
                                }
                        },
                );
        });
}

async function cleanupDatabaseState() {
        return new Promise((resolve) => {
                db.run("DROP TABLE IF EXISTS user_progress_backup", () => {
                        db.run("DROP TABLE IF EXISTS completed_levels_backup", () => {
                                db.run("DROP TABLE IF EXISTS leaderboard_backup", () => {
                                        resolve();
                                });
                        });
                });
        });
}

async function getGuildHunt(guildId) {
        return safeop(
                () =>
                        new Promise((resolve, reject) => {
                                db.get(
                                        "SELECT * FROM guild_hunts WHERE guild_id = ? AND active = 1",
                                        [guildId],
                                        (err, row) => {
                                                if (err) reject(err);
                                                if (!row) resolve(null);
                                                else {
                                                        try {
                                                                const huntData = JSON.parse(row.hunt_data);
                                                                resolve({ ...row, huntData });
                                                        } catch (parseErr) {
                                                                reject(parseErr);
                                                        }
                                                }
                                        },
                                );
                        }),
                "Error fetching guild hunt",
        );
}

async function createGuildHunt(guildId, huntData, createdBy) {
        await cleanupDatabaseState();
        await clearFirstBloodRecords(guildId);

        return safeop(
                () =>
                        new Promise((resolve, reject) => {
                                db.run(
                                        "INSERT OR REPLACE INTO guild_hunts (guild_id, hunt_data, created_by, created_at, active) VALUES (?, ?, ?, ?, 1)",
                                        [guildId, JSON.stringify(huntData), createdBy, Date.now()],
                                        (err) => {
                                                if (err) reject(err);
                                                else resolve(true);
                                        },
                                );
                        }),
                "Error creating guild hunt",
        );
}

async function deleteGuildHunt(guildId) {
        await ensureLeaderboardTable();

        return safeop(
                () =>
                        new Promise((resolve, reject) => {
                                db.serialize(() => {
                                        db.run("BEGIN TRANSACTION", (err) => {
                                                if (err) {
                                                        reject(err);
                                                        return;
                                                }

                                                const deleteOperations = [
                                                        "DELETE FROM completed_levels WHERE guild_id = ?",
                                                        "DELETE FROM user_progress WHERE guild_id = ?",
                                                        "DELETE FROM leaderboard WHERE guild_id = ?",
                                                        "DELETE FROM first_blood_records WHERE guild_id = ?",
                                                        "DELETE FROM hunt_paused WHERE guild_id = ?",
                                                        "DELETE FROM guild_hunts WHERE guild_id = ?",
                                                ];

                                                let hasError = false;

                                                const executeNextDelete = (index) => {
                                                        if (index >= deleteOperations.length) {
                                                                db.run("COMMIT", (err) => {
                                                                        if (err) {
                                                                                db.run("ROLLBACK");
                                                                                reject(err);
                                                                        } else {
                                                                                resolve(true);
                                                                        }
                                                                });
                                                                return;
                                                        }

                                                        db.run(deleteOperations[index], [guildId], (err) => {
                                                                if (err) {
                                                                        console.error(`Error in delete operation ${index}:`, err);
                                                                        if (!hasError) {
                                                                                hasError = true;
                                                                                db.run("ROLLBACK");
                                                                                reject(err);
                                                                        }
                                                                        return;
                                                                }
                                                                executeNextDelete(index + 1);
                                                        });
                                                };

                                                executeNextDelete(0);
                                        });
                                });
                        }),
                "Error deleting guild hunt",
        );
}

async function getUserProgress(userId, guildId) {
        return safeop(
                () =>
                        new Promise((resolve, reject) => {
                                db.get(
                                        "SELECT * FROM user_progress WHERE user_id = ? AND guild_id = ?",
                                        [userId, guildId],
                                        async (err, row) => {
                                                if (err) reject(err);
                                                if (!row) {
                                                        const newUser = {
                                                                level: 1,
                                                                points: 0,
                                                                hintUsed: [],
                                                                startTime: Date.now(),
                                                        };
                                                        const success = await initializeUser(userId, guildId, newUser);
                                                        if (success) resolve(newUser);
                                                        else reject(new Error("Failed to initialize user"));
                                                } else {
                                                        try {
                                                                row.hintUsed = JSON.parse(row.hint_used || "[]");
                                                                resolve(row);
                                                        } catch (parseErr) {
                                                                console.error("Error parsing hint_used:", parseErr);
                                                                row.hintUsed = [];
                                                                resolve(row);
                                                        }
                                                }
                                        },
                                );
                        }),
                "Error fetching user progress",
        );
}

async function initializeUser(userId, guildId, data) {
        return (
                safeop(
                        () =>
                                new Promise((resolve, reject) => {
                                        db.run(
                                                "INSERT INTO user_progress (user_id, guild_id, level, points, hint_used, start_time) VALUES (?, ?, ?, ?, ?, ?)",
                                                [
                                                        userId,
                                                        guildId,
                                                        data.level,
                                                        data.points,
                                                        JSON.stringify(data.hintUsed),
                                                        data.startTime,
                                                ],
                                                (err) => {
                                                        if (err) reject(err);
                                                        else resolve(true);
                                                },
                                        );
                                }),
                        "Error initializing user",
                ) !== null
        );
}

async function updateUserProgress(userId, guildId, data) {
        return (
                safeop(
                        () =>
                                new Promise((resolve, reject) => {
                                        db.run(
                                                "UPDATE user_progress SET level = ?, points = ?, hint_used = ? WHERE user_id = ? AND guild_id = ?",
                                                [
                                                        data.level,
                                                        data.points,
                                                        JSON.stringify(data.hintUsed),
                                                        userId,
                                                        guildId,
                                                ],
                                                (err) => {
                                                        if (err) reject(err);
                                                        else resolve(true);
                                                },
                                        );
                                }),
                        "Error updating user progress",
                ) !== null
        );
}

async function getLeaderboard(guildId, limit = 100) {
        await ensureLeaderboardTable();
        return new Promise((resolve, reject) => {
                db.all(
                        "SELECT * FROM leaderboard WHERE guild_id = ? ORDER BY points DESC, last_completed ASC LIMIT ?",
                        [guildId, limit],
                        (err, rows) => {
                                if (err) reject(err);
                                resolve(rows || []);
                        },
                );
        });
}

async function updateLeaderboard(guildId, data) {
        await ensureLeaderboardTable();
        return new Promise((resolve, reject) => {
                db.run(
                        `INSERT INTO leaderboard (user_id, guild_id, username, points, level, start_time, last_completed)
                         VALUES (?, ?, ?, ?, ?, ?, ?)
                         ON CONFLICT(user_id, guild_id) DO UPDATE SET 
                         points = ?, level = ?, last_completed = ?`,
                        [
                                data.userId,
                                guildId,
                                data.username,
                                data.points,
                                data.level,
                                data.startTime,
                                data.lastCompleted,
                                data.points,
                                data.level,
                                data.lastCompleted,
                        ],
                        (err) => {
                                if (err) reject(err);
                                resolve();
                        },
                );
        });
}

async function getUserRank(userId, guildId) {
        await ensureLeaderboardTable();
        return new Promise((resolve, reject) => {
                db.get(
                        `SELECT COUNT(*) + 1 as rank FROM leaderboard 
                         WHERE guild_id = ? AND points > (SELECT points FROM leaderboard WHERE user_id = ? AND guild_id = ?)`,
                        [guildId, userId, guildId],
                        (err, row) => {
                                if (err) {
                                        console.error("Error getting user rank:", err);
                                        resolve(null);
                                        return;
                                }
                                resolve(row ? row.rank : null);
                        },
                );
        });
}

async function getCompletedLevels(userId, guildId) {
        return new Promise((resolve, reject) => {
                db.all(
                        "SELECT * FROM completed_levels WHERE user_id = ? AND guild_id = ? ORDER BY completed_at ASC",
                        [userId, guildId],
                        (err, rows) => {
                                if (err) {
                                        console.error("Error getting completed levels:", err);
                                        resolve([]);
                                        return;
                                }
                                resolve(rows || []);
                        },
                );
        });
}

async function recordCompletedLevel(userId, guildId, levelId, completedAt, pointsEarned) {
        return new Promise((resolve, reject) => {
                db.run(
                        "INSERT INTO completed_levels (user_id, guild_id, level_id, completed_at, points_earned) VALUES (?, ?, ?, ?, ?)",
                        [userId, guildId, levelId, completedAt, pointsEarned],
                        (err) => {
                                if (err) {
                                        console.error("Error recording completed level:", err);
                                        resolve(false);
                                        return;
                                }
                                resolve(true);
                        },
                );
        });
}

async function isHuntPaused(guildId) {
        return new Promise((resolve) => {
                db.get(
                        "SELECT paused FROM hunt_paused WHERE guild_id = ?",
                        [guildId],
                        (err, row) => {
                                if (err) {
                                        console.error("Error checking hunt pause state:", err);
                                        resolve(false);
                                        return;
                                }
                                resolve(row ? row.paused === 1 : false);
                        },
                );
        });
}

async function setHuntPaused(guildId, paused, pausedBy) {
        return new Promise((resolve) => {
                db.run(
                        `INSERT INTO hunt_paused (guild_id, paused, paused_by, paused_at)
                         VALUES (?, ?, ?, ?)
                         ON CONFLICT(guild_id) DO UPDATE SET paused = ?, paused_by = ?, paused_at = ?`,
                        [guildId, paused ? 1 : 0, pausedBy, Date.now(), paused ? 1 : 0, pausedBy, Date.now()],
                        (err) => {
                                if (err) {
                                        console.error("Error setting hunt pause state:", err);
                                        resolve(false);
                                        return;
                                }
                                resolve(true);
                        },
                );
        });
}

async function setFirstBloodChannel(guildId, channelId, setupBy) {
        return new Promise((resolve) => {
                db.run(
                        `INSERT INTO first_blood_config (guild_id, channel_id, setup_by, setup_at)
                         VALUES (?, ?, ?, ?)
                         ON CONFLICT(guild_id) DO UPDATE SET channel_id = ?, setup_by = ?, setup_at = ?`,
                        [guildId, channelId, setupBy, Date.now(), channelId, setupBy, Date.now()],
                        (err) => {
                                if (err) {
                                        console.error("Error setting first blood channel:", err);
                                        resolve(false);
                                        return;
                                }
                                resolve(true);
                        },
                );
        });
}

async function getFirstBloodChannel(guildId) {
        return new Promise((resolve) => {
                db.get(
                        "SELECT channel_id FROM first_blood_config WHERE guild_id = ?",
                        [guildId],
                        (err, row) => {
                                if (err) {
                                        console.error("Error getting first blood channel:", err);
                                        resolve(null);
                                        return;
                                }
                                resolve(row ? row.channel_id : null);
                        },
                );
        });
}

async function checkFirstBlood(guildId, levelId) {
        return new Promise((resolve) => {
                db.get(
                        "SELECT user_id FROM first_blood_records WHERE guild_id = ? AND level_id = ?",
                        [guildId, levelId],
                        (err, row) => {
                                if (err) {
                                        console.error("Error checking first blood:", err);
                                        resolve(null);
                                        return;
                                }
                                resolve(row ? row.user_id : null);
                        },
                );
        });
}

async function recordFirstBlood(guildId, levelId, userId, username) {
        return new Promise((resolve) => {
                db.run(
                        `INSERT INTO first_blood_records (guild_id, level_id, user_id, username, completed_at)
                         VALUES (?, ?, ?, ?, ?)`,
                        [guildId, levelId, userId, username, Date.now()],
                        (err) => {
                                if (err) {
                                        if (err.code === 'SQLITE_CONSTRAINT') {
                                                resolve(false);
                                                return;
                                        }
                                        console.error("Error recording first blood:", err);
                                        resolve(false);
                                        return;
                                }
                                resolve(true);
                        },
                );
        });
}

async function clearFirstBloodRecords(guildId) {
        return new Promise((resolve) => {
                db.run(
                        "DELETE FROM first_blood_records WHERE guild_id = ?",
                        [guildId],
                        (err) => {
                                if (err) {
                                        console.error("Error clearing first blood records:", err);
                                        resolve(false);
                                        return;
                                }
                                resolve(true);
                        },
                );
        });
}

async function kickUserFromHunt(userId, guildId) {
        return new Promise((resolve) => {
                db.serialize(() => {
                        db.run("BEGIN TRANSACTION", (err) => {
                                if (err) {
                                        console.error("Error starting kick transaction:", err);
                                        resolve(false);
                                        return;
                                }

                                db.run("DELETE FROM user_progress WHERE user_id = ? AND guild_id = ?", [userId, guildId], (err) => {
                                        if (err) {
                                                console.error("Error deleting user progress:", err);
                                                db.run("ROLLBACK");
                                                resolve(false);
                                                return;
                                        }

                                        db.run("DELETE FROM completed_levels WHERE user_id = ? AND guild_id = ?", [userId, guildId], (err) => {
                                                if (err) {
                                                        console.error("Error deleting completed levels:", err);
                                                        db.run("ROLLBACK");
                                                        resolve(false);
                                                        return;
                                                }

                                                db.run("DELETE FROM leaderboard WHERE user_id = ? AND guild_id = ?", [userId, guildId], (err) => {
                                                        if (err) {
                                                                console.error("Error deleting from leaderboard:", err);
                                                                db.run("ROLLBACK");
                                                                resolve(false);
                                                                return;
                                                        }

                                                        db.run("COMMIT", (err) => {
                                                                if (err) {
                                                                        console.error("Error committing kick transaction:", err);
                                                                        db.run("ROLLBACK");
                                                                        resolve(false);
                                                                        return;
                                                                }
                                                                resolve(true);
                                                        });
                                                });
                                        });
                                });
                        });
                });
        });
}

module.exports = {
        getGuildHunt,
        createGuildHunt,
        deleteGuildHunt,
        getUserProgress,
        initializeUser,
        updateUserProgress,
        getLeaderboard,
        updateLeaderboard,
        getUserRank,
        getCompletedLevels,
        recordCompletedLevel,
        cleanupDatabaseState,
        isHuntPaused,
        setHuntPaused,
        setFirstBloodChannel,
        getFirstBloodChannel,
        checkFirstBlood,
        recordFirstBlood,
        clearFirstBloodRecords,
        kickUserFromHunt,
};
