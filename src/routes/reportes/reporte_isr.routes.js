import { Router } from "express";
import { verificarToken, requiereAlgunoPermiso } from "../../middlewares/auth.middleware.js";
import { getIsrAnios, getIsrReporte, getIsrReportePDF } from "./reporte_isr.controller.js";

const router = Router();

router.use(verificarToken);

// Acceso: Administrador Nomina, Contabilidad y cualquier rol con módulo REPORTES
const soloAutorizados = requiereAlgunoPermiso(
  { modulo: "REPORTES", permiso: "Ver reportes gerenciales" },
  { modulo: "ADMIN",    permiso: "Ver bitacora" }
);

// GET /api/reportes/isr/anios
// Años fiscales disponibles para el selector del dashboard
router.get("/anios", soloAutorizados, getIsrAnios);

// GET /api/reportes/isr/reporte?anio=2025&departamentoId=
// Datos JSON: empleados, totales, desglose por depto, gráfico mensual
router.get("/reporte", soloAutorizados, getIsrReporte);

// GET /api/reportes/isr/reporte/pdf?anio=2025&departamentoId=
// Descarga del reporte en PDF listo para presentar a SAT
router.get("/reporte/pdf", soloAutorizados, getIsrReportePDF);

export default router;
