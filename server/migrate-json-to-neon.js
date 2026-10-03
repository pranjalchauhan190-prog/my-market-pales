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

async function migrate() {
    const pool = storage.createPool();
    let client = null;
    let transactionStarted = false;

    try {
        client = await pool.connect();
        await storage.ensureSchema(client);
        await client.query("BEGIN");
        transactionStarted = true;

        for (const fileName of stateFiles) {
            const filePath = path.join(__dirname, fileName);
            const contents = await fs.readFile(filePath, "utf8");
            const value = JSON.parse(contents);
            const result = await client.query(
                `INSERT INTO marketplace_state (state_key, state_value)
                 VALUES ($1, $2::jsonb)
                 ON CONFLICT (state_key) DO NOTHING`,
                [fileName, JSON.stringify(value)]
            );

            console.log(
                `${fileName}: ${result.rowCount ? "imported" : "already present"}`
            );
        }

        await client.query("COMMIT");
        transactionStarted = false;
    } catch (error) {
        if (transactionStarted && client) {
            await client.query("ROLLBACK").catch(() => {});
        }
        throw error;
    } finally {
        if (client) {
            client.release();
        }
        await pool.end();
    }
}

migrate().catch((error) => {
    console.error("JSON migration failed (code):", error.code || error.name);
    process.exitCode = 1;
});