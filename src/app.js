import express from "express";
import cors from "cors";

import clientesRoutes from "./routes/clientes/clientes.routes.js";
import permisosRoutes from "./routes/permisos/permisos.routes.js";
import rolesRoutes from "./routes/roles/roles.routes.js";
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
import prestamoRoutes from "./routes/prestamo/prestamo.routes.js";
import prestamoDetalleRoutes from "./routes/prestamo_detalle/prestamo_detalle.routes.js";
import periodoRoutes from "./routes/periodo/periodo.routes.js";
import liquidacionRoutes from "./routes/liquidacion/liquidacion.routes.js";
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
app.use("/nomina", nominaRoutes);
app.use("/nominaDetalle", nominaDetalleRoutes);
app.use("/prestamo", prestamoRoutes);
app.use("/prestamoDetalle", prestamoDetalleRoutes);
app.use("/periodo", periodoRoutes);
app.use("/liquidacion", liquidacionRoutes);
app.use("/sedes", sedesRoutes);
app.use("/empleados", empleadosRoutes);
app.use("/cuentas", cuentasRoutes);
app.use("/control", controlRoutes);
app.use("/bitacoras", bitacorasRoutes);
app.use("/usuarioBitacora", usuarioBitacoraRoutes);
app.use("/tipoContrato", tipoContratoRoutes);
app.use("/empleadoContrato", empleadoContratoRoutes);

export default app;