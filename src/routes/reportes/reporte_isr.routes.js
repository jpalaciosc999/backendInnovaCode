import { Router } from "express";
import { verificarToken, requiereAlgunoPermiso } from "../../middlewares/auth.middleware.js";
import { getIsrAnios, getIsrConstanciaPDF, getIsrFacturaPDF, getIsrReporte, getIsrReportePDF } from "./reporte_isr.controller.js";

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

// GET /api/reportes/isr/constancia/pdf?anio=2026&empleadoId=1
// Constancia simple de retencion ISR para entregar al trabajador.
router.get("/constancia/pdf", soloAutorizados, getIsrConstanciaPDF);

// Alias usado por el frontend: /api/reportes/isr/pdf?anioFiscal=2026
router.get("/pdf", soloAutorizados, (req, res, next) => {
  if (!req.query.anio && req.query.anioFiscal) {
    req.query.anio = req.query.anioFiscal;
  }

  return getIsrReportePDF(req, res, next);
});

// Alias formal para descargar el formato tipo SAT-1901.
router.get("/factura/pdf", soloAutorizados, (req, res, next) => {
  if (!req.query.anio && req.query.anioFiscal) {
    req.query.anio = req.query.anioFiscal;
  }

  return getIsrFacturaPDF(req, res, next);
});

export default router;
