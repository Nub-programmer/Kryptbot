const sqlite3 = require("sqlite3").verbose();
const path = require("node:path");

const db = new sqlite3.Database(
        path.join(__dirname, "..", "..", "data", "hunt.db"),
        sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE,
        (err) => {
                if (err) {
                        console.error("db connection error:", err);
                        process.exit(1);
                }
                console.log("Connected to database");
        },
);

function createTables() {
        const tables = [
                {
                        name: "guild_hunts",
                        sql: `CREATE TABLE IF NOT EXISTS guild_hunts (
                                guild_id TEXT PRIMARY KEY,
                                hunt_data TEXT,
                                created_by TEXT,
                                created_at INTEGER,
                                active INTEGER DEFAULT 1
                        )`,
                },
                {
                        name: "user_progress",
                        sql: `CREATE TABLE IF NOT EXISTS user_progress (
                                user_id TEXT,
                                guild_id TEXT,
                                level INTEGER,
                                points INTEGER,
                                hint_used TEXT,
                                start_time INTEGER,
                                PRIMARY KEY (user_id, guild_id)
                        )`,
                },
                {
                        name: "completed_levels",
                        sql: `CREATE TABLE IF NOT EXISTS completed_levels (
                                user_id TEXT,
                                guild_id TEXT,
                                level_id INTEGER,
                                completed_at INTEGER,
                                points_earned INTEGER,
                                FOREIGN KEY(user_id, guild_id) REFERENCES user_progress(user_id, guild_id)
                        )`,
                },
                {
                        name: "leaderboard",
                        sql: `CREATE TABLE IF NOT EXISTS leaderboard (
                                user_id TEXT,
                                guild_id TEXT,
                                username TEXT,
                                points INTEGER,
                                level INTEGER,
                                start_time INTEGER,
                                last_completed INTEGER,
                                PRIMARY KEY (user_id, guild_id),
                                FOREIGN KEY(user_id, guild_id) REFERENCES user_progress(user_id, guild_id)
                        )`,
                },
                {
                        name: "hunt_paused",
                        sql: `CREATE TABLE IF NOT EXISTS hunt_paused (
                                guild_id TEXT PRIMARY KEY,
                                paused INTEGER DEFAULT 0,
                                paused_by TEXT,
                                paused_at INTEGER
                        )`,
                },
                {
                        name: "first_blood_config",
                        sql: `CREATE TABLE IF NOT EXISTS first_blood_config (
                                guild_id TEXT PRIMARY KEY,
                                channel_id TEXT,
                                setup_by TEXT,
                                setup_at INTEGER
                        )`,
                },
                {
                        name: "first_blood_records",
                        sql: `CREATE TABLE IF NOT EXISTS first_blood_records (
                                guild_id TEXT,
                                level_id INTEGER,
                                user_id TEXT,
                                username TEXT,
                                completed_at INTEGER,
                                PRIMARY KEY (guild_id, level_id)
                        )`,
                },
        ];

        const createTableSequentially = (index) => {
                if (index >= tables.length) {
                        console.log("All database tables created/updated successfully");
                        return;
                }

                const table = tables[index];
                db.run(table.sql, (err) => {
                        if (err) {
                                console.error(`Error creating table ${table.name}:`, err);
                        } else {
                                console.log(`Table ${table.name} created/verified successfully`);
                        }
                        createTableSequentially(index + 1);
                });
        };

        createTableSequentially(0);
}

function initializeDatabase() {
        db.serialize(() => {
                db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, tables) => {
                        if (err) {
                                console.error("Error checking existing tables:", err);
                                createTables();
                                return;
                        }

                        const tableNames = tables.map((t) => t.name);
                        const requiredTables = [
                                "guild_hunts",
                                "user_progress",
                                "completed_levels",
                                "leaderboard",
                                "hunt_paused",
                                "first_blood_config",
                                "first_blood_records",
                        ];
                        const missingTables = requiredTables.filter(
                                (table) => !tableNames.includes(table),
                        );

                        if (missingTables.length > 0) {
                                console.log(
                                        `Missing tables: ${missingTables.join(", ")}, creating all tables...`,
                                );
                                createTables();
                                return;
                        }

                        db.get("PRAGMA table_info(user_progress)", (err, row) => {
                                if (err) {
                                        console.error("Error checking user_progress structure:", err);
                                        createTables();
                                        return;
                                }

                                if (row && !tableNames.some((name) => name.includes("backup"))) {
                                        db.all("PRAGMA table_info(user_progress)", (err, columns) => {
                                                if (err) {
                                                        console.error("Error getting user_progress columns:", err);
                                                        createTables();
                                                        return;
                                                }

                                                const hasGuildId = columns.some((col) => col.name === "guild_id");

                                                if (!hasGuildId) {
                                                        console.log(
                                                                "Migrating existing database to multi-server format...",
                                                        );

                                                        db.run("DROP TABLE IF EXISTS user_progress_backup");
                                                        db.run("DROP TABLE IF EXISTS completed_levels_backup");
                                                        db.run("DROP TABLE IF EXISTS leaderboard_backup");

                                                        setTimeout(() => {
                                                                db.run(
                                                                        "ALTER TABLE user_progress RENAME TO user_progress_backup",
                                                                        (err) => {
                                                                                if (err) {
                                                                                        console.error("Error backing up user_progress:", err);
                                                                                        createTables();
                                                                                        return;
                                                                                }

                                                                                db.run(
                                                                                        "ALTER TABLE completed_levels RENAME TO completed_levels_backup",
                                                                                        (err) => {
                                                                                                if (err)
                                                                                                        console.error(
                                                                                                                "Error backing up completed_levels:",
                                                                                                                err,
                                                                                                        );
                                                                                        },
                                                                                );

                                                                                db.run(
                                                                                        "ALTER TABLE leaderboard RENAME TO leaderboard_backup",
                                                                                        (err) => {
                                                                                                if (err)
                                                                                                        console.error("Error backing up leaderboard:", err);
                                                                                        },
                                                                                );

                                                                                createTables();
                                                                        },
                                                                );
                                                        }, 100);
                                                } else {
                                                        console.log("Database tables are in correct format, verifying...");
                                                        createTables();
                                                }
                                        });
                                } else {
                                        console.log(
                                                "Database appears to be in correct state, verifying tables...",
                                        );
                                        createTables();
                                }
                        });
                });
        });
}

function closeDatabase() {
        return new Promise((resolve, reject) => {
                db.close((err) => {
                        if (err) {
                                console.error("Error closing database:", err);
                                reject(err);
                        } else {
                                console.log("Database connection closed");
                                resolve();
                        }
                });
        });
}

module.exports = {
        db,
        initializeDatabase,
        createTables,
        closeDatabase,
};
