import { Router } from "express";
import {
  getDepartamentos,
  getDepartamentoById,
  createDepartamento,
  updateDepartamento,
  deleteDepartamentoLogico
} from "./departamentos.controller.js";

const router = Router();

router.get("/", getDepartamentos);
router.get("/:id", getDepartamentoById);
router.post("/", createDepartamento);
router.put("/:id", updateDepartamento);
router.put("/desactivar/:id", deleteDepartamentoLogico);

export default router;