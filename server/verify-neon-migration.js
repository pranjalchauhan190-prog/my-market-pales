const fs = require("fs/promises");
const path = require("path");
const storage = require("./storage");

const stateFiles = [
    "products.json",
    "orders.json",
    "shorts.json",
    "reviews.json",
    "sellers.json",
    "categories.json",
    "coupons.json",
    "promotion.json",
    "notifications.json"
];

function stableJSON(value) {
    if (Array.isArray(value)) {
        return `[${value.map(stableJSON).join(",")}]`;
    }

    if (value && typeof value === "object") {
        const entries = Object.keys(value)
            .sort()
            .map(key => `${JSON.stringify(key)}:${stableJSON(value[key])}`);
        return `{${entries.join(",")}}`;
    }

    return JSON.stringify(value);
}

function recordCount(value) {
    return Array.isArray(value) ? value.length : 1;
}

async function verify() {
    const pool = storage.createPool();

    try {
        await storage.ensureSchema(pool);
        const result = await pool.query(
            `SELECT state_key, state_value
             FROM marketplace_state
             WHERE state_key = ANY($1::text[])`,
            [stateFiles]
        );
        const databaseState = new Map(
            result.rows.map(row => [row.state_key, row.state_value])
        );
        let allMatch = true;

        for (const fileName of stateFiles) {
            const localValue = JSON.parse(
                await fs.readFile(path.join(__dirname, fileName), "utf8")
            );
            const databaseValue = databaseState.get(fileName);
            const matches = databaseState.has(fileName) &&
                stableJSON(localValue) === stableJSON(databaseValue);

            allMatch = allMatch && matches;
            console.log(
                `${fileName}: local=${recordCount(localValue)} database=${databaseValue === undefined ? 0 : recordCount(databaseValue)} match=${matches}`
            );
        }

        console.log(`MIGRATION_DATA_MATCH=${allMatch}`);
        if (!allMatch) {
            process.exitCode = 1;
        }
    } catch (error) {
        console.error("Migration verification failed (code):", error.code || error.name);
        process.exitCode = 1;
    } finally {
        await pool.end();
    }
}

verify();