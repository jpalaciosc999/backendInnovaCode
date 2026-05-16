import express from "express";
import cors from "cors";

import { verificarToken } from "./middlewares/auth.middleware.js";

import authRoutes from "./routes/auth/auth.routes.js";
import clientesRoutes from "./routes/clientes/clientes.routes.js";
import permisosRoutes from "./routes/permisos/Permisos.routes.js";
import rolesRoutes from "./routes/roles/Roles.routes.js";
import usuariosRoutes from "./routes/usuarios/usuarios.routes.js";
import rolPermisosRoutes from "./routes/rol_permisos/rol_permisos.routes.js";
import ingresosRoutes from "./routes/ingresos/ingresos.routes.js";
import descuentosRoutes from "./routes/descuentos/descuentos.routes.js";
import puestosRoutes from "./routes/puestos/puestos.routes.js";
import departamentosRoutes from "./routes/departamentos/departamentos.routes.js";
import kpiRoutes from "./routes/kpi/kpi.routes.js";
import kpiResultadoRoutes from "./routes/kpi_resultado/kpi_resultado.routes.js";
import nominaRoutes from "./routes/nominas/nomina.routes.js";
import nominaDetalleRoutes from "./routes/nomina_detalle/nomina_detalle.routes.js";
import nominaAsignacionesRoutes from "./routes/nomina_asignaciones/nomina_asignaciones.routes.js";
import prestamoRoutes from "./routes/prestamo/prestamo.routes.js";
import prestamoDetalleRoutes from "./routes/prestamo_detalle/prestamo_detalle.routes.js";
import periodoRoutes from "./routes/periodo/periodo.routes.js";
import liquidacionRoutes from "./routes/liquidacion/liquidaciones.routes.js";
import sedesRoutes from "./routes/sedes/sedes.routes.js";
import empleadosRoutes from "./routes/empleados/empleados.routes.js";
import cuentasRoutes from "./routes/cuentas/cuentas.routes.js";
import controlRoutes from "./routes/control/control.routes.js";
import bitacoraRoutes from "./routes/bitacora/bitacora.routes.js";
import usuarioBitacoraRoutes from "./routes/usuarioBitacora/usuarioBitacora.routes.js";
import tipoContratoRoutes from "./routes/tipoContrato/tipoContrato.routes.js";
import empleadoContratoRoutes from "./routes/empleadoContrato/empleadoContrato.routes.js";
import suspensionIgssRoutes from "./routes/suspensionIgss/suspensionIgss.routes.js";
import marcajeRoutes from "./routes/marcaje/marcaje.routes.js";
import horariosRoutes from "./routes/horarios/horarios.routes.js";
import adminRoutes from "./routes/admin/admin.routes.js";

const app = express();

const allowedOrigins = [
  process.env.FRONTEND_URL,
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:4000",
  "http://127.0.0.1:4000"
].filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error("Origen no permitido por CORS"));
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json({
  limit: "1mb"
}));

app.use((req, res, next) => {
  const originalJson = res.json.bind(res);

  res.json = (body) => {
    if (res.statusCode >= 400 && body && typeof body === "object" && !body.error) {
      const error = body.message && body.error
        ? `${body.message}: ${body.error}`
        : body.message || "Error en la solicitud";

      return originalJson({ error });
    }

    return originalJson(body);
  };

  next();
});

app.get("/", (req, res) => {
  res.json({
    message: "Backend funcionando correctamente"
  });
});

app.use("/clientes", clientesRoutes);
app.use("/permisos", permisosRoutes);
app.use("/roles", rolesRoutes);
app.use("/usuarios", usuariosRoutes);
app.use("/rolPermisos", rolPermisosRoutes);
app.use("/ingresos", ingresosRoutes);
app.use("/descuentos", descuentosRoutes);
app.use("/puestos", puestosRoutes);
app.use("/departamentos", departamentosRoutes);
app.use("/kpi", kpiRoutes);
app.use("/kpiResultado", kpiResultadoRoutes);
app.use("/nominas", nominaRoutes);
app.use("/nominaDetalle", nominaDetalleRoutes);
app.use("/nomina-asignaciones", nominaAsignacionesRoutes);
app.use("/nominaAsignaciones", nominaAsignacionesRoutes);
app.use("/prestamo", prestamoRoutes);
app.use("/prestamoDetalle", prestamoDetalleRoutes);
app.use("/periodo", periodoRoutes);
app.use("/liquidaciones", liquidacionRoutes);
app.use("/sedes", sedesRoutes);
app.use("/empleados", empleadosRoutes);
app.use("/cuentas", cuentasRoutes);
app.use("/control", controlRoutes);
app.use("/Control", controlRoutes);
app.use("/bitacora", bitacoraRoutes);
app.use("/usuarioBitacora", usuarioBitacoraRoutes);
app.use("/tipoContrato", tipoContratoRoutes);
app.use("/empleadoContrato", empleadoContratoRoutes);
app.use("/EmpleadoContrato", empleadoContratoRoutes);
app.use("/suspensionIgss", suspensionIgssRoutes);
app.use("/SuspensionIgss", suspensionIgssRoutes);
app.use("/marcaje", marcajeRoutes);
app.use("/Marcaje", marcajeRoutes);
app.use("/marcajes", marcajeRoutes);
app.use("/Marcajes", marcajeRoutes);
app.use("/horarios", horariosRoutes);
app.use("/admin", adminRoutes);
app.use("/auth", authRoutes);

app.use((err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  res.status(err.status || 500).json({
    error: err.message || "Error interno del servidor"
  });
});

export default app;
