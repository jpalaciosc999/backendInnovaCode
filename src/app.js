import express from "express";
import cors from "cors";

import clientesRoutes from "./routes/clientes/clientes.routes.js";
import sedesRoutes from "./routes/sedes/sedes.routes.js";
import empleadosRoutes from "./routes/empleados/empleados.routes.js";
import cuentasRoutes from "./routes/cuentas/cuentas.routes.js";
import controlRoutes from "./routes/control/control.routes.js";
import bitacorasRoutes from "./routes/bitacoras/bitacoras.routes.js";
import usuarioBitacoraRoutes from "./routes/usuarioBitacora/usuarioBitacora.routes.js";
import tipoContratoRoutes from "./routes/tipoContrato/tipoContrato.routes.js";
import empleadoContratoRoutes from "./routes/empleadoContrato/empleadoContrato.routes.js";

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

app.use("/clientes", clientesRoutes);
app.use("/sedes", sedesRoutes);
app.use("/empleados", empleadosRoutes);
app.use("/cuentas", cuentasRoutes);
app.use("/control", controlRoutes);
app.use("/bitacoras", bitacorasRoutes);
app.use("/usuarioBitacora", usuarioBitacoraRoutes);
app.use("/tipoContrato", tipoContratoRoutes);
app.use("/empleadoContrato", empleadoContratoRoutes);

export default app;