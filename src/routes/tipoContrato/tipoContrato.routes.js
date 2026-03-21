import { Router } from "express";
import {
  getTiposContrato,
  getTipoContratoById,
  createTipoContrato,
  updateTipoContrato,
  deleteTipoContrato
} from "./tipoContrato.controller.js";

const router = Router();

router.get("/", getTiposContrato);
router.get("/:id", getTipoContratoById);
router.post("/", createTipoContrato);
router.put("/:id", updateTipoContrato);
router.delete("/:id", deleteTipoContrato);

export default router;