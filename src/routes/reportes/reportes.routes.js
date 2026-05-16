import { Router } from "express";
import { getMarcajesReporte, getMarcajesPDF } from "./reportes.controller.js";
import igssRouter from "./reporte_igss.routes.js";
import isrRouter  from "./reporte_isr.routes.js";
import dashboardEjecutivoRouter from "./dashboard_ejecutivo.routes.js";

const router = Router();

// GET /api/reportes/marcajes?empleadoId=&departamentoId=&fechaInicio=YYYY-MM-DD&fechaFin=YYYY-MM-DD
router.get("/marcajes", getMarcajesReporte);

// GET /api/reportes/marcajes/pdf?empleadoId=&departamentoId=&fechaInicio=YYYY-MM-DD&fechaFin=YYYY-MM-DD
router.get("/marcajes/pdf", getMarcajesPDF);

// /api/reportes/igss/...  (Reporte IGSS — acceso: Administrador y Contabilidad)
router.use("/igss", igssRouter);

// /api/reportes/isr/...   (Reporte ISR Anual — acceso: Administrador y Contabilidad)
router.use("/isr", isrRouter);

// /api/reportes/dashboard/ejecutivo (Dashboard ejecutivo RRHH/Administración/Gerencia)
router.use("/dashboard", dashboardEjecutivoRouter);

export default router;
