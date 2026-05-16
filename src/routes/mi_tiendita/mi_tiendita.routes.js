import { Router } from "express";
import {
  getPagosMiTiendita,
  getMisPagosMiTiendita,
  getPagoMiTienditaById,
  createPagoMiTiendita,
  updatePagoMiTiendita,
  deletePagoMiTiendita,
  anularPagoMiTiendita,
  getTotalPendientePorEmpleado
} from "./mi_tiendita.controller.js";

const router = Router();

router.get("/", getPagosMiTiendita);
router.get("/mis-pagos", getMisPagosMiTiendita);
router.get("/totales-pendientes", getTotalPendientePorEmpleado);
router.get("/:id", getPagoMiTienditaById);

router.post("/", createPagoMiTiendita);

router.put("/:id", updatePagoMiTiendita);

router.delete("/:id", deletePagoMiTiendita);

router.patch("/:id/anular", anularPagoMiTiendita);

export default router;