import express from "express";
import cors from "cors";
import clientesRoutes from "./routes/clientes/clientes.routes.js";

const app = express();

app.use(cors({
  origin: "http://localhost:5173"
}));

app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    message: "Backend funcionando correctamente"
  });
});

app.use("/api/clientes", clientesRoutes);

export default app;