import { Router } from "express";
import { getMarcajesReporte, getMarcajesPDF } from "./reportes.controller.js";
import igssRouter from "./reporte_igss.routes.js";
import isrRouter  from "./reporte_isr.routes.js";
import dashboardEjecutivoRouter from "./dashboard_ejecutivo.routes.js";
import {
  getAguinaldoPDF,
  getDashboardEjecutivoPDF,
  getDescuentosPDF,
  getHorasExtraPDF,
  getIsrProyeccion,
  getIsrProyeccionPDF,
  getKpiPDF,
  getLiquidacionPDF,
  getVacacionesPDF
} from "./reportes_pdf.controller.js";

const router = Router();

// GET /api/reportes/marcajes?empleadoId=&departamentoId=&fechaInicio=YYYY-MM-DD&fechaFin=YYYY-MM-DD
router.get("/marcajes", getMarcajesReporte);

// GET /api/reportes/marcajes/pdf?empleadoId=&departamentoId=&fechaInicio=YYYY-MM-DD&fechaFin=YYYY-MM-DD
router.get("/marcajes/pdf", getMarcajesPDF);

// /api/reportes/igss/...  (Reporte IGSS — acceso: Administrador y Contabilidad)
router.use("/igss", igssRouter);

// Proyeccion ISR consumida por el frontend.
router.get("/isr/proyeccion", getIsrProyeccion);
router.get("/isr/proyeccion/pdf", getIsrProyeccionPDF);

// /api/reportes/isr/...   (Reporte ISR Anual — acceso: Administrador y Contabilidad)
router.use("/isr", isrRouter);

// /api/reportes/dashboard/ejecutivo (Dashboard ejecutivo RRHH/Administración/Gerencia)
router.use("/dashboard", dashboardEjecutivoRouter);

// Endpoints PDF consumidos por el frontend de reportes.
router.get("/aguinaldo/pdf", getAguinaldoPDF);
router.get("/vacaciones/pdf", getVacacionesPDF);
router.get("/descuentos/pdf", getDescuentosPDF);
router.get("/kpi/pdf", getKpiPDF);
router.get("/horas-extra/pdf", getHorasExtraPDF);
router.get("/liquidacion/pdf", getLiquidacionPDF);
router.get("/dashboard-ejecutivo/pdf", getDashboardEjecutivoPDF);

export default router;
