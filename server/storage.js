const { Pool } = require("pg");

const TABLE_SCHEMA = `
    CREATE TABLE IF NOT EXISTS marketplace_state (
        state_key text PRIMARY KEY,
        state_value jsonb NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT NOW()
    )
`;

let pool = null;

function createPool(connectionString = process.env.DATABASE_URL) {
    if (!connectionString) {
        throw new Error("DATABASE_URL is required");
    }

    return new Pool({
        connectionString,
        max: 5
    });
}

async function ensureSchema(databasePool) {
    await databasePool.query(TABLE_SCHEMA);
}

async function initialize() {
    if (!process.env.DATABASE_URL) {
        if (process.env.NODE_ENV === "production") {
            const error = new Error("DATABASE_URL is required in production");
            error.code = "MISSING_DATABASE_URL";
            throw error;
        }
        return false;
    }

    pool = createPool();

    try {
        await ensureSchema(pool);
        return true;
    } catch (error) {
        await pool.end();
        pool = null;
        throw error;
    }
}

function isEnabled() {
    return pool !== null;
}

function read(key, fallback, callback) {
    if (!pool) {
        callback(new Error("Database storage is not initialized"), null);
        return;
    }

    pool.query(
        "SELECT state_value FROM marketplace_state WHERE state_key = $1",
        [key]
    )
        .then(({ rows }) => {
            callback(null, rows.length ? rows[0].state_value : fallback);
        })
        .catch((error) => callback(error, null));
}

function write(key, value, callback) {
    if (!pool) {
        callback(new Error("Database storage is not initialized"));
        return;
    }

    pool.query(
        `INSERT INTO marketplace_state (state_key, state_value)
         VALUES ($1, $2::jsonb)
         ON CONFLICT (state_key) DO UPDATE
         SET state_value = EXCLUDED.state_value, updated_at = NOW()`,
        [key, JSON.stringify(value)]
    )
        .then(() => callback(null))
        .catch(callback);
}

module.exports = {
    createPool,
    ensureSchema,
    initialize,
    isEnabled,
    read,
    write
};