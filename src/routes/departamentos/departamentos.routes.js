import { Router } from "express";
import {
  getDepartamentos,
  getDepartamentoById,
  createDepartamento,
  updateDepartamento,
  deleteDepartamento
} from "./departamento.controller.js";

const router = Router();

router.get("/", getDepartamentos);
router.get("/:id", getDepartamentoById);
router.post("/", createDepartamento);
router.put("/:id", updateDepartamento);
router.delete("/:id", deleteDepartamento);

export default router;