import app from "./app.js";
import { initDB, closeDB } from "./config/db.js";
import dotenv from "dotenv";

dotenv.config();

const PORT = process.env.PORT || 4000;

async function startServer() {
  try {
    await initDB();

    app.listen(PORT, () => {
      console.log(`Servidor backend corriendo en http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("No se pudo iniciar el servidor:", error);
    process.exit(1);
  }
}

process.on("SIGINT", async () => {
  console.log("Cerrando aplicación...");
  await closeDB();
  process.exit(0);
});

startServer();