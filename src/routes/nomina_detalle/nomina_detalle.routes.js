import { Router } from "express";
import * as controller from "./nomina_detalle.controller.js";

const router = Router();

router.get("/", controller.getNominaDetalles);
router.post("/", controller.createNominaDetalle);
router.put("/:id", controller.updateNominaDetalle);
router.delete("/:id", controller.deleteNominaDetalle);

export default router;