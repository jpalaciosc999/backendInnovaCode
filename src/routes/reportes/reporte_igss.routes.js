import { Router } from "express";
import {
  requiereAlgunoPermiso,
  verificarToken
} from "../../middlewares/auth.middleware.js";
import {
  getIgssPeriodos,
  getIgssReporte,
  getIgssReportePDF
} from "./reporte_igss.controller.js";

const router = Router();

// Todos los endpoints requieren token válido
router.use(verificarToken);

// Acceso permitido a:
//   · Administrador Nomina  → tiene REPORTES / Ver reportes gerenciales
//   · Contabilidad          → tiene REPORTES / Ver reportes gerenciales
//   · Analista Nomina       → tiene REPORTES / Ver reportes gerenciales
// Si en el futuro se quiere restringir solo a ADMIN o CONTABILIDAD, cambiar
// a requierePermiso("ADMIN", "Ver bitacora") y ajustar la asignación en BD.
const soloAdminContabilidad = requiereAlgunoPermiso(
  { modulo: "REPORTES", permiso: "Ver reportes gerenciales" },
  { modulo: "ADMIN",    permiso: "Ver bitacora" }
);

// GET /api/reportes/igss/periodos
// Períodos disponibles para el selector del dashboard
router.get("/periodos", soloAdminContabilidad, getIgssPeriodos);

// GET /api/reportes/igss/reporte?periodoId=&departamentoId=&estado=
// Datos JSON del reporte IGSS (patronal 12.67% + laboral 4.83%)
router.get("/reporte", soloAdminContabilidad, getIgssReporte);

// GET /api/reportes/igss/reporte/pdf?periodoId=&departamentoId=&estado=
// Descarga del reporte en PDF listo para presentar al IGSS
router.get("/reporte/pdf", soloAdminContabilidad, getIgssReportePDF);

// Alias usado por el frontend: /api/reportes/igss/pdf
router.get("/pdf", soloAdminContabilidad, getIgssReportePDF);

export default router;
