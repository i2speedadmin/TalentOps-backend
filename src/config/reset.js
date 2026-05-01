const db = require('./db'); // adjust path if needed

async function resetDB() {
  try {
    console.log("🔄 Resetting database...");

    await db.query("SET FOREIGN_KEY_CHECKS = 0");

    const [tables] = await db.query("SHOW TABLES");

    for (let row of tables) {
      const tableName = Object.values(row)[0];
      console.log(`Dropping table: ${tableName}`);
      await db.query(`DROP TABLE IF EXISTS \`${tableName}\``);
    }

    await db.query("SET FOREIGN_KEY_CHECKS = 1");

    console.log("✅ All tables dropped");
  } catch (err) {
    console.error("❌ Reset failed:", err);
  } finally {
    process.exit();
  }
}

resetDB();